// scripts/deploy.js
const hre = require("hardhat");
const { ethers } = require("hardhat");

// 🔧 تنظیمات اصلی - اینجا رو ویرایش کن
const CONFIG = {
  // آدرس‌های مهم
  PANCAKESWAP_ROUTER: "0x10ED43C718714eb63d5aA57B78B54704E256024E", // BSC Mainnet
  // PANCAKESWAP_ROUTER: "0xD99D1c33F9fC3444f8101754aBC46c52416550D1", // BSC Testnet
  
  MARKETING_WALLET: "0xYourMarketingWalletAddress", // 👈 اینجا رو تغییر بده
  CHARITY_WALLET: "0xYourCharityWalletAddress", // 👈 اینجا رو تغییر بده
  
  // تنظیمات Presale
  PRESALE: {
    START_TIME: Math.floor(Date.now() / 1000) + 3600, // 1 ساعت بعد
    DURATION_DAYS: 7, // 7 روز
    
    SOFT_CAP: ethers.parseEther("50"), // 50 BNB
    HARD_CAP: ethers.parseEther("100"), // 100 BNB
    
    MIN_BUY: ethers.parseEther("0.1"), // 0.1 BNB
    MAX_BUY: ethers.parseEther("5"), // 5 BNB
    
    LP_PERCENT: 70, // 70% به LP
    MARKETING_PERCENT: 30, // 30% به Marketing
    
    LISTING_RATE: ethers.parseEther("70000"), // 70,000 tokens per BNB
    
    // Stages (rate = tokens per BNB)
    STAGES: [
      { tokens: ethers.parseUnits("1000000", 18), rate: ethers.parseEther("80000") }, // Stage 1: 1M tokens @ 80k/BNB
      { tokens: ethers.parseUnits("1000000", 18), rate: ethers.parseEther("75000") }, // Stage 2: 1M tokens @ 75k/BNB
      { tokens: ethers.parseUnits("1000000", 18), rate: ethers.parseEther("70000") }, // Stage 3: 1M tokens @ 70k/BNB
    ]
  }
};

