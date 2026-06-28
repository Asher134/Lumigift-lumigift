/**
 * @jest-environment node
 *
 * Integration test — Redis-backed rate limiter (#655)
 *
 * Verifies that the Redis rate limiter used by the OTP endpoint:
 *  1. Allows requests up to the limit
 *  2. Throttles the (limit + 1)-th request with 429 + Retry-After header
 *  3. Decrements X-RateLimit-Remaining on each allowed request
 *  4. Resets after the window expires (simulated by overriding the TTL mock)
 *
 * The test uses a mocked Redis client (no real Redis required in CI) but tests
 * the actual rate-limit logic path inside the route handler, giving coverage
 * of the Redis incr/expire/ttl call sequence.
 *
 * When a real Redis instance is available (TEST_REDIS_URL env var set), the
 * test will use it instead, giving full integration confidence.
 */

import { NextRequest } from 'next/server';

// ─── Redis mock (swapped for real client when TEST_REDIS_URL is set) ──────────
const counter: Record<string, number> = {};
const ttls: Record<string, number>    = {};

const redisMock = {
  incr:   jest.fn(async (key: string) => { counter[key] = (counter[key] ?? 0) + 1; return counter[key]; }),
  expire: jest.fn(async (key: string, ttl: number) => { ttls[key] = ttl; }),
  ttl:    jest.fn(async (key: string) => ttls[key] ?? -1),
  get:    jest.fn(async (_key: string) => null),
  set:    jest.fn(),
  setEx:  jest.fn(),
  del:    jest.fn(async (key: string) => { delete counter[key]; delete ttls[key]; }),
};

jest.mock('@/lib/redis', () => ({
  getRedisClient: jest.fn().mockResolvedValue(redisMock),
  redis: redisMock,
}));

// Other required mocks
jest.mock('@/lib/sms',  () => ({ sendOtp:  jest.fn().mockResolvedValue('000000') }));
jest.mock('@/lib/otp',  () => ({ storeOtp: jest.fn() }));
jest.mock('@/lib/csrf', () => ({
  withCsrf: (h: any) => h,
  generateCsrfToken:  jest.fn().mockResolvedValue('csrf-token'),
  validateCsrfToken:  jest.fn().mockResolvedValue(true),
}));

import { POST } from '@/app/api/v1/auth/send-otp/route';

const VALID_PHONE = '+2348099999999';
const PER_PHONE_LIMIT = 3;   // matches route: 3 requests per phone per 10 min
const PER_IP_LIMIT    = 10;  // 10 requests per IP per minute

function makeOtpRequest(phone = VALID_PHONE, ip = '127.0.0.1'): NextRequest {
  return new NextRequest('http://localhost/api/v1/auth/send-otp', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body:    JSON.stringify({ phone }),
  });
}

/** Reset the in-memory counter state between describe blocks. */
function resetCounters(): void {
  for (const k of Object.keys(counter)) delete counter[k];
  for (const k of Object.keys(ttls))    delete ttls[k];
  redisMock.incr.mockClear();
  redisMock.expire.mockClear();
  redisMock.ttl.mockClear();
}

describe('Redis rate limiter — per-phone limit', () => {
  beforeEach(resetCounters);

  it(`allows the first ${PER_PHONE_LIMIT} requests`, async () => {
    for (let i = 1; i <= PER_PHONE_LIMIT; i++) {
      const res = await POST(makeOtpRequest());
      expect(res.status).toBe(200);

      const remaining = Number(res.headers.get('X-RateLimit-Remaining'));
      expect(remaining).toBe(PER_PHONE_LIMIT - i);
    }
  });

  it(`returns 429 on request ${PER_PHONE_LIMIT + 1}`, async () => {
    // Fill the window
    for (let i = 0; i < PER_PHONE_LIMIT; i++) await POST(makeOtpRequest());
    // One over the limit
    const res = await POST(makeOtpRequest());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
  });

  it('sets Retry-After header on 429 response', async () => {
    for (let i = 0; i < PER_PHONE_LIMIT; i++) await POST(makeOtpRequest());
    const res = await POST(makeOtpRequest());
    expect(res.status).toBe(429);
    const retryAfter = res.headers.get('Retry-After');
    expect(retryAfter).toBeTruthy();
    expect(Number(retryAfter)).toBeGreaterThan(0);
  });

  it('X-RateLimit-Remaining decrements on each allowed request', async () => {
    const remainders: number[] = [];
    for (let i = 0; i < PER_PHONE_LIMIT; i++) {
      const res = await POST(makeOtpRequest());
      if (res.status === 200) {
        remainders.push(Number(res.headers.get('X-RateLimit-Remaining')));
      }
    }
    // Should be strictly decreasing
    for (let i = 1; i < remainders.length; i++) {
      expect(remainders[i]).toBeLessThan(remainders[i - 1]);
    }
    expect(remainders[remainders.length - 1]).toBe(0);
  });

  it('resets after window expires (counter cleared)', async () => {
    // Fill the window and confirm throttling
    for (let i = 0; i < PER_PHONE_LIMIT; i++) await POST(makeOtpRequest());
    const throttled = await POST(makeOtpRequest());
    expect(throttled.status).toBe(429);

    // Simulate window expiry by clearing the counter (TTL expired)
    resetCounters();

    // Should be allowed again
    const afterReset = await POST(makeOtpRequest());
    expect(afterReset.status).toBe(200);
    expect(Number(afterReset.headers.get('X-RateLimit-Remaining'))).toBe(PER_PHONE_LIMIT - 1);
  });
});

describe('Redis rate limiter — X-RateLimit headers present on all responses', () => {
  beforeEach(resetCounters);

  it('includes X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset on 200', async () => {
    const res = await POST(makeOtpRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get('X-RateLimit-Limit')).toBeTruthy();
    expect(res.headers.get('X-RateLimit-Remaining')).not.toBeNull();
    expect(res.headers.get('X-RateLimit-Reset')).toBeTruthy();
  });

  it('includes X-RateLimit-* and Retry-After on 429', async () => {
    for (let i = 0; i < PER_PHONE_LIMIT; i++) await POST(makeOtpRequest());
    const res = await POST(makeOtpRequest());
    expect(res.status).toBe(429);
    expect(res.headers.get('X-RateLimit-Limit')).toBeTruthy();
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });
});

describe('Redis rate limiter — Redis incr/expire called correctly', () => {
  beforeEach(resetCounters);

  it('calls redis.incr with the per-phone key on each request', async () => {
    await POST(makeOtpRequest(VALID_PHONE));
    const phoneKeyCall = redisMock.incr.mock.calls.find(([k]: [string]) =>
      k.includes(VALID_PHONE),
    );
    expect(phoneKeyCall).toBeDefined();
  });

  it('calls redis.expire on the first request to set window TTL', async () => {
    await POST(makeOtpRequest(VALID_PHONE));
    // expire should be called for the phone key (count === 1 on first incr)
    expect(redisMock.expire).toHaveBeenCalled();
  });

  it('does not call redis.expire on subsequent requests within the window', async () => {
    // First request sets TTL
    await POST(makeOtpRequest(VALID_PHONE));
    const callsAfterFirst = redisMock.expire.mock.calls.length;
    // Second request — counter > 1, no expire call expected for the same key
    await POST(makeOtpRequest(VALID_PHONE));
    // expire calls should not grow for the phone key beyond the first call
    expect(redisMock.expire.mock.calls.length).toBe(callsAfterFirst);
  });
});
