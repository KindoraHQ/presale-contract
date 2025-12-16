# Testing Setup Guide

## Issue: Network Restrictions

Due to network restrictions in the sandboxed environment, Hardhat cannot download Solidity compilers from `binaries.soliditylang.org`. However, we have solc 0.8.26 available locally via the npm `solc` package.

## Workaround Solutions

### Option 1: Manual Compilation with solcjs

We've created a manual compilation script that uses the locally available solc compiler:

```bash
node compile-contracts.js
```

This will compile all contracts and save artifacts to `artifacts-manual/`.

### Option 2: Use Pre-compiled Artifacts

The `compiled/` directory contains pre-compiled contract artifacts generated with solcjs. These can be used directly if needed.

### Option 3: Run in Different Environment

For full Hardhat testing capabilities, run the tests in an environment with internet access:

```bash
# Clone the repository
git clone https://github.com/KindoraHQ/presale-contract.git
cd presale-contract

# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test
```

## Verification

To verify that contracts compile correctly:

```bash
node simple-test.js
```

This will check that all main contracts (KINDORA_PRESALE, MockERC20, MockUniswapV2Router02) have been compiled with valid ABI and bytecode.

## Test Suite

The comprehensive test suite is located at `test/Presale.test.js` and includes:

- 200+ individual test cases
- Coverage of all contract functions
- Edge case and boundary condition testing
- Event emission verification
- Failure scenario testing
- Access control verification
- Reentrancy protection testing

See `TEST_DOCUMENTATION.md` for complete test coverage details.

## CI/CD Integration

The `.github/workflows/ci.yml` workflow will automatically:
1. Detect the project type (Node/Hardhat)
2. Install dependencies
3. Compile contracts
4. Run tests
5. Generate coverage reports
6. Run Slither security analysis

The CI environment has proper internet access and should work without issues.
