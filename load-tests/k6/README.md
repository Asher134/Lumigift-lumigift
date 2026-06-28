# k6 Load Test – Gift Creation Peak Traffic

## Purpose

This script (`gift_creation_test.js`) simulates a **Valentine's Day** traffic spike where **1000 concurrent virtual users** create gifts for a short duration. It helps identify performance bottlenecks in the gift creation API before releasing to production.

## How to Run

1. **Install k6** (if not already installed):
   ```bash
   brew install k6   # macOS
   // or see https://k6.io/docs/getting-started/installation for other OSes
   ```
2. **Set the target environment** (default points to staging):
   ```bash
   export BASE_URL=https://staging.lumigift.com   # adjust if needed
   ```
3. **Execute the test**:
   ```bash
   k6 run load-tests/k6/gift_creation_test.js
   ```

## Expected Results

- The test runs for **1 minute** with **1000 VUs**.
- **Threshold**: 95th percentile of request duration (`p(95)`) must be **< 2000 ms**.
- On successful run you will see a summary like:
  ```
  checks{status_is_201:true, response_has_gift_id:true}................. 100.00%
  http_req_duration{scenario:gift_creation}............................. avg=xxx ms, p(95)=xxx ms
  ```
- Anything above the 2‑second threshold will be marked as a failed check, indicating a potential bottleneck.

## Post‑Run Analysis

1. Review the **k6 HTML or JSON report** (use `--out json=report.json` to generate).
2. Identify slow endpoints, database query times, or external service latencies.
3. Compare against the baseline documented in this repo (`/load-tests/k6/BASELINE.md`) for future regression checks.

---
*This README was generated automatically to aid developers in running and interpreting the k6 load test.*
