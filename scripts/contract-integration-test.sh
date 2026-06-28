#!/usr/bin/env bash
# Integration test: deploy escrow contract to local Stellar testnet and exercise full flow.
# Requires: stellar-cli, funded test accounts
set -euo pipefail

PASS=0
FAIL=0

log_result() {
  local scenario="$1" status="$2"
  if [ "$status" = "PASS" ]; then
    echo "[PASS] $scenario"
    PASS=$((PASS + 1))
  else
    echo "[FAIL] $scenario"
    FAIL=$((FAIL + 1))
  fi
}

# ── Configuration ─────────────────────────────────────────────────────────────
NETWORK="${STELLAR_NETWORK:-testnet}"
RPC_URL="${STELLAR_RPC_URL:-https://soroban-testnet.stellar.org}"
NETWORK_PASSPHRASE="${STELLAR_NETWORK_PASSPHRASE:-Test SDF Network ; September 2015}"
WASM_PATH="contracts/target/wasm32-unknown-unknown/release/lumigift_escrow.wasm"

echo "=== Lumigift Escrow Contract Integration Test ==="
echo "Network : $NETWORK"
echo "RPC URL : $RPC_URL"

# ── Prerequisites ─────────────────────────────────────────────────────────────
if ! command -v stellar &>/dev/null; then
  echo "ERROR: stellar CLI not found. Install via: cargo install --locked stellar-cli --features opt"
  exit 1
fi

if [ ! -f "$WASM_PATH" ]; then
  echo "WASM not found at $WASM_PATH — building now..."
  npm run contract:build
fi

# ── Generate ephemeral test identities ────────────────────────────────────────
echo ""
echo "--- Setting up test identities ---"
stellar keys generate --network "$NETWORK" --overwrite integration-admin 2>/dev/null || true
stellar keys generate --network "$NETWORK" --overwrite integration-sender 2>/dev/null || true
stellar keys generate --network "$NETWORK" --overwrite integration-recipient 2>/dev/null || true

ADMIN_ADDRESS=$(stellar keys address integration-admin)
SENDER_ADDRESS=$(stellar keys address integration-sender)
RECIPIENT_ADDRESS=$(stellar keys address integration-recipient)

echo "Admin     : $ADMIN_ADDRESS"
echo "Sender    : $SENDER_ADDRESS"
echo "Recipient : $RECIPIENT_ADDRESS"

# ── Fund accounts via Friendbot ────────────────────────────────────────────────
echo ""
echo "--- Funding accounts via Friendbot ---"
for ADDR in "$ADMIN_ADDRESS" "$SENDER_ADDRESS" "$RECIPIENT_ADDRESS"; do
  curl -sf "https://friendbot.stellar.org?addr=$ADDR" -o /dev/null && echo "Funded: $ADDR" || echo "Friendbot skipped (may already be funded): $ADDR"
done

# ── Deploy contract ────────────────────────────────────────────────────────────
echo ""
echo "--- Deploying contract ---"
CONTRACT_ID=$(stellar contract deploy \
  --wasm "$WASM_PATH" \
  --source integration-admin \
  --network "$NETWORK" \
  2>&1 | tail -1)

if [[ "$CONTRACT_ID" =~ ^C[A-Z0-9]{55}$ ]]; then
  log_result "contract_deploy" "PASS"
  echo "Contract ID: $CONTRACT_ID"
else
  log_result "contract_deploy" "FAIL"
  echo "ERROR: invalid contract ID output: $CONTRACT_ID"
  exit 1
fi

# ── Scenario helpers ──────────────────────────────────────────────────────────
invoke() {
  stellar contract invoke \
    --id "$CONTRACT_ID" \
    --source "$1" \
    --network "$NETWORK" \
    -- "${@:2}" 2>&1
}

# ── Scenario 1: initialize ────────────────────────────────────────────────────
echo ""
echo "--- Scenario 1: initialize ---"
UNLOCK_TS=$(( $(date +%s) + 3600 ))  # 1 hour from now
if invoke integration-admin initialize \
     --sender "$SENDER_ADDRESS" \
     --recipient "$RECIPIENT_ADDRESS" \
     --token USDC \
     --amount 1000000 \
     --unlock_time "$UNLOCK_TS" 2>&1 | grep -qiE 'success|ok|\(\)'; then
  log_result "initialize" "PASS"
else
  log_result "initialize" "FAIL"
fi

# ── Scenario 2: cancel before unlock (sender only) ────────────────────────────
echo ""
echo "--- Scenario 2: cancel_gift ---"
if invoke integration-sender cancel_gift 2>&1 | grep -qiE 'success|ok|\(\)'; then
  log_result "cancel_gift" "PASS"
else
  log_result "cancel_gift" "FAIL"
fi

# ── Scenario 3: re-initialize for claim test (unlock in the past) ─────────────
echo ""
echo "--- Scenario 3: initialize with past unlock + claim ---"
CONTRACT_ID2=$(stellar contract deploy \
  --wasm "$WASM_PATH" \
  --source integration-admin \
  --network "$NETWORK" \
  2>&1 | tail -1)

PAST_TS=$(( $(date +%s) - 60 ))  # 1 minute in the past
invoke() {
  stellar contract invoke \
    --id "$CONTRACT_ID2" \
    --source "$1" \
    --network "$NETWORK" \
    -- "${@:2}" 2>&1
}

invoke integration-admin initialize \
  --sender "$SENDER_ADDRESS" \
  --recipient "$RECIPIENT_ADDRESS" \
  --token USDC \
  --amount 500000 \
  --unlock_time "$PAST_TS" 2>&1 | true

if invoke integration-recipient claim_gift 2>&1 | grep -qiE 'success|ok|\(\)'; then
  log_result "claim_gift" "PASS"
else
  log_result "claim_gift" "FAIL"
fi

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "=== Results ==="
echo "PASS: $PASS"
echo "FAIL: $FAIL"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
