import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { ZodError } from "zod";
import { authOptions } from "@/lib/auth";
import type { ApiError } from "@/types";
import { requestLogger, getCorrelationId } from "@/lib/logger";
import { sanitizeObject } from "@/lib/sanitize";
import { formatZodErrors } from "./validate";

export { withCsrf } from "@/lib/csrf";

export { withCors } from "./cors";

export { validateRequest, validationErrorResponse, formatZodErrors, searchParamsToObject } from "./validate";

type Handler = (_req: NextRequest, _context?: any) => Promise<NextResponse>;

const API_VERSION = "v1";

const DEFAULT_BODY_SIZE_LIMIT = 1 * 1024 * 1024; // 1MB

export function createErrorResponse(
  code: string,
  message: string,
  correlationId: string,
  status: number,
  errors?: Array<{ path: string; message: string }>
): NextResponse<ApiError> {
  const body: ApiError = {
    success: false,
    error: { code, message, correlationId },
  };
  if (errors) body.errors = errors;
  const res = NextResponse.json<ApiError>(body, { status });
  res.headers.set("X-API-Version", API_VERSION);
  res.headers.set("x-correlation-id", correlationId);
  return res;
}

function mapErrorToStatus(err: unknown): { code: string; message: string; status: number; errors?: Array<{ path: string; message: string }> } {
  if (err instanceof ZodError) {
    return { code: "VALIDATION_ERROR", message: "Validation failed", status: 400, errors: formatZodErrors(err) };
  }
  if (err instanceof Error) {
    const name = err.name || "";
    if (name === "AuthError" || err.message === "Unauthorized") {
      return { code: "UNAUTHORIZED", message: "Unauthorized", status: 401 };
    }
    if (name === "ForbiddenError" || err.message === "Forbidden") {
      return { code: "FORBIDDEN", message: "Forbidden", status: 403 };
    }
    if (name === "NotFoundError" || err.message === "Not found") {
      return { code: "NOT_FOUND", message: "Not found", status: 404 };
    }
    if (name === "ConflictError") {
      return { code: "CONFLICT", message: err.message, status: 409 };
    }
  }
  return { code: "INTERNAL_ERROR", message: "Internal server error", status: 500 };
}

export function withAuth(handler: Handler): Handler {
  return async (req, _context) => {
    const correlationId = getCorrelationId(req.headers);
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return createErrorResponse("UNAUTHORIZED", "Unauthorized", correlationId, 401);
    }
    return handler(req, _context);
  };
}

export function withErrorHandler(handler: Handler, options: { bodySizeLimit?: number } = {}): Handler {
  return async (req, context) => {
    const correlationId = getCorrelationId(req.headers);
    const log = requestLogger(correlationId);

    const contentLength = req.headers.get("content-length");
    const limit = options.bodySizeLimit ?? DEFAULT_BODY_SIZE_LIMIT;
    if (contentLength && parseInt(contentLength) > limit) {
      return createErrorResponse("PAYLOAD_TOO_LARGE", "Payload too large", correlationId, 413);
    }

    const proxiedReq = new Proxy(req, {
      get(target, prop) {
        if (prop === "json") {
          return async () => {
            try {
              const body = await target.json();
              return sanitizeObject(body);
            } catch (err: any) {
              if (err.message?.includes("body exceeded")) {
                throw createErrorResponse("PAYLOAD_TOO_LARGE", "Payload too large", correlationId, 413);
              }
              throw err;
            }
          };
        }
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

    try {
      const res = await handler(proxiedReq as NextRequest, context);
      res.headers.set("X-API-Version", API_VERSION);
      res.headers.set("x-correlation-id", correlationId);
      return res;
    } catch (err) {
      if (err instanceof NextResponse) {
        return err;
      }
      log.error({ err }, "[API Error]");
      const mapped = mapErrorToStatus(err);
      return createErrorResponse(mapped.code, mapped.message, correlationId, mapped.status, mapped.errors);
    }
  };
}

export function withAdmin(handler: Handler): Handler {
  return async (req, context) => {
    const correlationId = getCorrelationId(req.headers);
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return createErrorResponse("UNAUTHORIZED", "Unauthorized", correlationId, 401);
    }
    const user = session.user as { id: string; role?: string };
    if (user.role !== "admin") {
      return createErrorResponse("FORBIDDEN", "Forbidden", correlationId, 403);
    }
    return handler(req, context);
  };
}

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
