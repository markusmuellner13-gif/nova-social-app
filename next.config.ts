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
  // sharp must be required from node_modules at runtime, never bundled.
  //
  // Without this, production returned 500 for EVERY proxied image while the
  // upstream sources were perfectly healthy:
  //
  //   Failed to load external module sharp-…: Could not load the "sharp"
  //   module using the linux-x64 runtime
  //   ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file
  //
  // The versions were never the problem — @img/sharp-linux-x64@0.35.3 asks for
  // @img/sharp-libvips-linux-x64@1.3.2 and the lockfile pins exactly that. The
  // problem is that the bundler rewrote the import into its own external-module
  // loader, which brings sharp.node without the libvips shared library sitting
  // beside it, so the dlopen fails at runtime and only at runtime — the build
  // is perfectly green, and it works locally on Windows where the binary is
  // already unpacked in node_modules.
  //
  // Listing it here makes Next leave `require('sharp')` alone and trace the
  // whole package, .so files included. /api/image-proxy is the only importer.
  serverExternalPackages: ['sharp'],
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
