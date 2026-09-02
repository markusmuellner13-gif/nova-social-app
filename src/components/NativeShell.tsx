'use client';

import { useEffect } from 'react';
import { isNative, isAndroidNative, loadPlugin } from '@/lib/native';
import { completeNativeOAuth, closeAuthBrowser, isAuthCallbackUrl } from '@/lib/nativeAuth';
import { takePendingTapUrl } from '@/lib/nativePush';
import { dismissActiveNotifications } from '@/lib/notifications';

// ─────────────────────────────────────────────────────────────────────────────
// The native app's shell behaviours.
//
// A bundled web view only *feels* like an app once the OS-level behaviours that
// users never consciously notice are wired up — the ones whose absence is
// immediately obvious:
//
//   • the splash screen goes away when the UI is actually ready, not on a timer
//   • the status bar matches the app's own dark chrome
//   • Android's hardware/gesture Back navigates, and only exits from the root
//   • links into the app (OAuth returns, shared events) open IN the app
//   • foregrounding clears the notification tray, like every other app
//
// Renders nothing. On the web every effect below short-circuits on the first
// line, so the browser build is completely unaffected.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  /** Send the user somewhere in response to a deep link or a tapped push. */
  onNavigate?: (url: string) => void;
}

export default function NativeShell({ onNavigate }: Props) {
  useEffect(() => {
    if (!isNative()) return;

    // Cleanups collected as they're registered, so a listener that resolves
    // after unmount (they all register asynchronously) is still torn down.
    const cleanups: Array<() => void> = [];
    let cancelled = false;
    const track = (fn: () => void) => { if (cancelled) fn(); else cleanups.push(fn); };

    // ── Status bar ────────────────────────────────────────────────────────────
    // The layout already extends under the notch and pads with
    // env(safe-area-inset-*), so the bar must overlay rather than reserve space.
    void (async () => {
      const bar = await loadPlugin(() => import('@capacitor/status-bar'));
      if (!bar) return;
      const { StatusBar, Style } = bar;
      try {
        await StatusBar.setStyle({ style: Style.Dark });   // light glyphs on dark chrome
        await StatusBar.setOverlaysWebView({ overlay: true });
      } catch { /* not supported on this device */ }
    })();

    // ── Splash ────────────────────────────────────────────────────────────────
    // Hidden here rather than on the config's timer: this runs once React has
    // mounted, so the user never sees a blank frame between the two.
    void (async () => {
      const splash = await loadPlugin(() => import('@capacitor/splash-screen'));
      try { await splash?.SplashScreen.hide(); } catch { /* already hidden */ }
    })();

    // ── Deep links + Android Back + lifecycle ─────────────────────────────────
    void (async () => {
      const appPlugin = await loadPlugin(() => import('@capacitor/app'));
      if (!appPlugin) return;
      const { App } = appPlugin;

      // A link that opened the app: either the OAuth provider returning, or a
      // shared event URL. Shared links are Nova's main growth loop, so they must
      // land in the app rather than bouncing the user into a browser tab.
      const urlOpen = await App.addListener('appUrlOpen', async ({ url }) => {
        if (isAuthCallbackUrl(url)) {
          const ok = await completeNativeOAuth(url);
          await closeAuthBrowser();
          if (ok) onNavigate?.('/');
          return;
        }
        try {
          const parsed = new URL(url);
          onNavigate?.(`${parsed.pathname}${parsed.search}`);
        } catch { /* not a URL we can route */ }
      });
      track(() => void urlOpen.remove());

      // Android Back. Without this the button closes the whole app from any
      // screen, which is the single most jarring thing a wrapped web app does.
      // Let the browser history handle it, and only exit from the root.
      if (isAndroidNative()) {
        const back = await App.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack || window.history.length > 1) window.history.back();
          else void App.exitApp();
        });
        track(() => void back.remove());
      }

      // Foregrounding clears the tray — `visibilitychange` is unreliable in a
      // WebView, so use the OS's own lifecycle event.
      const stateChange = await App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void dismissActiveNotifications();
      });
      track(() => void stateChange.remove());
    })();

    // ── A push that launched the app ──────────────────────────────────────────
    // The tap may have been handled before this component mounted, so drain the
    // pending value as well as listening for later ones.
    const pending = takePendingTapUrl();
    if (pending) onNavigate?.(pending);

    const onTap = (e: Event) => {
      const url = (e as CustomEvent<{ url?: string }>).detail?.url;
      if (url) onNavigate?.(url);
    };
    window.addEventListener('nova:push-tap', onTap);
    track(() => window.removeEventListener('nova:push-tap', onTap));

    return () => {
      cancelled = true;
      cleanups.forEach(fn => { try { fn(); } catch { /* already gone */ } });
    };
  }, [onNavigate]);

  return null;
}
