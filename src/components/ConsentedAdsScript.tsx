'use client';

import { useEffect } from 'react';
import { useConsent } from './CookieConsent';

const ADSENSE_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? '';

// Injects the Google AdSense loader ONLY when (a) a publisher ID is configured
// and (b) the user has given consent. AdSense sets cookies, so under the Italian
// Garante / ePrivacy it must be opt-in. Reacts to consent changes via useConsent.
export default function ConsentedAdsScript() {
  const consent = useConsent();

  useEffect(() => {
    if (!ADSENSE_ID || consent !== 'accepted') return;
    if (document.getElementById('nova-adsense')) return;
    const s = document.createElement('script');
    s.id = 'nova-adsense';
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}`;
    document.head.appendChild(s);
  }, [consent]);

  return null;
}
