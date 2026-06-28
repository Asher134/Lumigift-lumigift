# SQL Injection Audit — Issue #410

**Date:** 2026-06-01  
**Auditor:** Automated static analysis + manual review  
**Status:** ✅ No vulnerabilities found

## Scope

All files in `src/` and `scripts/` that call `pool.query()` or `client.query()` were reviewed for raw string interpolation of user-supplied values in SQL statements.

## Methodology

1. Searched all `pool.query(` and `client.query(` call sites using static analysis.
2. Verified each call uses parameterized placeholders (`$1`, `$2`, …) for user-supplied values.
3. Confirmed no template literals concatenate user input directly into SQL strings.
4. Reviewed dynamic WHERE clause construction in `audit.service.ts` — confirmed only column names (not user values) are interpolated; all values are parameterized.

## Findings

| File | Query | Parameterized? | Notes |
|------|-------|---------------|-------|
| `src/lib/auth.ts` | `SELECT 1 FROM known_devices WHERE user_id = $1 AND fingerprint = $2` | ✅ Yes | |
| `src/lib/auth.ts` | `INSERT INTO known_devices (user_id, fingerprint) VALUES ($1, $2)` | ✅ Yes | |
| `src/lib/auth.ts` | `UPDATE known_devices SET last_seen_at = NOW() WHERE user_id = $1 AND fingerprint = $2` | ✅ Yes | |
| `src/lib/auth.ts` | `SELECT id, phone, name FROM users WHERE phone = $1` | ✅ Yes | |
| `src/app/api/v1/users/route.ts` | `SELECT 1 FROM users WHERE phone = $1 LIMIT 1` | ✅ Yes | |
| `src/app/api/v1/users/me/route.ts` | Delegates to `user-deletion.service.ts` | ✅ Yes | |
| `src/app/api/v1/auth/register/route.ts` | `SELECT 1 FROM users WHERE phone = $1 LIMIT 1` | ✅ Yes | |
| `src/app/api/v1/auth/register/route.ts` | `INSERT INTO users (id, phone, display_name) VALUES ($1, $2, $3)` | ✅ Yes | |
| `src/app/api/v1/auth/report-login/route.ts` | `INSERT INTO suspicious_login_reports (user_id, fingerprint) VALUES ($1, $2)` | ✅ Yes | |
| `src/server/services/gift.service.ts` | `SELECT display_name FROM users WHERE id = $1` | ✅ Yes | |
| `src/server/services/invitation.service.ts` | All queries | ✅ Yes | |
| `src/server/services/audit.service.ts` | Dynamic WHERE clause | ✅ Yes | Column names only interpolated; all values use `$N` params |
| `src/server/services/fraud.service.ts` | All queries | ✅ Yes | |
| `src/server/services/scheduler.service.ts` | All queries | ✅ Yes | |
| `src/server/services/user-deletion.service.ts` | All queries | ✅ Yes | |
| `scripts/seed-test-db.ts` | DDL + DML statements | ✅ N/A / Yes | Static schema; seed data uses `$N` params |

## Dynamic WHERE Clause Pattern (audit.service.ts)

The `queryAuditLogs` function builds a dynamic WHERE clause by appending fixed column name strings (`user_id`, `gift_id`, etc.) to a conditions array. **User-supplied values are never interpolated** — they are always passed as `$N` parameters. This pattern is safe.

```ts
// Safe: column names are hardcoded, values use $N params
conditions.push(`user_id = $${paramIndex++}`);
params.push(query.userId);
```

## Automated Prevention

An ESLint rule (`no-restricted-syntax`) in `.eslintrc.json` flags:
1. Tagged template SQL literals (`sql\`...\``)
2. Template literals as the first argument to `.query()` calls

This rule runs on every `npm run lint` and in CI on every PR.

## PR Review Checklist

The PR template (`.github/PULL_REQUEST_TEMPLATE.md`) now includes a mandatory SQL injection check item:
> Any new database queries use parameterized placeholders (`$1`, `$2`, …) — no string interpolation of user input in SQL.

## Conclusion

**No SQL injection vulnerabilities found.** All database queries consistently use the `pg` driver's parameterized query API. The ESLint rule and PR checklist provide ongoing automated and manual prevention.

## Recommendations

1. Maintain the parameterized query pattern for all future database calls.
2. Run `npm run lint` in CI to enforce the ESLint SQL injection rule on every PR.
3. Consider adopting a query builder (e.g., Kysely) in the future to make parameterization the only possible path.
4. For staging environment scans, run `sqlmap` against the API endpoints as part of the security testing pipeline.
