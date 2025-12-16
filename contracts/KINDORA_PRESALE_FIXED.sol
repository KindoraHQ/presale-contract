// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
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

contract KINDORA_PRESALE is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable saleToken;
    IUniswapV2Router02 public immutable router;
    uint8 public immutable tokenDecimals;

    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;
    uint256 private constant BPS = 10_000;

    uint256 public startTime;
    uint256 public endTime;

    uint256 public softCapWei;
    uint256 public hardCapWei;

    uint256 public minBuyWei;
    uint256 public maxBuyWei;

    uint256 public saleAllocation;

    uint256 public lpPercent = 70;
    uint256 public marketingPercent = 30;

    // 🔧 FIX: کاهش slippage به 5% (safer)
    uint256 public maxSlippageBps = 500;

    uint256 public listingRate;

    address public marketingWallet;

    struct Stage {
        uint256 tokens;
        uint256 rate;
    }

    Stage[] public stages;
    uint256 public currentStage;
    uint256 public tokensSoldInCurrentStage;

    bool public finalized;

    mapping(address => uint256) public contributedWei;
    mapping(address => uint256) public boughtTokens;

    uint256 public totalRaisedWei;
    uint256 public tokensSold;

    uint256 public marketingPending;

    event StagesConfigured(uint256 stageCount, uint256 totalTokens);
    event Bought(address indexed user, uint256 amountWei, uint256 tokensOut, uint256 stageIndex);
    event Refunded(address indexed user, uint256 amountWei);
    event Claimed(address indexed user, uint256 amountTokens);

    event Finalized(
        uint256 lpWei,
        uint256 marketingWei,
        uint256 lpTokensUsed,
        uint256 amountETHUsed,
        uint256 liquidity
    );

    event MarketingWithdrawn(address indexed to, uint256 amount);
    event LeftoverCreditedToMarketing(uint256 amount);
    event EmergencyERC20Withdrawn(address indexed token, address indexed to, uint256 amount);
    event RecoveredTokensOnFailure(address indexed to, uint256 amount);

    constructor(
        address _saleToken,
        address _router,
        address _marketingWallet
    ) Ownable(msg.sender) {
        require(_saleToken != address(0), "TOKEN_ZERO");
        require(_router != address(0), "ROUTER_ZERO");
        require(_marketingWallet != address(0), "MKT_ZERO");

        saleToken = IERC20(_saleToken);
        router = IUniswapV2Router02(_router);
        marketingWallet = _marketingWallet;

        uint8 dec = IERC20Metadata(_saleToken).decimals();
        require(dec == 18, "DECIMALS_NOT_18");
        tokenDecimals = dec;
    }

    modifier onlyBeforeStart() {
        require(startTime == 0 || block.timestamp < startTime, "ALREADY_STARTED");
        _;
    }

    function presaleActive() public view returns (bool) {
        return
            stages.length > 0 &&
            startTime > 0 &&
            block.timestamp >= startTime &&
            block.timestamp < endTime &&
            !finalized &&
            tokensSold < saleAllocation &&
            currentStage < stages.length;
    }

    function presaleEnded() public view returns (bool) {
        return (endTime > 0 && block.timestamp >= endTime) || tokensSold >= saleAllocation;
    }

    function softCapMet() public view returns (bool) {
        return totalRaisedWei >= softCapWei;
    }

    function getStageCount() external view returns (uint256) {
        return stages.length;
    }

    function getCurrentStageInfo()
        external
        view
        returns (
            uint256 index,
            uint256 tokensInStage,
            uint256 tokensSoldStage,
            uint256 rate
        )
    {
        if (currentStage >= stages.length) {
            return (currentStage, 0, 0, 0);
        }
        Stage storage s = stages[currentStage];
        return (currentStage, s.tokens, tokensSoldInCurrentStage, s.rate);
    }

    function setTimes(uint256 _start, uint256 _end) external onlyOwner onlyBeforeStart {
        require(_start > block.timestamp, "START_IN_PAST");
        require(_end > _start, "BAD_TIME");
        startTime = _start;
        endTime = _end;
    }

    function setCaps(uint256 _softCapWei, uint256 _hardCapWei) external onlyOwner onlyBeforeStart {
        require(_softCapWei > 0, "SOFT_ZERO");
        if (_hardCapWei != 0) require(_hardCapWei > _softCapWei, "HARD_SOFT");
        softCapWei = _softCapWei;
        hardCapWei = _hardCapWei;
    }

    function setBuyLimits(uint256 _minBuyWei, uint256 _maxBuyWei) external onlyOwner onlyBeforeStart {
        require(_minBuyWei > 0, "MIN_ZERO");
        require(_maxBuyWei == 0 || _maxBuyWei > _minBuyWei, "MAX_LE_MIN");
        minBuyWei = _minBuyWei;
        maxBuyWei = _maxBuyWei;
    }

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
        require(_bps <= 3000, "SLIP_TOO_HIGH");
        maxSlippageBps = _bps;
    }

    function setListingRate(uint256 _listingRate) external onlyOwner onlyBeforeStart {
        require(_listingRate > 0, "LIST_ZERO");
        listingRate = _listingRate;
    }

    function configureStages(
        uint256[] calldata _tokens,
        uint256[] calldata _rates
    ) external onlyOwner onlyBeforeStart {
        require(_tokens.length > 0, "NO_STAGES");
        require(_tokens.length == _rates.length, "LEN_MISMATCH");

        delete stages;
        uint256 total;
        for (uint256 i = 0; i < _tokens.length; i++) {
            require(_tokens[i] > 0, "ZERO_STAGE");
            require(_rates[i] > 0, "ZERO_RATE");
            stages.push(Stage({tokens: _tokens[i], rate: _rates[i]}));
            total += _tokens[i];
        }
        saleAllocation = total;
        currentStage = 0;
        tokensSoldInCurrentStage = 0;

        emit StagesConfigured(_tokens.length, total);
    }

    function depositSaleTokens(uint256 amount) external onlyOwner {
        saleToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    receive() external payable {
        buy();
    }

    function buy() public payable nonReentrant {
        _buy(msg.sender, msg.value);
    }

    function _buy(address buyer, uint256 amountWei) internal {
        require(presaleActive(), "NOT_ACTIVE");
        require(amountWei >= minBuyWei, "BELOW_MIN");
        require(saleToken.balanceOf(address(this)) >= saleAllocation, "NEED_TOKENS_DEPOSITED");

        if (maxBuyWei != 0) require(contributedWei[buyer] + amountWei <= maxBuyWei, "ABOVE_MAX");
        if (hardCapWei != 0) require(totalRaisedWei + amountWei <= hardCapWei, "HARD_CAP");

        require(currentStage < stages.length, "NO_STAGE");

        Stage storage s = stages[currentStage];
        uint256 remainingInStage = s.tokens - tokensSoldInCurrentStage;
        require(remainingInStage > 0, "STAGE_EMPTY");

        uint256 tokensOut = (amountWei * s.rate) / 1e18;
        require(tokensOut > 0, "ZERO_OUT");
        require(tokensOut <= remainingInStage, "EXCEEDS_STAGE");
        require(tokensSold + tokensOut <= saleAllocation, "SALE_EXCEEDED");

        // 🔧 FIX: محاسبه امن‌تر usedWei
        uint256 usedWei = (tokensOut * 1e18) / s.rate;
        uint256 remainder = (tokensOut * 1e18) % s.rate;
        if (remainder > 0) {
            usedWei += 1; // round up
        }
        require(usedWei > 0 && usedWei <= amountWei, "MATH_ERROR");

        uint256 refundWei = amountWei - usedWei;

        contributedWei[buyer] += usedWei;
        totalRaisedWei += usedWei;
        boughtTokens[buyer] += tokensOut;
        tokensSold += tokensOut;
        tokensSoldInCurrentStage += tokensOut;

        uint256 boughtStage = currentStage;

        if (tokensSoldInCurrentStage == s.tokens) {
            if (currentStage + 1 < stages.length) {
                currentStage++;
                tokensSoldInCurrentStage = 0;
            }
        }

        if (refundWei > 0) {
            (bool r, ) = payable(buyer).call{value: refundWei}("");
            require(r, "REFUND_FAIL");
        }

        emit Bought(buyer, usedWei, tokensOut, boughtStage);
    }

    // 🔧 CRITICAL FIX: Race condition حل شد
    function refund() external nonReentrant {
        require(presaleEnded(), "NOT_ENDED");
        require(!softCapMet(), "SOFT_MET");

        uint256 amt = contributedWei[msg.sender];
        uint256 tok = boughtTokens[msg.sender];
        require(amt > 0, "NO_REFUND");

        // ✅ اول پول رو بفرست (Check-Effects-Interactions)
        (bool sent, ) = payable(msg.sender).call{value: amt}("");
        require(sent, "REFUND_FAIL");

        // ✅ بعد state رو تغییر بده
        contributedWei[msg.sender] = 0;
        boughtTokens[msg.sender] = 0;

        if (totalRaisedWei >= amt) totalRaisedWei -= amt;
        else totalRaisedWei = 0;

        if (tokensSold >= tok) tokensSold -= tok;
        else tokensSold = 0;

        emit Refunded(msg.sender, amt);
    }

    function claim() external nonReentrant {
        require(presaleEnded(), "NOT_ENDED");
        require(softCapMet(), "SOFT_NOT_MET");
        require(finalized, "NOT_FINALIZED");

        uint256 amt = boughtTokens[msg.sender];
        require(amt > 0, "NO_TOKENS");

        boughtTokens[msg.sender] = 0;
        saleToken.safeTransfer(msg.sender, amt);

        emit Claimed(msg.sender, amt);
    }

    // 🔧 CRITICAL FIX: LP tokens check برای همه حالت‌ها
    function finalize() external nonReentrant {
        require(presaleEnded(), "NOT_ENDED");
        require(softCapMet(), "SOFT_NOT_MET");
        require(!finalized, "ALREADY_FINAL");
        require(listingRate > 0, "LIST_RATE_NOT_SET");

        uint256 totalBalance = address(this).balance;
        require(totalBalance > 0, "NO_FUNDS");

        uint256 lpWei = (totalBalance * lpPercent) / 100;
        uint256 lpTokensNeeded = (lpWei * listingRate) / 1e18;

        // ✅ FIX: همیشه LP tokens رو چک کن، نه فقط برای hardCap != 0
        uint256 bal = saleToken.balanceOf(address(this));
        require(bal >= tokensSold + lpTokensNeeded, "INSUFFICIENT_TOKENS_FOR_LP");

        uint256 liquidity;
        uint256 amountTokenUsed;
        uint256 amountETHUsed;
        uint256 marketingWei;

        if (lpWei > 0 && lpTokensNeeded > 0) {
            uint256 minTokens = (lpTokensNeeded * (BPS - maxSlippageBps)) / BPS;
            uint256 minETH = (lpWei * (BPS - maxSlippageBps)) / BPS;

            saleToken.forceApprove(address(router), 0);
            saleToken.forceApprove(address(router), lpTokensNeeded);

            (amountTokenUsed, amountETHUsed, liquidity) =
                router.addLiquidityETH{value: lpWei}(
                    address(saleToken),
                    lpTokensNeeded,
                    minTokens,
                    minETH,
                    DEAD,
                    block.timestamp + 3600
                );

            saleToken.forceApprove(address(router), 0);

            marketingWei = totalBalance - amountETHUsed;
        } else {
            amountTokenUsed = 0;
            amountETHUsed = 0;
            liquidity = 0;
            marketingWei = totalBalance;
        }

        if (marketingWei > 0) {
            marketingPending += marketingWei;
            emit LeftoverCreditedToMarketing(marketingWei);
        }

        uint256 balAfter = saleToken.balanceOf(address(this));
        if (balAfter > tokensSold) {
            uint256 extra = balAfter - tokensSold;
            saleToken.safeTransfer(owner(), extra);
        }

        finalized = true;

        emit Finalized(lpWei, marketingWei, amountTokenUsed, amountETHUsed, liquidity);
    }

    function withdrawMarketing(address payable to) external nonReentrant {
        require(msg.sender == marketingWallet, "NOT_MARKETING");
        uint256 amt = marketingPending;
        require(amt > 0, "NO_FUNDS");
        marketingPending = 0;
        (bool ok, ) = to.call{value: amt}("");
        require(ok, "WITHDRAW_FAIL");
        emit MarketingWithdrawn(to, amt);
    }

    function recoverTokensOnFailure(address to) external onlyOwner {
        require(presaleEnded(), "NOT_ENDED");
        require(!softCapMet(), "SOFT_MET");
        require(to != address(0), "TO_ZERO");

        uint256 bal = saleToken.balanceOf(address(this));
        require(bal > 0, "NO_TOKENS");

        saleToken.safeTransfer(to, bal);
        emit RecoveredTokensOnFailure(to, bal);
    }

    function emergencyWithdrawERC20(
        address token,
        address to,
        uint256 amount
    ) external onlyOwner {
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

    function getMarketingPending() external view returns (uint256) {
        return marketingPending;
    }
}
