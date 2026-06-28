# Contract Deployment Guide

Operational reference for building, deploying, and verifying the Lumigift escrow contract on Stellar.

---

## Deployed Addresses

| Network | Contract ID | Explorer |
|---------|-------------|---------|
| **Testnet** | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCN4` | [View on Stellar Expert](https://stellar.expert/explorer/testnet/contract/CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCN4) |
| **Mainnet** | _not yet deployed_ | — |

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Rust | stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| wasm32 target | — | `rustup target add wasm32-unknown-unknown` |
| Stellar CLI | ≥ 20 | [Installation guide](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli) |
| Node.js | ≥ 20 | — |

---

## Deployment Parameters

| Parameter | Testnet Value |
|-----------|--------------|
| Network | `testnet` |
| RPC URL | `https://soroban-testnet.stellar.org` |
| Network Passphrase | `Test SDF Network ; September 2015` |
| USDC Issuer | `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5` |
| USDC Asset Code | `USDC` |

---

## Deploying

### 1. Build the WASM

```bash
npm run contract:build
```

Output: `contracts/target/wasm32-unknown-unknown/release/lumigift_escrow.wasm`

### 2. Set environment variables

```bash
export STELLAR_NETWORK=testnet
export STELLAR_SERVER_SECRET_KEY=S...   # your Stellar secret key
```

The deploying account must have a testnet XLM balance. Fund it at [friendbot](https://friendbot.stellar.org/?addr=<YOUR_PUBLIC_KEY>) if needed.

### 3. Deploy

```bash
npm run contract:deploy
```

The script is **idempotent**: if `STELLAR_ESCROW_CONTRACT_ID` is already set in the environment or in `.env.local`, it exits without redeploying. To force a fresh deployment, unset the variable first:

```bash
unset STELLAR_ESCROW_CONTRACT_ID
npm run contract:deploy
```

On success the contract ID is written to `.env.local` automatically.

### 4. Verify

```bash
npm run contract:verify
```

This calls `get_state` on the deployed contract and prints the Stellar Expert link. A `NotInitialized` response is expected for a freshly deployed contract (no gift has been escrowed yet) and still confirms the contract is live.

---

## Contract Functions

| Function | Description |
|----------|-------------|
| `initialize(sender, recipient, token, amount, unlock_time)` | Lock `amount` of `token` from `sender` until `unlock_time` (Unix timestamp). One-time call. |
| `claim()` | Transfer locked funds to `recipient`. Requires caller = recipient and current time ≥ `unlock_time`. |
| `get_state()` | Returns `(recipient, amount, unlock_time, claimed)`. |

### Error codes

| Code | Variant | Meaning |
|------|---------|---------|
| 1 | `AlreadyInitialized` | `initialize` called twice |
| 2 | `AlreadyClaimed` | `claim` called after funds already released |
| 3 | `StillLocked` | `claim` called before `unlock_time` |
| 4 | `NotInitialized` | State read before `initialize` |
| 5 | `Unauthorized` | Reserved |
| 6 | `AlreadyCancelled` | Reserved |

---

## Testnet Verification Checklist

- [ ] Contract responds to `get_state` (returns `NotInitialized` or valid state)
- [ ] Contract visible on [Stellar Expert](https://stellar.expert/explorer/testnet/contract/CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCN4)
- [ ] `initialize` succeeds with a test sender, recipient, USDC amount, and future unlock time
- [ ] `claim` fails with `StillLocked` before unlock time
- [ ] `claim` succeeds after unlock time and transfers USDC to recipient
- [ ] Second `claim` fails with `AlreadyClaimed`
- [ ] Second `initialize` fails with `AlreadyInitialized`

---

## Re-deploying / Upgrading

Each `contract:deploy` run creates a **new** contract instance with a new address. After redeployment:

1. Update `STELLAR_ESCROW_CONTRACT_ID` in `.env.local` (done automatically by the script).
2. Update the address in `.env.example` and this document.
3. Update the README contract address table.
4. Open a PR with the new address.
