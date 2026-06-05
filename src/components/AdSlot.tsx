'use client';

import { useEffect, useRef } from 'react';

interface Props {
  slotId?: string;
  format?: 'auto' | 'rectangle' | 'fluid';
  index?: number;
}

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

// Drop your AdSense publisher ID in NEXT_PUBLIC_ADSENSE_CLIENT_ID
// and your ad slot IDs in NEXT_PUBLIC_ADSENSE_SLOT_FEED / _SQUARE
const CLIENT_ID  = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID  ?? '';
const SLOT_FEED  = process.env.NEXT_PUBLIC_ADSENSE_SLOT_FEED  ?? '';
const SLOT_SQ    = process.env.NEXT_PUBLIC_ADSENSE_SLOT_SQUARE ?? '';

export default function AdSlot({ slotId, format = 'auto', index = 0 }: Props) {
  const insRef  = useRef<HTMLModElement | null>(null);
  const pushed  = useRef(false);
  const resolvedSlot = slotId ?? (index % 2 === 0 ? SLOT_FEED : SLOT_SQ);

  useEffect(() => {
    if (!CLIENT_ID || !resolvedSlot || pushed.current) return;
    pushed.current = true;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch { /* already initialised */ }
  }, [resolvedSlot]);

  // ── Placeholder shown before AdSense is configured ──────────────────────
  if (!CLIENT_ID || !resolvedSlot) {
    return (
      <div
        className="ad-slot-placeholder"
        style={{
          width: '100%',
          minHeight: 90,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(26,26,36,0.6)',
          borderTop: '1px solid #1e1e2a',
          borderBottom: '1px solid #1e1e2a',
          gap: 4,
          padding: '12px 0',
        }}
        aria-label="Advertisement"
      >
        <span style={{ fontSize: 10, color: '#444455', letterSpacing: '0.08em', fontWeight: 600 }}>
          ADVERTISEMENT
        </span>
        <div
          style={{
            width: '90%',
            height: 60,
            borderRadius: 12,
            background: 'linear-gradient(90deg, #1a1a24 25%, #252530 50%, #1a1a24 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.8s infinite',
          }}
        />
      </div>
    );
  }

  // ── Real AdSense unit ────────────────────────────────────────────────────
  return (
    <div style={{ width: '100%', overflow: 'hidden', borderTop: '1px solid #1e1e2a', borderBottom: '1px solid #1e1e2a' }}>
      <p style={{ fontSize: 9, color: '#444455', textAlign: 'center', letterSpacing: '0.08em', margin: '4px 0 2px', fontWeight: 600 }}>
        ADVERTISEMENT
      </p>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={CLIENT_ID}
        data-ad-slot={resolvedSlot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
