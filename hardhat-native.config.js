const path = require('path');
const solc = require('solc');

// Override Hardhat's compiler downloader
require("@nomicfoundation/hardhat-toolbox");

const SOLC_VERSION = "0.8.26";

module.exports = {
  solidity: {
    compilers: [
      {
        version: SOLC_VERSION,
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      }
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
  },
  mocha: {
    timeout: 100000,
  },
};
