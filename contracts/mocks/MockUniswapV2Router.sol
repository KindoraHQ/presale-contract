// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract MockUniswapV2Router {
    address public immutable WETH;
    
    uint256 public liquidityAdded;
    uint256 public tokensReceived;
    uint256 public ethReceived;

    constructor(address _weth) {
        WETH = _weth;
    }

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
        returns (uint amountToken, uint amountETH, uint liquidity)
    {
        require(deadline >= block.timestamp, "EXPIRED");
        require(msg.value >= amountETHMin, "INSUFFICIENT_ETH");
        require(amountTokenDesired >= amountTokenMin, "INSUFFICIENT_TOKEN");

        // Transfer tokens from sender
        require(
            IERC20(token).transferFrom(msg.sender, address(this), amountTokenDesired),
            "TRANSFER_FAILED"
        );

        // Store values for testing
        tokensReceived = amountTokenDesired;
        ethReceived = msg.value;
        
        // Return values (simulate successful liquidity addition)
        amountToken = amountTokenDesired;
        amountETH = msg.value;
        liquidity = (amountToken * amountETH) / 1e18; // Simple liquidity calculation
        liquidityAdded = liquidity;

        return (amountToken, amountETH, liquidity);
    }

    // Allow contract to receive ETH
    receive() external payable {}
}
