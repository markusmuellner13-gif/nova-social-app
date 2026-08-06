'use client';

import { apiUrl } from './apiBase';

// ─────────────────────────────────────────────────────────────────────────────
// "Has this exact password already leaked in a breach?"
//
// The single highest-value password check there is: length and character-class
// rules do nothing against credential stuffing, which replays passwords that are
// already public. "Tr0ub4dor&3" passes every complexity rule and appears in
// breach corpora hundreds of times.
//
// The password never leaves the device. We SHA-1 it here, send only the first 5
// hex characters to our own /api/pwned-range, and match the returned suffixes
// locally (HIBP k-anonymity — see the route for why).
// ─────────────────────────────────────────────────────────────────────────────

export type BreachResult =
  | { status: 'safe' }
  | { status: 'breached'; count: number }
  | { status: 'unknown' };  // offline, blocked, rate-limited — never blocks signup

const cache = new Map<string, BreachResult>();

async function sha1Hex(input: string): Promise<string | null> {
  // Web Crypto needs a secure context. https:// and http://localhost (which is
  // exactly the origin Capacitor's Android WebView uses) both qualify.
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  try {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-1', bytes);
    return [...new Uint8Array(digest)]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  } catch {
    return null;
  }
}

export async function checkPasswordBreached(password: string): Promise<BreachResult> {
  if (!password) return { status: 'unknown' };

  const hash = await sha1Hex(password);
  if (!hash) return { status: 'unknown' };

  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const cached = cache.get(hash);
  if (cached) return cached;

  let result: BreachResult = { status: 'unknown' };
  try {
    const res = await fetch(apiUrl(`/api/pwned-range?prefix=${prefix}`), {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const text = await res.text();
      result = { status: 'safe' };
      for (const line of text.split('\n')) {
        const [sfx, countRaw] = line.trim().split(':');
        if (sfx === suffix) {
          // Padded decoy rows are returned with a count of 0 — a real hit is >0.
          const count = Number(countRaw) || 0;
          result = count > 0 ? { status: 'breached', count } : { status: 'safe' };
          break;
        }
      }
    }
  } catch {
    result = { status: 'unknown' };
  }

  // Only cache determinate answers, so a blip doesn't pin a password as unknown.
  if (result.status !== 'unknown') cache.set(hash, result);
  return result;
}
