/** @type {import('next').NextConfig} */
// Baseline response security headers (docs/security/security-hardening.md).
// The site is a static marketing/legal site: it needs no framing, no camera/
// mic/geolocation, and never sends the full URL as a referrer. A full
// Content-Security-Policy is deliberately not set here — Next injects inline
// scripts/styles per page and a nonce-based CSP needs middleware + real-browser
// verification; it is tracked as a follow-up rather than shipped untested.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-DNS-Prefetch-Control', value: 'off' },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
