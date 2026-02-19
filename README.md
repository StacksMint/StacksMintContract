# StacksMint 🔨

> Deploy fully compliant SIP-010 fungible tokens on the Stacks blockchain in a single call.

StacksMint is an open-source token factory and registry built on Stacks using the Clarity smart contract language. Anyone can mint their own token, track all deployed tokens, and manage their token portfolio — no deep smart contract knowledge required.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [SIP-010 Standard](#sip-010-standard)
- [Contract Reference](#contract-reference)
- [Getting Started](#getting-started)
- [Deploying a Token](#deploying-a-token)
- [Registry](#registry)
- [Fee Structure](#fee-structure)
- [Project Structure](#project-structure)
- [Testing](#testing)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

StacksMint solves a simple problem: deploying a SIP-010 token on Stacks requires writing and deploying a Clarity contract from scratch, which is a barrier for most users. StacksMint provides a battle-tested token template and a public registry so that:

- Developers can fork the template and deploy in minutes
- The community can discover and verify all tokens minted through StacksMint
- Token creators get a compliant, auditable contract out of the box

---

## Features

- ✅ **Full SIP-010 compliance** — all required trait functions implemented
- 🏭 **Token template** — a clean, auditable base contract ready to fork and deploy
- 📋 **On-chain registry** — every StacksMint token is logged with name, symbol, decimals, supply, and owner
- 🔍 **Owner lookup** — query all tokens deployed by a specific principal
- 🔒 **Mint control** — initial supply goes to deployer; optional mintable flag
- 🌐 **Token URI support** — link to off-chain metadata (IPFS, Arweave, HTTPS)
- 🪙 **STX registration fee** — small fee to register in the public registry (anti-spam)
- 🧪 **Full test suite** — unit tests with Clarinet

---

## Architecture

Because Clarity does **not** support dynamic contract deployment, StacksMint uses a two-contract architecture:

```
┌──────────────────────────────────────────────┐
│              token-template.clar             │
│  (Deployed once per token by the creator)    │
│  - SIP-010 trait implementation              │
│  - Transfer, mint, burn logic                │
│  - Token metadata (name, symbol, decimals)   │
└──────────────────────┬───────────────────────┘
                       │ creator registers token
                       ▼
┌──────────────────────────────────────────────┐
│          stacksmint-registry.clar            │
│  (Single shared registry contract)           │
│  - Tracks all tokens deployed via StacksMint │
│  - Owner → tokens lookup map                 │
│  - Public token directory                    │
│  - Registration fee collection               │
└──────────────────────────────────────────────┘
```

**Workflow:**
1. Clone the token template
2. Customize name, symbol, decimals, initial supply, and token URI
3. Deploy your token contract to Stacks mainnet or testnet
4. Call `register-token` on the StacksMint registry to list your token publicly
5. Your token is now live and discoverable

---

## SIP-010 Standard

All tokens minted via StacksMint implement the [SIP-010 Fungible Token Standard](https://github.com/stacksgov/sips/blob/main/sips/sip-010/sip-010-fungible-token-standard.md), which requires the following trait functions:

| Function | Description |
|---|---|
| `transfer` | Transfer tokens between principals |
| `get-name` | Returns the token name |
| `get-symbol` | Returns the token ticker symbol |
| `get-decimals` | Returns number of decimal places |
| `get-balance` | Returns balance for a given principal |
| `get-total-supply` | Returns total token supply |
| `get-token-uri` | Returns optional URI for token metadata |

---

## Contract Reference

### `token-template.clar`

The base token contract. Fork this for each new token you want to deploy.

**Constants (customize before deploying)**

```clarity
(define-constant token-name "My Token")
(define-constant token-symbol "MTK")
(define-constant token-decimals u6)
(define-constant initial-supply u1000000000000) ;; 1,000,000 tokens (with 6 decimals)
(define-constant token-uri (some u"https://example.com/token-metadata.json"))
```

**Key Functions**

```clarity
;; Transfer tokens
(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))

;; Mint new tokens (owner only, if mintable)
(define-public (mint (amount uint) (recipient principal))

;; Burn tokens
(define-public (burn (amount uint) (sender principal))

;; Read-only getters
(define-read-only (get-name))
(define-read-only (get-symbol))
(define-read-only (get-decimals))
(define-read-only (get-balance (account principal)))
(define-read-only (get-total-supply))
(define-read-only (get-token-uri))
```

---

### `stacksmint-registry.clar`

The shared public registry. Deploy once; all token creators point to this.

**Key Functions**

```clarity
;; Register your deployed token in the public registry
(define-public (register-token
  (token-contract principal)
  (name (string-ascii 32))
  (symbol (string-ascii 10))
  (decimals uint)
  (total-supply uint)
  (token-uri (optional (string-utf8 256))))

;; Look up a token by its contract principal
(define-read-only (get-token-info (token-contract principal)))

;; Get all tokens registered by an owner
(define-read-only (get-tokens-by-owner (owner principal)))

;; Get total number of tokens in the registry
(define-read-only (get-token-count))
```

---

## Getting Started

### Prerequisites

- [Clarinet](https://github.com/hirosystems/clarinet) — Clarity development environment
- [Stacks CLI](https://docs.stacks.co/docs/cli) — for mainnet/testnet deployments
- Node.js v18+ (for deployment scripts)
- A [Hiro Wallet](https://wallet.hiro.so/) with STX for deployment fees

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/stacksmint.git
cd stacksmint

# Install dependencies
npm install

# Check Clarinet is working
clarinet check
```

---

## Deploying a Token

### Step 1 — Customize the template

Copy the token template and update the constants at the top:

```bash
cp contracts/token-template.clar contracts/my-token.clar
```

Edit `contracts/my-token.clar`:

```clarity
(define-constant token-name "Degen Coin")
(define-constant token-symbol "DEGEN")
(define-constant token-decimals u6)
(define-constant initial-supply u500000000000) ;; 500,000 tokens
(define-constant token-uri (some u"ipfs://QmYourMetadataCIDHere"))
```

### Step 2 — Test locally

```bash
clarinet test
clarinet console
```

### Step 3 — Deploy to testnet

```bash
clarinet deployments apply --devnet     # local devnet
clarinet deployments apply --testnet    # Stacks testnet
```

### Step 4 — Register in the StacksMint registry

After deploying, call the registry to make your token publicly discoverable:

```bash
# Using Clarinet console or a deployment script
(contract-call? .stacksmint-registry register-token
  'ST1234...yourtokencontract
  "Degen Coin"
  "DEGEN"
  u6
  u500000000000
  (some u"ipfs://QmYourMetadataCIDHere"))
```

### Step 5 — Verify on the explorer

View your token on the [Hiro Explorer](https://explorer.hiro.so/) or [Stacks Explorer](https://explorer.stacks.co/).

---

## Registry

The StacksMint registry is a permissionless, on-chain directory. Once a token is registered:

- It appears in the public token list
- Anyone can query it by contract address or owner
- The metadata is permanently on-chain and immutable

### Querying the registry

```clarity
;; Get info about a specific token
(contract-call? .stacksmint-registry get-token-info 'SP1234...token-contract)

;; Find all tokens by an owner
(contract-call? .stacksmint-registry get-tokens-by-owner 'SP1234...owner-address)

;; Total tokens in the registry
(contract-call? .stacksmint-registry get-token-count)
```

---

## Fee Structure

| Action | Fee |
|---|---|
| Deploying your token contract | Stacks network gas only |
| Registering in StacksMint registry | 1 STX (anti-spam) |
| Querying the registry | Free (read-only) |

Registration fees are collected by the registry contract owner and may be used for protocol maintenance and future development.

---

## Project Structure

```
stacksmint/
├── contracts/
│   ├── token-template.clar        # SIP-010 token base contract
│   └── stacksmint-registry.clar   # Public token registry
├── tests/
│   ├── token-template_test.ts     # Token unit tests
│   └── stacksmint-registry_test.ts # Registry unit tests
├── scripts/
│   ├── deploy-token.ts            # Deployment helper script
│   └── register-token.ts          # Registry registration script
├── deployments/
│   ├── devnet.yaml
│   ├── testnet.yaml
│   └── mainnet.yaml
├── settings/
│   └── Devnet.toml
├── Clarinet.toml
├── package.json
└── README.md
```

---

## Testing

StacksMint uses [Clarinet](https://github.com/hirosystems/clarinet) for unit and integration testing.

```bash
# Run all tests
clarinet test

# Run a specific test file
clarinet test tests/token-template_test.ts

# Run tests with coverage
clarinet test --coverage

# Open interactive Clarinet console
clarinet console
```

### Test coverage includes

- SIP-010 trait compliance
- Transfer with and without memo
- Mint and burn access control
- Registry registration and lookup
- Fee enforcement
- Edge cases: zero transfers, overflow, unauthorized minting

---

## Roadmap

- [x] SIP-010 token template
- [x] On-chain registry contract
- [ ] Web UI for no-code token deployment
- [ ] Token metadata standard (extended JSON schema)
- [ ] Batch registration support
- [ ] SIP-009 NFT factory (StacksMint for NFTs)
- [ ] Token verification badges
- [ ] Integration with Stacks DEXes (ALEX, Arkadiko)
- [ ] Token analytics dashboard
- [ ] Multisig mint control

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Write tests for your changes
4. Ensure all tests pass (`clarinet test`)
5. Open a pull request with a clear description

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for our full contribution guidelines and code of conduct.

---

## License

StacksMint is open source under the [MIT License](./LICENSE).

---

Built with ❤️ on [Stacks](https://stacks.co) — Bitcoin's smart contract layer.
