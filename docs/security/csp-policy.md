# Content Security Policy

_Last audited: 2026-06-27_

## Overview

The CSP is set dynamically in [`src/proxy.ts`](../../src/proxy.ts) so every
response includes a fresh cryptographic **nonce**.  A nonce-per-request approach
means `unsafe-inline` is not required for scripts and provides stronger XSS
protection than a hash-list.

Static security headers (`X-Frame-Options`, `HSTS`, etc.) are added in
[`next.config.mjs`](../../next.config.mjs).

## Enforced Policy (production)

```
Content-Security-Policy:
  default-src 'self';
  script-src  'self' 'nonce-<per-request>' https://js.paystack.co https://js.stripe.com https://cdn.jsdelivr.net;
  style-src   'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src    'self' https://fonts.gstatic.com;
  img-src     'self' data: https: blob:;
  connect-src 'self' https://api.paystack.co https://api.stripe.com
              https://horizon-testnet.stellar.org https://horizon.stellar.org
              https://soroban-testnet.stellar.org https://soroban-mainnet.stellar.org;
  frame-src   https://js.paystack.co https://js.stripe.com;
  object-src  'none';
  base-uri    'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
  report-uri  /api/v1/csp-report;
```

### Notes

- **`unsafe-eval` is absent in production.**  It is only injected in
  `NODE_ENV=development` to support Next.js hot-module replacement.
- **`unsafe-inline` for scripts is absent.**  All first-party scripts use the
  per-request nonce.
- **`unsafe-inline` for styles** is currently required because Next.js injects
  critical CSS inline.  Tracked for removal once the project migrates to
  CSS modules / external stylesheets only.
- `img-src https:` is intentionally broad to support Cloudinary CDN URLs.
  Tighten to specific hostnames once image domains are stable.

## Violation Reporting

All CSP violations are POSTed to `/api/v1/csp-report`, logged via **Pino**
(`log.warn(...)`) in [`src/app/api/v1/csp-report/route.ts`](../../src/app/api/v1/csp-report/route.ts),
and visible in the application's structured log stream.

Violations should be reviewed over a **30-day rolling window** to:
1. Catch legitimate third-party integrations that need to be allow-listed.
2. Detect XSS injection attempts (unexpected `script-src` violations).
3. Identify browser extensions causing false positives.

## Report-Only Mode

Before enforcing any change to the CSP policy, switch to report-only mode:

1. Set `CSP_REPORT_ONLY=true` in the deployment environment.
2. The middleware will send `Content-Security-Policy-Report-Only` instead of
   `Content-Security-Policy` — violations are reported but **not blocked**.
3. Monitor `/api/v1/csp-report` logs for at least **48 hours** to confirm no
   legitimate traffic is affected.
4. Remove `CSP_REPORT_ONLY=true` (or set to `false`) to enforce the new policy.

> **Never deploy a tighter policy directly to production without a report-only
> observation period.**

## Audit Checklist

| Directive       | `unsafe-inline` | `unsafe-eval` | Notes |
|-----------------|:-----------:|:-----------:|-------|
| `script-src`    | ✅ absent   | ✅ absent in prod | nonce-based |
| `style-src`     | ⚠️ present  | n/a         | required for Next.js inline critical CSS |
| `object-src`    | n/a         | n/a         | `'none'` — blocks Flash/Java |
| `base-uri`      | n/a         | n/a         | `'self'` — prevents base-tag injection |
| `frame-ancestors` | n/a       | n/a         | `'none'` — blocks clickjacking |

## Changing the Policy

1. Understand what the new directive allows or restricts.
2. Enable report-only mode (`CSP_REPORT_ONLY=true`).
3. Deploy to staging, observe violations for ≥ 48 h.
4. Update this document and the directive in `src/proxy.ts`.
5. Disable report-only mode and deploy to production.
6. Monitor violations for ≥ 30 days.
