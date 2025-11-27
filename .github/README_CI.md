# CI Pipeline

This document describes the Continuous Integration (CI) setup for the presale-contract repository.

## CI Workflow

The CI workflow (`.github/workflows/ci.yml`) runs automatically on:

- **Push** to `main`, `master`, or any feature branches (`feature/**`, `feat/**`, `fix/**`, `release/**`)
- **Pull requests** targeting `main`, `master`, or any branch

## Jobs

### 1. Build and Test (`build-and-test`)

Runs on `ubuntu-latest` with Node.js 18.x:

| Step | Command | Description |
|------|---------|-------------|
| Install dependencies | `npm ci` | Install npm packages |
| Compile contracts | `npm run compile` | Compile Solidity contracts with Hardhat |
| Run linter | `npm run lint` | Run Solhint to check code style |
| Run tests | `npm test` | Execute Hardhat tests |
| Run coverage | `npm run coverage` | Generate test coverage report |

**Note:** Coverage step is set to `continue-on-error: true` since it may not be configured for all projects.

### 2. Slither Static Analysis (`slither-analysis`)

Runs the [Slither](https://github.com/crytic/slither) static analyzer to detect potential vulnerabilities:

- Uses the official `crytic/slither-action`
- Generates SARIF and JSON reports as artifacts
- Set to `continue-on-error: true` to avoid blocking PRs on infrastructure issues

## Running Commands Locally

You can run the same commands locally that CI executes:

```bash
# Install dependencies
npm install

# Compile Solidity contracts
npm run compile

# Run Solhint linter
npm run lint

# Run tests
npm test

# Generate coverage report
npm run coverage
```

## Artifacts

The CI pipeline uploads the following artifacts:

- **coverage-report**: Test coverage files (if generated)
- **slither-sarif**: Slither SARIF report for GitHub Security tab
- **slither-json**: Slither JSON report with detailed findings

## Dependencies

The project uses:

- **Hardhat**: Ethereum development environment
- **@nomicfoundation/hardhat-toolbox**: Hardhat plugin bundle (ethers, chai, coverage, etc.)
- **@openzeppelin/contracts**: Audited smart contract library
- **Solhint**: Solidity linter

## Adding Tests

Create test files in the `test/` directory using Hardhat's testing framework:

```javascript
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("KindoraPresale", function () {
  it("should deploy successfully", async function () {
    // Test implementation
  });
});
```

Run tests with:

```bash
npm test
```
