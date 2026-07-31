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

  // No ad network configured yet → render NOTHING.
  //
  // This used to draw an "ADVERTISEMENT" box with a shimmering grey rectangle
  // inside it. Scrolling the feed produced five of them in a row — empty slots
  // for ads that don't exist, taking up space and making a finished app look
  // unfinished. An App Store reviewer would read them as broken. When there is
  // no ad to show, the honest and better-looking answer is no slot at all; the
  // real unit below appears the moment AdSense is configured.
  if (!CLIENT_ID || !resolvedSlot) return null;

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
