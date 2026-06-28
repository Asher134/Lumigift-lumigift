import { NextResponse } from "next/server";
import pool from "@/lib/db";
import { getRedisClient } from "@/lib/redis";
import { serverConfig } from "@/server/config";

/**
 * Health check endpoint — excluded from auth middleware.
 * GET /api/health
 *
 * Checks all critical dependencies: database, Redis, Stellar Horizon, Soroban RPC, and Paystack API.
 * Returns 200 with { status: 'ok' | 'degraded', timestamp, checks } if all checks pass.
 * Returns 503 if any critical dependency is down.
 * Response time target: < 500ms
 */
export async function GET() {
  const startTime = Date.now();

  const [db, redis, horizon, soroban, paystack] = await Promise.all([
    checkDb(),
    checkRedis(),
    checkHorizon(serverConfig.stellar.horizonUrl),
    checkSoroban(serverConfig.stellar.rpcUrl),
    checkPaystack(),
  ]);

  const checks = { db, redis, horizon, soroban, paystack };
  const degraded = Object.values(checks).some((s) => s === "error");
  const status = degraded ? "degraded" : "ok";
  const responseTime = Date.now() - startTime;

  return NextResponse.json(
    { status, timestamp: new Date().toISOString(), checks, responseTimeMs: responseTime },
    { status: degraded ? 503 : 200 }
  );
}

async function checkDb(): Promise<"ok" | "error"> {
  try {
    await pool.query("SELECT 1");
    return "ok";
  } catch {
    return "error";
  }
}

async function checkRedis(): Promise<"ok" | "error"> {
  try {
    const client = await getRedisClient();
    await client.ping();
    return "ok";
  } catch {
    return "error";
  }
}

async function checkHorizon(url: string): Promise<"ok" | "error"> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

async function checkSoroban(url: string): Promise<"ok" | "error"> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getNetwork",
      }),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

async function checkPaystack(): Promise<"ok" | "error"> {
  try {
    // Use a simple GET request to Paystack API with a timeout
    const res = await fetch("https://api.paystack.co/bank", {
      headers: {
        Authorization: `Bearer ${serverConfig.paystack.secretKey}`,
      },
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}
