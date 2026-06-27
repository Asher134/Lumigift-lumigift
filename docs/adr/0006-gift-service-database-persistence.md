# ADR-0006: Gift Service Database Persistence — PostgreSQL over In-Memory Map

**Date:** 2026-06-27  
**Status:** Accepted

## Context

`gift.service.ts` and `group-gift.service.ts` currently store gift records in module-level `Map` objects:

```ts
// gift.service.ts
export const gifts = new Map<string, Gift>();

// group-gift.service.ts
const groupGifts = new Map<string, GroupGift>();
```

This approach was chosen during early prototyping for simplicity. It has several production-blocking consequences:

- **Data loss on restart**: every Vercel deployment, cold start, or crash wipes all gift and payment state.
- **No cross-instance consistency**: Vercel runs many serverless instances concurrently; each instance has its own isolated Map, so two requests for the same gift may read different data.
- **No ACID guarantees**: gift creation and Paystack payment initialisation must be atomic. An in-memory Map provides no rollback path if the Paystack call fails mid-write.
- **No queryability**: features like "gifts by sender", "gifts expiring today", or admin dashboards require SQL-style filtering that Maps cannot support without a full table scan.
- **Fraud and audit trail gaps**: `fraud.service.ts` and `audit.service.ts` write to PostgreSQL; the gift Map is invisible to those logs.

PostgreSQL is already in use for user accounts, OTP tokens, audit logs, and fraud flags (ADR-0004). The `pool` connection helper and plain-SQL migration infrastructure already exist.

## Decision

Migrate `gift.service.ts` and `group-gift.service.ts` from in-memory `Map` storage to **PostgreSQL**, using the existing `pool` (pg) connection and plain SQL queries.

- Add `gifts` and `group_gifts` tables via a new migration file in `migrations/`.
- Replace every `Map.get / Map.set / Map.delete` in both service files with `pool.query(...)` calls.
- Keep the existing `Gift` and `GroupGift` TypeScript types; only the persistence layer changes.
- Wrap gift-creation + payment-initialisation in a PostgreSQL transaction to preserve atomicity.

## Consequences

### Positive

- Gift records survive deployments, cold starts, and instance crashes.
- All Vercel instances share a single authoritative data source — no split-brain reads.
- PostgreSQL ACID transactions prevent partial writes during gift creation + payment initiation.
- Existing SQL query infrastructure (indexes, CTEs, audit triggers) can be reused immediately.
- Fraud and audit services gain visibility into the full gift lifecycle.
- Cursor and offset pagination become straightforward SQL `LIMIT / OFFSET / WHERE id > $cursor`.

### Negative

- Every gift operation now incurs a network round-trip to the database; p99 latency increases slightly compared to in-memory reads.
- Connection pool exhaustion is a risk in high-concurrency scenarios — pool sizing (`DB_POOL_MAX`) must be tuned.
- Plain SQL queries must be written and tested manually; no compile-time query validation.
- A migration must be applied before deployment; there is no automatic rollback if the migration fails.

### Neutral

- Redis remains the store for OTP codes and idempotency keys (see `docs/ops/redis.md`).
- The `group-gift.service.ts` `shareToken → id` index (currently a second Map) will be stored as a unique column in the `group_gifts` table with a B-tree index.
- The BullMQ queue (Stellar unlock jobs) already reads gift IDs from Redis job payloads and re-fetches gift data from the service layer; no queue changes are required.

## Alternatives Considered

| Option | Reason Rejected |
| --- | --- |
| **Redis (HASH / JSON)** | Redis is already used for ephemeral state (OTP, idempotency). Storing durable gift records in Redis would create an undifferentiated data model, complicate backup/restore, and provide no relational query capability. Redis Sentinel is also optional infrastructure — requiring it for primary storage adds an operational dependency. |
| **SQLite (via Turso / libsql)** | SQLite cannot handle concurrent writes from multiple serverless instances without significant coordination overhead. Turso (distributed SQLite) would add a new vendor dependency not already in the stack. |
| **Prisma ORM** | Prisma adds cold-start overhead in serverless environments (large bundle, schema engine process). ADR-0004 explicitly chose raw `pg` to keep the bundle lean. Introducing Prisma now would require migrating all existing queries and increasing the Vercel function bundle by ~30–60 kB. |
| **Keep in-memory + Redis backup** | Using Redis as a write-through cache behind the Map would add complexity without eliminating the split-brain problem across instances. It would also duplicate data across two stores that have different failure modes. |
