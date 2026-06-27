import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { ApiError } from "@/types";
import { requestLogger, getCorrelationId } from "@/lib/logger";
import { sanitizeObject } from "@/lib/sanitize";

// Re-export CSRF middleware so callers can import from one place
export { withCsrf } from "@/lib/csrf";

// Re-export CORS middleware so callers can import from one place
export { withCors } from "./cors";

// Re-export validation helpers so callers can import from one place
export { validateRequest, validationErrorResponse, formatZodErrors, searchParamsToObject } from "./validate";

type Handler = (_req: NextRequest, _context?: any) => Promise<NextResponse>;

/** Wraps a route handler — returns 401 if no session. */
export function withAuth(handler: Handler): Handler {
  return async (req, _context) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json<ApiError>(
        { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    return handler(req, _context);
  };
}

const API_VERSION = "v1";

const DEFAULT_BODY_SIZE_LIMIT = 1 * 1024 * 1024; // 1MB

/** Wraps a route handler with a try/catch — returns 500 on unhandled errors. */
export function withErrorHandler(handler: Handler, options: { bodySizeLimit?: number } = {}): Handler {
  return async (req, context) => {
    const correlationId = getCorrelationId(req.headers);
    const log = requestLogger(correlationId);

    // Check Content-Length if available
    const contentLength = req.headers.get("content-length");
    const limit = options.bodySizeLimit ?? DEFAULT_BODY_SIZE_LIMIT;
    if (contentLength && parseInt(contentLength) > limit) {
      const res = NextResponse.json<ApiError>(
        { success: false, error: "Payload too large", code: "PAYLOAD_TOO_LARGE" },
        { status: 413 }
      );
      res.headers.set("X-API-Version", API_VERSION);
      res.headers.set("x-correlation-id", correlationId);
      return res;
    }

    // Proxy the request to sanitize JSON body when accessed
    const proxiedReq = new Proxy(req, {
      get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (prop === "json" && typeof value === "function") {
          return async () => {
            try {
              const body = await value.apply(target);
              return sanitizeObject(body);
            } catch (err: any) {
              // Check if error is due to body size
              if (err.message?.includes("body exceeded")) {
                const res = NextResponse.json<ApiError>(
                  { success: false, error: "Payload too large", code: "PAYLOAD_TOO_LARGE" },
                  { status: 413 }
                );
                res.headers.set("X-API-Version", API_VERSION);
                res.headers.set("x-correlation-id", correlationId);
                throw res;
              }
              throw err;
            }
          };
        }
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    try {
      const res = await handler(proxiedReq as NextRequest, context);
      res.headers.set("X-API-Version", API_VERSION);
      res.headers.set("x-correlation-id", correlationId);
      return res;
    } catch (err) {
      // If the error is a NextResponse (our 413), return it directly
      if (err instanceof NextResponse) {
        return err;
      }
      log.error({ err }, "[API Error]");
      const res = NextResponse.json<ApiError>(
        { success: false, error: "Internal server error", code: "INTERNAL_ERROR" },
        { status: 500 }
      );
      res.headers.set("X-API-Version", API_VERSION);
      res.headers.set("x-correlation-id", correlationId);
      return res;
    }
  };
}

/** Wraps a route handler — returns 401 if no session, 403 if not admin. */
export function withAdmin(handler: Handler): Handler {
  return async (req, context) => {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json<ApiError>(
        { success: false, error: "Unauthorized", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }
    const user = session.user as { id: string; role?: string };
    if (user.role !== "admin") {
      return NextResponse.json<ApiError>(
        { success: false, error: "Forbidden", code: "FORBIDDEN" },
        { status: 403 }
      );
    }
    return handler(req, context);
  };
}

/** Rate-limit helper (simple in-memory; swap for Redis in production). */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) return false;

  entry.count++;
  return true;
}
