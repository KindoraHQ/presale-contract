// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

contract MockUniswapV2Router02 {
    address public immutable WETH;

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
        require(block.timestamp <= deadline, "EXPIRED");
        require(msg.value >= amountETHMin, "INSUFFICIENT_ETH");
        require(amountTokenDesired >= amountTokenMin, "INSUFFICIENT_TOKEN");

        // Transfer tokens from sender to this contract
        IERC20(token).transferFrom(msg.sender, address(this), amountTokenDesired);

        // In a real implementation, this would create a pair and add liquidity
        // For testing, we'll just return the amounts
        amountToken = amountTokenDesired;
        amountETH = msg.value;
        liquidity = (amountToken * amountETH) / 1e18; // Simple liquidity calculation

        // Don't actually transfer to 'to' address for dead address testing
        return (amountToken, amountETH, liquidity);
    }
}
