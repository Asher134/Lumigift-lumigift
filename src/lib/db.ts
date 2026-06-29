import { Pool } from "pg";
import { serverConfig } from "@/server/config";
import { serviceLogger } from "@/lib/logger";

const log = serviceLogger("db");

const pool = new Pool({
  connectionString: serverConfig.database.url,
  min: serverConfig.database.poolMin,
  max: serverConfig.database.poolMax,
  idleTimeoutMillis: serverConfig.database.idleTimeoutMs,
  connectionTimeoutMillis: serverConfig.database.connectionTimeoutMs,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10_000,
});

pool.on("connect", () => {
  log.debug("new connection added to pool");
});

pool.on("error", (err) => {
  log.error({ err }, "unexpected pool error");
});

export function getPoolMetrics() {
  return {
    totalConnections: pool.totalCount,
    idleConnections: pool.idleCount,
    waitingRequests: pool.waitingCount,
    maxConnections: serverConfig.database.poolMax,
    minConnections: serverConfig.database.poolMin,
  };
}

export function logPoolMetrics() {
  log.info(
    {
      min: serverConfig.database.poolMin,
      max: serverConfig.database.poolMax,
      idleTimeoutMs: serverConfig.database.idleTimeoutMs,
      connectionTimeoutMs: serverConfig.database.connectionTimeoutMs,
    },
    "pool ready"
  );
}

export async function closePool() {
  await pool.end();
  log.info("pool closed");
}

export default pool;
