import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getRedisClient } from "@/lib/redis";
import { getCorrelationId } from "@/lib/logger";
import { createErrorResponse } from "./index";

type Handler = (_req: NextRequest, _context?: any) => Promise<NextResponse>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24 hours

interface CachedResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
}

export function withIdempotency(handler: Handler): Handler {
  return async (req, context) => {
    const idempotencyKey = req.headers.get("idempotency-key");
    if (!idempotencyKey) {
      return handler(req, context);
    }

    const correlationId = getCorrelationId(req.headers);

    if (!UUID_RE.test(idempotencyKey)) {
      return createErrorResponse(
        "VALIDATION_ERROR",
        "Idempotency-Key must be a valid UUID",
        correlationId,
        400
      );
    }

    const session = await getServerSession(authOptions);
    const userId = (session?.user as { id: string } | undefined)?.id ?? "anonymous";
    const cacheKey = `idempotency:${userId}:${idempotencyKey}`;

    const redis = await getRedisClient();
    const cached = await redis.get(cacheKey);

    if (cached) {
      const { status, body, headers }: CachedResponse = JSON.parse(cached);
      const res = new NextResponse(body, {
        status,
        headers: { "content-type": "application/json", ...headers },
      });
      res.headers.set("x-idempotent-replayed", "true");
      return res;
    }

    const res = await handler(req, context);

    if (res.status >= 200 && res.status < 300) {
      const body = await res.text();
      const headersToCache: Record<string, string> = {};
      res.headers.forEach((value, key) => {
        headersToCache[key] = value;
      });
      const entry: CachedResponse = { status: res.status, body, headers: headersToCache };
      await redis.setEx(cacheKey, IDEMPOTENCY_TTL_SECONDS, JSON.stringify(entry));

      return new NextResponse(body, {
        status: res.status,
        headers: res.headers,
      });
    }

    return res;
  };
}
