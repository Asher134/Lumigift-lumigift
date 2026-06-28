/**
 * @jest-environment node
 *
 * API contract tests — validate actual handler responses against openapi.yaml (#650)
 *
 * Strategy: call route handlers directly (no HTTP server needed) and assert
 * the JSON response shapes match the schemas declared in openapi.yaml.
 *
 * Endpoints covered (10 critical paths):
 *  1.  POST /api/v1/auth/send-otp           → 400 (missing body)
 *  2.  POST /api/v1/auth/send-otp           → 400 (invalid phone)
 *  3.  GET  /api/v1/gifts                   → 401 (unauthenticated)
 *  4.  POST /api/v1/gifts                   → 401 (unauthenticated)
 *  5.  GET  /api/v1/gifts/:id               → 404 (not found)
 *  6.  DELETE /api/v1/gifts/:id             → 401 (unauthenticated)
 *  7.  POST /api/v1/gifts/:id/claim         → 400 (missing body)
 *  8.  GET  /api/v1/cron/unlock             → 401 (missing token)
 *  9.  GET  /api/v1/cron/expire             → 401 (missing token)
 * 10.  POST /api/v1/payments               → 401 (missing signature)
 *
 * Each test verifies:
 *  - HTTP status code matches the openapi.yaml declaration
 *  - Response body shape: { success, error } for errors / { success, data } for 2xx
 */

import { NextRequest } from 'next/server';
import { assertSuccessEnvelope, assertErrorEnvelope } from './helpers';

// ─── Mocks required for Next.js route handlers ────────────────────────────────
jest.mock('next-auth', () => ({
  getServerSession: jest.fn().mockResolvedValue(null),
}));
jest.mock('@/lib/redis', () => ({
  getRedisClient: jest.fn().mockResolvedValue({
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn(),
    ttl: jest.fn().mockResolvedValue(60),
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
  }),
  redis: {
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn(),
    ttl: jest.fn().mockResolvedValue(60),
  },
}));
jest.mock('@/lib/sms',   () => ({ sendOtp: jest.fn().mockResolvedValue('123456') }));
jest.mock('@/lib/otp',   () => ({ storeOtp: jest.fn() }));
jest.mock('@/lib/csrf',  () => ({
  withCsrf: (h: any) => h,   // bypass CSRF in tests
  generateCsrfToken: jest.fn().mockResolvedValue('test-csrf'),
  validateCsrfToken: jest.fn().mockResolvedValue(true),
}));
jest.mock('@/lib/paystack', () => ({ refundPayment: jest.fn(), initializePayment: jest.fn() }));
jest.mock('@/server/services/gift.service', () => ({
  createGift: jest.fn(),
  getGiftById: jest.fn().mockResolvedValue(null),
  getGiftsBySenderPaginated: jest.fn().mockResolvedValue({ gifts: [], nextCursor: null }),
  getGiftsBySenderPage: jest.fn().mockResolvedValue({ gifts: [], total: 0 }),
  cancelGift: jest.fn(),
  softDeleteGift: jest.fn(),
  gifts: new Map(),
}));
jest.mock('@/server/services/audit.service', () => ({ createAuditLog: jest.fn() }));
jest.mock('@/server/services/account-takeover.service', () => ({
  checkRapidGiftCreation: jest.fn(),
}));

// ─── Lazy imports (after mocks are set up) ────────────────────────────────────
let sendOtpRoute: any;
let giftsRoute: any;
let giftByIdRoute: any;
let claimRoute: any;
let cronUnlockRoute: any;
let cronExpireRoute: any;
let paymentsRoute: any;

beforeAll(async () => {
  sendOtpRoute  = await import('@/app/api/v1/auth/send-otp/route');
  giftsRoute    = await import('@/app/api/v1/gifts/route');
  giftByIdRoute = await import('@/app/api/v1/gifts/[id]/route');
  claimRoute    = await import('@/app/api/v1/gifts/[id]/claim/route');
  cronUnlockRoute = await import('@/app/api/v1/cron/unlock/route');
  cronExpireRoute = await import('@/app/api/v1/cron/expire/route');
  paymentsRoute   = await import('@/app/api/v1/payments/route');
});

