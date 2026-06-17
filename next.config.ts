import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',      value: 'on' },
  { key: 'X-Content-Type-Options',      value: 'nosniff' },
  { key: 'X-Frame-Options',             value: 'SAMEORIGIN' },
  { key: 'X-XSS-Protection',            value: '1; mode=block' },
  { key: 'Referrer-Policy',             value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security',   value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy',          value: 'camera=(), microphone=(), geolocation=(self)' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js requires unsafe-inline for hydration; unsafe-eval for some runtime features
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://pagead2.googlesyndication.com https://partner.googleadservices.com https://tpc.googlesyndication.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      // Images: real venue photos come from unpredictable hosts (a venue's own
      // og:image, Google Places photos on *.googleusercontent.com, etc.), so we
      // allow any https image source. Scripts/styles/connect stay locked down.
      "img-src 'self' data: blob: https:",
      // Connections: Supabase (REST + realtime), Vercel Analytics
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'i.pravatar.cc' },
      // Ticketmaster
      { protocol: 'https', hostname: 's1.ticketm.net' },
      { protocol: 'https', hostname: 's4.ticketm.net' },
      { protocol: 'https', hostname: '*.ticketmaster.com' },
      { protocol: 'https', hostname: '*.livenation.com' },
      // Unsplash
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Pexels
      { protocol: 'https', hostname: 'images.pexels.com' },
      // Logo services
      { protocol: 'https', hostname: 'logo.clearbit.com' },
      { protocol: 'https', hostname: 'ui-avatars.com' },
      // Wikipedia thumbnails (sightseeing)
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      // Google user avatars (OAuth sign-in)
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      // OpenStreetMap tiles (future map views)
      { protocol: 'https', hostname: '*.tile.openstreetmap.org' },
    ],
  },
};

export default nextConfig;
