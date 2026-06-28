# BullMQ Worker Failure Runbook

BullMQ workers process two critical workload types in Lumigift:

| Worker | Queue | Purpose |
|--------|-------|---------|
| Stellar unlock worker | `stellar-unlock` | Submits Soroban contract calls to transfer USDC when a gift's unlock time passes |
| Scheduled unlock worker | `gift-unlock` | Picks up gifts whose `unlockAt` has elapsed and enqueues Stellar transactions |

Failure in either worker means gifts are not unlocked on time and recipients cannot claim their USDC. Use this runbook to diagnose, recover, and escalate.

---

## Alert Triggers

Use this runbook when any of the following fire:

| Alert | Condition | Channel |
|-------|-----------|---------|
| Stalled jobs | `bullmq_stalled_count{queue=~"stellar-unlock|gift-unlock"} > 0` for 5 min | Slack #incidents |
| Failed job spike | `bullmq_failed_count` rate > 5 per minute | Slack #incidents |
| Queue depth | `bullmq_waiting_count > 50` for 10 min | Slack #incidents |
| Worker offline | No `bullmq_processed_count` increments for 15 min during business hours | Slack #incidents |
| Redis connection loss | `redis_connected == 0` | Slack #incidents (triggers all queue alerts) |

---

## Prerequisites

Install the BullMQ CLI globally for ad-hoc inspection:

```bash
npm install -g @bull-board/cli   # optional GUI
npm install -g bullmq            # includes bull-repl for CLI access
```

All commands below require `REDIS_URL` to be set in your shell:

```bash
export REDIS_URL=redis://<host>:6379
# or with password:
export REDIS_URL=redis://:<password>@<host>:6379
```

---

## 1. Inspect Queue State

### List waiting, active, failed, and delayed job counts

```bash
# Using bull-repl
bull-repl --queue stellar-unlock --redis $REDIS_URL

# Inside bull-repl:
> counts
# Output: { waiting: 3, active: 1, completed: 412, failed: 7, delayed: 0, paused: 0 }
```

Alternatively, check via Redis directly:

```bash
# Count jobs in each state (replace "stellar-unlock" with your queue name)
redis-cli -u $REDIS_URL llen "bull:stellar-unlock:wait"
redis-cli -u $REDIS_URL llen "bull:stellar-unlock:active"
redis-cli -u $REDIS_URL zcard "bull:stellar-unlock:failed"
redis-cli -u $REDIS_URL zcard "bull:stellar-unlock:delayed"
```

### Inspect a specific failed job

```bash
# List failed job IDs
redis-cli -u $REDIS_URL zrange "bull:stellar-unlock:failed" 0 -1

# Read the job data for a specific ID
redis-cli -u $REDIS_URL hgetall "bull:stellar-unlock:<job-id>"
```

Key fields to check:

- `failedReason` — the error message from the last attempt
- `stacktrace` — full stack (JSON-encoded array of strings)
- `attemptsMade` — how many times the job has been retried
- `opts` — contains `attempts` (max retries) and `backoff` config

### Check stalled jobs

Stalled jobs are active jobs whose worker died mid-processing. BullMQ moves them back to the waiting list automatically on the next stall check cycle (default: 30 s). If stalled jobs are not recovering:

```bash
redis-cli -u $REDIS_URL lrange "bull:stellar-unlock:active" 0 -1
```

---

## 2. Retry / Replay Failed Jobs

### Retry a single failed job

```bash
# Inside bull-repl
> retry <job-id>
```

Or via the Node.js BullMQ API (run from a one-off script):

```ts
import { Queue } from "bullmq";
const queue = new Queue("stellar-unlock", { connection: { url: process.env.REDIS_URL } });
const job = await queue.getJob("<job-id>");
await job?.retry();
```

### Retry all failed jobs in a queue

```bash
# bull-repl
> retryFailed

# Or via Redis scan (bulk retry — use with caution on large queues)
redis-cli -u $REDIS_URL zrange "bull:stellar-unlock:failed" 0 -1 | xargs -I{} \
  node -e "
    const { Queue } = require('bullmq');
    const q = new Queue('stellar-unlock', { connection: { url: process.env.REDIS_URL } });
    q.getJob('{}').then(j => j?.retry()).then(() => q.close());
  "
```

### Re-enqueue a job with new data

If the job data itself was wrong (e.g., stale gift ID), add a corrected job manually:

```ts
import { Queue } from "bullmq";
const queue = new Queue("stellar-unlock", { connection: { url: process.env.REDIS_URL } });
await queue.add("unlock", { giftId: "<uuid>", retryOf: "<original-job-id>" });
await queue.close();
```

---

## 3. Drain a Queue Before Deployment

Draining ensures no jobs are processed during a deployment window. Always drain before replacing the worker process.

```bash
# Pause the queue (stops workers picking up new jobs; active jobs finish)
node -e "
  const { Queue } = require('bullmq');
  new Queue('stellar-unlock', { connection: { url: process.env.REDIS_URL } })
    .pause().then(() => { console.log('paused'); process.exit(0); });
"

# Wait for active count to reach 0
watch -n 2 "redis-cli -u $REDIS_URL llen 'bull:stellar-unlock:active'"

# After deployment completes, resume
node -e "
  const { Queue } = require('bullmq');
  new Queue('stellar-unlock', { connection: { url: process.env.REDIS_URL } })
    .resume().then(() => { console.log('resumed'); process.exit(0); });
"
```

To obliterate an entire queue (remove all jobs — irreversible):

```bash
node -e "
  const { Queue } = require('bullmq');
  new Queue('stellar-unlock', { connection: { url: process.env.REDIS_URL } })
    .obliterate({ force: true }).then(() => { console.log('obliterated'); process.exit(0); });
"
```

> **Warning:** `obliterate` permanently deletes all waiting, delayed, and failed jobs. Only use during a full queue rebuild where jobs can be reconstructed from the database.

---

## 4. Recover from Redis Connection Loss

BullMQ workers reconnect automatically when Redis becomes available. However, jobs that were `active` during the outage become stalled and must be recovered manually.

### Step-by-step recovery

1. **Verify Redis is reachable:**
   ```bash
   redis-cli -u $REDIS_URL ping
   # Expected: PONG
   ```

2. **If using Sentinel, confirm the current master:**
   ```bash
   redis-cli -h $SENTINEL_HOST -p 26379 sentinel get-master-addr-by-name mymaster
   ```
   See `docs/ops/redis.md` for full Sentinel failover recovery.

3. **Check for stalled jobs** (may take up to 30 s for BullMQ to detect them after Redis reconnects):
   ```bash
   redis-cli -u $REDIS_URL lrange "bull:stellar-unlock:active" 0 -1
   ```

4. **Force a stall check** to move stalled jobs back to waiting:
   ```ts
   import { Worker } from "bullmq";
   const worker = new Worker("stellar-unlock", async () => {}, {
     connection: { url: process.env.REDIS_URL },
   });
   await worker.runStalledJobsCheck();
   await worker.close();
   ```

5. **Verify jobs are moving** by watching the waiting count decrease and completed count increase:
   ```bash
   watch -n 5 "redis-cli -u $REDIS_URL llen 'bull:stellar-unlock:wait'"
   ```

6. **Reconcile any missed unlocks** against the database:
   ```sql
   -- Find gifts that should have unlocked during the outage window but haven't been claimed
   SELECT id, unlock_at, status
   FROM gifts
   WHERE status = 'locked'
     AND unlock_at < NOW()
   ORDER BY unlock_at;
   ```
   Re-enqueue each as a new job (step 2 above).

---

## 5. Bull Board UI (Optional)

If Bull Board is running (check `src/server/workers/` for a `createBullBoard` call), access the dashboard at:

```
http://localhost:3000/admin/queues   (local)
https://www.lumigift.com/admin/queues  (production — requires admin session)
```

The board provides:
- Real-time job counts per state
- Per-job stacktrace viewer
- One-click retry and discard buttons

---

## Escalation Path

| Situation | Action |
|-----------|--------|
| Failed jobs retried successfully, no data loss | Close the incident; add a post-mortem note in Slack #incidents |
| Jobs failing repeatedly with a Stellar RPC error | See `docs/ops/runbook.md → Stellar Network Degradation` |
| Jobs failing with a database error | See `docs/ops/runbook.md → Database Connection Failure` |
| Redis unavailable for > 5 minutes | Escalate to on-call engineering lead; follow `docs/ops/redis.md` |
| Gifts not unlocked and recipients are affected | Escalate to engineering lead immediately; manually trigger unlock via admin interface while workers recover |
| Worker process not starting after deployment | Check application logs in Vercel / hosting dashboard; escalate to engineering lead if process exits on startup |