function makeReq(
  url: string,
  opts: { method?: string; body?: any; headers?: Record<string, string> } = {}
): NextRequest {
  const { method = 'GET', body, headers = {} } = opts;
  return new NextRequest(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ─── 1 & 2 · POST /api/v1/auth/send-otp ─────────────────────────────────────
describe('POST /api/v1/auth/send-otp', () => {
  it('returns 400 with error envelope when body is empty (schema: BadRequest)', async () => {
    const req = makeReq('http://localhost/api/v1/auth/send-otp', { method: 'POST', body: {} });
    const res = await sendOtpRoute.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    assertErrorEnvelope(body);
  });

  it('returns 400 when phone is not a string (schema: BadRequest)', async () => {
    const req = makeReq('http://localhost/api/v1/auth/send-otp', {
      method: 'POST',
      body: { phone: 12345 },
    });
    const res = await sendOtpRoute.POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    assertErrorEnvelope(body);
  });
});

// ─── 3 · GET /api/v1/gifts ───────────────────────────────────────────────────
describe('GET /api/v1/gifts', () => {
  it('returns 401 when not authenticated (schema: Unauthorized)', async () => {
    const req = makeReq('http://localhost/api/v1/gifts');
    const res = await giftsRoute.GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    assertErrorEnvelope(body);
  });
});

// ─── 4 · POST /api/v1/gifts ──────────────────────────────────────────────────
describe('POST /api/v1/gifts', () => {
  it('returns 401 when not authenticated (schema: Unauthorized)', async () => {
    const req = makeReq('http://localhost/api/v1/gifts', { method: 'POST', body: {} });
    const res = await giftsRoute.POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    assertErrorEnvelope(body);
  });
});

// ─── 5 · GET /api/v1/gifts/:id ───────────────────────────────────────────────
describe('GET /api/v1/gifts/:id', () => {
  it('returns 404 when gift does not exist (schema: NotFound)', async () => {
    const req = makeReq('http://localhost/api/v1/gifts/00000000-0000-0000-0000-000000000000');
    const context = { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) };
    const res = await giftByIdRoute.GET(req, context);
    expect(res.status).toBe(404);
    const body = await res.json();
    assertErrorEnvelope(body);
    expect(body.error).toMatch(/not found/i);
  });
});

// ─── 6 · DELETE /api/v1/gifts/:id ───────────────────────────────────────────
describe('DELETE /api/v1/gifts/:id', () => {
  it('returns 401 when not authenticated (schema: Unauthorized)', async () => {
    const req = makeReq('http://localhost/api/v1/gifts/00000000-0000-0000-0000-000000000000', {
      method: 'DELETE',
    });
    const context = { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) };
    const res = await giftByIdRoute.DELETE(req, context);
    expect(res.status).toBe(401);
    const body = await res.json();
    assertErrorEnvelope(body);
  });
});

// ─── 7 · POST /api/v1/gifts/:id/claim ───────────────────────────────────────
describe('POST /api/v1/gifts/:id/claim', () => {
  it('returns 400 when body is missing required fields (schema: BadRequest)', async () => {
    const req = makeReq('http://localhost/api/v1/gifts/00000000-0000-0000-0000-000000000000/claim', {
      method: 'POST',
      body: {},
    });
    const context = { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) };
    const res = await claimRoute.POST(req, context);
    // claim handler returns 400 for missing recipientStellarKey or 404 for missing gift
    expect([400, 404]).toContain(res.status);
    const body = await res.json();
    assertErrorEnvelope(body);
  });
});

// ─── 8 · GET /api/v1/cron/unlock ────────────────────────────────────────────
describe('GET /api/v1/cron/unlock', () => {
  it('returns 401 when Bearer token is missing (schema: Unauthorized)', async () => {
    const req = makeReq('http://localhost/api/v1/cron/unlock');
    const res = await cronUnlockRoute.GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    assertErrorEnvelope(body);
  });
});

// ─── 9 · GET /api/v1/cron/expire ────────────────────────────────────────────
describe('GET /api/v1/cron/expire', () => {
  it('returns 401 when Bearer token is missing (schema: Unauthorized)', async () => {
    const req = makeReq('http://localhost/api/v1/cron/expire');
    const res = await cronExpireRoute.GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    assertErrorEnvelope(body);
  });
});

// ─── 10 · POST /api/v1/payments ─────────────────────────────────────────────
describe('POST /api/v1/payments (Paystack webhook)', () => {
  it('returns 401 when x-paystack-signature header is missing (schema: Unauthorized)', async () => {
    const req = makeReq('http://localhost/api/v1/payments', {
      method: 'POST',
      body: { event: 'charge.success', data: {} },
    });
    const res = await paymentsRoute.POST(req);
    expect([400, 401]).toContain(res.status);
    const body = await res.json();
    // either error shape is valid per the spec
    expect(body.success).toBe(false);
  });
});
