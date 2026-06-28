# CDN Configuration

Lumigift uses a CDN (Cloudflare or AWS CloudFront) to serve static assets and
Next.js optimized images with long cache TTLs.

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `NEXT_PUBLIC_CDN_URL` | CDN origin URL (no trailing slash) | `https://cdn.lumigift.com` |

When `NEXT_PUBLIC_CDN_URL` is not set, the app falls back to serving assets
directly from the Next.js origin (safe for local dev and staging).

## How It Works

- `assetPrefix` in `next.config.mjs` routes all `/_next/static/*` requests
  through the CDN domain.
- The custom image loader (`src/lib/cdn-image-loader.ts`) routes
  `/_next/image` optimization requests through the CDN.
- The CDN must proxy cache-miss requests back to the Next.js origin.

## Cloudflare Setup

1. Add a CNAME record: `cdn.lumigift.com → lumigift.com` (proxied).
2. Create a Cache Rule:
   - **Match:** `lumigift.com/_next/static/*`
   - **Cache TTL:** Edge TTL 1 year, Browser TTL 1 year
3. Create a Cache Rule for images:
   - **Match:** `lumigift.com/_next/image*`
   - **Cache TTL:** Edge TTL 7 days, Browser TTL 7 days
4. Enable **Always Use HTTPS**.
5. Set up a **Deploy Hook** or use the Cloudflare API to purge cache on deploy:
   ```bash
   curl -X POST "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/purge_cache" \
     -H "Authorization: Bearer $CF_API_TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"purge_everything":true}'
   ```

## AWS CloudFront Setup

1. Create a CloudFront distribution with origin `lumigift.com`.
2. Add a cache behavior for `/_next/static/*`:
   - **Cache policy:** Managed-CachingOptimized (TTL max 31536000s)
   - **Origin request policy:** Managed-CORS-S3Origin
3. Add a cache behavior for `/_next/image*`:
   - **Cache policy:** Custom (TTL 604800s / 7 days)
   - **Query strings:** Forward `url`, `w`, `q`
4. Set the CloudFront domain as `NEXT_PUBLIC_CDN_URL`.
5. Invalidate on deploy:
   ```bash
   aws cloudfront create-invalidation \
     --distribution-id $CF_DISTRIBUTION_ID \
     --paths "/_next/static/*" "/_next/image*"
   ```

## Cache Invalidation on Deploy

Add the invalidation step to your deploy workflow after the build succeeds.
See `.github/workflows/deploy.yml` for the deployment pipeline.

## HTTPS

Both Cloudflare and CloudFront enforce HTTPS by default. Ensure:
- Cloudflare SSL/TLS mode is set to **Full (strict)**.
- CloudFront viewer protocol policy is **Redirect HTTP to HTTPS**.
