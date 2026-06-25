'use client';
import { apiUrl } from '@/lib/apiBase';

// Fire-and-forget analytics for sponsored posts (#9). Uses sendBeacon so it
// never blocks rendering or navigation. No-ops on the server / if unsupported.
export function trackEvent(type: 'impression' | 'click', id: string): void {
  if (typeof window === 'undefined' || !id) return;
  try {
    const payload = JSON.stringify({ type, id });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([payload], { type: 'application/json' }));
    } else {
      void fetch(apiUrl('/api/track'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true });
    }
  } catch { /* analytics must never throw */ }
}
