# CI / GitHub Actions

This repository's CI workflow lives at `.github/workflows/ci.yml`.

What the CI does
- Triggers on push and pull_request for main/master and common feature/release branch patterns.
- Detects the project type automatically:
  - Node / Hardhat (package.json + Hardhat)
  - Foundry (foundry.toml / forge)
  - Brownie (brownie-config.yaml / python)
- Installs dependencies, compiles contracts, lints when available, runs tests, and uploads coverage and Slither reports as artifacts.
- Runs Slither in Docker and marks that step as non-blocking (continue-on-error: true) so transient infra issues won't block PRs.

Run the same checks locally
- Node / Hardhat:
  - Install: npm ci (or npm install)
  - Compile: npm run compile  (or npx hardhat compile)
  - Lint: npm run lint
  - Test: npm test (or npx hardhat test)
- Foundry:
  - Install Foundry: curl -L https://foundry.paradigm.xyz | bash
  - Build: forge build
  - Test: forge test
- Brownie:
  - Install: pip install -r requirements.txt
  - Compile: brownie compile
  - Test: brownie test

Notes
- No secrets are required by the workflow.
- Coverage artifact upload assumes your project produces a `coverage/` directory or files under `coverage/**`.
- Slither runs in Docker and its report will be uploaded as `slither-report.json`. Slither is set to continue-on-error to avoid blocking PRs for infra/tool issues.
