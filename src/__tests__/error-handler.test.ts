/**
 * @jest-environment node
 */

import { NextRequest, NextResponse } from "next/server";

jest.mock("next-auth", () => ({
  getServerSession: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/auth", () => ({ authOptions: {} }));
jest.mock("@/lib/logger", () => ({
  requestLogger: () => ({ error: jest.fn(), info: jest.fn() }),
  getCorrelationId: () => "test-corr-id",
}));
jest.mock("@/lib/sanitize", () => ({
  sanitizeObject: (obj: any) => obj,
}));

import {
  withErrorHandler,
  withAuth,
  withAdmin,
  createErrorResponse,
} from "@/server/middleware";
import { ZodError, ZodIssue } from "zod";

function makeReq(
  url: string,
  opts: { method?: string; headers?: Record<string, string> } = {}
): NextRequest {
  return new NextRequest(url, {
    method: opts.method ?? "GET",
    headers: opts.headers ?? {},
  });
}

function assertStructuredError(
  body: any,
  expectedCode: string,
  expectedCorrelationId = "test-corr-id"
) {
  expect(body.success).toBe(false);
  expect(body.error).toEqual(
    expect.objectContaining({
      code: expectedCode,
      correlationId: expectedCorrelationId,
    })
  );
  expect(typeof body.error.message).toBe("string");
}

describe("createErrorResponse", () => {
  it("produces the structured error envelope", () => {
    const res = createErrorResponse("TEST_CODE", "test message", "corr-1", 400);
    expect(res.status).toBe(400);
    expect(res.headers.get("x-correlation-id")).toBe("corr-1");
  });

  it("includes field errors when provided", async () => {
    const res = createErrorResponse("VALIDATION_ERROR", "Validation failed", "corr-2", 400, [
      { path: "phone", message: "required" },
    ]);
    const body = await res.json();
    expect(body.errors).toEqual([{ path: "phone", message: "required" }]);
  });
});

describe("withErrorHandler", () => {
  it("returns structured 500 for unhandled Error", async () => {
    const handler = withErrorHandler(async () => {
      throw new Error("boom");
    });
    const res = await handler(makeReq("http://localhost/test"));
    expect(res.status).toBe(500);
    const body = await res.json();
    assertStructuredError(body, "INTERNAL_ERROR");
  });

  it("maps ZodError to 400 with field errors", async () => {
    const handler = withErrorHandler(async () => {
      const issue = { code: "invalid_type", expected: "string", received: "number", path: ["phone"], message: "Expected string" } as any as ZodIssue;
      throw new ZodError([issue]);
    });
    const res = await handler(makeReq("http://localhost/test"));
    expect(res.status).toBe(400);
    const body = await res.json();
    assertStructuredError(body, "VALIDATION_ERROR");
    expect(body.errors).toEqual([{ path: "phone", message: "Expected string" }]);
  });

  it("maps AuthError to 401", async () => {
    const handler = withErrorHandler(async () => {
      const err = new Error("Unauthorized");
      err.name = "AuthError";
      throw err;
    });
    const res = await handler(makeReq("http://localhost/test"));
    expect(res.status).toBe(401);
    const body = await res.json();
    assertStructuredError(body, "UNAUTHORIZED");
  });

  it("maps ForbiddenError to 403", async () => {
    const handler = withErrorHandler(async () => {
      const err = new Error("Forbidden");
      err.name = "ForbiddenError";
      throw err;
    });
    const res = await handler(makeReq("http://localhost/test"));
    expect(res.status).toBe(403);
    const body = await res.json();
    assertStructuredError(body, "FORBIDDEN");
  });

  it("maps NotFoundError to 404", async () => {
    const handler = withErrorHandler(async () => {
      const err = new Error("Not found");
      err.name = "NotFoundError";
      throw err;
    });
    const res = await handler(makeReq("http://localhost/test"));
    expect(res.status).toBe(404);
    const body = await res.json();
    assertStructuredError(body, "NOT_FOUND");
  });

  it("maps ConflictError to 409", async () => {
    const handler = withErrorHandler(async () => {
      const err = new Error("Already exists");
      err.name = "ConflictError";
      throw err;
    });
    const res = await handler(makeReq("http://localhost/test"));
    expect(res.status).toBe(409);
    const body = await res.json();
    assertStructuredError(body, "CONFLICT");
  });

  it("returns 413 for oversized content-length", async () => {
    const handler = withErrorHandler(async () => {
      return NextResponse.json({ success: true });
    });
    const res = await handler(
      makeReq("http://localhost/test", {
        headers: { "content-length": "99999999" },
      })
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    assertStructuredError(body, "PAYLOAD_TOO_LARGE");
  });

  it("sets X-API-Version and x-correlation-id on success responses", async () => {
    const handler = withErrorHandler(async () => {
      return NextResponse.json({ success: true, data: {} });
    });
    const res = await handler(makeReq("http://localhost/test"));
    expect(res.status).toBe(200);
    expect(res.headers.get("X-API-Version")).toBe("v1");
    expect(res.headers.get("x-correlation-id")).toBe("test-corr-id");
  });
});

describe("withAuth", () => {
  it("returns structured 401 when no session", async () => {
    const handler = withAuth(async () => {
      return NextResponse.json({ success: true });
    });
    const res = await handler(makeReq("http://localhost/test"));
    expect(res.status).toBe(401);
    const body = await res.json();
    assertStructuredError(body, "UNAUTHORIZED");
  });
});

describe("withAdmin", () => {
  it("returns structured 401 when no session", async () => {
    const handler = withAdmin(async () => {
      return NextResponse.json({ success: true });
    });
    const res = await handler(makeReq("http://localhost/test"));
    expect(res.status).toBe(401);
    const body = await res.json();
    assertStructuredError(body, "UNAUTHORIZED");
  });
});
