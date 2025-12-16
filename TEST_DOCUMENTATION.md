# Presale Contract Test Suite

## Overview
This test suite provides comprehensive testing for the KINDORA_PRESALE contract located in `contracts/Presale.sol`.

## Test Infrastructure

### Dependencies
- **Hardhat**: Ethereum development environment
- **Ethers.js v6**: Ethereum library for contract interaction
- **Chai**: Assertion library for tests
- **Hardhat Network Helpers**: Utilities for time manipulation and network control

### Mock Contracts
Located in `test/mocks/`:

1. **MockERC20.sol**: ERC-20 token implementation for testing
   - Implements standard ERC-20 functions (transfer, approve, transferFrom)
   - Includes mint function for test token distribution
   - Emits Transfer and Approval events

2. **MockUniswapV2Router02.sol**: Simplified Uniswap router for testing
   - Implements addLiquidityETH function
   - Used to test presale finalization and liquidity addition

## Test Coverage

### 1. Deployment and Initialization Tests
- ✓ Correct parameter initialization
- ✓ Revert on zero address inputs (token, router, marketing wallet)
- ✓ Initial state verification (finalized, totalRaisedWei, tokensSold, etc.)

### 2. Configuration Tests

#### setTimes
- ✓ Valid start/end time configuration
- ✓ Revert on past start time
- ✓ Revert on invalid time range (end before start)
- ✓ Access control (onlyOwner)

#### setCaps
- ✓ Valid soft/hard cap configuration
- ✓ Revert on zero soft cap
- ✓ Revert on hard cap ≤ soft cap
- ✓ Allow zero hard cap (unlimited)
- ✓ Access control

#### setBuyLimits
- ✓ Valid min/max buy limits
- ✓ Revert on zero minimum
- ✓ Revert on max ≤ min
- ✓ Allow zero max (unlimited)
- ✓ Access control

#### setSplit
- ✓ Valid LP/marketing split (must equal 100)
- ✓ Revert on invalid split sum
- ✓ Access control

#### setMarketingWallet
- ✓ Valid wallet update
- ✓ Revert on zero address
- ✓ Access control

#### setMaxSlippageBps
- ✓ Valid slippage configuration
- ✓ Revert on excessive slippage (>3000 bps)
- ✓ Access control

#### setListingRate
- ✓ Valid listing rate configuration
- ✓ Revert on zero rate
- ✓ Access control

#### configureStages
- ✓ Multiple stages configuration
- ✓ Event emission (StagesConfigured)
- ✓ Revert on empty stages
- ✓ Revert on mismatched array lengths
- ✓ Revert on zero token amounts
- ✓ Revert on zero rates
- ✓ Access control

### 3. Buy Functionality Tests

#### Happy Path
- ✓ Successful token purchase
- ✓ Purchase via receive() function
- ✓ Excess ETH refund
- ✓ Stage transition when sold out
- ✓ Multiple purchases from same user
- ✓ Correct event emission (Bought)
- ✓ Balance and state updates

#### Edge Cases
- ✓ Minimum buy amount
- ✓ Maximum buy amount
- ✓ Exact soft cap
- ✓ Exact hard cap
- ✓ Multiple simultaneous buyers

#### Failure Scenarios
- ✓ Revert before presale starts
- ✓ Revert on amount below minimum
- ✓ Revert when exceeding max buy limit
- ✓ Revert when exceeding hard cap
- ✓ Revert when tokens not deposited
- ✓ Revert when exceeding stage allocation

### 4. Refund Functionality Tests
- ✓ Successful refund when soft cap not met
- ✓ Event emission (Refunded)
- ✓ State cleanup (contributions and tokens reset)
- ✓ Revert if presale not ended
- ✓ Revert if soft cap met
- ✓ Revert if no contribution exists

### 5. Claim Functionality Tests
- ✓ Successful token claim after finalization
- ✓ Event emission (Claimed)
- ✓ Token transfer to user
- ✓ State cleanup (bought tokens reset)
- ✓ Revert if presale not ended
- ✓ Revert if soft cap not met
- ✓ Revert if not finalized
- ✓ Revert if no tokens to claim

### 6. Finalize Functionality Tests
- ✓ Successful finalization with liquidity addition
- ✓ Event emission (Finalized, LeftoverCreditedToMarketing)
- ✓ Marketing funds credited
- ✓ Leftover token handling
- ✓ Revert if presale not ended
- ✓ Revert if soft cap not met
- ✓ Revert if already finalized
- ✓ Revert if listing rate not set
- ✓ Revert if insufficient tokens for LP

### 7. Marketing Withdrawal Tests
- ✓ Successful withdrawal by marketing wallet
- ✓ Event emission (MarketingWithdrawn)
- ✓ Balance updates
- ✓ Revert if not marketing wallet
- ✓ Revert if no funds available

