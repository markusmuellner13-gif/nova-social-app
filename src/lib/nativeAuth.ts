'use client';

import { isNative, loadPlugin } from './native';
import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────────
// Social sign-in inside the bundled app.
//
// THE PROBLEM: signInWithOAuth() navigates the current page to the provider and
// expects to come back to `window.location.origin`. In the native app that
// origin is `capacitor://localhost` — an origin Supabase will not accept as a
// redirect target and that no external browser can navigate back to. Google
// additionally refuses to render its consent screen inside an embedded WebView
// (`disallowed_useragent`), so doing it in-page fails twice over.
//
// THE FIX, which is also what Apple and Google require:
//   1. Ask Supabase for the provider URL WITHOUT navigating (skipBrowserRedirect).
//   2. Open it in the system browser — SFSafariViewController on iOS, a Custom
//      Tab on Android — via @capacitor/browser. This is a real browser with the
//      user's own cookies, so existing Google/Apple sessions are reused.
//   3. The provider returns to a custom URL scheme the OS routes back to us,
//      the app's `appUrlOpen` listener catches it (see NativeShell), and we
//      establish the session from the tokens it carries.
//
// The web path is untouched: signInGoogle()/signInApple() in supabase.ts still
// do the ordinary redirect when not running natively.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The deep link the provider returns to. Must be registered in three places, or
 * sign-in dead-ends with a browser tab that never closes:
 *   • iOS      — CFBundleURLSchemes in ios/App/App/Info.plist
 *   • Android  — the BROWSABLE intent-filter in AndroidManifest.xml
 *   • Supabase — Authentication → URL Configuration → Redirect URLs
 */
export const NATIVE_AUTH_SCHEME   = 'com.nova.discover';
export const NATIVE_AUTH_REDIRECT = `${NATIVE_AUTH_SCHEME}://auth/callback`;

export type OAuthProvider = 'google' | 'apple';

/** Open the provider's page in the system browser. Native only. */
export async function startNativeOAuth(provider: OAuthProvider): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: NATIVE_AUTH_REDIRECT,
      // Hand us the URL instead of navigating this WebView to it.
      skipBrowserRedirect: true,
    },
  });
  if (error) throw error;
  if (!data?.url) throw new Error('Could not start sign-in');

  const browser = await loadPlugin(() => import('@capacitor/browser'));
  if (!browser) {
    // No Browser plugin (shouldn't happen in a built app) — a plain navigation
    // is worse than the system browser but still better than silently failing.
    window.location.href = data.url;
    return;
  }
  await browser.Browser.open({ url: data.url, presentationStyle: 'popover' });
}

/**
 * Turn the returned deep link into a session.
 *
 * Handles BOTH Supabase flows, because which one is in play depends on client
 * config that can change under us: the implicit flow returns tokens in the URL
 * fragment, PKCE returns a `code` to exchange. Returns true if a session was
 * established, so the caller knows whether to close the browser and refresh.
 */
export async function completeNativeOAuth(url: string): Promise<boolean> {
  if (!supabase) return false;

  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }

  // The provider can also come back with an error (user cancelled, consent
  // denied). Treat it as "not signed in" rather than throwing into a listener.
  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  if (parsed.searchParams.get('error') || hash.get('error')) return false;

  try {
    const accessToken  = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      return !error;
    }

    const code = parsed.searchParams.get('code');
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      return !error;
    }
  } catch {
    return false;
  }
  return false;
}

/** Dismiss the system browser sheet once we have the session. */
export async function closeAuthBrowser(): Promise<void> {
  const browser = await loadPlugin(() => import('@capacitor/browser'));
  try { await browser?.Browser.close(); } catch { /* already closed by the user */ }
}

/** True when this URL is the OAuth callback rather than a shared-content link. */
export function isAuthCallbackUrl(url: string): boolean {
  return url.startsWith(NATIVE_AUTH_REDIRECT) || url.startsWith(`${NATIVE_AUTH_SCHEME}://auth`);
}

/** Where social sign-in should send the provider back to, for this runtime. */
export function authRedirectTo(path: string): string {
  return isNative() ? NATIVE_AUTH_REDIRECT : `${window.location.origin}${path}`;
}
