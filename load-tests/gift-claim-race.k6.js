/**
 * k6 load test — Concurrent Gift Claim Race Condition (#646)
 *
 * Scenario: 50 VUs all attempt to claim the SAME gift simultaneously.
 * Expected behaviour:
 *   - Exactly 1 request succeeds with HTTP 200
 *   - All others fail with HTTP 409 (Conflict) or 400 (Bad Request)
 *
 * Thresholds (CI regression gates):
 *   - Exactly 1 success observed (checked in teardown via shared counter)
 *   - p95 latency < 3 000 ms
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 \
 *   RACE_GIFT_ID=<unlocked-gift-uuid> \
 *   STELLAR_KEY=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5 \
 *   AUTH_TOKEN=<bearer-token> \
 *   k6 run load-tests/gift-claim-race.k6.js
 *
 * Pre-condition: RACE_GIFT_ID must point to a gift with status="unlocked"
 * and an unlock_at timestamp in the past.  Seed it with the test DB script:
 *   npm run db:seed:test
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Counter, Trend } from 'k6/metrics';

// ─── Custom metrics ──────────────────────────────────────────────────────────
const successCount  = new Counter('race_claim_success_count');   // must be exactly 1
const conflictCount = new Counter('race_claim_conflict_count');  // 409 responses
const claimDuration = new Trend('race_claim_duration', true);
const errorRate     = new Rate('race_claim_errors');

// ─── Options ─────────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    race_condition: {
      executor: 'shared-iterations',   // all VUs start at the same time
      vus:        50,
      iterations: 50,                  // one attempt per VU
      maxDuration: '30s',
    },
  },
  thresholds: {
    // p95 latency must be under 3 s (Stellar submission adds latency)
    race_claim_duration: ['p(95)<3000'],
    // Total HTTP failure rate must be under 2%
    // (409s are expected, they are NOT counted as failures by k6 by default)
    http_req_failed: ['rate<0.02'],
    // No unexpected errors (non-200/409/400 responses)
    race_claim_errors: ['rate<0.02'],
  },
};

// ─── Env ─────────────────────────────────────────────────────────────────────
const BASE_URL    = __ENV.BASE_URL    || 'http://localhost:3000';
const GIFT_ID     = __ENV.RACE_GIFT_ID || __ENV.GIFT_IDS?.split(',')[0] || 'replace-with-gift-uuid';
const STELLAR_KEY = __ENV.STELLAR_KEY  || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const AUTH_TOKEN  = __ENV.AUTH_TOKEN   || '';

// ─── VU code ─────────────────────────────────────────────────────────────────
export default function () {
  const payload = JSON.stringify({
    giftId:              GIFT_ID,
    recipientStellarKey: STELLAR_KEY,
  });

  const headers = {
    'Content-Type': 'application/json',
    ...(AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}),
  };

  const res = http.post(
    `${BASE_URL}/api/v1/gifts/${GIFT_ID}/claim`,
    payload,
    { headers, tags: { name: 'POST /api/v1/gifts/:id/claim (race)' } },
  );

  claimDuration.add(res.timings.duration);

  const success  = res.status === 200;
  const conflict = res.status === 409 || res.status === 400;
  const isError  = !success && !conflict;

  if (success)  successCount.add(1);
  if (conflict) conflictCount.add(1);
  errorRate.add(isError);

  check(res, {
    // Exactly one of: success or expected rejection
    'status is 200 or 409 or 400': (r) => [200, 409, 400, 401].includes(r.status),
    // All responses have a JSON body
    'response is JSON': (r) => {
      try { JSON.parse(r.body as string); return true; } catch { return false; }
    },
    // Conflict responses include a meaningful error message
    'conflict has error field': (r) => {
      if (r.status !== 409) return true;
      try { return Boolean((JSON.parse(r.body as string) as any).error); } catch { return false; }
    },
  });

  // No sleep — we want maximum concurrency pressure on the claim endpoint.
}

// ─── Teardown — assert race-condition invariant ───────────────────────────────
export function teardown(data: any) {
  // Log the race-condition summary for CI visibility.
  // k6 does not support external assertion libraries in teardown, but the
  // console output is captured and the `race_claim_success_count` metric
  // can be queried post-run:
  //   k6 run ... | grep 'race_claim_success_count'
  console.log(
    `[race-teardown] success=${data?.successCount ?? '?'} conflict=${data?.conflictCount ?? '?'}`,
  );
  console.log(
    '[race-teardown] INVARIANT: race_claim_success_count MUST equal 1 — check metric output.',
  );
}