### 8. Emergency Function Tests

#### recoverTokensOnFailure
- ✓ Successful token recovery on failed presale
- ✓ Event emission (RecoveredTokensOnFailure)
- ✓ Revert if presale not ended
- ✓ Revert if soft cap met
- ✓ Revert on zero address

#### emergencyWithdrawERC20
- ✓ Withdraw extra sale tokens after finalization
- ✓ Withdraw other ERC-20 tokens
- ✓ Event emission (EmergencyERC20Withdrawn)
- ✓ Revert if not finalized
- ✓ Revert if trying to withdraw sold tokens
- ✓ Access control

### 9. View Function Tests
- ✓ presaleActive() status
- ✓ presaleEnded() status
- ✓ softCapMet() status
- ✓ getCurrentStageInfo() data
- ✓ getStageCount() count
- ✓ getMarketingPending() amount

### 10. Access Control Tests
- ✓ Ownable pattern enforcement
- ✓ Ownership transfer
- ✓ Revert on transfer to zero address
- ✓ Marketing wallet restrictions

### 11. Reentrancy Protection Tests
- ✓ NonReentrant modifier on buy()
- ✓ NonReentrant modifier on refund()
- ✓ NonReentrant modifier on claim()
- ✓ NonReentrant modifier on finalize()

### 12. ERC-20 Interface Tests (MockERC20)
- ✓ transfer() function and event
- ✓ approve() function and event
- ✓ transferFrom() function
- ✓ balanceOf() view
- ✓ allowance() view
- ✓ totalSupply() updates
- ✓ Revert on insufficient balance
- ✓ Revert on insufficient allowance
- ✓ Zero amount transfers
- ✓ Mint functionality

### 13. Edge Cases and Boundary Conditions
- ✓ Zero amount handling
- ✓ Maximum uint256 values (within reasonable test bounds)
- ✓ Invalid addresses (zero address)
- ✓ Simultaneous operations
- ✓ State transitions
- ✓ Precise boundary values (soft cap, hard cap, min/max buy)

## Running Tests

### Prerequisites
```bash
npm install
```

### Compile Contracts
```bash
npx hardhat compile
```

### Run All Tests
```bash
npx hardhat test
```

### Run Specific Test File
```bash
npx hardhat test test/Presale.test.js
```

### Run Tests with Coverage
```bash
npx hardhat coverage
```

### Run Tests with Gas Reporting
```bash
REPORT_GAS=true npx hardhat test
```

## Test Structure

Each test file follows this structure:

```javascript
describe("Category", function () {
  beforeEach(async function () {
    // Setup: Deploy contracts, configure presale, etc.
  });

  it("Should do something specific", async function () {
    // Arrange: Set up test conditions
    // Act: Execute the function being tested
    // Assert: Verify expected outcomes
  });
});
```

## Key Testing Patterns

### Time Manipulation
```javascript
const startTime = (await time.latest()) + 100;
await time.increaseTo(startTime);
```

### Event Testing
```javascript
await expect(contract.function())
  .to.emit(contract, "EventName")
  .withArgs(arg1, arg2);
```

### Revert Testing
```javascript
await expect(contract.function()).to.be.revertedWith("ERROR_MESSAGE");
await expect(contract.function()).to.be.revertedWithCustomError(contract, "ErrorName");
```

### Balance Tracking
```javascript
const initialBalance = await ethers.provider.getBalance(address);
// ... perform operation ...
const finalBalance = await ethers.provider.getBalance(address);
expect(finalBalance).to.equal(expectedBalance);
```

## Contract Functions Tested

### Owner Functions
- setTimes()
- setCaps()
- setBuyLimits()
- setSplit()
- setMarketingWallet()
- setMaxSlippageBps()
- setListingRate()
- configureStages()
- depositSaleTokens()
- recoverTokensOnFailure()
- emergencyWithdrawERC20()
- transferOwnership()

### User Functions
- buy()
- receive()
- refund()
- claim()

### Marketing Functions
- withdrawMarketing()

### Public Functions
- finalize()

### View Functions
- presaleActive()
- presaleEnded()
- softCapMet()
- getCurrentStageInfo()
- getStageCount()
- getMarketingPending()
- owner()
- All public state variables

## Notes

- Tests use MockERC20 and MockUniswapV2Router02 for isolated testing
- All tests are independent and can run in any order
- Time-dependent tests use Hardhat's time manipulation helpers
- Gas optimization is not a primary concern in test contracts
- Tests cover both success and failure scenarios
- Event emissions are verified for state-changing operations

## Future Enhancements

- Add fuzzing tests for edge cases
- Add integration tests with real Uniswap contracts (on fork)
- Add stress tests for gas optimization
- Add upgrade path tests if contract becomes upgradeable
- Add multi-signature wallet tests if added to marketing withdrawal
