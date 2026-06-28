# Security Headers

All HTTP responses from Lumigift include the following security headers, configured in `next.config.mjs` via Next.js `headers()`.

## Header Reference

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Enforces HTTPS for 2 years across all subdomains. Prevents SSL-stripping attacks. |
| `X-Frame-Options` | `DENY` | Prevents the site from being embedded in an `<iframe>`. Mitigates clickjacking. |
| `X-Content-Type-Options` | `nosniff` | Prevents browsers from MIME-sniffing responses away from the declared content-type. |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Sends full referrer for same-origin requests; only the origin for cross-origin HTTPS; nothing for cross-origin HTTP. Balances analytics and privacy. |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(self)` | Restricts browser feature access. Payment API is allowed only from same origin. |
| `X-XSS-Protection` | `1; mode=block` | Legacy XSS filter for older browsers. Modern browsers rely on CSP instead. |

## OWASP Secure Headers Checklist

Audited against [OWASP Secure Headers Project](https://owasp.org/www-project-secure-headers/).

| OWASP Recommended Header | Status | Notes |
|--------------------------|--------|-------|
| Strict-Transport-Security | ✅ Set | 2-year max-age with preload |
| X-Frame-Options | ✅ Set | DENY |
| X-Content-Type-Options | ✅ Set | nosniff |
| Referrer-Policy | ✅ Set | strict-origin-when-cross-origin |
| Permissions-Policy | ✅ Set | Restrictive defaults |
| Content-Security-Policy | ⚠️ Pending | CSP is complex to tune with Next.js RSC + inline scripts. To be added in a follow-up once the frontend is stable. |
| Cross-Origin-Opener-Policy | ⚠️ Pending | Will be set to `same-origin` once cross-origin pop-up flows (Paystack checkout) are confirmed to work. |
| Cross-Origin-Resource-Policy | ⚠️ Pending | Evaluate after CDN/image proxy setup is finalised. |

## Verification

Headers can be verified manually using [securityheaders.com](https://securityheaders.com) against the production domain, or with:

```bash
curl -sI https://lumigift.com | grep -i -E "strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy"
```

## Implementation Location

```
next.config.mjs
└── securityHeaders[]   ← header definitions
└── nextConfig.headers() ← applied to all routes via source: "/(.*)"
```
