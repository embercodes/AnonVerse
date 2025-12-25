# AnonVerse - Encrypted Group Chat

AnonVerse is a Zama FHE powered group chat dApp. Each group creates a six digit secret on chain using FHE, members receive permission to decrypt it through the relayer, and every message is encrypted client side with that secret before being stored on chain.

## Project goals

- Provide private group messaging without a centralized key server.
- Keep message encryption and decryption in the client while using on chain state for access control.
- Demonstrate a complete FHE based key distribution flow with a simple, auditable contract.

## Problems solved

- **Key distribution**: groups can share a secret key without revealing it on chain.
- **Access control**: only members can decrypt the group key via ACL permissions.
- **Data integrity**: ciphertext messages are stored on chain and tied to group membership.

## Advantages

- **FHE first design**: group secrets never appear in plaintext on chain.
- **Clear trust boundary**: the relayer enables decryption only for authorized members.
- **Simple client crypto**: deterministic client side encryption keeps UI fast and auditable.
- **Full stack demo**: contract, tasks, tests, and frontend are all included.

## How it works

1. A user creates a group with a name.
2. The contract generates a random six digit secret A as an encrypted euint32.
3. The encrypted secret is stored with the group and shared via ACL with members.
4. A member uses the relayer to decrypt A locally in the frontend.
5. The member encrypts messages client side with A and posts ciphertext on chain.
6. Other members decrypt messages locally with the same A.

## Tech stack

- **Smart contracts**: Solidity, Hardhat.
- **FHE**: Zama fhevm libraries and ACL based permissions.
- **Relayer**: Zama relayer SDK for user decryption.
- **Frontend**: React + Vite.
- **Wallet**: RainbowKit.
- **Chain access**: viem for reads, ethers for writes.

## Repository layout

- `contracts/AnonVerse.sol` contract and core logic.
- `deploy/deploy.ts` deployment script.
- `tasks/anonverse.ts` Hardhat tasks for create, join, decrypt, and post.
- `test/AnonVerse.ts` mock FHE tests.
- `deployments/sepolia/AnonVerse.json` ABI and deployment metadata.
- `src/src` frontend app.

## Contract workflow

```bash
# Compile and generate types
npm run compile

# Run mock tests (FHE mock only)
npm test

# Deploy to local hardhat network
npx hardhat deploy --network hardhat

# Deploy to Sepolia (requires PRIVATE_KEY + INFURA_API_KEY in .env)
npx hardhat deploy --network sepolia
```

Required `.env` values for Hardhat:

- `PRIVATE_KEY` deployer key (no mnemonic).
- `INFURA_API_KEY` for RPC access.
- `ETHERSCAN_API_KEY` optional for verification.

After deploying to Sepolia, copy the address into `deployments/sepolia/AnonVerse.json` so the frontend uses the correct address and ABI.

## Frontend workflow

```bash
cd src
npm install
npm run dev
```

- Update `DEFAULT_CONTRACT_ADDRESS` in `src/src/config/contracts.ts` to the Sepolia address.
- Reads use viem public client. Writes use ethers via `useEthersSigner`.
- The relayer SDK is initialized in `useZamaInstance` for decryption.
- The frontend does not use localStorage or environment variables.

## Hardhat tasks

```bash
npx hardhat task:list-groups --network <net>
npx hardhat task:create-group --name "<room>" --network <net>
npx hardhat task:join-group --group <id> --network <net>
npx hardhat task:decrypt-key --group <id> --network <net>
npx hardhat task:post-message --group <id> --cipher "<hex>" --network <net>
```

## Encryption model

- **Group secret**: `FHE.randEuint32()` is bounded to a six digit integer and stored as an encrypted value.
- **Sharing**: the encrypted secret is shared via ACL to group members.
- **Messages**: plaintext is XOR encrypted client side with a stream derived from the six digit secret.
- **Storage**: ciphertext is stored on chain; only holders of the secret can decrypt.

## Limitations and security notes

- A six digit key is intentionally small for demo simplicity and is not meant for production security.
- On chain ciphertext is public; privacy depends on keeping the decrypted key local.
- The relayer is required for user decryption and is part of the trust model.

## Future roadmap

- Replace the six digit key with a stronger FHE derived secret.
- Add key rotation and member revocation flows.
- Provide message indexing and pagination for large groups.
- Add attachment support with off chain storage and on chain hashes.
- Expand test coverage for edge cases and gas analysis.
- Improve UX around relayer status and retry behavior.

## License

See `LICENSE`.
