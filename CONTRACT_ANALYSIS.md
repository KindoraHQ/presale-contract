# KINDORA_PRESALE Contract Analysis

## Contract Overview

**File**: `contracts/Presale.sol`  
**Contract Name**: `KINDORA_PRESALE`  
**Inheritance**: Ownable, ReentrancyGuard  
**License**: MIT  
**Solidity Version**: ^0.8.20

## Core Functionality

### 1. Multi-Stage Presale System

The contract implements a sophisticated multi-stage presale mechanism where:
- Each stage has a specific token allocation and exchange rate
- Stages progress automatically when sold out
- Users buy tokens with ETH at the current stage rate
- Excess ETH is automatically refunded if purchase exceeds stage capacity

### 2. Configurable Parameters

#### Time-based Controls
- `startTime`: When the presale begins
- `endTime`: When the presale ends
- Only owner can configure before presale starts

#### Caps and Limits
- `softCapWei`: Minimum ETH to raise for successful presale
- `hardCapWei`: Maximum ETH that can be raised (0 = unlimited)
- `minBuyWei`: Minimum purchase amount per transaction
- `maxBuyWei`: Maximum total contribution per user (0 = unlimited)

#### Economic Parameters
- `listingRate`: Exchange rate for liquidity pool creation
- `lpPercent`: Percentage of raised funds for liquidity (default: 70%)
- `marketingPercent`: Percentage for marketing (default: 30%)
- `maxSlippageBps`: Maximum acceptable slippage for LP addition (max: 30%)

### 3. Stage Configuration

Stages are defined by:
```solidity
struct Stage {
    uint256 tokens;  // Total tokens available in this stage
    uint256 rate;    // Exchange rate (tokens per ETH, 18 decimals)
}
```

- Owner configures stages before presale starts
- Total allocation = sum of all stage tokens
- Stages are traversed sequentially during purchases

### 4. Purchase Flow

1. **Validation**:
   - Presale must be active
   - Amount >= minBuyWei
   - User total <= maxBuyWei (if set)
   - Total raised <= hardCapWei (if set)
   - Tokens must be deposited in contract

2. **Calculation**:
   - tokensOut = (amountWei * rate) / 1e18
   - Checks against stage capacity
   - Calculates exact ETH needed
   - Computes refund if any

3. **State Updates**:
   - Update user's contributed and bought amounts
   - Update total raised and tokens sold
   - Progress to next stage if current is exhausted
   - Refund excess ETH

4. **Event Emission**:
   - Emits `Bought` event with user, amount, tokens, and stage index

### 5. Refund Mechanism

If presale ends without reaching soft cap:
- Users can call `refund()` to get their ETH back
- Contributions and token allocations are reset
- Owner can recover deposited tokens via `recoverTokensOnFailure()`

### 6. Claim Mechanism

If presale succeeds (soft cap met):
- Presale must be finalized first
- Users call `claim()` to receive their tokens
- Tokens are transferred from contract to user
- User's bought balance is reset to prevent double-claiming

### 7. Finalization Process

After presale ends successfully:

1. **Liquidity Provision**:
   - Calculate LP allocation: lpWei = (totalRaised * lpPercent) / 100
   - Calculate tokens needed: lpTokens = (lpWei * listingRate) / 1e18
   - Approve router to spend tokens
   - Call `addLiquidityETH()` on Uniswap router
   - LP tokens sent to DEAD address (0x000...dEaD)
   - Slippage protection via minTokens and minETH

2. **Marketing Funds**:
   - Leftover ETH (after LP addition) credited to marketingPending
   - Marketing wallet can withdraw via `withdrawMarketing()`

3. **Leftover Tokens**:
   - Extra tokens (beyond sold amount) returned to owner
   - Prevents tokens from being locked in contract

### 8. Security Features

#### Reentrancy Protection
- `nonReentrant` modifier on:
  - buy()
  - refund()
  - claim()
  - finalize()
  - withdrawMarketing()

#### Access Control
- `onlyOwner` for configuration functions
- `onlyBeforeStart` prevents changes after presale begins
- Marketing wallet restriction on `withdrawMarketing()`

#### SafeERC20
- Uses OpenZeppelin's SafeERC20 library for all token operations
- Protects against non-standard ERC-20 implementations
- Handles tokens that don't return bool on transfer/approve

#### Input Validation
- Zero address checks
- Parameter range validation
- State requirement checks (ended, finalized, etc.)

### 9. State Variables

#### Immutable (Set at Deployment)
- `saleToken`: The ERC-20 token being sold
- `router`: Uniswap V2 router for liquidity
- `tokenDecimals`: Must be 18
- `DEAD`: 0x000...dEaD (for LP token burn)
- `BPS`: 10,000 (basis points)

#### Configuration (Owner-Controlled)
- Time parameters
- Caps and limits
- Split percentages
- Listing rate
- Marketing wallet address
- Slippage tolerance

