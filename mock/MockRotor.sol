// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockPancakeRouter
 * @dev Mock router برای تست local - شبیه‌سازی PancakeSwap Router
 */
contract MockPancakeRouter {
    address public immutable WETH;
    
    constructor() {
        WETH = address(this); // برای تست، خودش رو به عنوان WETH معرفی می‌کنه
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
        IERC20(token).transferFrom(msg.sender, address(this), amountTokenDesired);
        
        // شبیه‌سازی LP creation
        amountToken = amountTokenDesired;
        amountETH = msg.value;
        liquidity = (amountToken * amountETH) / 1e18; // ساده‌سازی شده
        
        return (amountToken, amountETH, liquidity);
    }
    
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external {
        require(deadline >= block.timestamp, "EXPIRED");
        require(path.length >= 2, "INVALID_PATH");
        
        // Transfer tokens from sender
        IERC20(path[0]).transferFrom(msg.sender, address(this), amountIn);
        
        // شبیه‌سازی swap - به ازای هر توکن، 0.0001 ETH میده
        uint amountOut = amountIn / 10000;
        
        if (amountOut >= amountOutMin && address(this).balance >= amountOut) {
            (bool success, ) = to.call{value: amountOut}("");
            require(success, "TRANSFER_FAILED");
        }
    }
    
    // برای دریافت ETH
    receive() external payable {}
}