async function main() {
  console.log("🚀 شروع دیپلویمنت Kindora + Presale...\n");
  
  const [deployer] = await ethers.getSigners();
  console.log("📍 Deployer Address:", deployer.address);
  console.log("💰 Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB\n");
  
  // ===== 1. Deploy Kindora Token =====
  console.log("📝 Step 1: Deploying Kindora Token...");
  const Kindora = await ethers.getContractFactory("Kindora");
  const token = await Kindora.deploy(CONFIG.PANCAKESWAP_ROUTER);
  await token.waitForDeployment();
  const tokenAddress = await token.getAddress();
  console.log("✅ Kindora Token deployed:", tokenAddress);
  
  // ===== 2. Deploy Presale =====
  console.log("\n📝 Step 2: Deploying Presale Contract...");
  const Presale = await ethers.getContractFactory("KINDORA_PRESALE");
  const presale = await Presale.deploy(
    tokenAddress,
    CONFIG.PANCAKESWAP_ROUTER,
    CONFIG.MARKETING_WALLET
  );
  await presale.waitForDeployment();
  const presaleAddress = await presale.getAddress();
  console.log("✅ Presale deployed:", presaleAddress);
  
  // ===== 3. Configure Presale =====
  console.log("\n📝 Step 3: Configuring Presale...");
  
  // Set Times
  const startTime = CONFIG.PRESALE.START_TIME;
  const endTime = startTime + (CONFIG.PRESALE.DURATION_DAYS * 24 * 60 * 60);
  console.log("⏰ Setting times...");
  await (await presale.setTimes(startTime, endTime)).wait();
  console.log("   Start:", new Date(startTime * 1000).toLocaleString());
  console.log("   End:", new Date(endTime * 1000).toLocaleString());
  
  // Set Caps
  console.log("💎 Setting caps...");
  await (await presale.setCaps(CONFIG.PRESALE.SOFT_CAP, CONFIG.PRESALE.HARD_CAP)).wait();
  console.log("   Soft Cap:", ethers.formatEther(CONFIG.PRESALE.SOFT_CAP), "BNB");
  console.log("   Hard Cap:", ethers.formatEther(CONFIG.PRESALE.HARD_CAP), "BNB");
  
  // Set Buy Limits
  console.log("🎯 Setting buy limits...");
  await (await presale.setBuyLimits(CONFIG.PRESALE.MIN_BUY, CONFIG.PRESALE.MAX_BUY)).wait();
  console.log("   Min Buy:", ethers.formatEther(CONFIG.PRESALE.MIN_BUY), "BNB");
  console.log("   Max Buy:", ethers.formatEther(CONFIG.PRESALE.MAX_BUY), "BNB");
  
  // Set Listing Rate
  console.log("📊 Setting listing rate...");
  await (await presale.setListingRate(CONFIG.PRESALE.LISTING_RATE)).wait();
  console.log("   Rate:", ethers.formatEther(CONFIG.PRESALE.LISTING_RATE), "tokens/BNB");
  
  // Configure Stages
  console.log("🎪 Configuring stages...");
  const stageTokens = CONFIG.PRESALE.STAGES.map(s => s.tokens);
  const stageRates = CONFIG.PRESALE.STAGES.map(s => s.rate);
  await (await presale.configureStages(stageTokens, stageRates)).wait();
  
  let totalSaleTokens = 0n;
  CONFIG.PRESALE.STAGES.forEach((stage, i) => {
    totalSaleTokens += stage.tokens;
    console.log(`   Stage ${i + 1}:`, ethers.formatUnits(stage.tokens, 18), "tokens @", ethers.formatEther(stage.rate), "tokens/BNB");
  });
  
  // ===== 4. محاسبه و Deposit توکن‌ها =====
  console.log("\n📝 Step 4: Calculating and Depositing Tokens...");
  
  // محاسبه LP tokens مورد نیاز
  const hardCapWei = CONFIG.PRESALE.HARD_CAP;
  const lpWei = (hardCapWei * BigInt(CONFIG.PRESALE.LP_PERCENT)) / 100n;
  const lpTokensNeeded = (lpWei * CONFIG.PRESALE.LISTING_RATE) / ethers.parseEther("1");
  
  const totalTokensNeeded = totalSaleTokens + lpTokensNeeded;
  
  console.log("💰 Token Requirements:");
  console.log("   Sale Tokens:", ethers.formatUnits(totalSaleTokens, 18));
  console.log("   LP Tokens:", ethers.formatUnits(lpTokensNeeded, 18));
  console.log("   Total Needed:", ethers.formatUnits(totalTokensNeeded, 18));
  
  // Approve و Deposit
  console.log("\n🔓 Approving tokens...");
  await (await token.approve(presaleAddress, totalTokensNeeded)).wait();
  
  console.log("📦 Depositing tokens to presale...");
  await (await presale.depositSaleTokens(totalTokensNeeded)).wait();
  console.log("✅ Tokens deposited successfully!");
  
  // ===== 5. معاف کردن Presale از Fees و Limits =====
  console.log("\n📝 Step 5: Exempting Presale from Fees & Limits...");
  await (await token.setExcludedFromFees(presaleAddress, true)).wait();
  console.log("✅ Presale excluded from fees");
  
  await (await token.setExcludedFromLimits(presaleAddress, true)).wait();
  console.log("✅ Presale excluded from limits");
  
  // ===== 6. خلاصه نهایی =====
  console.log("\n" + "=".repeat(60));
  console.log("🎉 DEPLOYMENT SUCCESSFUL!");
  console.log("=".repeat(60));
  console.log("\n📋 Contract Addresses:");
  console.log("   Kindora Token:", tokenAddress);
  console.log("   Presale:", presaleAddress);
  console.log("   Router:", CONFIG.PANCAKESWAP_ROUTER);
  console.log("   Marketing Wallet:", CONFIG.MARKETING_WALLET);
  
  console.log("\n⏳ Presale Info:");
  console.log("   Starts:", new Date(startTime * 1000).toLocaleString());
  console.log("   Ends:", new Date(endTime * 1000).toLocaleString());
  console.log("   Soft Cap:", ethers.formatEther(CONFIG.PRESALE.SOFT_CAP), "BNB");
  console.log("   Hard Cap:", ethers.formatEther(CONFIG.PRESALE.HARD_CAP), "BNB");
  
  console.log("\n📊 Token Distribution:");
  console.log("   Total Supply: 10,000,000 KNR");
  console.log("   Presale Sale:", ethers.formatUnits(totalSaleTokens, 18), "KNR");
  console.log("   Presale LP:", ethers.formatUnits(lpTokensNeeded, 18), "KNR");
  console.log("   Remaining in Wallet:", ethers.formatUnits(
    ethers.parseUnits("10000000", 18) - totalTokensNeeded, 18
  ), "KNR");
  
  console.log("\n⚠️  IMPORTANT - بعد از Presale:");
  console.log("   1. صبر کن تا presale تموم بشه");
  console.log("   2. هر کسی می‌تونه finalize() رو صدا بزنه");
  console.log("   3. بعد از finalize، اجرا کن:");
  console.log(`      await token.setCharityWallet("${CONFIG.CHARITY_WALLET}")`);
  console.log("      await token.enableTrading()");
  console.log("   4. Users می‌تونن claim() کنن");
  
  console.log("\n📝 Verification Commands:");
  console.log(`npx hardhat verify --network bsc ${tokenAddress} "${CONFIG.PANCAKESWAP_ROUTER}"`);
  console.log(`npx hardhat verify --network bsc ${presaleAddress} "${tokenAddress}" "${CONFIG.PANCAKESWAP_ROUTER}" "${CONFIG.MARKETING_WALLET}"`);
  
  console.log("\n✅ همه چی آماده است! 🚀\n");
  
  // ذخیره آدرس‌ها برای استفاده بعدی
  const fs = require('fs');
  const addresses = {
    token: tokenAddress,
    presale: presaleAddress,
    router: CONFIG.PANCAKESWAP_ROUTER,
    marketing: CONFIG.MARKETING_WALLET,
    charity: CONFIG.CHARITY_WALLET,
    deployedAt: new Date().toISOString()
  };
  fs.writeFileSync('deployed-addresses.json', JSON.stringify(addresses, null, 2));
  console.log("💾 Addresses saved to deployed-addresses.json\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
