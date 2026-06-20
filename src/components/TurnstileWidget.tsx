'use client';

import { useEffect, useRef } from 'react';

// Renders the Cloudflare Turnstile widget when NEXT_PUBLIC_TURNSTILE_SITE_KEY is
// set; otherwise renders nothing and immediately reports an empty token, so forms
// keep working before keys are configured. Calls onToken whenever a token is
// issued / refreshed / expires.

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

interface TurnstileApi {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
}
declare global {
  interface Window { turnstile?: TurnstileApi }
}

function loadScript(): Promise<void> {
  return new Promise((resolve) => {
    if (window.turnstile) return resolve();
    const existing = document.getElementById('cf-turnstile-script');
    if (existing) { existing.addEventListener('load', () => resolve(), { once: true }); return; }
    const s = document.createElement('script');
    s.id = 'cf-turnstile-script';
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.addEventListener('load', () => resolve(), { once: true });
    document.head.appendChild(s);
  });
}

export default function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // No site key → feature disabled; report empty token so the form isn't blocked.
    if (!SITE_KEY) { onToken(''); return; }

    let widgetId: string | null = null;
    let cancelled = false;

    loadScript().then(() => {
      if (cancelled || !ref.current || !window.turnstile) return;
      widgetId = window.turnstile.render(ref.current, {
        sitekey: SITE_KEY,
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => onToken(''),
        theme: 'dark',
      });
    });

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        try { window.turnstile.remove(widgetId); } catch { /* already gone */ }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={ref} style={{ marginTop: 4 }} />;
}
