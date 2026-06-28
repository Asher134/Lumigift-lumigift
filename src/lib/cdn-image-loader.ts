/**
 * Custom Next.js image loader that routes optimized images through the CDN.
 * Used when NEXT_PUBLIC_CDN_URL is set in the environment.
 *
 * Next.js calls this function for every <Image> component render.
 * The CDN must be configured to proxy /_next/image requests to the origin.
 */
export default function cdnImageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
  const q = quality ?? 75;
  return `${cdnUrl}/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${q}`;
}
