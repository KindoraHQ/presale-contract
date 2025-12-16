// Simple test to verify contract compilation and basic structure
const fs = require('fs');
const path = require('path');

console.log('=== Contract Compilation Verification ===\n');

const artifacts = [
  'KINDORA_PRESALE',
  'MockERC20',
  'MockUniswapV2Router02'
];

let allPass = true;

for (const artifact of artifacts) {
  const artifactPath = path.join(__dirname, 'artifacts-manual', `${artifact}.json`);
  
  if (fs.existsSync(artifactPath)) {
    const contract = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    console.log(`✓ ${artifact}:`);
    console.log(`  - ABI functions: ${contract.abi.filter(item => item.type === 'function').length}`);
    console.log(`  - ABI events: ${contract.abi.filter(item => item.type === 'event').length}`);
    console.log(`  - Bytecode length: ${contract.bytecode ? contract.bytecode.length : 0}`);
    
    if (!contract.bytecode || contract.bytecode.length === 0) {
      console.log(`  ✗ ERROR: No bytecode generated`);
      allPass = false;
    }
  } else {
    console.log(`✗ ${artifact}: Artifact not found`);
    allPass = false;
  }
  console.log('');
}

if (allPass) {
  console.log('✓ All contracts compiled successfully!\n');
  process.exit(0);
} else {
  console.log('✗ Some contracts failed compilation\n');
  process.exit(1);
}
