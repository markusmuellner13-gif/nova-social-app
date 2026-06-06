import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'i.pravatar.cc' },
      // Ticketmaster event images
      { protocol: 'https', hostname: 's1.ticketm.net' },
      { protocol: 'https', hostname: 's4.ticketm.net' },
      { protocol: 'https', hostname: '*.ticketmaster.com' },
      { protocol: 'https', hostname: '*.livenation.com' },
      // Unsplash images
      { protocol: 'https', hostname: 'images.unsplash.com' },
      // Pexels images
      { protocol: 'https', hostname: 'images.pexels.com' },
      // Logo services
      { protocol: 'https', hostname: 'logo.clearbit.com' },
      { protocol: 'https', hostname: 'ui-avatars.com' },
    ],
  },
};

export default nextConfig;
