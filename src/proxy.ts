import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const correlationId = request.headers.get("x-correlation-id") || crypto.randomUUID();
  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const cspHeader = buildCspHeader(nonce);

  // CSP_REPORT_ONLY=true switches to Content-Security-Policy-Report-Only so
  // violations are logged without blocking — use this before enforcing any
  // changes to the CSP policy (see docs/security/csp-policy.md).
  const cspHeaderName =
    process.env.CSP_REPORT_ONLY === "true"
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy";

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-correlation-id", correlationId);
  requestHeaders.set(cspHeaderName, cspHeader);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set(cspHeaderName, cspHeader);
  response.headers.set("x-correlation-id", correlationId);

  return response;
}

function buildCspHeader(nonce: string): string {
  const isProd = process.env.NODE_ENV === "production";

  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' ${isProd ? "" : "'unsafe-eval'"} https://js.paystack.co https://js.stripe.com https://cdn.jsdelivr.net`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: https: blob:`,
    `connect-src 'self' https://api.paystack.co https://api.stripe.com https://horizon-testnet.stellar.org https://horizon.stellar.org https://soroban-testnet.stellar.org https://soroban-mainnet.stellar.org`,
    `frame-src https://js.paystack.co https://js.stripe.com`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
    `report-uri /api/v1/csp-report`,
  ];

  return directives.join("; ");
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
