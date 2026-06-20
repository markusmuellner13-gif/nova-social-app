'use client';

import { Analytics } from '@vercel/analytics/react';
import { useConsent } from './CookieConsent';

// Loads Vercel Analytics ONLY after the user has accepted analytics consent.
// Reacts live to the consent banner (useConsent subscribes to the consent event),
// so no reload is needed when the user clicks "Accept all".
export default function ConsentedAnalytics() {
  const consent = useConsent();
  if (consent !== 'accepted') return null;
  return <Analytics />;
}
