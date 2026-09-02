import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Android App Links verification.
//
// Nova's growth loop is people sharing event links. Without this file every one
// of those links opens a browser tab even on a phone that HAS the app — the
// share leaks the user straight back out to the web. With it, Android verifies
// that nova's domain and the installed app belong together and routes
// https://<domain>/e/... into the app.
//
// The fingerprint is served from an env var rather than committed because it
// doesn't exist until the release keystore is created, and shipping a file with
// a placeholder in it is worse than shipping none: Android caches a failed
// verification. Until ANDROID_CERT_FINGERPRINT is set this 404s, which is the
// same as not existing, and links keep opening in the browser as they do today.
//
//   keytool -list -v -keystore nova-release.keystore -alias nova \
//     | findstr /C:"SHA256:"
//   → Vercel env: ANDROID_CERT_FINGERPRINT=AB:CD:…  (the SHA-256 line)
//
// Play App Signing re-signs the upload: once enrolled, use the SHA-256 shown in
// Play Console → Setup → App signing, NOT the local keystore's, or verification
// fails for every user who installed from the Play Store.
// ─────────────────────────────────────────────────────────────────────────────

const PACKAGE = process.env.ANDROID_PACKAGE_NAME || 'com.nova.discover';

export function GET() {
  // Accept several fingerprints (comma or whitespace separated) so the upload
  // key and the Play-signing key can both be listed during a migration.
  const fingerprints = (process.env.ANDROID_CERT_FINGERPRINT || '')
    .split(/[,\s]+/)
    .map(f => f.trim().toUpperCase())
    .filter(f => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(f));

  if (fingerprints.length === 0) {
    return new NextResponse('Not Found', { status: 404 });
  }

  return NextResponse.json(
    [{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: PACKAGE,
        sha256_cert_fingerprints: fingerprints,
      },
    }],
    {
      headers: {
        'Content-Type': 'application/json',
        // Verified at install time and periodically after; a day is long enough
        // to be cheap and short enough that adding a key takes effect quickly.
        'Cache-Control': 'public, max-age=86400',
      },
    },
  );
}
