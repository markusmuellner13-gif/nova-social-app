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
  // Content-Security-Policy is NOT here any more. A nonce has to be generated
  // per response, which a static config cannot do, so the policy lives in
  // middleware.ts — see `buildCsp`. Keeping a second copy here would silently
  // override it (the last header set wins) and put back the `unsafe-inline`
  // script policy this replaced.
];

const nextConfig: NextConfig = {
  // NOTE: `serverExternalPackages: ['sharp']` is deliberately NOT set here. It
  // was tried against the image-proxy outage and changed nothing — the built
  // chunk came out byte-identical, because sharp is already on Next's default
  // external list. The actual cause was a duplicate sharp version in the tree;
  // see the `sharp` pin in package.json.
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
      // The stock hosts (picsum/unsplash/pexels) and the retired logo.clearbit.com
      // are gone — posts no longer carry stand-in photography, so allowing them
      // here would only re-open a door nothing walks through.
      { protocol: 'https', hostname: 'i.pravatar.cc' },
      // Ticketmaster
      { protocol: 'https', hostname: 's1.ticketm.net' },
      { protocol: 'https', hostname: 's4.ticketm.net' },
      { protocol: 'https', hostname: '*.ticketmaster.com' },
      { protocol: 'https', hostname: '*.livenation.com' },
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
