import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { AnonVerse, AnonVerse__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

function xorEncrypt(message: string, key: number): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(message);
  const keyBytes = new Uint8Array(4);
  new DataView(keyBytes.buffer).setUint32(0, key);
  const encrypted = bytes.map((byte, idx) => byte ^ keyBytes[idx % keyBytes.length]);
  return Buffer.from(encrypted).toString("hex");
}

function xorDecrypt(cipherText: string, key: number): string {
  const cipherBytes = Buffer.from(cipherText, "hex");
  const keyBytes = new Uint8Array(4);
  new DataView(keyBytes.buffer).setUint32(0, key);
  const plain = cipherBytes.map((byte, idx) => byte ^ keyBytes[idx % keyBytes.length]);
  return new TextDecoder().decode(plain);
}

async function deployFixture() {
  const factory = (await ethers.getContractFactory("AnonVerse")) as AnonVerse__factory;
  const contract = (await factory.deploy()) as AnonVerse;
  const address = await contract.getAddress();
  return { contract, address };
}

describe("AnonVerse", function () {
  let signers: Signers;
  let anonVerse: AnonVerse;
  let contractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      this.skip();
    }
    ({ contract: anonVerse, address: contractAddress } = await deployFixture());
  });

  it("creates groups with encrypted keys and tracks the creator as first member", async function () {
    const tx = await anonVerse.connect(signers.alice).createGroup("Alpha");
    await tx.wait();

    const count = await anonVerse.getGroupCount();
    expect(count).to.eq(1n);

    const group = await anonVerse.getGroup(0);
    expect(group[0]).to.eq("Alpha");
    expect(group[1]).to.eq(signers.alice.address);
    expect(group[3]).to.eq(1n);

    const clearKey = await fhevm.userDecryptEuint(FhevmType.euint32, group[5], contractAddress, signers.alice);
    expect(clearKey).to.be.greaterThanOrEqual(0);
    expect(clearKey).to.be.lessThan(1_000_000);
  });

  it("shares the key with joined members and stores encrypted messages", async function () {
    await anonVerse.connect(signers.alice).createGroup("Beta");
    await anonVerse.connect(signers.bob).joinGroup(0);

    const encryptedKey = await anonVerse.getGroupSecret(0);
    const bobKey = await fhevm.userDecryptEuint(FhevmType.euint32, encryptedKey, contractAddress, signers.bob);

    const cipher = xorEncrypt("hello anonverse", Number(bobKey));
    const tx = await anonVerse.connect(signers.bob).postMessage(0, cipher);
    await tx.wait();

    const messageCount = await anonVerse.getMessageCount(0);
    expect(messageCount).to.eq(1n);

    const stored = await anonVerse.getMessage(0, 0);
    expect(stored.sender).to.eq(signers.bob.address);
    expect(stored.cipherText).to.eq(cipher);
    expect(xorDecrypt(stored.cipherText, Number(bobKey))).to.eq("hello anonverse");
  });

  it("prevents non-members from posting messages", async function () {
    await anonVerse.connect(signers.alice).createGroup("Gamma");
    const encryptedKey = await anonVerse.getGroupSecret(0);
    const creatorKey = await fhevm.userDecryptEuint(FhevmType.euint32, encryptedKey, contractAddress, signers.alice);
    const cipher = xorEncrypt("only members can post", Number(creatorKey));

    await expect(anonVerse.connect(signers.bob).postMessage(0, cipher)).to.be.revertedWith("Join first");
  });
});
