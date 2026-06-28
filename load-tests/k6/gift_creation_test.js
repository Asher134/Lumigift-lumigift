// k6 load test for gift creation peak traffic (Valentine's Day scenario)
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: {
    gift_creation: {
      executor: 'constant-vus',
      vus: 1000,
      duration: '1m', // hold 1000 VUs for 1 minute
    },
  },
  thresholds: {
    // 95th percentile of request duration should be under 2 seconds
    'http_req_duration{scenario:gift_creation}': ['p(95)<2000'],
  },
};

// Base URL of the staging environment (set via env variable when running the test)
const BASE_URL = __ENV.BASE_URL || 'https://staging.lumigift.com';

// Minimal payload for creating a gift (adjust fields as required by the API)
function getPayload() {
  return JSON.stringify({
    amountNgn: 5000,
    recipientPhoneHash: 'abcdef1234567890',
    recipientName: 'Valentine',
    message: 'Happy Valentine\'s Day!',
    occasion: 'valentine',
    // add any other required fields here
  });
}

export default function () {
  const res = http.post(`${BASE_URL}/api/v1/gifts`, getPayload(), {
    headers: { 'Content-Type': 'application/json' },
  });

  // Basic sanity checks – ensure we receive a successful creation response
  check(res, {
    'status is 201': (r) => r.status === 201,
    'response has gift id': (r) => r.json('data.gift.id') !== undefined,
  });

  // Optional small pause to simulate think time
  sleep(0.1);
}
