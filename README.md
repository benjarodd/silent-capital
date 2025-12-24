# Silent Capital

Silent Capital is a confidential fundraising protocol built on Zama FHEVM. It lets campaign creators set a name, target, and end time while contributors fund with encrypted fETH. Amounts stay private on-chain, yet the contract still maintains accurate totals and per-contributor records using fully homomorphic encryption.

## Overview

Silent Capital focuses on a simple lifecycle:
- Creators open campaigns with a target and deadline.
- Contributors send encrypted fETH, keeping their amounts hidden from the public chain.
- The contract aggregates encrypted totals and stores encrypted per-user contributions.
- The creator can close at any time to receive the total raised in fETH.

This design provides privacy for contributors and reduces fundraising copycat risks while keeping the fundraising flow on-chain and verifiable.

## Problems Solved

- Public fundraising exposes contributor amounts, which can reveal competitive strategy, donor capacity, or sensitive participation.
- Traditional fundraising often requires trusted custodians to keep contribution data private.
- Many privacy solutions push sensitive data off-chain, adding centralization risk.

Silent Capital keeps contribution amounts confidential on-chain while remaining non-custodial and composable with the FHEVM ecosystem.

## Advantages

- Confidential contributions and totals using FHE on-chain.
- No off-chain custodians or manual accounting.
- Clear, on-chain campaign lifecycle with explicit close control.
- Privacy-preserving auditing for creators and contributors through permitted decryption.
- Straightforward integration for both contract-level scripts and a React UI.

## Core Features

- Campaign creation with name, target, and end timestamp.
- Encrypted fETH contributions via ERC7984 confidential transfers.
- Encrypted per-contributor records and encrypted totals.
- Creator-controlled closure and payout of the full encrypted total.
- UI-based decryption for permitted users (creator for totals, contributor for own amounts).
- CLI tasks for minting, creating, contributing, and decrypting values.

## Architecture

### Smart Contracts

- `SilentCapital` (contracts/SilentCapital.sol)
  - Manages campaigns, encrypted contributions, and totals.
  - Uses `euint64` for all encrypted amounts.
  - Grants decryption permissions to the contributor and the creator as appropriate.

- `FHEETH` (contracts/FHEETH.sol)
  - Confidential ERC7984 token used for fundraising.
  - Mintable for local testing and demo flows.

- `FHECounter` (contracts/FHECounter.sol)
  - Template reference contract preserved from the base FHEVM template.

### Frontend

- React + Vite app under `app/`.
- Reads contract state with viem and writes transactions with ethers.
- Integrates Zama relayer SDK to encrypt inputs and decrypt handles.
- Uses explicit contract addresses provided by the user (no frontend environment variables).

## Tech Stack

- Solidity 0.8.27
- Hardhat + hardhat-deploy
- Zama FHEVM Solidity library
- OpenZeppelin confidential ERC7984 token
- React 19 + Vite
- viem (read-only contract calls)
- ethers (write transactions)
- RainbowKit + wagmi
- Zama relayer SDK

## Project Structure

```
./
├── app/                   # React frontend
├── contracts/             # Solidity contracts
├── deploy/                # hardhat-deploy scripts
├── docs/                  # Zama docs references
├── tasks/                 # Hardhat CLI tasks
├── test/                  # Test suites
├── types/                 # Typechain outputs
├── hardhat.config.ts      # Hardhat config
├── README.md              # Project documentation
└── deployments/           # Generated after deployments
```

## Usage

### Prerequisites

- Node.js 20+
- npm
- A wallet funded with Sepolia ETH for transactions

### Install Dependencies

From the repository root:

```bash
npm install
```

Frontend dependencies:

```bash
cd app
npm install
```

### Compile and Test Contracts

```bash
npm run compile
npm run test
```

Sepolia tests (requires a deployed contract):

```bash
npm run test:sepolia
```

### Local Node and Local Deploy (for development)

```bash
npm run chain
npm run deploy:localhost
```

### Sepolia Deployment

1. Ensure `.env` contains a funded `PRIVATE_KEY` and an `INFURA_API_KEY`.
2. Deploy to Sepolia:

```bash
npm run deploy:sepolia
```

The deployment artifacts will be written under `deployments/sepolia/`.

### Hardhat Tasks

The tasks folder includes convenience commands for common flows:

```bash
npx hardhat task:fheth:address --network sepolia
npx hardhat task:fundraise:address --network sepolia
npx hardhat task:fheth:mint --amount 1000000 --network sepolia
npx hardhat task:fundraise:create --name "Seed Round" --target 5000000 --end 1735689600 --network sepolia
npx hardhat task:fundraise:contribute --campaign 1 --amount 250000 --network sepolia
npx hardhat task:fundraise:decrypt-total --campaign 1 --network sepolia
npx hardhat task:fundraise:decrypt-contribution --campaign 1 --network sepolia
npx hardhat task:fundraise:close --campaign 1 --network sepolia
```

Notes:
- Amounts are uint64 base units (the frontend formats them with 6 decimals).
- Contributors must set the fundraising contract as an operator in the token contract to allow encrypted transfers.

### Frontend Configuration

1. Deploy contracts to Sepolia.
2. Copy the generated ABI arrays from:
   - `deployments/sepolia/SilentCapital.json`
   - `deployments/sepolia/FHEETH.json`
3. Paste those ABI arrays into `app/src/config/contracts.ts`.
4. Update the default addresses in `app/src/config/contracts.ts` to the Sepolia deployment addresses.

The frontend intentionally avoids environment variables. All addresses are entered or updated in the UI/config file.

### Run the Frontend

```bash
cd app
npm run dev
```

Open the UI, connect a wallet, and use Sepolia. The app does not target a local chain.

### Using the App

- Enter the deployed `SilentCapital` and `FHEETH` contract addresses (or use the defaults).
- Mint fETH for testing.
- Create a campaign with a name, target, and end time.
- Approve the fundraising contract as an operator in the fETH contract.
- Contribute with an encrypted amount.
- Decrypt your own contribution or the campaign total (if permitted).
- Close the campaign as the creator to receive all raised funds.

## Privacy and Permission Model

- All contribution amounts are stored as `euint64` encrypted values.
- The contract explicitly grants decryption permission to:
  - The contributor (for their own contribution handle).
  - The creator (for the campaign total handle).
- Decryption requests are signed by the user and processed through the Zama relayer.

## Limitations and Considerations

- Amounts are constrained to `uint64` and must fit within that range.
- There is no refund flow; closing a campaign sends all raised funds to the creator.
- The contract allows the creator to close at any time, even before the deadline.
- This project is for testnet and development environments; it is not audited.

## Future Roadmap

- Campaign milestones and partial releases.
- Optional refund paths if goals are not met.
- Multi-admin campaigns and multisig payouts.
- More granular access controls for viewing totals.
- Contribution proofs or attestations for external verifiers.
- Multi-token fundraising support (additional confidential assets).
- Enhanced analytics using aggregated FHE statistics.
- UX improvements for decrypt status, approvals, and campaign discovery.

## License

BSD-3-Clause-Clear. See `LICENSE` for details.
