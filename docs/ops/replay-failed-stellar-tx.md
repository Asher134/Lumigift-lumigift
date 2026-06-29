# Replaying Failed Stellar Transaction Jobs

## Overview

When a Stellar transaction job exhausts its retries (3 attempts with exponential
backoff), BullMQ marks it as failed and the dead-letter handler writes a record
to the `failed_jobs` PostgreSQL table. The gift stays in its pre-claim status
until the job is replayed or manually resolved.

## 1. Check Queue Health

```bash
curl -s -H "Authorization: Bearer $ADMIN_SECRET" \
  https://www.lumigift.com/api/v1/admin/queue-stats | jq .
```

Look at `data.stellarTx.failed` and `data.deadLetterCount`.

## 2. Inspect Failed Jobs

```sql
SELECT id, job_id, job_data, error_message, attempts_made, failed_at
FROM failed_jobs
WHERE queue_name = 'stellar-tx'
  AND replayed_at IS NULL
ORDER BY failed_at DESC;
```

Common failure reasons:
- **"Invalid recipient account"** — unrecoverable; the recipient's Stellar
  account does not exist or lacks a USDC trustline. Contact the user.
- **Network/timeout errors** — transient; safe to replay.
- **"Gift not found"** — data inconsistency; investigate the in-memory store.

## 3. Replay a Job

Re-enqueue the claim through the application:

```bash
# Connect to the Node REPL on the worker process, or run a one-off script:
node -e "
  const { enqueueClaim } = require('./src/lib/queues/stellar-tx.queue');
  enqueueClaim('<giftId>', '<recipientStellarKey>')
    .then(id => console.log('Enqueued:', id))
    .catch(console.error);
"
```

After replay, mark the dead-letter record:

```sql
UPDATE failed_jobs
SET replayed_at = now()
WHERE queue_name = 'stellar-tx' AND job_id = 'claim:<giftId>';
```

## 4. Bulk Replay (Transient Failures Only)

```sql
-- Find all transient failures (exclude "Invalid recipient account")
SELECT job_id, job_data->>'giftId' AS gift_id,
       job_data->>'recipientStellarKey' AS stellar_key
FROM failed_jobs
WHERE queue_name = 'stellar-tx'
  AND replayed_at IS NULL
  AND error_message NOT LIKE 'Invalid recipient%';
```

Use the output to script bulk `enqueueClaim` calls, then update `replayed_at`
for all replayed records.

## 5. Monitoring

- **Pino logs**: search for `"stellar-tx worker: job exhausted retries"` in your
  log aggregation system.
- **Queue stats**: poll `/api/v1/admin/queue-stats` or add a Grafana panel for
  the `failed` count.
- **Alerting**: set up an alert when `deadLetterCount > 0` persists for more
  than 15 minutes.
