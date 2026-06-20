'use client';

import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { hasAnalyticsConsent } from './CookieConsent';

// Loads Vercel Analytics ONLY after the user has accepted analytics consent.
// Reacts live to the consent banner via the 'nova:consent' event so no reload
// is needed when the user clicks "Accept all".
export default function ConsentedAnalytics() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(hasAnalyticsConsent());
    const onConsent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setEnabled(detail === 'accepted');
    };
    window.addEventListener('nova:consent', onConsent);
    return () => window.removeEventListener('nova:consent', onConsent);
  }, []);

  if (!enabled) return null;
  return <Analytics />;
}
