# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.x     | ✅ Yes    |

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Please email **security@lumigift.com** with:

1. A description of the vulnerability
2. Steps to reproduce
3. Potential impact
4. Any suggested mitigations

We will acknowledge your report within 48 hours and aim to release a fix within 14 days for critical issues.

## Scope

In scope:

- Smart contract vulnerabilities (fund loss, unauthorized claims)
- Authentication bypass
- API injection or data exposure
- Dependency vulnerabilities with known exploits

Out of scope:

- Social engineering
- Denial of service via resource exhaustion
- Issues requiring physical access to a device

## Cron Endpoint Authentication

Cron endpoints (`/api/v1/cron/*`) use **two-factor authentication** to prevent abuse if
the `CRON_SECRET` is ever compromised.

### Factor 1 — Bearer token

Every request must include:

```
Authorization: Bearer <CRON_SECRET>
```

### Factor 2 — Time-based HMAC (anti-replay)

Every request must also include an `X-Cron-HMAC` header containing a
HMAC-SHA256 signature computed as:

```
HMAC-SHA256(key=CRON_SECRET, message=floor(unix_seconds / 60))
```

The server accepts signatures for the **current 60-second window** and the
**previous window** (to tolerate minor clock skew).  A captured token is valid
for at most ~120 seconds, preventing replay attacks.

#### Generating the HMAC (Node.js example)

```ts
import { createHmac } from "crypto";

const window = Math.floor(Date.now() / 1000 / 60);
const hmac = createHmac("sha256", process.env.CRON_SECRET!)
  .update(String(window))
  .digest("hex");

fetch("https://app.lumigift.com/api/v1/cron/unlock", {
  headers: {
    Authorization: `Bearer ${process.env.CRON_SECRET}`,
    "X-Cron-HMAC": hmac,
  },
});
```

#### AWS EventBridge scheduler example

Add the following as a static header in your EventBridge scheduler target:

```
X-Cron-HMAC: <pre-computed via Lambda or Step Functions>
```

Because EventBridge does not support dynamic header values natively, the
recommended pattern is a thin Lambda wrapper that computes the HMAC at
invocation time and proxies the request.

### Implementation

See `src/lib/cron-auth.ts` for the canonical server-side implementation.
