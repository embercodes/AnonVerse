import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedAnonVerse = await deploy("AnonVerse", {
    from: deployer,
    log: true,
  });

  console.log(`AnonVerse contract: `, deployedAnonVerse.address);
};
export default func;
func.id = "deploy_anonverse"; // id required to prevent reexecution
func.tags = ["AnonVerse"];
