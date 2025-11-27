// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

///
/// @title Kindora Presale — hardened, production-ready implementation
/// @notice
///  - Collects BNB for an ERC20 token presale
///  - Reserves tokens for buyers
///  - Adds liquidity at finalize, sends LP tokens to DEAD
///  - Uses a pull model for marketing withdrawals
///
/// @dev
///  The sale token MUST be a standard, non-tax ERC20 (i.e., no fee-on-transfer).
///
///  Key safety choices:
///  - Uses OZ SafeERC20, Ownable, ReentrancyGuard
///  - External entry points are protected by nonReentrant; internal functions avoid modifiers
///  - Pull model for marketing funds to avoid finalize being blocked by a payable/delegating
///    marketing contract
///  - Any ETH refunded by the router (unused portion of lpWei) is credited to marketingPending
///  - Emergency ERC20 withdrawal is only allowed for amounts strictly above buyer reservations
///

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IUniswapV2Router02 {
    function WETH() external pure returns (address);

    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    )
        external
        payable
        returns (uint amountToken, uint amountETH, uint liquidity);
}

contract KindoraPresale is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ------------------------------------------------------------------------
       Immutables and constants
       ------------------------------------------------------------------------ */
    IERC20 public immutable saleToken;
    IUniswapV2Router02 public immutable router;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 internal constant BPS = 10_000;

    /* ------------------------------------------------------------------------
       Config (settable only before start)
       ------------------------------------------------------------------------ */
    uint256 public startTime;
    uint256 public endTime;

    uint256 public softCapWei;
    uint256 public hardCapWei; // 0 = no hard cap

    uint256 public minBuyWei;
    uint256 public maxBuyWei; // 0 = no per-wallet max

    uint256 public saleAllocation; // total tokens available for sale (in token units)

    // Rates (tokens per 1 BNB/ETH scaled by 1e18)
    uint256 public initialRate;
    uint256 public currentRate;
    uint256 public stepDownBps; // rate reduction per purchase (bps)
    uint256 public listingRate; // tokens per 1 BNB used to compute LP token amount

    uint256 public lpPercent = 70;        // percent to LP (of contract balance at finalize)
    uint256 public marketingPercent = 30; // percent to marketing (of contract balance at finalize)

    // Slippage protection for addLiquidity (bps). Set before start.
    uint256 public maxSlippageBps = 1000; // default 10%

    // Marketing wallet (can only be set before start)
    address public marketingWallet;

    /* ------------------------------------------------------------------------
       State
       ------------------------------------------------------------------------ */
    bool public finalized;
    bool public liquidityAdded;
    uint256 public liquidityAmount;

    // user => gross BNB contributed (wei)
    mapping(address => uint256) public contributedWei;
    // user => tokens reserved for claim
    mapping(address => uint256) public boughtTokens;

    // Bookkeeping totals
    uint256 public totalRaisedWei; // gross sum of contributedWei
    uint256 public tokensSold;     // sum of boughtTokens

    // Marketing funds accumulated (pull model)
    uint256 public marketingPending;

    /* ------------------------------------------------------------------------
       Events
       ------------------------------------------------------------------------ */
    event Bought(address indexed user, uint256 amountWei, uint256 tokensOut, uint256 newRate);
    event Refunded(address indexed user, uint256 amountWei);
    event Claimed(address indexed user, uint256 amountTokens);
    event Finalized(uint256 lpWei, uint256 marketingWei, uint256 lpTokensUsed, uint256 liquidity);
    event MarketingWithdrawn(address indexed to, uint256 amount);
    event LeftoverCreditedToMarketing(uint256 amount);
    event EmergencyERC20Withdrawn(address indexed token, address indexed to, uint256 amount);
    event RecoveredTokensOnFailure(address indexed to, uint256 amount);

    /* ------------------------------------------------------------------------
       Constructor
       ------------------------------------------------------------------------ */
    constructor(address _saleToken, address _router, address _marketingWallet) {
        require(_saleToken != address(0), "TOKEN_ZERO");
        require(_router != address(0), "ROUTER_ZERO");
        require(_marketingWallet != address(0), "MKT_ZERO");

        saleToken = IERC20(_saleToken);
        router = IUniswapV2Router02(_router);
        marketingWallet = _marketingWallet;
    }

    /* ------------------------------------------------------------------------
       Modifiers / view helpers
       ------------------------------------------------------------------------ */
    modifier onlyBeforeStart() {
        require(startTime == 0 || block.timestamp < startTime, "ALREADY_STARTED");
        _;
    }

    function presaleActive() public view returns (bool) {
        return startTime > 0 && block.timestamp >= startTime && block.timestamp < endTime && !finalized;
    }

    function presaleEnded() public view returns (bool) {
        return endTime > 0 && block.timestamp >= endTime;
    }

    function softCapMet() public view returns (bool) {
        return totalRaisedWei >= softCapWei;
    }

    function remainingSaleTokens() external view returns (uint256) {
        if (saleAllocation <= tokensSold) return 0;
        return saleAllocation - tokensSold;
    }

    /* ------------------------------------------------------------------------
       Admin configuration (only before start)
       ------------------------------------------------------------------------ */

    /// @notice Set start and end times (start must be in the future).
    function setTimes(uint256 _start, uint256 _end) external onlyOwner onlyBeforeStart {
        require(_start > block.timestamp, "START_IN_PAST");
        require(_end > _start, "BAD_TIME");
        startTime = _start;
        endTime = _end;
    }

    /// @notice Set soft and hard caps (hard can be zero = no hard cap).
    function setCaps(uint256 _softCapWei, uint256 _hardCapWei) external onlyOwner onlyBeforeStart {
        require(_softCapWei > 0, "SOFT_ZERO");
        if (_hardCapWei != 0) require(_hardCapWei > _softCapWei, "HARD_SOFT");
        softCapWei = _softCapWei;
        hardCapWei = _hardCapWei;
    }

    /// @notice Per-wallet gross buy limits. _maxBuyWei == 0 means no per-wallet max.
    function setBuyLimits(uint256 _minBuyWei, uint256 _maxBuyWei) external onlyOwner onlyBeforeStart {
        require(_minBuyWei > 0, "MIN_ZERO");
        require(_maxBuyWei == 0 || _maxBuyWei > _minBuyWei, "MAX_LE_MIN");
        minBuyWei = _minBuyWei;
        maxBuyWei = _maxBuyWei;
    }

    function setSaleAllocation(uint256 _saleAllocation) external onlyOwner onlyBeforeStart {
        require(_saleAllocation > 0, "SALE_ZERO");
        saleAllocation = _saleAllocation;
    }

    /// @notice Set rates (initialRate and listingRate are tokens-per-1ETH scaled by 1e18).
    function setRates(
        uint256 _initialRate,
        uint256 _stepDownBps,
        uint256 _listingRate
    ) external onlyOwner onlyBeforeStart {
        require(_initialRate > 0, "RATE_ZERO");
        require(_listingRate > 0, "LIST_ZERO");
        require(_stepDownBps <= 2000, "STEP_TOO_HIGH"); // <= 20%
        initialRate = _initialRate;
        currentRate = _initialRate;
        stepDownBps = _stepDownBps;
        listingRate = _listingRate;
    }

    /// @notice Set LP / marketing split (must sum to 100).
    function setSplit(uint256 _lpPercent, uint256 _marketingPercent) external onlyOwner onlyBeforeStart {
        require(_lpPercent + _marketingPercent == 100, "BAD_SPLIT");
        lpPercent = _lpPercent;
        marketingPercent = _marketingPercent;
    }

    function setMarketingWallet(address _marketingWallet) external onlyOwner onlyBeforeStart {
        require(_marketingWallet != address(0), "MKT_ZERO");
        marketingWallet = _marketingWallet;
    }

    function setMaxSlippageBps(uint256 _bps) external onlyOwner onlyBeforeStart {
        require(_bps <= 3000, "SLIP_TOO_HIGH"); // <= 30%
        maxSlippageBps = _bps;
    }

    /// @notice Owner must deposit sale tokens to this contract prior to finalize.
    function depositSaleTokens(uint256 amount) external onlyOwner {
        saleToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    /* ------------------------------------------------------------------------
       Buy / refund / claim
       ------------------------------------------------------------------------ */

    receive() external payable {
        // Direct BNB transfers are supported and call internal _buy.
        _buy(msg.sender, msg.value);
    }

    /// @notice Primary buy entry point (protected by nonReentrant).
    function buy() external payable nonReentrant {
        _buy(msg.sender, msg.value);
    }

    /// @dev Internal buy implementation. Updates state before external calls (defense-in-depth).
    function _buy(address buyer, uint256 amountWei) internal {
        require(presaleActive(), "NOT_ACTIVE");
        require(amountWei >= minBuyWei, "BELOW_MIN");

        if (maxBuyWei != 0) {
            require(contributedWei[buyer] + amountWei <= maxBuyWei, "ABOVE_MAX");
        }

        if (hardCapWei != 0) {
            require(totalRaisedWei + amountWei <= hardCapWei, "HARD_CAP");
        }

        uint256 tokensOut = (amountWei * currentRate) / 1e18;
        require(tokensOut > 0, "ZERO_OUT");
        require(tokensSold + tokensOut <= saleAllocation, "SALE_EXCEEDED");

        // Update accounting
        contributedWei[buyer] += amountWei;
        totalRaisedWei += amountWei;
        boughtTokens[buyer] += tokensOut;
        tokensSold += tokensOut;

        // Apply step-down rate for subsequent buys
        if (stepDownBps > 0) {
            uint256 newRate = (currentRate * (BPS - stepDownBps)) / BPS;
            if (newRate > 0) currentRate = newRate;
        }

        emit Bought(buyer, amountWei, tokensOut, currentRate);
    }

    /// @notice Refund when presale ended and soft cap not met.
    function refund() external nonReentrant {
        require(presaleEnded(), "NOT_ENDED");
        require(!softCapMet(), "SOFT_MET");

        uint256 amt = contributedWei[msg.sender];
        uint256 tok = boughtTokens[msg.sender];
        require(amt > 0, "NO_REFUND");

        // Zero user state first
        contributedWei[msg.sender] = 0;
        boughtTokens[msg.sender] = 0;

        // Update totals (defensive)
        if (totalRaisedWei >= amt) totalRaisedWei -= amt;
        else totalRaisedWei = 0;

        if (tokensSold >= tok) tokensSold -= tok;
        else tokensSold = 0;

        (bool sent, ) = payable(msg.sender).call{value: amt}("");
        require(sent, "REFUND_FAIL");

        emit Refunded(msg.sender, amt);
    }

    /// @notice Claim reserved tokens after presale success & finalize.
    function claim() external nonReentrant {
        require(presaleEnded(), "NOT_ENDED");
        require(softCapMet(), "SOFT_NOT_MET");
        require(finalized, "NOT_FINALIZED");
        // Guard: if LP was required, ensure liquidity was actually created
        if (lpPercent > 0) {
            require(liquidityAdded, "NO_LIQUIDITY");
        }

        uint256 amt = boughtTokens[msg.sender];
        require(amt > 0, "NO_TOKENS");

        boughtTokens[msg.sender] = 0;
        saleToken.safeTransfer(msg.sender, amt);

        emit Claimed(msg.sender, amt);
    }

    /* ------------------------------------------------------------------------
       Finalize
       ------------------------------------------------------------------------ */

    /// @notice Finalize presale: compute splits, add liquidity and credit marketingPending.
    /// @dev Uses pull model for marketing funds. Marks finalized only after successful execution.
    function finalize() external nonReentrant {
        require(presaleEnded(), "NOT_ENDED");
        require(softCapMet(), "SOFT_NOT_MET");
        require(!finalized, "ALREADY_FINAL");

        uint256 totalBalance = address(this).balance;
        require(totalBalance > 0, "NO_FUNDS");

        uint256 lpWei = (totalBalance * lpPercent) / 100;
        uint256 marketingWei = totalBalance - lpWei;

        // If no LP allocation, credit leftover to marketing and finalize immediately.
        if (lpWei == 0) {
            uint256 leftover0 = address(this).balance;
            if (leftover0 > 0) {
                marketingPending += leftover0;
                emit LeftoverCreditedToMarketing(leftover0);
            }
            finalized = true;
            liquidityAdded = false;
            emit Finalized(0, leftover0, 0, 0);
            return;
        }

        uint256 lpTokensNeeded = (lpWei * listingRate) / 1e18;
        require(lpTokensNeeded > 0, "LP_TOKENS_ZERO");

        uint256 bal = saleToken.balanceOf(address(this));
        require(bal >= tokensSold + lpTokensNeeded, "INSUFFICIENT_TOKENS");

        uint256 liquidity = 0;
        uint256 amountTokenUsed = 0;
        uint256 amountETHUsed = 0;

        uint256 minTokens = (lpTokensNeeded * (BPS - maxSlippageBps)) / BPS;
        uint256 minETH = (lpWei * (BPS - maxSlippageBps)) / BPS;

        // Approve tokens for router
        saleToken.safeApprove(address(router), 0);
        saleToken.safeApprove(address(router), lpTokensNeeded);

        // Attempt addLiquidityETH; use try/catch to capture failures explicitly.
        bool lpSuccess = false;
        try router.addLiquidityETH{value: lpWei}(
            address(saleToken),
            lpTokensNeeded,
            minTokens,
            minETH,
            DEAD,
            block.timestamp + 3600
        ) returns (uint256 usedTokens, uint256 usedETH, uint256 liq) {
            amountTokenUsed = usedTokens;
            amountETHUsed = usedETH;
            liquidity = liq;

            // Basic sanity checks: positive values
            if (liquidity > 0 && amountETHUsed > 0 && amountTokenUsed > 0) {
                lpSuccess = true;
            }
        } catch Error(string memory reason) {
            saleToken.safeApprove(address(router), 0);
            revert(string(abi.encodePacked("LP_FAILED:", reason)));
        } catch {
            saleToken.safeApprove(address(router), 0);
            revert("LP_FAILED");
        }

        // Reset approval
        saleToken.safeApprove(address(router), 0);

        require(lpSuccess, "LP_NOT_CREATED");

        // Credit leftover ETH (if any)
        uint256 leftover = address(this).balance;
        if (leftover > 0) {
            marketingPending += leftover;
            emit LeftoverCreditedToMarketing(leftover);
        }

        // Return extra tokens to owner (keep tokensSold reserved)
        uint256 balAfter = saleToken.balanceOf(address(this));
        if (balAfter > tokensSold) {
            uint256 extra = balAfter - tokensSold;
            saleToken.safeTransfer(owner(), extra);
        }

        liquidityAdded = true;
        liquidityAmount = liquidity;

        finalized = true;

        emit Finalized(lpWei, marketingWei, amountTokenUsed, liquidity);
    }

    /* ------------------------------------------------------------------------
       Withdraw helpers (pull)
       ------------------------------------------------------------------------ */

    /// @notice Marketing wallet withdraws accumulated marketing funds (pull).
    /// @dev Only the configured marketingWallet can call this.
    function withdrawMarketing(address payable to) external nonReentrant {
        require(msg.sender == marketingWallet, "NOT_MARKETING");
        uint256 amt = marketingPending;
        require(amt > 0, "NO_FUNDS");
        marketingPending = 0;
        (bool ok, ) = to.call{value: amt}("");
        require(ok, "WITHDRAW_FAIL");
        emit MarketingWithdrawn(to, amt);
    }

    /* ------------------------------------------------------------------------
       Owner recovery for failed presale (safe)
       ------------------------------------------------------------------------ */

    /// @notice Allow owner to recover ALL sale tokens when presale has failed (soft cap not met).
    /// @dev Only callable after presaleEnded && !softCapMet && when no tokens remain reserved for buyers.
    ///      This prevents owner from withdrawing buyer-reserved tokens.
    function recoverTokensOnFailure(address to) external onlyOwner {
        require(presaleEnded(), "NOT_ENDED");
        require(!softCapMet(), "SOFT_MET");
        require(tokensSold == 0, "TOKENS_RESERVED");
        require(to != address(0), "TO_ZERO");

        uint256 bal = saleToken.balanceOf(address(this));
        require(bal > 0, "NO_TOKENS");
        saleToken.safeTransfer(to, bal);
        emit RecoveredTokensOnFailure(to, bal);
    }

    /* ------------------------------------------------------------------------
       Emergency withdraws
       ------------------------------------------------------------------------ */

    /// @notice Owner-only emergency withdrawal for ERC20 tokens accidentally sent to this contract.
    /// @dev For the sale token, only amounts strictly above buyer reservations (tokensSold) can be withdrawn.
    function emergencyWithdrawERC20(address token, address to, uint256 amount) external onlyOwner {
        require(finalized, "NOT_FINALIZED");
        require(to != address(0), "TO_ZERO");

        if (token == address(saleToken)) {
            uint256 available = saleToken.balanceOf(address(this));
            require(available >= tokensSold, "NO_EXTRA_TOKENS");
            uint256 extra = available - tokensSold;
            require(amount <= extra, "AMOUNT_TOO_HIGH");
            saleToken.safeTransfer(to, amount);
        } else {
            IERC20(token).safeTransfer(to, amount);
        }

        emit EmergencyERC20Withdrawn(token, to, amount);
    }

    /* ------------------------------------------------------------------------
       Misc view helpers
       ------------------------------------------------------------------------ */

    function getMarketingPending() external view returns (uint256) {
        return marketingPending;
    }
}
