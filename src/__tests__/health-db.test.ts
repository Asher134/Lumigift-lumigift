/**
 * @jest-environment node
 */

import { NextRequest } from "next/server";

const mockQuery = jest.fn();
const mockPool = {
  query: mockQuery,
  totalCount: 5,
  idleCount: 3,
  waitingCount: 0,
  on: jest.fn(),
  end: jest.fn(),
};

jest.mock("pg", () => ({
  Pool: jest.fn(() => mockPool),
}));

jest.mock("@/server/config", () => ({
  serverConfig: {
    database: {
      url: "postgresql://test:test@localhost:5432/test",
      poolMin: 2,
      poolMax: 10,
      idleTimeoutMs: 10000,
      connectionTimeoutMs: 5000,
    },
  },
}));

jest.mock("@/lib/logger", () => ({
  serviceLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
  requestLogger: () => ({
    error: jest.fn(),
    info: jest.fn(),
  }),
  getCorrelationId: () => "test-correlation-id",
}));

let GET: any;

beforeAll(async () => {
  const mod = await import("@/app/api/v1/health/db/route");
  GET = mod.GET;
});

function makeReq(url: string): NextRequest {
  return new NextRequest(url);
}

describe("GET /api/v1/health/db", () => {
  afterEach(() => {
    mockQuery.mockReset();
  });

  it("returns 200 with pool stats when database is healthy", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });

    const res = await GET(makeReq("http://localhost/api/v1/health/db"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe("ok");
    expect(body.data.metrics).toEqual(
      expect.objectContaining({
        totalConnections: 5,
        idleConnections: 3,
        waitingRequests: 0,
        maxConnections: 10,
        minConnections: 2,
      })
    );
    expect(typeof body.data.latencyMs).toBe("number");
  });

  it("returns 503 when database query fails (simulated connection drop)", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection terminated"));

    const res = await GET(makeReq("http://localhost/api/v1/health/db"));
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.data.status).toBe("error");
    expect(body.data.metrics).toBeDefined();
  });

  it("recovers after a simulated connection drop", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection terminated"));
    const failRes = await GET(makeReq("http://localhost/api/v1/health/db"));
    expect(failRes.status).toBe(503);

    mockQuery.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] });
    const okRes = await GET(makeReq("http://localhost/api/v1/health/db"));
    expect(okRes.status).toBe(200);
    const body = await okRes.json();
    expect(body.data.status).toBe("ok");
  });
});
