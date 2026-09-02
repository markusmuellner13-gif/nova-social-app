import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// iOS Universal Links verification — the Apple half of the same job as
// assetlinks.json (see that file for why this matters).
//
// Requirements Apple enforces and that are easy to get wrong:
//   • served over HTTPS with NO redirect
//   • Content-Type: application/json
//   • the path has no .json extension
//   • the file is fetched by Apple's CDN at install time, so it must be public
//
// Gated on APPLE_APP_ID (= <TeamID>.<bundle id>, e.g. ABCDE12345.com.nova.discover),
// found in the Apple Developer portal under Membership. Until it is set this
// 404s — identical to not existing — and shared links keep opening in Safari.
//
// The matching half lives in Xcode: Signing & Capabilities → Associated Domains
// → applinks:<your domain>. Both sides are required.
// ─────────────────────────────────────────────────────────────────────────────

export function GET() {
  const appId = (process.env.APPLE_APP_ID || '').trim();
  // <10-char Team ID>.<bundle identifier>
  if (!/^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/.test(appId)) {
    return new NextResponse('Not Found', { status: 404 });
  }

  return NextResponse.json(
    {
      applinks: {
        details: [{
          appIDs: [appId],
          components: [
            // Shared event links open in the app…
            { '/': '/e/*', comment: 'Shared event links open in Nova' },
            // …but the sign-in return leg must NOT be captured: it has to land
            // in the browser that started it so the OAuth session completes.
            { '/': '/auth/*', exclude: true, comment: 'OAuth callbacks stay in the browser' },
          ],
        }],
      },
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400',
      },
    },
  );
}