#### Dynamic State
- `stages[]`: Array of sale stages
- `currentStage`: Active stage index
- `tokensSoldInCurrentStage`: Progress within current stage
- `finalized`: Whether presale has been finalized
- `contributedWei`: Mapping of user contributions
- `boughtTokens`: Mapping of user token allocations
- `totalRaisedWei`: Total ETH raised
- `tokensSold`: Total tokens sold
- `marketingPending`: ETH available for marketing withdrawal

## Integration Points

### External Contracts

1. **ERC-20 Token** (`saleToken`):
   - Must have 18 decimals
   - Must be deposited before presale starts
   - Transferred to users on claim
   - Transferred to owner (leftover) on finalization

2. **Uniswap V2 Router**:
   - Used in `finalize()` to add liquidity
   - Receives token approval
   - Called with `addLiquidityETH()`
   - Deadline set to block.timestamp + 3600

### Events

- `StagesConfigured(stageCount, totalTokens)`
- `Bought(user, amountWei, tokensOut, stageIndex)`
- `Refunded(user, amountWei)`
- `Claimed(user, amountTokens)`
- `Finalized(lpWei, marketingWei, lpTokensUsed, amountETHUsed, liquidity)`
- `MarketingWithdrawn(to, amount)`
- `LeftoverCreditedToMarketing(amount)`
- `EmergencyERC20Withdrawn(token, to, amount)`
- `RecoveredTokensOnFailure(to, amount)`
- `OwnershipTransferred(previousOwner, newOwner)` (inherited)

## Typical Usage Flow

### Setup (Owner)
1. Deploy contract with token, router, and marketing wallet
2. Configure times: `setTimes(start, end)`
3. Configure caps: `setCaps(softCap, hardCap)`
4. Configure limits: `setBuyLimits(min, max)`
5. Set listing rate: `setListingRate(rate)`
6. Configure stages: `configureStages(tokens[], rates[])`
7. Deposit tokens: `depositSaleTokens(amount)`

### Presale Active (Users)
8. Users send ETH to contract or call `buy()`
9. Contract calculates tokens, updates state, refunds excess
10. Stages progress automatically as they sell out

### After Presale Ends

**Success Path** (soft cap met):
11. Anyone calls `finalize()`
12. Liquidity added to DEX
13. Marketing funds credited
14. Users call `claim()` to receive tokens

**Failure Path** (soft cap not met):
11. Users call `refund()` to get ETH back
12. Owner calls `recoverTokensOnFailure()` to retrieve tokens

### Post-Finalization
13. Marketing wallet calls `withdrawMarketing()` as needed
14. Owner can use `emergencyWithdrawERC20()` for stuck tokens (if any)

## Advanced Features

### Precise Token Calculation
```solidity
uint256 tokensOut = (amountWei * s.rate) / 1e18;
uint256 usedWei = (tokensOut * 1e18 + s.rate - 1) / s.rate;
uint256 refundWei = amountWei - usedWei;
```

This ensures:
- Correct token amount based on rate
- Exact ETH needed is calculated (with rounding up)
- User gets refund for unused ETH

### Slippage Protection
```solidity
uint256 minTokens = (lpTokensNeeded * (BPS - maxSlippageBps)) / BPS;
uint256 minETH = (lpWei * (BPS - maxSlippageBps)) / BPS;
```

Protects against:
- Price manipulation during LP addition
- Excessive slippage
- Front-running attacks

### Force Approve Pattern
```solidity
saleToken.forceApprove(address(router), 0);
saleToken.forceApprove(address(router), lpTokensNeeded);
// ... use approval ...
saleToken.forceApprove(address(router), 0);
```

This pattern:
- Resets approval to 0 first
- Sets new approval
- Clears approval after use
- Works with tokens like USDT that require 0 approval before changing

## Gas Optimizations

- Uses `immutable` for deployment-time constants
- Minimal storage reads in loops
- Efficient calculations (unchecked math where safe via OpenZeppelin)
- Single SSTORE for state changes where possible

## Security Considerations

### Strengths
✓ Reentrancy protection on all external calls  
✓ Uses SafeERC20 for token operations  
✓ Comprehensive input validation  
✓ Owner functions protected and time-restricted  
✓ Slippage protection on DEX operations  
✓ Clear state machine (presale states)  

### Recommendations
- Consider adding pausable functionality for emergencies
- Consider timelocks for owner functions
- Consider multisig for owner and marketing wallet
- Document expected gas costs for users
- Consider adding a whitelist mechanism if needed

## Testing Priorities

1. **Critical**: Buy, refund, claim, finalize flow
2. **High**: Stage transitions, access control, reentrancy
3. **Medium**: Edge cases, boundary conditions, event emissions
4. **Low**: View functions, gas optimization verification

All priorities are covered in the comprehensive test suite at `test/Presale.test.js`.
