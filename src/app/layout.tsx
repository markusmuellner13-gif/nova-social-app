import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import './globals.css';
import { AppProvider } from '@/context/AppContext';
import { Analytics } from '@vercel/analytics/react';

export const metadata: Metadata = {
  metadataBase: new URL('https://nova-phi-liart.vercel.app'),
  title: 'Nova — Your World, Curated by AI',
  description: 'Nova is an AI-powered social discovery app. Find events, concerts, exhibitions and things to do wherever you are.',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png',   sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png',   sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Nova',
  },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Nova',
    title: 'Nova — Your World, Curated by AI',
    description: 'Discover real events, concerts, sightseeing and things to do near you — curated by AI, personalised for you.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Nova — AI-powered social discovery' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nova — Your World, Curated by AI',
    description: 'Discover real events, concerts, sightseeing and things to do near you — curated by AI, personalised for you.',
    images: ['/og-image.png'],
  },
  keywords: ['events', 'discover', 'AI', 'social', 'concerts', 'sightseeing', 'things to do'],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0a0f',
};

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE ADSENSE SETUP INSTRUCTIONS
// ─────────────────────────────────────────────────────────────────────────────
// 1. Apply at https://adsense.google.com (free, takes 1-3 days to approve)
// 2. Once approved, get your Publisher ID: ca-pub-XXXXXXXXXXXXXXXXX
// 3. Add to Vercel Environment Variables:
//      NEXT_PUBLIC_ADSENSE_CLIENT_ID   = ca-pub-XXXXXXXXXXXXXXXXX
//      NEXT_PUBLIC_ADSENSE_SLOT_FEED   = (slot ID from AdSense dashboard)
//      NEXT_PUBLIC_ADSENSE_SLOT_SQUARE = (second slot ID)
// 4. Uncomment the <Script> tag below and replace YOUR_PUBLISHER_ID
// 5. Redeploy — ads will appear automatically in the feed
// ─────────────────────────────────────────────────────────────────────────────

const ADSENSE_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? '';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ height: '100%' }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* Google AdSense — loads only when publisher ID is set */}
        {ADSENSE_ID && (
          // eslint-disable-next-line @next/next/no-sync-scripts
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}`}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body style={{ height: '100%', margin: 0, overflow: 'hidden' }}>
        <AppProvider>
          {children}
        </AppProvider>
        <Analytics />
      </body>
    </html>
  );
}
