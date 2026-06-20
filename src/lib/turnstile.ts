// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Turnstile — bot / abuse protection (free, privacy-first, GDPR-friendly).
//
// Server-side verification of the token the client widget produces. GATED: if
// TURNSTILE_SECRET_KEY isn't set it NO-OPS (returns ok) so nothing breaks before
// you add keys. Once the secret is set, endpoints can require a valid token.
//
// Setup:
//   1. Cloudflare dashboard → Turnstile → Add site → get Site Key + Secret Key
//   2. Vercel env: NEXT_PUBLIC_TURNSTILE_SITE_KEY (client) + TURNSTILE_SECRET_KEY (server)
// ─────────────────────────────────────────────────────────────────────────────

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const turnstileEnabled = !!process.env.TURNSTILE_SECRET_KEY;

export interface TurnstileResult {
  success: boolean;
  skipped?: boolean;   // true when no secret configured (verification disabled)
  reason?: string;
}

export async function verifyTurnstile(token: string | undefined, ip?: string): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { success: true, skipped: true }; // disabled → don't block

  if (!token) return { success: false, reason: 'missing_token' };

  try {
    const body = new URLSearchParams();
    body.set('secret', secret);
    body.set('response', token);
    if (ip) body.set('remoteip', ip);

    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json() as { success?: boolean; 'error-codes'?: string[] };
    if (data.success) return { success: true };
    return { success: false, reason: (data['error-codes'] ?? []).join(',') || 'verification_failed' };
  } catch {
    return { success: false, reason: 'verify_unreachable' };
  }
}
