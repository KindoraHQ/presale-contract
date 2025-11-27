# CI Workflow Documentation

This document describes the GitHub Actions CI workflow configured for this Solidity smart contract repository.

## Overview

The CI workflow automatically runs on:
- **Push events** to `main`, `master`, and all feature branches
- **Pull request events** targeting `main`, `master`, and all feature branches

## Workflow Steps

### 1. Project Detection
The workflow automatically detects the project type:
- **Hardhat** (default): Detected via `hardhat.config.js/ts` or `package.json`
- **Foundry**: Detected via `foundry.toml` or `lib/foundry` directory
- **Brownie**: Detected via `brownie-config.yaml`

If no build tooling is present, a minimal Hardhat setup is automatically initialized.

### 2. Compilation
Compiles all Solidity contracts using the detected framework:
- Hardhat: `npm run compile` or `npx hardhat compile`
- Foundry: `forge build`
- Brownie: `brownie compile`

### 3. Linting
Runs static code analysis using solhint (or project's lint script if available).

### 4. Testing
Executes the test suite:
- Hardhat: `npm test` or `npx hardhat test`
- Foundry: `forge test`
- Brownie: `brownie test`

### 5. Coverage (Optional)
If a `coverage` script exists in `package.json`, it generates test coverage reports and uploads them as artifacts.

### 6. Slither Static Analysis
Runs [Slither](https://github.com/crytic/slither) security analysis:
- Results are uploaded as `slither-report.json` artifact
- **Note**: This step is set to `continue-on-error: true` and will not fail the build

## Running Locally

To run the same commands locally:

### Prerequisites
- Node.js 18.x
- npm or yarn

### Commands

```bash
# Install dependencies (if package.json exists)
npm install

# For a minimal Hardhat setup (if no tooling exists)
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox

# Compile contracts
npx hardhat compile

# Run linter
npm install --save-dev solhint
npx solhint 'contracts/**/*.sol'

# Run tests
npx hardhat test

# Run coverage (if configured)
npm run coverage

# Run Slither (requires Python and Slither installed)
pip install slither-analyzer
slither . --json slither-report.json
```

### For Foundry Projects
```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Compile
forge build

# Test
forge test

# Slither
slither .
```

### For Brownie Projects
```bash
# Install Brownie
pip install eth-brownie

# Compile
brownie compile

# Test
brownie test
```

## Artifacts

The workflow produces the following artifacts:
- **coverage-report**: Test coverage reports (if coverage script exists)
- **slither-report**: Slither static analysis JSON report

## Notes

- The Slither step is configured with `continue-on-error: true` to prevent security findings from blocking the CI pipeline. Review the uploaded report for any security concerns.
- Coverage upload to external services (e.g., Codecov) is not enabled by default.
- No secrets or tokens are required for this workflow.
