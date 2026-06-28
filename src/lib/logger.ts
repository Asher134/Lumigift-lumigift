/**
 * Structured application logger (pino).
 *
 * In development, logs are pretty-printed to stdout.
 * In production, logs are emitted as JSON to stdout AND optionally shipped
 * to a centralized log aggregation system.
 *
 * Supported backends (configure via env vars):
 *   - Datadog:    LOG_BACKEND=datadog  DD_API_KEY=<key>  DD_SITE=datadoghq.com
 *   - Loki:       LOG_BACKEND=loki     LOKI_URL=http://loki:3100
 *   - CloudWatch: LOG_BACKEND=cloudwatch  AWS_REGION=us-east-1
 *                 LOG_GROUP=/lumigift/app  LOG_STREAM=prod
 *   - Generic HTTP (Logtail/Betterstack):
 *                 LOG_BACKEND=http  LOG_AGGREGATION_URL=<url>  LOG_AGGREGATION_TOKEN=<token>
 *
 * Correlation IDs:
 *   Every log line carries a correlationId so logs are searchable by request,
 *   user, or gift ID across the aggregation system.
 *
 * Log retention:
 *   Configure 90-day hot retention + 1-year cold (S3/Glacier) in your
 *   aggregation service. See docs/ops/log-aggregation.md.
 */

import pino from "pino";
import { randomUUID } from "crypto";

const isDev = process.env.NODE_ENV !== "production";

type PinoTransport = Parameters<typeof pino.transport>[0];

function buildTransports(): PinoTransport | undefined {
  if (isDev) {
    return {
      target: "pino-pretty",
      options: { colorize: true, translateTime: "SYS:standard", ignore: "pid,hostname" },
    };
  }

  const backend = process.env.LOG_BACKEND;
  const targets: any[] = [
    // Always write JSON to stdout so container log drivers can capture it.
    { target: "pino/file", options: { destination: 1 }, level: "info" },
  ];

  if (backend === "datadog" && process.env.DD_API_KEY) {
    targets.push({
      target: "pino-datadog-transport",
      options: {
        apiKey: process.env.DD_API_KEY,
        ddSite: process.env.DD_SITE ?? "datadoghq.com",
        service: process.env.NEXT_PUBLIC_APP_NAME ?? "lumigift",
        env: process.env.NODE_ENV,
      },
      level: "info",
    });
  } else if (backend === "loki" && process.env.LOKI_URL) {
    targets.push({
      target: "pino-loki",
      options: {
        host: process.env.LOKI_URL,
        labels: {
          app: process.env.NEXT_PUBLIC_APP_NAME ?? "lumigift",
          env: process.env.NODE_ENV ?? "production",
        },
        batching: true,
        interval: 5,
      },
      level: "info",
    });
  } else if (backend === "http" && process.env.LOG_AGGREGATION_URL) {
    targets.push({
      target: "pino-http-send",
      options: {
        url: process.env.LOG_AGGREGATION_URL,
        method: "POST",
        headers: process.env.LOG_AGGREGATION_TOKEN
          ? { Authorization: `Bearer ${process.env.LOG_AGGREGATION_TOKEN}` }
          : {},
        batchSize: 100,
        retries: 3,
      },
      level: "info",
    });
  }

  return targets.length > 1 ? { targets } : undefined;
}

const transport = buildTransports();

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? (isDev ? "debug" : "info"),
    base: {
      env: process.env.NODE_ENV,
      app: process.env.NEXT_PUBLIC_APP_NAME ?? "lumigift",
    },
    // Redact sensitive fields before they reach any transport
    redact: {
      paths: [
        "phone",
        "recipientPhone",
        "recipientPhoneHash",
        "*.phone",
        "*.recipientPhone",
        "amount",
        "amountNgn",
        "*.amount",
        "*.amountNgn",
        "req.headers.authorization",
        "req.headers.cookie",
        "*.token",
        "*.secret",
        "*.apiKey",
        "*.privateKey",
      ],
      censor: "[REDACTED]",
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  transport ? pino.transport(transport) : undefined
);

/** Child logger pre-bound with a service name label. */
export function serviceLogger(service: string) {
  return logger.child({ service });
}

/**
 * Returns a child logger pre-bound with a correlation ID.
 * Pass the ID from the `x-correlation-id` request header, or omit to
 * generate a new UUID.
 */
export function requestLogger(correlationId?: string) {
  return logger.child({ correlationId: correlationId ?? randomUUID() });
}

/**
 * Extracts or generates a correlation ID from a Headers object.
 * Suitable for use in Next.js middleware and route handlers.
 */
export function getCorrelationId(headers: Headers): string {
  return headers.get("x-correlation-id") ?? randomUUID();
}
