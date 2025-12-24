import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { FHEETH, FHEETH__factory, SilentCapital, SilentCapital__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  creator: HardhatEthersSigner;
  contributor: HardhatEthersSigner;
};

async function deployFixture() {
  const tokenFactory = (await ethers.getContractFactory("FHEETH")) as FHEETH__factory;
  const token = (await tokenFactory.deploy()) as FHEETH;
  const tokenAddress = await token.getAddress();

  const fundFactory = (await ethers.getContractFactory("SilentCapital")) as SilentCapital__factory;
  const fund = (await fundFactory.deploy(tokenAddress)) as SilentCapital;
  const fundAddress = await fund.getAddress();

  return { token, tokenAddress, fund, fundAddress };
}

describe("SilentCapital", function () {
  let signers: Signers;
  let token: FHEETH;
  let tokenAddress: string;
  let fund: SilentCapital;
  let fundAddress: string;

  before(async function () {
    const ethSigners = await ethers.getSigners();
    signers = {
      deployer: ethSigners[0],
      creator: ethSigners[0],
      contributor: ethSigners[1],
    };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ token, tokenAddress, fund, fundAddress } = await deployFixture());
  });

  it("creates a campaign and records encrypted contributions", async function () {
    const latestBlock = await ethers.provider.getBlock("latest");
    const endAt = (latestBlock?.timestamp ?? 0) + 3600;

    const target = 10_000_000n;
    const createTx = await fund.connect(signers.creator).createCampaign("Seed Round", target, endAt);
    await createTx.wait();

    const campaignId = await fund.campaignCount();

    const contribution = 1_500_000n;
    const mintTx = await token.mint(signers.contributor.address, contribution);
    await mintTx.wait();

    const operatorTx = await token.connect(signers.contributor).setOperator(fundAddress, endAt);
    await operatorTx.wait();

    const encryptedAmount = await fhevm
      .createEncryptedInput(tokenAddress, fundAddress)
      .add64(contribution)
      .encrypt();

    const contributeTx = await fund
      .connect(signers.contributor)
      .contribute(campaignId, encryptedAmount.handles[0], encryptedAmount.inputProof);
    await contributeTx.wait();

    const encryptedContribution = await fund.contributionOf(campaignId, signers.contributor.address);
    const clearContribution = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedContribution,
      fundAddress,
      signers.contributor,
    );

    const info = await fund.campaignInfo(campaignId);
    const encryptedTotal = info[5];
    const clearTotal = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedTotal,
      fundAddress,
      signers.creator,
    );

    expect(BigInt(clearContribution)).to.eq(contribution);
    expect(BigInt(clearTotal)).to.eq(contribution);
  });

  it("allows the creator to close and receive funds", async function () {
    const latestBlock = await ethers.provider.getBlock("latest");
    const endAt = (latestBlock?.timestamp ?? 0) + 7200;

    const createTx = await fund.connect(signers.creator).createCampaign("Bridge", 0, endAt);
    await createTx.wait();
    const campaignId = await fund.campaignCount();

    const contribution = 2_000_000n;
    const mintTx = await token.mint(signers.contributor.address, contribution);
    await mintTx.wait();

    const operatorTx = await token.connect(signers.contributor).setOperator(fundAddress, endAt);
    await operatorTx.wait();

    const encryptedAmount = await fhevm
      .createEncryptedInput(tokenAddress, fundAddress)
      .add64(contribution)
      .encrypt();

    const contributeTx = await fund
      .connect(signers.contributor)
      .contribute(campaignId, encryptedAmount.handles[0], encryptedAmount.inputProof);
    await contributeTx.wait();

    const closeTx = await fund.connect(signers.creator).closeCampaign(campaignId);
    await closeTx.wait();

    const creatorBalance = await token.confidentialBalanceOf(signers.creator.address);
    const clearBalance = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      creatorBalance,
      tokenAddress,
      signers.creator,
    );

    expect(BigInt(clearBalance)).to.eq(contribution);
  });
});
