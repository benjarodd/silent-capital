import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:fundraise:address", "Prints the SilentCapital address").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;

    const deployment = await deployments.get("SilentCapital");
    console.log("SilentCapital address is " + deployment.address);
  },
);

task("task:fheth:address", "Prints the FHEETH address").setAction(async function (
  _taskArguments: TaskArguments,
  hre,
) {
  const { deployments } = hre;

  const deployment = await deployments.get("FHEETH");
  console.log("FHEETH address is " + deployment.address);
});

task("task:fheth:mint", "Mints test fETH to an address")
  .addOptionalParam("to", "Recipient address (defaults to first signer)")
  .addParam("amount", "Amount in base units (uint64)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const amount = BigInt(taskArguments.amount);
    const signers = await ethers.getSigners();
    const recipient = taskArguments.to ?? signers[0].address;

    const tokenDeployment = await deployments.get("FHEETH");
    const token = await ethers.getContractAt("FHEETH", tokenDeployment.address);

    const tx = await token.mint(recipient, amount);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:fundraise:create", "Creates a fundraising campaign")
  .addParam("name", "Campaign name")
  .addParam("target", "Target amount in base units")
  .addParam("end", "End timestamp (unix seconds)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const deployment = await deployments.get("SilentCapital");
    const contract = await ethers.getContractAt("SilentCapital", deployment.address);

    const tx = await contract.createCampaign(taskArguments.name, BigInt(taskArguments.target), BigInt(taskArguments.end));
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:fundraise:contribute", "Contributes encrypted fETH to a campaign")
  .addParam("campaign", "Campaign id")
  .addParam("amount", "Amount in base units (uint64)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const campaignId = BigInt(taskArguments.campaign);
    const amount = BigInt(taskArguments.amount);

    const fundraiseDeployment = await deployments.get("SilentCapital");
    const fundraise = await ethers.getContractAt("SilentCapital", fundraiseDeployment.address);

    const tokenAddress = await fundraise.token();
    const signers = await ethers.getSigners();

    const encryptedAmount = await fhevm
      .createEncryptedInput(tokenAddress, fundraiseDeployment.address)
      .add64(amount)
      .encrypt();

    const tx = await fundraise
      .connect(signers[0])
      .contribute(campaignId, encryptedAmount.handles[0], encryptedAmount.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });

task("task:fundraise:decrypt-total", "Decrypts the campaign total")
  .addParam("campaign", "Campaign id")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const campaignId = BigInt(taskArguments.campaign);
    const deployment = await deployments.get("SilentCapital");
    const contract = await ethers.getContractAt("SilentCapital", deployment.address);

    const signers = await ethers.getSigners();
    const info = await contract.campaignInfo(campaignId);
    const encryptedTotal = info[5];

    const clearTotal = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedTotal,
      deployment.address,
      signers[0],
    );
    console.log(`Clear total: ${clearTotal}`);
  });

task("task:fundraise:decrypt-contribution", "Decrypts a contributor amount")
  .addParam("campaign", "Campaign id")
  .addOptionalParam("contributor", "Contributor address (defaults to first signer)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const campaignId = BigInt(taskArguments.campaign);
    const deployment = await deployments.get("SilentCapital");
    const contract = await ethers.getContractAt("SilentCapital", deployment.address);

    const signers = await ethers.getSigners();
    const contributor = taskArguments.contributor ?? signers[0].address;

    const encryptedContribution = await contract.contributionOf(campaignId, contributor);

    const clearContribution = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedContribution,
      deployment.address,
      signers[0],
    );
    console.log(`Clear contribution: ${clearContribution}`);
  });

task("task:fundraise:close", "Closes a campaign and transfers the total to the creator")
  .addParam("campaign", "Campaign id")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const campaignId = BigInt(taskArguments.campaign);
    const deployment = await deployments.get("SilentCapital");
    const contract = await ethers.getContractAt("SilentCapital", deployment.address);

    const tx = await contract.closeCampaign(campaignId);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`tx:${tx.hash} status=${receipt?.status}`);
  });
