# Contract Upgrade Runbook

**Applies to:** Lumigift Escrow Contract (Soroban/Stellar)  
**Status:** Required before mainnet deployment  
**Estimated time:** 45–90 minutes (testnet), 2–4 hours (mainnet with multisig)

---

## Overview

This runbook covers the full lifecycle of upgrading the deployed escrow contract WASM — from pre-upgrade checks through post-upgrade verification and rollback procedure.

The upgrade flow is:

```
Build new WASM → Upload to Stellar → propose_admin_op → multisig approval → execute upgrade → verify → smoke test
```

---

## Pre-Upgrade Checklist

Complete every item before touching any network.

- [ ] New WASM builds cleanly: `npm run contract:build` exits 0
- [ ] All contract tests pass: `npm run contract:test` exits 0
- [ ] New WASM reviewed and approved in PR by ≥2 core contributors
- [ ] Migration plan documented if storage schema changed (see [Migration](#migration-notes))
- [ ] Staging / testnet run completed and signed off
- [ ] On-call engineer available for the duration of the mainnet window
- [ ] Rollback WASM hash noted (current production hash, from step below)
- [ ] Freeze gift creation on the platform (optional, reduces in-flight gifts during upgrade)

### Record the current WASM hash (rollback reference)

```bash
stellar contract info --id $CONTRACT_ID --network $STELLAR_NETWORK \
  | grep wasm_hash
# Save output: e.g. CURRENT_WASM_HASH=abc123...
```

---

## Step 1 — Build the new WASM

```bash
cd contracts
npm run contract:build
# Output: contracts/escrow/target/wasm32-unknown-unknown/release/escrow.wasm
```

Verify the build artifact exists and is non-zero:

```bash
ls -lh contracts/escrow/target/wasm32-unknown-unknown/release/escrow.wasm
```

---

## Step 2 — Upload WASM to Stellar

Upload stores the WASM on-chain and returns a hash. **This does not affect the live contract yet.**

```bash
stellar contract upload \
  --wasm contracts/escrow/target/wasm32-unknown-unknown/release/escrow.wasm \
  --source $ADMIN_KEYPAIR \
  --network $STELLAR_NETWORK
# Output: NEW_WASM_HASH=<64-char hex>
export NEW_WASM_HASH=<value from above>
```

---

## Step 3 — Propose the upgrade (propose_admin_op)

The upgrade operation must be proposed by the admin account and approved by the multisig threshold before execution.

```bash
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $ADMIN_KEYPAIR \
  --network $STELLAR_NETWORK \
  -- propose_admin_op \
  --op_type upgrade \
  --new_wasm_hash $NEW_WASM_HASH
# Output: PROPOSAL_ID=<id>
export PROPOSAL_ID=<value from above>
```

---

## Step 4 — Multisig Approval

Each required signer must independently approve the proposal. Minimum threshold: **2-of-3 signers**.

### Signer instructions

Each signer runs the following on their own machine with their own keypair:

```bash
# 1. Verify the proposal details before signing
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $SIGNER_KEYPAIR \
  --network $STELLAR_NETWORK \
  -- get_admin_op \
  --proposal_id $PROPOSAL_ID
# Confirm: op_type = "upgrade", new_wasm_hash = $NEW_WASM_HASH

# 2. Approve
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $SIGNER_KEYPAIR \
  --network $STELLAR_NETWORK \
  -- approve_admin_op \
  --proposal_id $PROPOSAL_ID
```

**Do not share your keypair.** Each signer approves independently.

### Check approval count

```bash
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $ADMIN_KEYPAIR \
  --network $STELLAR_NETWORK \
  -- get_admin_op \
  --proposal_id $PROPOSAL_ID
# Verify: approvals >= threshold
```

---

## Step 5 — Execute the Upgrade

Once threshold is reached, execute:

```bash
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $ADMIN_KEYPAIR \
  --network $STELLAR_NETWORK \
  -- execute_admin_op \
  --proposal_id $PROPOSAL_ID
```

---

## Step 6 — Post-Upgrade Verification

### 6a. Confirm new WASM hash is live

```bash
stellar contract info --id $CONTRACT_ID --network $STELLAR_NETWORK \
  | grep wasm_hash
# Must equal $NEW_WASM_HASH
```

### 6b. Smoke test — read contract state

```bash
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $ADMIN_KEYPAIR \
  --network $STELLAR_NETWORK \
  -- get_state
# Should return valid state; no panic = good
```

### 6c. End-to-end smoke test (testnet only)

```bash
STELLAR_NETWORK=testnet npm run contract:deploy
# Re-run the E2E suite against the upgraded contract
```

### 6d. Check existing in-flight gifts

Query the database for any gifts in `pending` or `processing` state and confirm they are unaffected:

```sql
SELECT id, status, stellar_tx_hash FROM gifts
WHERE status IN ('pending', 'processing')
ORDER BY created_at DESC LIMIT 20;
```

---

## Rollback Procedure

If the upgrade WASM is broken (contract panics, wrong behaviour, storage regression):

### Option A — Re-upgrade to the previous WASM

The old WASM is still on-chain (upload is permanent). Re-run steps 3–6 using `CURRENT_WASM_HASH` (recorded in pre-upgrade checklist) as the `new_wasm_hash`.

```bash
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $ADMIN_KEYPAIR \
  --network $STELLAR_NETWORK \
  -- propose_admin_op \
  --op_type upgrade \
  --new_wasm_hash $CURRENT_WASM_HASH
```

Then complete multisig approval and execute as normal.

### Option B — Emergency admin pause (if contract supports it)

```bash
stellar contract invoke \
  --id $CONTRACT_ID \
  --source $ADMIN_KEYPAIR \
  --network $STELLAR_NETWORK \
  -- set_paused \
  --paused true
```

This blocks new claims while rollback is coordinated.

### Decision matrix

| Symptom | Action |
|---|---|
| Contract invocations panic | Option A immediately |
| Wrong storage values | Option A + data audit |
| Minor UI / off-chain bug | No rollback needed; fix off-chain layer |
| In-flight gifts stuck | Option B (pause) while diagnosing |

---

## Migration Notes

If the new WASM adds new `DataKey` variants or changes existing storage types:

1. Document the migration in `contracts/escrow/CHANGELOG.md`
2. Write a migration script (`scripts/migrate-contract-storage.ts`) that reads old keys and writes new ones **before** upgrading the WASM
3. Test the migration on a forked testnet state before mainnet

If storage layout is **unchanged**, no migration script is needed — Soroban instance storage is preserved across upgrades.

---

## Environment Variables

| Variable | Description |
|---|---|
| `STELLAR_NETWORK` | `testnet` or `mainnet` |
| `CONTRACT_ID` | Deployed escrow contract address (starts with `C`) |
| `ADMIN_KEYPAIR` | Admin secret key (handle with care) |
| `SIGNER_KEYPAIR` | Individual multisig signer secret key |

All secrets must be stored in a secrets manager (e.g. AWS Secrets Manager, 1Password) and never committed to the repository.

---

## Contacts

| Role | Contact |
|---|---|
| Contract lead | Open an issue on [JosephOnuh/Lumigift-lumigift](https://github.com/JosephOnuh/Lumigift-lumigift) |
| Security issues | security@lumigift.com (do not open public issues) |
