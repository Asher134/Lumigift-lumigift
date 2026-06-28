#!/usr/bin/env ts-node
/**
 * Verify the deployed escrow contract on Stellar Testnet.
 * Calls get_state and prints the result, then prints the Stellar Expert link.
 *
 * Usage:
 *   STELLAR_NETWORK=testnet ts-node scripts/verify-contract.ts
 *
 * Requires:
 *   STELLAR_ESCROW_CONTRACT_ID  — deployed contract address
 *   STELLAR_SERVER_SECRET_KEY   — signing key (read-only call still needs a source)
 */

import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

const network = process.env.STELLAR_NETWORK ?? "testnet";
const rpcUrl =
  network === "mainnet"
    ? "https://soroban-rpc.stellar.org"
    : "https://soroban-testnet.stellar.org";
const networkPassphrase =
  network === "mainnet"
    ? "Public Global Stellar Network ; September 2015"
    : "Test SDF Network ; September 2015";
const explorerBase =
  network === "mainnet"
    ? "https://stellar.expert/explorer/public/contract"
    : "https://stellar.expert/explorer/testnet/contract";

// ─── Resolve contract ID ──────────────────────────────────────────────────────

function readEnvLocal(): Record<string, string> {
  const envLocalPath = path.resolve(__dirname, "../.env.local");
  if (!fs.existsSync(envLocalPath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(envLocalPath, "utf-8")
      .split("\n")
      .filter((l) => l.includes("=") && !l.startsWith("#"))
      .map((l) => {
        const idx = l.indexOf("=");
        return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^"|"$/g, "")];
      })
  );
}

const envLocal = readEnvLocal();
const contractId =
  process.env.STELLAR_ESCROW_CONTRACT_ID ?? envLocal["STELLAR_ESCROW_CONTRACT_ID"];

if (!contractId || contractId === "replace_with_deployed_contract_id") {
  console.error("❌ STELLAR_ESCROW_CONTRACT_ID is not set. Deploy the contract first.");
  process.exit(1);
}

const secretKey = process.env.STELLAR_SERVER_SECRET_KEY;
if (!secretKey) {
  console.error("❌ Missing required environment variable: STELLAR_SERVER_SECRET_KEY");
  process.exit(1);
}

// ─── Invoke get_state ─────────────────────────────────────────────────────────

console.log(`🔍 Verifying contract ${contractId} on ${network}…\n`);

const result = spawnSync(
  "stellar",
  [
    "contract",
    "invoke",
    "--id",
    contractId,
    "--source",
    secretKey,
    "--rpc-url",
    rpcUrl,
    "--network-passphrase",
    networkPassphrase,
    "--",
    "get_state",
  ],
  { encoding: "utf-8", shell: false }
);

if (result.error || result.status !== 0) {
  // get_state returns NotInitialized if the contract hasn't been initialized yet —
  // that's still a successful deployment verification.
  const stderr = result.stderr ?? "";
  if (stderr.includes("NotInitialized") || stderr.includes("Error(Contract, #4)")) {
    console.log("✅ Contract is deployed and responding.");
    console.log("   State: not yet initialized (no gift escrowed).");
  } else {
    console.error("❌ Verification failed:", stderr || result.error?.message);
    process.exit(1);
  }
} else {
  console.log("✅ Contract is deployed and initialized.");
  console.log("   State:", result.stdout.trim());
}

console.log(`\n   Explorer: ${explorerBase}/${contractId}`);
console.log(`   Contract ID: ${contractId}`);
