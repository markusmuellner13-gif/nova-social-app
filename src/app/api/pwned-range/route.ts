import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// Have I Been Pwned range lookup — "has this password appeared in a breach?"
//
// The password NEVER leaves the user's device, not even to this server. The
// client SHA-1s it locally, sends only the first FIVE hex characters of the
// hash, and we return every breached suffix sharing that prefix (~800 of them).
// The client finds its own suffix in that list. This is HIBP's documented
// k-anonymity model: the prefix is shared by hundreds of thousands of distinct
// passwords, so neither Nova nor Cloudflare can tell which one was checked.
//
// It lives here rather than in the browser because the hardened CSP's
// connect-src does not include api.pwnedpasswords.com, and adding a third-party
// origin there to save one hop would be a bad trade. Proxying also means the
// native build (which has no same-origin API) works through NEXT_PUBLIC_API_BASE
// like every other route.
//
// Falls under middleware's `read` tier (60/min per IP). Failure is non-fatal:
// the caller treats an error as "unknown" and relies on the local policy, so
// HIBP being down can never block a signup.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';

const HIBP = 'https://api.pwnedpasswords.com/range/';

export async function GET(request: NextRequest) {
  const prefix = (request.nextUrl.searchParams.get('prefix') || '').toUpperCase();

  // Exactly five uppercase hex characters — nothing else is ever forwarded.
  if (!/^[0-9A-F]{5}$/.test(prefix)) {
    return NextResponse.json({ ok: false, error: 'bad_prefix' }, { status: 400 });
  }

  try {
    const res = await fetch(`${HIBP}${prefix}`, {
      headers: {
        // Padding asks HIBP to bulk the response with decoys so its own size
        // can't hint at the answer.
        'Add-Padding': 'true',
        'User-Agent': 'nova-app-password-check',
      },
      signal: AbortSignal.timeout(4000),
      next: { revalidate: 86_400 },
    });

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: 'upstream' }, { status: 502 });
    }

    const body = await res.text();
    return new NextResponse(body, {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'unavailable' }, { status: 503 });
  }
}
