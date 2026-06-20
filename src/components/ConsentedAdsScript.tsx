'use client';

import { useEffect, useState } from 'react';
import { hasAnalyticsConsent } from './CookieConsent';

const ADSENSE_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? '';

// Injects the Google AdSense loader ONLY when (a) a publisher ID is configured
// and (b) the user has given consent. AdSense sets cookies, so under the Italian
// Garante / ePrivacy it must be opt-in. Runs once; reacts to the consent event.
export default function ConsentedAdsScript() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (!ADSENSE_ID) return;
    const sync = () => setAllowed(hasAnalyticsConsent());
    sync();
    window.addEventListener('nova:consent', sync);
    return () => window.removeEventListener('nova:consent', sync);
  }, []);

  useEffect(() => {
    if (!ADSENSE_ID || !allowed) return;
    if (document.getElementById('nova-adsense')) return;
    const s = document.createElement('script');
    s.id = 'nova-adsense';
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_ID}`;
    document.head.appendChild(s);
  }, [allowed]);

  return null;
}
