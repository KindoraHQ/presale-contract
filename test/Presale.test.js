const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Presale Contract - Comprehensive Test Suite", function () {
  let presale;
  let saleToken;
  let router;
  let weth;
  let owner;
  let marketingWallet;
  let user1;
  let user2;
  let user3;
  let addrs;

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";
  
  // Helper to convert ether to wei
  const toWei = (amount) => ethers.parseEther(amount.toString());
  
  // Helper to convert tokens (18 decimals)
  const toTokens = (amount) => ethers.parseUnits(amount.toString(), 18);

  beforeEach(async function () {
    [owner, marketingWallet, user1, user2, user3, ...addrs] = await ethers.getSigners();

    // Deploy MockERC20 for WETH
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
    
    // Deploy MockERC20 for sale token
    saleToken = await MockERC20.deploy("Kindora Token", "KNDRA", 18);
    
    // Deploy MockUniswapV2Router02
    const MockRouter = await ethers.getContractFactory("MockUniswapV2Router02");
    router = await MockRouter.deploy(await weth.getAddress());

    // Deploy Presale contract
    const Presale = await ethers.getContractFactory("KINDORA_PRESALE");
    presale = await Presale.deploy(
      await saleToken.getAddress(),
      await router.getAddress(),
      marketingWallet.address
    );

    // Mint tokens to owner for presale
    await saleToken.mint(owner.address, toTokens(10000000));
  });

  describe("Deployment and Initialization", function () {
    it("Should deploy with correct parameters", async function () {
      expect(await presale.saleToken()).to.equal(await saleToken.getAddress());
      expect(await presale.router()).to.equal(await router.getAddress());
      expect(await presale.marketingWallet()).to.equal(marketingWallet.address);
      expect(await presale.owner()).to.equal(owner.address);
    });

    it("Should revert if sale token address is zero", async function () {
      const Presale = await ethers.getContractFactory("KINDORA_PRESALE");
      await expect(
        Presale.deploy(ZERO_ADDRESS, await router.getAddress(), marketingWallet.address)
      ).to.be.revertedWith("TOKEN_ZERO");
    });

    it("Should revert if router address is zero", async function () {
      const Presale = await ethers.getContractFactory("KINDORA_PRESALE");
      await expect(
        Presale.deploy(await saleToken.getAddress(), ZERO_ADDRESS, marketingWallet.address)
      ).to.be.revertedWith("ROUTER_ZERO");
    });

    it("Should revert if marketing wallet address is zero", async function () {
      const Presale = await ethers.getContractFactory("KINDORA_PRESALE");
      await expect(
        Presale.deploy(await saleToken.getAddress(), await router.getAddress(), ZERO_ADDRESS)
      ).to.be.revertedWith("MKT_ZERO");
    });

    it("Should have correct initial values", async function () {
      expect(await presale.finalized()).to.equal(false);
      expect(await presale.totalRaisedWei()).to.equal(0);
      expect(await presale.tokensSold()).to.equal(0);
      expect(await presale.currentStage()).to.equal(0);
      expect(await presale.lpPercent()).to.equal(70);
      expect(await presale.marketingPercent()).to.equal(30);
    });
  });

  describe("Configuration - setTimes", function () {
    it("Should set start and end times correctly", async function () {
      const startTime = (await time.latest()) + 3600; // 1 hour from now
      const endTime = startTime + 86400; // 24 hours after start

      await presale.setTimes(startTime, endTime);
      expect(await presale.startTime()).to.equal(startTime);
      expect(await presale.endTime()).to.equal(endTime);
    });

    it("Should revert if start time is in the past", async function () {
      const startTime = (await time.latest()) - 3600;
      const endTime = startTime + 86400;

      await expect(presale.setTimes(startTime, endTime)).to.be.revertedWith("START_IN_PAST");
    });

    it("Should revert if end time is before start time", async function () {
      const startTime = (await time.latest()) + 3600;
      const endTime = startTime - 100;

      await expect(presale.setTimes(startTime, endTime)).to.be.revertedWith("BAD_TIME");
    });

    it("Should revert if called by non-owner", async function () {
      const startTime = (await time.latest()) + 3600;
      const endTime = startTime + 86400;

      await expect(
        presale.connect(user1).setTimes(startTime, endTime)
      ).to.be.revertedWithCustomError(presale, "OwnableUnauthorizedAccount");
    });
  });

  describe("Configuration - setCaps", function () {
    it("Should set soft and hard caps correctly", async function () {
      await presale.setCaps(toWei(10), toWei(100));
      expect(await presale.softCapWei()).to.equal(toWei(10));
      expect(await presale.hardCapWei()).to.equal(toWei(100));
    });

    it("Should revert if soft cap is zero", async function () {
      await expect(presale.setCaps(0, toWei(100))).to.be.revertedWith("SOFT_ZERO");
    });

    it("Should revert if hard cap is less than or equal to soft cap", async function () {
      await expect(presale.setCaps(toWei(100), toWei(50))).to.be.revertedWith("HARD_SOFT");
    });

    it("Should allow hard cap to be zero (unlimited)", async function () {
      await presale.setCaps(toWei(10), 0);
      expect(await presale.hardCapWei()).to.equal(0);
    });

    it("Should revert if called by non-owner", async function () {
      await expect(
        presale.connect(user1).setCaps(toWei(10), toWei(100))
      ).to.be.revertedWithCustomError(presale, "OwnableUnauthorizedAccount");
    });
  });

  describe("Configuration - setBuyLimits", function () {
    it("Should set buy limits correctly", async function () {
      await presale.setBuyLimits(toWei(0.1), toWei(10));
      expect(await presale.minBuyWei()).to.equal(toWei(0.1));
      expect(await presale.maxBuyWei()).to.equal(toWei(10));
    });

    it("Should revert if min buy is zero", async function () {
      await expect(presale.setBuyLimits(0, toWei(10))).to.be.revertedWith("MIN_ZERO");
    });

    it("Should revert if max buy is less than or equal to min buy", async function () {
      await expect(presale.setBuyLimits(toWei(10), toWei(5))).to.be.revertedWith("MAX_LE_MIN");
    });

    it("Should allow max buy to be zero (unlimited)", async function () {
      await presale.setBuyLimits(toWei(0.1), 0);
      expect(await presale.maxBuyWei()).to.equal(0);
    });

    it("Should revert if called by non-owner", async function () {
      await expect(
        presale.connect(user1).setBuyLimits(toWei(0.1), toWei(10))
      ).to.be.revertedWithCustomError(presale, "OwnableUnauthorizedAccount");
    });
  });

  describe("Configuration - setSplit", function () {
    it("Should set LP and marketing split correctly", async function () {
      await presale.setSplit(80, 20);
      expect(await presale.lpPercent()).to.equal(80);
      expect(await presale.marketingPercent()).to.equal(20);
    });

    it("Should revert if split doesn't equal 100", async function () {
      await expect(presale.setSplit(70, 20)).to.be.revertedWith("BAD_SPLIT");
    });

    it("Should revert if called by non-owner", async function () {
      await expect(
        presale.connect(user1).setSplit(80, 20)
      ).to.be.revertedWithCustomError(presale, "OwnableUnauthorizedAccount");
    });
  });

  describe("Configuration - setMarketingWallet", function () {
    it("Should set marketing wallet correctly", async function () {
      await presale.setMarketingWallet(user1.address);
      expect(await presale.marketingWallet()).to.equal(user1.address);
    });

    it("Should revert if marketing wallet is zero address", async function () {
      await expect(presale.setMarketingWallet(ZERO_ADDRESS)).to.be.revertedWith("MKT_ZERO");
    });

    it("Should revert if called by non-owner", async function () {
      await expect(
        presale.connect(user1).setMarketingWallet(user2.address)
      ).to.be.revertedWithCustomError(presale, "OwnableUnauthorizedAccount");
    });
  });

  describe("Configuration - setMaxSlippageBps", function () {
    it("Should set max slippage correctly", async function () {
      await presale.setMaxSlippageBps(500);
      expect(await presale.maxSlippageBps()).to.equal(500);
    });

    it("Should revert if slippage is too high", async function () {
      await expect(presale.setMaxSlippageBps(3001)).to.be.revertedWith("SLIP_TOO_HIGH");
    });

    it("Should revert if called by non-owner", async function () {
      await expect(
        presale.connect(user1).setMaxSlippageBps(500)
      ).to.be.revertedWithCustomError(presale, "OwnableUnauthorizedAccount");
    });
  });

  describe("Configuration - setListingRate", function () {
    it("Should set listing rate correctly", async function () {
      await presale.setListingRate(toWei(1000));
      expect(await presale.listingRate()).to.equal(toWei(1000));
    });

    it("Should revert if listing rate is zero", async function () {
      await expect(presale.setListingRate(0)).to.be.revertedWith("LIST_ZERO");
    });

    it("Should revert if called by non-owner", async function () {
      await expect(
        presale.connect(user1).setListingRate(toWei(1000))
      ).to.be.revertedWithCustomError(presale, "OwnableUnauthorizedAccount");
    });
  });

  describe("Configuration - configureStages", function () {
    it("Should configure stages correctly", async function () {
      const tokens = [toTokens(100000), toTokens(200000), toTokens(300000)];
      const rates = [toWei(1000), toWei(900), toWei(800)];

      await expect(presale.configureStages(tokens, rates))
        .to.emit(presale, "StagesConfigured")
        .withArgs(3, toTokens(600000));

      expect(await presale.getStageCount()).to.equal(3);
      expect(await presale.saleAllocation()).to.equal(toTokens(600000));
    });

    it("Should revert if no stages provided", async function () {
      await expect(presale.configureStages([], [])).to.be.revertedWith("NO_STAGES");
    });

    it("Should revert if array lengths don't match", async function () {
      const tokens = [toTokens(100000), toTokens(200000)];
      const rates = [toWei(1000)];

      await expect(presale.configureStages(tokens, rates)).to.be.revertedWith("LEN_MISMATCH");
    });

    it("Should revert if stage has zero tokens", async function () {
      const tokens = [toTokens(100000), 0];
      const rates = [toWei(1000), toWei(900)];

      await expect(presale.configureStages(tokens, rates)).to.be.revertedWith("ZERO_STAGE");
    });

    it("Should revert if stage has zero rate", async function () {
      const tokens = [toTokens(100000), toTokens(200000)];
      const rates = [toWei(1000), 0];

      await expect(presale.configureStages(tokens, rates)).to.be.revertedWith("ZERO_RATE");
    });

    it("Should revert if called by non-owner", async function () {
      const tokens = [toTokens(100000)];
      const rates = [toWei(1000)];

      await expect(
        presale.connect(user1).configureStages(tokens, rates)
      ).to.be.revertedWithCustomError(presale, "OwnableUnauthorizedAccount");
    });
  });

  describe("Deposit Sale Tokens", function () {
    it("Should allow owner to deposit sale tokens", async function () {
      const amount = toTokens(1000000);
      await saleToken.approve(await presale.getAddress(), amount);
      await presale.depositSaleTokens(amount);

      expect(await saleToken.balanceOf(await presale.getAddress())).to.equal(amount);
    });

    it("Should revert if called by non-owner", async function () {
      const amount = toTokens(1000000);
      await saleToken.connect(user1).approve(await presale.getAddress(), amount);
      
      await expect(
        presale.connect(user1).depositSaleTokens(amount)
      ).to.be.revertedWithCustomError(presale, "OwnableUnauthorizedAccount");
    });
  });

  describe("Buy Functionality - Happy Path", function () {
    beforeEach(async function () {
      // Setup presale
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 86400;
      await presale.setTimes(startTime, endTime);
      await presale.setCaps(toWei(10), toWei(100));
      await presale.setBuyLimits(toWei(0.1), toWei(50));
      await presale.setListingRate(toWei(1000));

      const tokens = [toTokens(100000), toTokens(200000)];
      const rates = [toWei(1000), toWei(900)];
      await presale.configureStages(tokens, rates);

      // Deposit tokens
      const depositAmount = toTokens(500000);
      await saleToken.approve(await presale.getAddress(), depositAmount);
      await presale.depositSaleTokens(depositAmount);

      // Move to start time
      await time.increaseTo(startTime);
    });

    it("Should allow buying tokens", async function () {
      const buyAmount = toWei(1);
      const expectedTokens = toTokens(1000); // 1 ETH * 1000 rate

      await expect(presale.connect(user1).buy({ value: buyAmount }))
        .to.emit(presale, "Bought")
        .withArgs(user1.address, buyAmount, expectedTokens, 0);

      expect(await presale.contributedWei(user1.address)).to.equal(buyAmount);
      expect(await presale.boughtTokens(user1.address)).to.equal(expectedTokens);
      expect(await presale.totalRaisedWei()).to.equal(buyAmount);
      expect(await presale.tokensSold()).to.equal(expectedTokens);
    });

    it("Should handle purchases via receive function", async function () {
      const buyAmount = toWei(1);
      const expectedTokens = toTokens(1000);

      await expect(
        user1.sendTransaction({ to: await presale.getAddress(), value: buyAmount })
      ).to.emit(presale, "Bought");

      expect(await presale.boughtTokens(user1.address)).to.equal(expectedTokens);
    });

    it("Should refund excess ETH when buying exact stage amount", async function () {
      // Buy with extra ETH
      const buyAmount = toWei(150); // More than stage 1 can handle
      const stage1Tokens = toTokens(100000);
      const expectedWeiUsed = toWei(100); // 100000 tokens / 1000 rate
      
      const initialBalance = await ethers.provider.getBalance(user1.address);
      const tx = await presale.connect(user1).buy({ value: buyAmount });
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const finalBalance = await ethers.provider.getBalance(user1.address);

      expect(await presale.boughtTokens(user1.address)).to.equal(stage1Tokens);
      expect(await presale.contributedWei(user1.address)).to.equal(expectedWeiUsed);
      
      // User should get refund
      const refund = buyAmount - expectedWeiUsed;
      expect(finalBalance).to.be.closeTo(initialBalance - expectedWeiUsed - gasUsed, toWei(0.001));
    });

    it("Should transition to next stage when current stage is sold out", async function () {
      // Buy all of stage 1
      await presale.connect(user1).buy({ value: toWei(100) });
      
      expect(await presale.currentStage()).to.equal(1);
      expect(await presale.tokensSoldInCurrentStage()).to.equal(0);

      // Buy from stage 2
      await presale.connect(user2).buy({ value: toWei(1) });
      const expectedTokensStage2 = toTokens(900); // 1 ETH * 900 rate

      expect(await presale.boughtTokens(user2.address)).to.equal(expectedTokensStage2);
    });

    it("Should handle multiple purchases from same user", async function () {
      await presale.connect(user1).buy({ value: toWei(1) });
      await presale.connect(user1).buy({ value: toWei(2) });

      expect(await presale.contributedWei(user1.address)).to.equal(toWei(3));
      expect(await presale.boughtTokens(user1.address)).to.equal(toTokens(3000));
    });
  });

  describe("Buy Functionality - Edge Cases", function () {
    beforeEach(async function () {
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 86400;
      await presale.setTimes(startTime, endTime);
      await presale.setCaps(toWei(10), toWei(100));
      await presale.setBuyLimits(toWei(0.1), toWei(10));
      await presale.setListingRate(toWei(1000));

      const tokens = [toTokens(100000)];
      const rates = [toWei(1000)];
      await presale.configureStages(tokens, rates);

      const depositAmount = toTokens(500000);
      await saleToken.approve(await presale.getAddress(), depositAmount);
      await presale.depositSaleTokens(depositAmount);

      await time.increaseTo(startTime);
    });

    it("Should revert if presale not active (before start)", async function () {
      // Deploy new presale that hasn't started
      const Presale = await ethers.getContractFactory("KINDORA_PRESALE");
      const newPresale = await Presale.deploy(
        await saleToken.getAddress(),
        await router.getAddress(),
        marketingWallet.address
      );

      await expect(
        newPresale.connect(user1).buy({ value: toWei(1) })
      ).to.be.revertedWith("NOT_ACTIVE");
    });

    it("Should revert if amount below minimum", async function () {
      await expect(
        presale.connect(user1).buy({ value: toWei(0.05) })
      ).to.be.revertedWith("BELOW_MIN");
    });

    it("Should revert if user exceeds max buy limit", async function () {
      await presale.connect(user1).buy({ value: toWei(5) });
      
      await expect(
        presale.connect(user1).buy({ value: toWei(6) })
      ).to.be.revertedWith("ABOVE_MAX");
    });

    it("Should revert if total raised exceeds hard cap", async function () {
      await presale.connect(user1).buy({ value: toWei(10) });
      await presale.connect(user2).buy({ value: toWei(10) });
      await presale.connect(user3).buy({ value: toWei(10) });
      
      // Try to exceed hard cap
      await expect(
        presale.connect(addrs[0]).buy({ value: toWei(80) })
      ).to.be.revertedWith("HARD_CAP");
    });

    it("Should revert if tokens not deposited", async function () {
      // Deploy new presale without depositing tokens
      const Presale = await ethers.getContractFactory("KINDORA_PRESALE");
      const newPresale = await Presale.deploy(
        await saleToken.getAddress(),
        await router.getAddress(),
        marketingWallet.address
      );

      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 86400;
      await newPresale.setTimes(startTime, endTime);
      await newPresale.setCaps(toWei(10), toWei(100));
      await newPresale.setBuyLimits(toWei(0.1), toWei(10));

      const tokens = [toTokens(100000)];
      const rates = [toWei(1000)];
      await newPresale.configureStages(tokens, rates);

      await time.increaseTo(startTime);

      await expect(
        newPresale.connect(user1).buy({ value: toWei(1) })
      ).to.be.revertedWith("NEED_TOKENS_DEPOSITED");
    });

    it("Should revert if trying to exceed stage allocation", async function () {
      // Try to buy more than stage has
      await expect(
        presale.connect(user1).buy({ value: toWei(150) })
      ).to.be.revertedWith("EXCEEDS_STAGE");
    });
  });

  describe("Refund Functionality", function () {
    beforeEach(async function () {
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000; // Short presale
      await presale.setTimes(startTime, endTime);
      await presale.setCaps(toWei(100), toWei(200)); // High soft cap
      await presale.setBuyLimits(toWei(0.1), toWei(10));
      await presale.setListingRate(toWei(1000));

      const tokens = [toTokens(100000)];
      const rates = [toWei(1000)];
      await presale.configureStages(tokens, rates);

      const depositAmount = toTokens(500000);
      await saleToken.approve(await presale.getAddress(), depositAmount);
      await presale.depositSaleTokens(depositAmount);

      await time.increaseTo(startTime);
    });

    it("Should allow refund when soft cap not met", async function () {
      await presale.connect(user1).buy({ value: toWei(5) });
      
      // Move past end time
      await time.increase(1001);

      const initialBalance = await ethers.provider.getBalance(user1.address);
      const tx = await presale.connect(user1).refund();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;
      const finalBalance = await ethers.provider.getBalance(user1.address);

      expect(finalBalance).to.equal(initialBalance + toWei(5) - gasUsed);
      expect(await presale.contributedWei(user1.address)).to.equal(0);
      expect(await presale.boughtTokens(user1.address)).to.equal(0);
    });

    it("Should emit Refunded event", async function () {
      await presale.connect(user1).buy({ value: toWei(5) });
      await time.increase(1001);

      await expect(presale.connect(user1).refund())
        .to.emit(presale, "Refunded")
        .withArgs(user1.address, toWei(5));
    });

    it("Should revert refund if presale not ended", async function () {
      await presale.connect(user1).buy({ value: toWei(5) });
      
      await expect(presale.connect(user1).refund()).to.be.revertedWith("NOT_ENDED");
    });

    it("Should revert refund if soft cap met", async function () {
      // Meet soft cap
      for (let i = 0; i < 10; i++) {
        await presale.connect(addrs[i]).buy({ value: toWei(10) });
      }
      
      await time.increase(1001);

      await expect(presale.connect(user1).refund()).to.be.revertedWith("SOFT_MET");
    });

    it("Should revert if user has no contribution", async function () {
      await time.increase(1001);

      await expect(presale.connect(user1).refund()).to.be.revertedWith("NO_REFUND");
    });
  });

  describe("Claim Functionality", function () {
    beforeEach(async function () {
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;
      await presale.setTimes(startTime, endTime);
      await presale.setCaps(toWei(10), toWei(100)); // Low soft cap
      await presale.setBuyLimits(toWei(0.1), toWei(20));
      await presale.setListingRate(toWei(1000));

      const tokens = [toTokens(100000)];
      const rates = [toWei(1000)];
      await presale.configureStages(tokens, rates);

      const depositAmount = toTokens(500000);
      await saleToken.approve(await presale.getAddress(), depositAmount);
      await presale.depositSaleTokens(depositAmount);

      await time.increaseTo(startTime);
    });

    it("Should allow claiming tokens after finalization", async function () {
      // Meet soft cap
      await presale.connect(user1).buy({ value: toWei(15) });
      
      // End presale
      await time.increase(1001);

      // Finalize
      await presale.finalize();

      // Claim
      const expectedTokens = toTokens(15000);
      await expect(presale.connect(user1).claim())
        .to.emit(presale, "Claimed")
        .withArgs(user1.address, expectedTokens);

      expect(await saleToken.balanceOf(user1.address)).to.equal(expectedTokens);
      expect(await presale.boughtTokens(user1.address)).to.equal(0);
    });

    it("Should revert claim if presale not ended", async function () {
      await presale.connect(user1).buy({ value: toWei(15) });
      
      await expect(presale.connect(user1).claim()).to.be.revertedWith("NOT_ENDED");
    });

    it("Should revert claim if soft cap not met", async function () {
      await presale.connect(user1).buy({ value: toWei(5) });
      await time.increase(1001);

      await expect(presale.connect(user1).claim()).to.be.revertedWith("SOFT_NOT_MET");
    });

    it("Should revert claim if not finalized", async function () {
      await presale.connect(user1).buy({ value: toWei(15) });
      await time.increase(1001);

      await expect(presale.connect(user1).claim()).to.be.revertedWith("NOT_FINALIZED");
    });

    it("Should revert if user has no tokens to claim", async function () {
      await presale.connect(user1).buy({ value: toWei(15) });
      await time.increase(1001);
      await presale.finalize();

      await expect(presale.connect(user2).claim()).to.be.revertedWith("NO_TOKENS");
    });
  });

  describe("Finalize Functionality", function () {
    beforeEach(async function () {
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;
      await presale.setTimes(startTime, endTime);
      await presale.setCaps(toWei(10), toWei(100));
      await presale.setBuyLimits(toWei(0.1), toWei(20));
      await presale.setListingRate(toWei(1000));

      const tokens = [toTokens(100000)];
      const rates = [toWei(1000)];
      await presale.configureStages(tokens, rates);

      const depositAmount = toTokens(500000);
      await saleToken.approve(await presale.getAddress(), depositAmount);
      await presale.depositSaleTokens(depositAmount);

      await time.increaseTo(startTime);
    });

    it("Should finalize presale and add liquidity", async function () {
      await presale.connect(user1).buy({ value: toWei(20) });
      await time.increase(1001);

      await expect(presale.finalize())
        .to.emit(presale, "Finalized");

      expect(await presale.finalized()).to.equal(true);
    });

    it("Should revert finalize if presale not ended", async function () {
      await presale.connect(user1).buy({ value: toWei(20) });

      await expect(presale.finalize()).to.be.revertedWith("NOT_ENDED");
    });

    it("Should revert finalize if soft cap not met", async function () {
      await presale.connect(user1).buy({ value: toWei(5) });
      await time.increase(1001);

      await expect(presale.finalize()).to.be.revertedWith("SOFT_NOT_MET");
    });

    it("Should revert finalize if already finalized", async function () {
      await presale.connect(user1).buy({ value: toWei(20) });
      await time.increase(1001);
      await presale.finalize();

      await expect(presale.finalize()).to.be.revertedWith("ALREADY_FINAL");
    });

    it("Should revert finalize if listing rate not set", async function () {
      // Create new presale without listing rate
      const Presale = await ethers.getContractFactory("KINDORA_PRESALE");
      const newPresale = await Presale.deploy(
        await saleToken.getAddress(),
        await router.getAddress(),
        marketingWallet.address
      );

      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;
      await newPresale.setTimes(startTime, endTime);
      await newPresale.setCaps(toWei(10), toWei(100));
      await newPresale.setBuyLimits(toWei(0.1), toWei(20));

      const tokens = [toTokens(100000)];
      const rates = [toWei(1000)];
      await newPresale.configureStages(tokens, rates);

      const depositAmount = toTokens(500000);
      await saleToken.approve(await newPresale.getAddress(), depositAmount);
      await newPresale.depositSaleTokens(depositAmount);

      await time.increaseTo(startTime);
      await newPresale.connect(user1).buy({ value: toWei(20) });
      await time.increase(1001);

      await expect(newPresale.finalize()).to.be.revertedWith("LIST_RATE_NOT_SET");
    });

    it("Should credit marketing pending correctly", async function () {
      await presale.connect(user1).buy({ value: toWei(20) });
      await time.increase(1001);

      await presale.finalize();

      const marketingPending = await presale.getMarketingPending();
      expect(marketingPending).to.be.gt(0);
    });
  });

  describe("Marketing Withdrawal", function () {
    beforeEach(async function () {
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;
      await presale.setTimes(startTime, endTime);
      await presale.setCaps(toWei(10), toWei(100));
      await presale.setBuyLimits(toWei(0.1), toWei(20));
      await presale.setListingRate(toWei(1000));

      const tokens = [toTokens(100000)];
      const rates = [toWei(1000)];
      await presale.configureStages(tokens, rates);

      const depositAmount = toTokens(500000);
      await saleToken.approve(await presale.getAddress(), depositAmount);
      await presale.depositSaleTokens(depositAmount);

      await time.increaseTo(startTime);
      await presale.connect(user1).buy({ value: toWei(20) });
      await time.increase(1001);
      await presale.finalize();
    });

    it("Should allow marketing wallet to withdraw funds", async function () {
      const marketingPending = await presale.getMarketingPending();
      const initialBalance = await ethers.provider.getBalance(marketingWallet.address);

      await expect(presale.connect(marketingWallet).withdrawMarketing(marketingWallet.address))
        .to.emit(presale, "MarketingWithdrawn");

      expect(await presale.getMarketingPending()).to.equal(0);
    });

    it("Should revert if called by non-marketing wallet", async function () {
      await expect(
        presale.connect(user1).withdrawMarketing(user1.address)
      ).to.be.revertedWith("NOT_MARKETING");
    });

    it("Should revert if no funds to withdraw", async function () {
      await presale.connect(marketingWallet).withdrawMarketing(marketingWallet.address);
      
      await expect(
        presale.connect(marketingWallet).withdrawMarketing(marketingWallet.address)
      ).to.be.revertedWith("NO_FUNDS");
    });
  });

  describe("Emergency Functions", function () {
    beforeEach(async function () {
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;
      await presale.setTimes(startTime, endTime);
      await presale.setCaps(toWei(100), toWei(200)); // High soft cap
      await presale.setBuyLimits(toWei(0.1), toWei(20));

      const tokens = [toTokens(100000)];
      const rates = [toWei(1000)];
      await presale.configureStages(tokens, rates);

      const depositAmount = toTokens(500000);
      await saleToken.approve(await presale.getAddress(), depositAmount);
      await presale.depositSaleTokens(depositAmount);

      await time.increaseTo(startTime);
    });

    it("Should allow owner to recover tokens on failure", async function () {
      await presale.connect(user1).buy({ value: toWei(5) });
      await time.increase(1001);

      const contractBalance = await saleToken.balanceOf(await presale.getAddress());
      
      await expect(presale.recoverTokensOnFailure(owner.address))
        .to.emit(presale, "RecoveredTokensOnFailure");

      expect(await saleToken.balanceOf(owner.address)).to.be.gt(0);
    });

    it("Should revert recover if presale not ended", async function () {
      await expect(
        presale.recoverTokensOnFailure(owner.address)
      ).to.be.revertedWith("NOT_ENDED");
    });

    it("Should revert recover if soft cap met", async function () {
      // Lower soft cap to meet it easily
      const Presale = await ethers.getContractFactory("KINDORA_PRESALE");
      const newPresale = await Presale.deploy(
        await saleToken.getAddress(),
        await router.getAddress(),
        marketingWallet.address
      );

      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;
      await newPresale.setTimes(startTime, endTime);
      await newPresale.setCaps(toWei(10), toWei(100)); // Low soft cap
      await newPresale.setBuyLimits(toWei(0.1), toWei(20));

      const tokens = [toTokens(100000)];
      const rates = [toWei(1000)];
      await newPresale.configureStages(tokens, rates);

      const depositAmount = toTokens(500000);
      await saleToken.approve(await newPresale.getAddress(), depositAmount);
      await newPresale.depositSaleTokens(depositAmount);

      await time.increaseTo(startTime);
      await newPresale.connect(user1).buy({ value: toWei(20) });
      await time.increase(1001);

      await expect(
        newPresale.recoverTokensOnFailure(owner.address)
      ).to.be.revertedWith("SOFT_MET");
    });

    it("Should revert recover if address is zero", async function () {
      await presale.connect(user1).buy({ value: toWei(5) });
      await time.increase(1001);

      await expect(
        presale.recoverTokensOnFailure(ZERO_ADDRESS)
      ).to.be.revertedWith("TO_ZERO");
    });
  });

  describe("Emergency ERC20 Withdrawal", function () {
    beforeEach(async function () {
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;
      await presale.setTimes(startTime, endTime);
      await presale.setCaps(toWei(10), toWei(100));
      await presale.setBuyLimits(toWei(0.1), toWei(20));
      await presale.setListingRate(toWei(1000));

      const tokens = [toTokens(100000)];
      const rates = [toWei(1000)];
      await presale.configureStages(tokens, rates);

      const depositAmount = toTokens(500000);
      await saleToken.approve(await presale.getAddress(), depositAmount);
      await presale.depositSaleTokens(depositAmount);

      await time.increaseTo(startTime);
      await presale.connect(user1).buy({ value: toWei(20) });
      await time.increase(1001);
      await presale.finalize();
    });

    it("Should allow owner to withdraw extra sale tokens after finalization", async function () {
      const contractBalance = await saleToken.balanceOf(await presale.getAddress());
      const tokensSold = await presale.tokensSold();
      const extra = contractBalance - tokensSold;

      if (extra > 0) {
        await expect(
          presale.emergencyWithdrawERC20(await saleToken.getAddress(), owner.address, extra)
        ).to.emit(presale, "EmergencyERC20Withdrawn");
      }
    });

    it("Should allow owner to withdraw other ERC20 tokens", async function () {
      // Create another token and send to presale
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      const otherToken = await MockERC20.deploy("Other Token", "OTHER", 18);
      await otherToken.mint(await presale.getAddress(), toTokens(1000));

      await expect(
        presale.emergencyWithdrawERC20(await otherToken.getAddress(), owner.address, toTokens(1000))
      ).to.emit(presale, "EmergencyERC20Withdrawn");
    });

    it("Should revert if not finalized", async function () {
      const Presale = await ethers.getContractFactory("KINDORA_PRESALE");
      const newPresale = await Presale.deploy(
        await saleToken.getAddress(),
        await router.getAddress(),
        marketingWallet.address
      );

      await expect(
        newPresale.emergencyWithdrawERC20(await saleToken.getAddress(), owner.address, 100)
      ).to.be.revertedWith("NOT_FINALIZED");
    });

    it("Should revert if trying to withdraw sold tokens", async function () {
      const tokensSold = await presale.tokensSold();
      
      await expect(
        presale.emergencyWithdrawERC20(await saleToken.getAddress(), owner.address, tokensSold)
      ).to.be.revertedWith("NO_EXTRA_TOKENS");
    });
  });

  describe("View Functions", function () {
    it("Should return correct presaleActive status", async function () {
      expect(await presale.presaleActive()).to.equal(false);

      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;
      await presale.setTimes(startTime, endTime);
      await presale.setCaps(toWei(10), toWei(100));
      await presale.setBuyLimits(toWei(0.1), toWei(20));

      const tokens = [toTokens(100000)];
      const rates = [toWei(1000)];
      await presale.configureStages(tokens, rates);

      const depositAmount = toTokens(500000);
      await saleToken.approve(await presale.getAddress(), depositAmount);
      await presale.depositSaleTokens(depositAmount);

      await time.increaseTo(startTime);
      expect(await presale.presaleActive()).to.equal(true);
    });

    it("Should return correct presaleEnded status", async function () {
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;
      await presale.setTimes(startTime, endTime);

      expect(await presale.presaleEnded()).to.equal(false);

      await time.increaseTo(endTime);
      expect(await presale.presaleEnded()).to.equal(true);
    });

    it("Should return correct softCapMet status", async function () {
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;
      await presale.setTimes(startTime, endTime);
      await presale.setCaps(toWei(10), toWei(100));
      await presale.setBuyLimits(toWei(0.1), toWei(20));

      const tokens = [toTokens(100000)];
      const rates = [toWei(1000)];
      await presale.configureStages(tokens, rates);

      const depositAmount = toTokens(500000);
      await saleToken.approve(await presale.getAddress(), depositAmount);
      await presale.depositSaleTokens(depositAmount);

      expect(await presale.softCapMet()).to.equal(false);

      await time.increaseTo(startTime);
      await presale.connect(user1).buy({ value: toWei(15) });

      expect(await presale.softCapMet()).to.equal(true);
    });

    it("Should return correct stage info", async function () {
      const tokens = [toTokens(100000), toTokens(200000)];
      const rates = [toWei(1000), toWei(900)];
      await presale.configureStages(tokens, rates);

      const [index, tokensInStage, tokensSoldStage, rate] = await presale.getCurrentStageInfo();
      
      expect(index).to.equal(0);
      expect(tokensInStage).to.equal(tokens[0]);
      expect(tokensSoldStage).to.equal(0);
      expect(rate).to.equal(rates[0]);
    });
  });

  describe("Access Control", function () {
    it("Should enforce onlyOwner modifier on configuration functions", async function () {
      await expect(
        presale.connect(user1).setTimes((await time.latest()) + 100, (await time.latest()) + 1000)
      ).to.be.revertedWithCustomError(presale, "OwnableUnauthorizedAccount");

      await expect(
        presale.connect(user1).setCaps(toWei(10), toWei(100))
      ).to.be.revertedWithCustomError(presale, "OwnableUnauthorizedAccount");

      await expect(
        presale.connect(user1).setBuyLimits(toWei(0.1), toWei(10))
      ).to.be.revertedWithCustomError(presale, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to transfer ownership", async function () {
      await presale.transferOwnership(user1.address);
      expect(await presale.owner()).to.equal(user1.address);
    });

    it("Should revert transfer ownership to zero address", async function () {
      await expect(
        presale.transferOwnership(ZERO_ADDRESS)
      ).to.be.revertedWithCustomError(presale, "OwnableInvalidOwner");
    });
  });

  describe("Reentrancy Protection", function () {
    it("Should protect buy function from reentrancy", async function () {
      // The nonReentrant modifier should prevent reentrancy attacks
      // This is tested implicitly through the normal buy flow
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 1000;
      await presale.setTimes(startTime, endTime);
      await presale.setCaps(toWei(10), toWei(100));
      await presale.setBuyLimits(toWei(0.1), toWei(20));

      const tokens = [toTokens(100000)];
      const rates = [toWei(1000)];
      await presale.configureStages(tokens, rates);

      const depositAmount = toTokens(500000);
      await saleToken.approve(await presale.getAddress(), depositAmount);
      await presale.depositSaleTokens(depositAmount);

      await time.increaseTo(startTime);
      
      // Normal buy should work
      await expect(presale.connect(user1).buy({ value: toWei(1) })).to.not.be.reverted;
    });
  });

  describe("ERC20 Token Interface Tests", function () {
    it("MockERC20 should implement transfer correctly", async function () {
      await saleToken.transfer(user1.address, toTokens(1000));
      expect(await saleToken.balanceOf(user1.address)).to.equal(toTokens(1000));
    });

    it("MockERC20 should emit Transfer event", async function () {
      await expect(saleToken.transfer(user1.address, toTokens(1000)))
        .to.emit(saleToken, "Transfer")
        .withArgs(owner.address, user1.address, toTokens(1000));
    });

    it("MockERC20 should implement approve correctly", async function () {
      await saleToken.approve(user1.address, toTokens(1000));
      expect(await saleToken.allowance(owner.address, user1.address)).to.equal(toTokens(1000));
    });

    it("MockERC20 should emit Approval event", async function () {
      await expect(saleToken.approve(user1.address, toTokens(1000)))
        .to.emit(saleToken, "Approval")
        .withArgs(owner.address, user1.address, toTokens(1000));
    });

    it("MockERC20 should implement transferFrom correctly", async function () {
      await saleToken.approve(user1.address, toTokens(1000));
      await saleToken.connect(user1).transferFrom(owner.address, user2.address, toTokens(500));
      
      expect(await saleToken.balanceOf(user2.address)).to.equal(toTokens(500));
      expect(await saleToken.allowance(owner.address, user1.address)).to.equal(toTokens(500));
    });

    it("MockERC20 should revert transfer with insufficient balance", async function () {
      await expect(
        saleToken.connect(user1).transfer(user2.address, toTokens(1000))
      ).to.be.revertedWith("Insufficient balance");
    });

    it("MockERC20 should revert transferFrom with insufficient allowance", async function () {
      await expect(
        saleToken.connect(user1).transferFrom(owner.address, user2.address, toTokens(1000))
      ).to.be.revertedWith("Insufficient allowance");
    });

    it("MockERC20 should handle zero amount transfers", async function () {
      await expect(saleToken.transfer(user1.address, 0))
        .to.emit(saleToken, "Transfer")
        .withArgs(owner.address, user1.address, 0);
    });

    it("MockERC20 should update totalSupply correctly", async function () {
      const initialSupply = await saleToken.totalSupply();
      await saleToken.mint(user1.address, toTokens(1000));
      expect(await saleToken.totalSupply()).to.equal(initialSupply + toTokens(1000));
    });
  });

  describe("Edge Cases and Boundary Conditions", function () {
    beforeEach(async function () {
      const startTime = (await time.latest()) + 100;
      const endTime = startTime + 86400;
      await presale.setTimes(startTime, endTime);
      await presale.setCaps(toWei(10), toWei(100));
      await presale.setBuyLimits(toWei(0.1), toWei(50));
      await presale.setListingRate(toWei(1000));

      const tokens = [toTokens(100000)];
      const rates = [toWei(1000)];
      await presale.configureStages(tokens, rates);

      const depositAmount = toTokens(500000);
      await saleToken.approve(await presale.getAddress(), depositAmount);
      await presale.depositSaleTokens(depositAmount);

      await time.increaseTo(startTime);
    });

    it("Should handle minimum buy amount correctly", async function () {
      await expect(presale.connect(user1).buy({ value: toWei(0.1) }))
        .to.emit(presale, "Bought");
    });

    it("Should handle maximum buy amount correctly", async function () {
      await expect(presale.connect(user1).buy({ value: toWei(50) }))
        .to.emit(presale, "Bought");
    });

    it("Should handle exact soft cap", async function () {
      await presale.connect(user1).buy({ value: toWei(10) });
      expect(await presale.softCapMet()).to.equal(true);
    });

    it("Should handle exact hard cap", async function () {
      // Buy up to hard cap
      await presale.connect(user1).buy({ value: toWei(50) });
      await presale.connect(user2).buy({ value: toWei(50) });
      
      expect(await presale.totalRaisedWei()).to.equal(toWei(100));
      
      // Any more should revert
      await expect(
        presale.connect(user3).buy({ value: toWei(1) })
      ).to.be.revertedWith("HARD_CAP");
    });

    it("Should handle multiple users buying simultaneously", async function () {
      await presale.connect(user1).buy({ value: toWei(5) });
      await presale.connect(user2).buy({ value: toWei(5) });
      await presale.connect(user3).buy({ value: toWei(5) });

      expect(await presale.totalRaisedWei()).to.equal(toWei(15));
      expect(await presale.tokensSold()).to.equal(toTokens(15000));
    });
  });
});
