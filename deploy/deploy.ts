import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedFHEETH = await deploy("FHEETH", {
    from: deployer,
    log: true,
  });

  const deployedSilentCapital = await deploy("SilentCapital", {
    from: deployer,
    log: true,
    args: [deployedFHEETH.address],
  });

  console.log(`FHEETH contract: `, deployedFHEETH.address);
  console.log(`SilentCapital contract: `, deployedSilentCapital.address);
};
export default func;
func.id = "deploy_silent_capital"; // id required to prevent reexecution
func.tags = ["SilentCapital"];
