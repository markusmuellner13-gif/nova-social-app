'use client';

import { useSyncExternalStore } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// GDPR / ePrivacy (Italian Garante) cookie & analytics consent banner.
//
// Shown on first visit until the user makes an explicit choice. We default to NO
// non-essential processing until consent is given (opt-in, as the Garante
// requires) and record the decision + timestamp in localStorage so we can prove
// consent and let the user change their mind later (Cookie Policy → withdraw).
//
// Vercel Analytics is cookieless/anonymous, but we still gate it behind consent
// to stay on the safe side of the Garante's strict stance. Any future Google
// AdSense MUST also check hasAnalyticsConsent() before loading.
// ─────────────────────────────────────────────────────────────────────────────

const CONSENT_KEY = 'nova.consent.v1';

export type ConsentValue = 'accepted' | 'rejected';

export function getConsent(): ConsentValue | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { value?: ConsentValue };
    return parsed.value === 'accepted' || parsed.value === 'rejected' ? parsed.value : null;
  } catch {
    return null;
  }
}

export function hasAnalyticsConsent(): boolean {
  return getConsent() === 'accepted';
}

function setConsent(value: ConsentValue) {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ value, ts: new Date().toISOString() }));
  } catch { /* storage blocked — banner simply re-appears next load */ }
  // Let listeners (e.g. analytics loader) react without a full reload.
  window.dispatchEvent(new CustomEvent('nova:consent', { detail: value }));
}

// Subscribe to consent changes (custom event + cross-tab storage event).
function subscribe(cb: () => void): () => void {
  window.addEventListener('nova:consent', cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener('nova:consent', cb);
    window.removeEventListener('storage', cb);
  };
}

// Canonical SSR-safe way to read an external store (localStorage) in React.
export function useConsent(): ConsentValue | null {
  return useSyncExternalStore(subscribe, getConsent, () => null);
}

// The banner must not be guessed into the page. The server cannot see
// localStorage, so `useConsent`'s server snapshot is `null` ("no choice yet") —
// and the document is server-rendered, so that guess put the banner straight
// into the HTML. It sat there, z-index 9999 over the splash, until React
// hydrated and read the real answer: the split-second banner people saw on
// every launch after they had already accepted.
//
// So the banner reads with its own server snapshot, UNKNOWN, which renders
// nothing. The real value is only consulted in the browser, after hydration —
// a user who has chosen never sees the banner at all, and a first-time visitor
// gets it a moment later, once we actually know it is needed.
const UNKNOWN = 'unknown' as const;
function useBannerConsent(): ConsentValue | null | typeof UNKNOWN {
  return useSyncExternalStore(subscribe, getConsent, () => UNKNOWN);
}

export default function CookieConsent() {
  const consent = useBannerConsent();

  // Not known yet (server / before hydration), or already chosen → nothing.
  if (consent !== null) return null;

  function choose(value: ConsentValue) {
    setConsent(value); // updates the store → this component re-renders and hides
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      style={{
        position: 'fixed', left: 12, right: 12, zIndex: 9999,
        // Clear of the iPhone home indicator / Android gesture bar.
        bottom: 'max(12px, calc(env(safe-area-inset-bottom, 0px) + 8px))',
        maxWidth: 560, margin: '0 auto',
        background: '#13131a', border: '1px solid #2a2a38', borderRadius: 18,
        padding: 18, boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
      }}
    >
      <p style={{ color: '#fff', fontSize: 14, fontWeight: 700, margin: 0, marginBottom: 6 }}>
        🍪 We respect your privacy
      </p>
      <p style={{ color: '#9a9aae', fontSize: 12.5, lineHeight: 1.6, margin: 0, marginBottom: 14 }}>
        Nova uses strictly necessary local storage to work. With your consent we also use
        anonymous, cookieless analytics to improve the app. You can change this anytime in our{' '}
        <a href="/cookie" style={{ color: '#a78bfa' }}>Cookie Policy</a>. See our{' '}
        <a href="/privacy" style={{ color: '#a78bfa' }}>Privacy Policy</a>.
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => choose('rejected')}
          style={{
            flex: 1, padding: '10px 12px', borderRadius: 12, fontSize: 13, fontWeight: 700,
            background: '#1a1a24', color: '#c0c0d0', border: '1px solid #2a2a38', cursor: 'pointer',
          }}
        >
          Reject non-essential
        </button>
        <button
          onClick={() => choose('accepted')}
          style={{
            flex: 1, padding: '10px 12px', borderRadius: 12, fontSize: 13, fontWeight: 700,
            background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: '#fff', border: 'none', cursor: 'pointer',
          }}
        >
          Accept all
        </button>
      </div>
    </div>
  );
}
