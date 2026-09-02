'use client';

import { isNative, isIOSNative, loadPlugin } from './native';
import { apiUrl } from './apiBase';

// ─────────────────────────────────────────────────────────────────────────────
// Opening a page that lives on the web, from either runtime.
//
// `window.open('/some-path')` is same-origin, and in the bundled app that origin
// is the local Capacitor bundle — so it resolves against files that aren't there
// and opens a blank view. Anything genuinely web-hosted has to be (a) made
// absolute against the hosted origin and (b) handed to the system browser.
// ─────────────────────────────────────────────────────────────────────────────

/** Open an app-relative path on the hosted web app, in the right browser. */
export async function openHostedPage(path: string): Promise<void> {
  // apiUrl() is already "the hosted origin, or nothing on the web", which is
  // exactly the absolute-vs-relative distinction needed here.
  const url = apiUrl(path);

  if (isNative()) {
    const browser = await loadPlugin(() => import('@capacitor/browser'));
    if (browser) {
      try {
        await browser.Browser.open({ url, presentationStyle: 'popover' });
        return;
      } catch { /* fall through to window.open */ }
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Should we show an entry point to the paid business portal?
 *
 * No on iOS. App Store Guideline 3.1.1 forbids not just non-IAP purchases inside
 * the app but "buttons, external links, or other calls to action" that steer
 * users to one — a link out to Stripe Checkout is exactly that, and it is a
 * common, easily-spotted rejection. Businesses sign up on the web, which is
 * where they already do it.
 *
 * Android and the web are unaffected: Play's payments policy carves out
 * advertising services, so the portal opens externally there as before.
 */
export function canShowBusinessPortal(): boolean {
  return !isIOSNative();
}
