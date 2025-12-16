const solc = require('solc');
const fs = require('fs');
const path = require('path');

function findImports(importPath) {
  try {
    const contractPath = path.join(__dirname, importPath);
    const source = fs.readFileSync(contractPath, 'utf8');
    return { contents: source };
  } catch (e) {
    return { error: 'File not found' };
  }
}

const presaleSource = fs.readFileSync(path.join(__dirname, 'contracts/Presale.sol'), 'utf8');
const mockERC20Source = fs.readFileSync(path.join(__dirname, 'test/mocks/MockERC20.sol'), 'utf8');
const mockRouterSource = fs.readFileSync(path.join(__dirname, 'test/mocks/MockUniswapV2Router02.sol'), 'utf8');

const input = {
  language: 'Solidity',
  sources: {
    'contracts/Presale.sol': { content: presaleSource },
    'test/mocks/MockERC20.sol': { content: mockERC20Source },
    'test/mocks/MockUniswapV2Router02.sol': { content: mockRouterSource }
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode']
      }
    }
  }
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

// Create artifacts directory
const artifactsDir = path.join(__dirname, 'artifacts-manual');
if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

// Save artifacts
for (const contractFile in output.contracts) {
  for (const contractName in output.contracts[contractFile]) {
    const artifact = {
      contractName: contractName,
      abi: output.contracts[contractFile][contractName].abi,
      bytecode: output.contracts[contractFile][contractName].evm.bytecode.object
    };
    const artifactPath = path.join(artifactsDir, `${contractName}.json`);
    fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));
    console.log(`Saved ${contractName} artifact`);
  }
}

console.log('Compilation completed!');
