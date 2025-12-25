import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

const CONTRACT_NAME = "AnonVerse";

task("task:list-groups", "List all groups").setAction(async function (_taskArguments: TaskArguments, hre) {
  const { deployments, ethers } = hre;
  const deployment = await deployments.get(CONTRACT_NAME);
  const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

  const count = await contract.getGroupCount();
  console.log(`Found ${count} groups in ${deployment.address}`);

  for (let i = 0; i < count; i++) {
    const [name, creator, createdAt, memberCount, messageCount] = await contract.getGroup(i);
    console.log(
      `#${i} ${name} | creator=${creator} | created=${new Date(Number(createdAt) * 1000).toISOString()} | members=${memberCount} | messages=${messageCount}`,
    );
  }
});

task("task:create-group", "Create a new group with a random encrypted key")
  .addParam("name", "Readable group name")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;
    const deployment = await deployments.get(CONTRACT_NAME);
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);
    const signer = (await ethers.getSigners())[0];

    const tx = await contract.connect(signer).createGroup(taskArguments.name);
    console.log(`Creating group "${taskArguments.name}" on ${deployment.address}... tx=${tx.hash}`);
    await tx.wait();

    const count = await contract.getGroupCount();
    const groupId = Number(count) - 1;
    console.log(`Group created with id=${groupId}`);
  });

task("task:join-group", "Join an existing group")
  .addParam("group", "Group id")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;
    const groupId = parseInt(taskArguments.group);
    const deployment = await deployments.get(CONTRACT_NAME);
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);
    const signer = (await ethers.getSigners())[0];

    const tx = await contract.connect(signer).joinGroup(groupId);
    console.log(`Joining group #${groupId}... tx=${tx.hash}`);
    await tx.wait();
    console.log("Joined successfully");
  });

task("task:decrypt-key", "Decrypt the shared key for a group")
  .addParam("group", "Group id")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers, fhevm } = hre;
    const groupId = parseInt(taskArguments.group);
    await fhevm.initializeCLIApi();

    const deployment = await deployments.get(CONTRACT_NAME);
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);
    const signer = (await ethers.getSigners())[0];

    const encryptedKey = await contract.getGroupSecret(groupId);
    const clearKey = await fhevm.userDecryptEuint(FhevmType.euint32, encryptedKey, deployment.address, signer);
    console.log(`Group #${groupId} key: ${clearKey}`);
  });

task("task:post-message", "Post an already encrypted message to a group")
  .addParam("group", "Group id")
  .addParam("cipher", "Ciphertext produced with the group's shared key")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { deployments, ethers } = hre;
    const groupId = parseInt(taskArguments.group);
    const deployment = await deployments.get(CONTRACT_NAME);
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);
    const signer = (await ethers.getSigners())[0];

    const tx = await contract.connect(signer).postMessage(groupId, taskArguments.cipher);
    console.log(`Posting message to group #${groupId}... tx=${tx.hash}`);
    await tx.wait();
    console.log("Message stored");
  });
