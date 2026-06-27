# ADR-0006: Gift Service — Database Persistence

**Date:** 2024-06-27  
**Status:** Proposed

## Context

Early prototypes of `gift.service.ts` stored gift records in an in-memory `Map`. This approach was sufficient for local exploration but introduces several problems in production:

- **No durability** — gifts are lost on every process restart or crash.
- **No horizontal scaling** — each server instance holds a separate, divergent copy of state; load-balanced deployments return inconsistent results.
- **No ACID guarantees** — concurrent writes (e.g. two simultaneous payment callbacks for the same gift) can corrupt state without transactions.
- **No auditability** — in-memory state cannot be queried, backed up, or replicated.

The project already depends on PostgreSQL for user records and audit logs (ADR-0004), so the infrastructure is in place.

## Decision

Migrate `gift.service.ts` to persist all gift records in the existing **PostgreSQL** database.

Each gift is a row in the `gifts` table. All reads and writes go through parameterised SQL queries via the existing `@/lib/db` connection pool. The in-memory `Map` is removed entirely.

## Consequences

### Positive
- Gift state survives server restarts and deployments.
- Multiple server instances share a single source of truth — horizontal scaling works correctly.
- Database transactions prevent race conditions during status transitions (e.g. funded → locked).
- Gift history is fully queryable for dashboards, support, and auditing.
- Consistent with the project's existing persistence strategy (ADR-0004).

### Negative
- Every gift operation now requires a database round-trip, increasing latency vs. in-memory reads.
- Unit tests that previously used the in-memory store must mock `@/lib/db` or use a test database.
- Schema migrations must be written and applied for every structural change to the gift record.

### Neutral
- The existing migration framework (`migrations/*.sql`) is used; no new tooling required.
- Redis remains in use for OTP and rate-limiting; it is not used for gift persistence.

## Alternatives Considered

| Option | Reason Rejected |
|--------|----------------|
| **Keep in-memory Map** | Not durable; crashes lose all gift data; cannot scale horizontally |
| **Redis (persistent mode)** | No relational queries; limited transaction support; adds operational complexity given PostgreSQL is already required |
| **SQLite (embedded)** | Cannot be shared across multiple Node.js processes; not suitable for containerised deployments; no existing expertise in the project |
| **MongoDB / document store** | No relational joins (e.g. gift ↔ user ↔ payment); adds a second database technology to maintain; PostgreSQL JSONB covers schema-flexible fields when needed |
