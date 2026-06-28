# Load Test Results

> **Tool:** [k6](https://k6.io)  
> **Scripts:** `load-tests/gift-creation.k6.js`, `load-tests/gift-claim.k6.js`, `load-tests/combined.k6.js`, `load-tests/gift-claim-race.k6.js`

---

## Performance Regression Thresholds

These thresholds are enforced by k6 and will cause a non-zero exit code (CI failure) if breached.

| Metric                       | Threshold  | Rationale                                           |
| ---------------------------- | ---------- | --------------------------------------------------- |
| `gift_creation_duration` p95 | < 2 000 ms | Gift creation involves DB write + Paystack API call |
| `gift_claim_duration` p95    | < 3 000 ms | Claim involves Stellar transaction submission       |
| `gift_creation_errors`       | < 1%       | Error rate budget                                   |
| `gift_claim_errors`          | < 1%       | Error rate budget                                   |
| `http_req_failed`            | < 1%       | Overall HTTP failure rate                           |

---

## Baseline Run — Not Yet Established

> **Status:** Baseline metrics have not yet been captured against a live environment.  
> Run the scripts against a staging environment and record results in the table below.

### How to run

```bash
# 1. Start the app (or point at staging)
npm run dev   # or set BASE_URL=https://staging.lumigift.com

# 2. Obtain a valid auth token (NextAuth session JWT)
export AUTH_TOKEN="<your-jwt>"

# 3. (For claim tests) seed unlocked gift IDs
export GIFT_IDS="uuid1,uuid2,...,uuid50"
export STELLAR_KEY="G..."

# 4. Run combined test and save JSON output
k6 run load-tests/combined.k6.js \
  --out json=load-tests/results/baseline-$(date +%Y%m%d).json

# 5. View summary
k6 run load-tests/combined.k6.js --summary-export=load-tests/results/summary.json
```

---

## Baseline Results Template

Fill in after the first run against staging.

### Gift Creation (100 VUs, 30 s)

| Metric             | Value |
| ------------------ | ----- |
| Total requests     | —     |
| Throughput (req/s) | —     |
| p50 latency        | — ms  |
| p95 latency        | — ms  |
| p99 latency        | — ms  |
| Error rate         | — %   |
| Date               | —     |
| Environment        | —     |

### Gift Claim (50 VUs, 30 s)

| Metric             | Value |
| ------------------ | ----- |
| Total requests     | —     |
| Throughput (req/s) | —     |
| p50 latency        | — ms  |
| p95 latency        | — ms  |
| p99 latency        | — ms  |
| Error rate         | — %   |
| Date               | —     |
| Environment        | —     |

---

## CI Integration

Add the following step to `.github/workflows/ci.yml` once a staging environment is available:

```yaml
- name: Run load tests
  env:
    BASE_URL: ${{ secrets.STAGING_URL }}
    AUTH_TOKEN: ${{ secrets.STAGING_AUTH_TOKEN }}
    GIFT_IDS: ${{ secrets.STAGING_GIFT_IDS }}
    STELLAR_KEY: ${{ secrets.STAGING_STELLAR_KEY }}
  run: |
    k6 run load-tests/combined.k6.js \
      --out json=load-tests/results/ci-${{ github.run_id }}.json
```

k6 exits with code 1 if any threshold is breached, which will fail the CI job.

---

## Notes

- The claim endpoint requires pre-seeded gifts with `status = "unlocked"`. In CI, a seed script should create these before the load test runs.
- Stellar transaction submission latency varies by network congestion. The 3 s p95 threshold is calibrated for testnet; adjust for mainnet.
- Results JSON files in `load-tests/results/` are gitignored — upload them as CI artifacts instead.

---

## Race Condition Test — Concurrent Gift Claims (#646)

**Script:** `load-tests/gift-claim-race.k6.js`  
**Purpose:** Detect race conditions when multiple users claim the same gift simultaneously.

### Scenario

50 VUs all attempt to claim **the same gift ID** at the same moment (no sleep between requests).  
Correct server behaviour: **exactly 1 claim succeeds (HTTP 200)**; all others are rejected (HTTP 409 Conflict or 400).

### Thresholds

| Metric                      | Threshold    | Rationale                                      |
| --------------------------- | ------------ | ---------------------------------------------- |
| `race_claim_duration` p95   | < 3 000 ms   | Stellar submission budget                       |
| `http_req_failed`           | < 2%         | 409s are expected and not counted as failures  |
| `race_claim_errors`         | < 2%         | Non-200/409/400 responses indicate a bug       |
| `race_claim_success_count`  | = 1          | Checked in CI post-run; > 1 means a race bug   |

### How to run

```bash
# Pre-condition: seed an unlocked gift
npm run db:seed:test

export BASE_URL=http://localhost:3000
export RACE_GIFT_ID=<unlocked-gift-uuid>
export STELLAR_KEY=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
export AUTH_TOKEN=<bearer-token>

k6 run load-tests/gift-claim-race.k6.js \
  --out json=load-tests/results/race-$(date +%Y%m%d).json
```

### Baseline Results — Not Yet Captured

| Metric                    | Value |
| ------------------------- | ----- |
| VUs                       | 50    |
| Successful claims         | —     |
| Conflict (409) responses  | —     |
| p95 latency               | — ms  |
| Date                      | —     |
| Environment               | —     |

> Run against staging and fill in the table above. A `race_claim_success_count` > 1 is a critical race condition bug.

### CI Integration

Add the following step to the `load-test` job in `.github/workflows/ci.yml`:

```yaml
- name: Run race condition load test
  env:
    BASE_URL: ${{ secrets.STAGING_URL }}
    RACE_GIFT_ID: ${{ secrets.STAGING_RACE_GIFT_ID }}
    STELLAR_KEY: ${{ secrets.STAGING_STELLAR_KEY }}
    AUTH_TOKEN: ${{ secrets.STAGING_AUTH_TOKEN }}
  run: |
    k6 run load-tests/gift-claim-race.k6.js \
      --out json=load-tests/results/race-${{ github.run_id }}.json
    # Fail CI if more than 1 claim succeeded (race condition detected)
    SUCCESS=$(cat load-tests/results/race-${{ github.run_id }}.json \
      | jq '[.[] | select(.metric == "race_claim_success_count")] | last | .data.value')
    if [ "$SUCCESS" -gt 1 ]; then
      echo "RACE CONDITION DETECTED: $SUCCESS claims succeeded for the same gift"
      exit 1
    fi
```
