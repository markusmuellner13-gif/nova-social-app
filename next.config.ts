import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',   value: 'on' },
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  { key: 'X-Frame-Options',          value: 'SAMEORIGIN' },
  { key: 'X-XSS-Protection',         value: '1; mode=block' },
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=(self)' },
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
      // OpenStreetMap tiles (future map views)
      { protocol: 'https', hostname: '*.tile.openstreetmap.org' },
    ],
  },
};

export default nextConfig;
