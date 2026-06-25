import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',      value: 'on' },
  { key: 'X-Content-Type-Options',      value: 'nosniff' },
  { key: 'X-Frame-Options',             value: 'SAMEORIGIN' },
  { key: 'X-XSS-Protection',            value: '1; mode=block' },
  { key: 'Referrer-Policy',             value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security',   value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'Permissions-Policy',          value: 'camera=(), microphone=(), geolocation=(self), payment=(), usb=(), magnetometer=(), accelerometer=(), gyroscope=(), interest-cohort=()' },
  // Isolate the browsing context — blocks cross-origin window references / tab-nabbing.
  { key: 'Cross-Origin-Opener-Policy',  value: 'same-origin' },
  // Disallow Adobe cross-domain policy files.
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js requires unsafe-inline for hydration; unsafe-eval for some runtime features
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://pagead2.googlesyndication.com https://partner.googleadservices.com https://tpc.googlesyndication.com https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      // Cloudflare Turnstile renders its challenge in an iframe.
      "frame-src 'self' https://challenges.cloudflare.com",
      // Images: real venue photos come from unpredictable hosts (a venue's own
      // og:image, Google Places photos on *.googleusercontent.com, etc.), so we
      // allow any https image source. Scripts/styles/connect stay locked down.
      "img-src 'self' data: blob: https:",
      // Connections: Supabase (REST + realtime), Vercel Analytics, Sentry,
      // Turnstile, the world-map country data (jsdelivr), map tiles
      // (OSM streets + Esri satellite) and the OSRM routing API for in-app
      // navigation.
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.de.sentry.io https://challenges.cloudflare.com https://cdn.jsdelivr.net https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://server.arcgisonline.com https://router.project-osrm.org https://tiles.openfreemap.org https://*.openfreemap.org",
      // MapLibre GL runs its tile workers from a blob: URL.
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "upgrade-insecure-requests",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // Native build only (NATIVE_EXPORT=1, via `npm run build:native`): emit a
  // static front-end bundle (`out/`) that Capacitor ships inside the iOS/Android
  // app. Never set on Vercel, so the web app keeps its server rendering, API
  // routes and middleware untouched.
  ...(process.env.NATIVE_EXPORT === '1' ? { output: 'export' as const, trailingSlash: true } : {}),
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
