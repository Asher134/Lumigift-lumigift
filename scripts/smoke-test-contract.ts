#!/usr/bin/env ts-node
/**
 * Post-deployment smoke test for the Lumigift escrow contract.
 *
 * Verifies the deployed contract is reachable and responds to a read-only
 * invocation on the target network.
 *
 * Usage:
 *   STELLAR_NETWORK=mainnet STELLAR_ESCROW_CONTRACT_ID=C... ts-node scripts/smoke-test-contract.ts
 */

import { spawnSync } from "child_process";

const network = process.env.STELLAR_NETWORK ?? "testnet";
const contractId = process.env.STELLAR_ESCROW_CONTRACT_ID;

if (!contractId) {
  console.error("Missing required env var: STELLAR_ESCROW_CONTRACT_ID");
  process.exit(1);
}

const rpcUrl =
  network === "mainnet"
    ? "https://soroban-rpc.stellar.org"
    : "https://soroban-testnet.stellar.org";

const networkPassphrase =
  network === "mainnet"
    ? "Public Global Stellar Network ; September 2015"
    : "Test SDF Network ; September 2015";

console.log(`🔍 Smoke-testing contract ${contractId} on ${network}…`);

// stellar contract info returns metadata if the contract exists; non-zero exit
// means the contract is unreachable or invalid.
const result = spawnSync(
  "stellar",
  [
    "contract",
    "info",
    "--id",
    contractId,
    "--rpc-url",
    rpcUrl,
    "--network-passphrase",
    networkPassphrase,
  ],
  { encoding: "utf-8", shell: false }
);

if (result.error || result.status !== 0) {
  console.error("❌ Smoke test failed:");
  console.error(result.stderr || result.error?.message);
  process.exit(1);
}

console.log("✅ Smoke test passed — contract is live and reachable.");
console.log(result.stdout.trim());
