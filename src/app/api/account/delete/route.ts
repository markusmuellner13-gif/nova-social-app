import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// GDPR Art. 17 — Right to erasure (full account deletion).
//
// The client sends its Supabase access token as `Authorization: Bearer <token>`.
// We verify it server-side with the SERVICE ROLE key, then delete the auth.users
// record. Every app table references auth.users / profiles with ON DELETE
// CASCADE, so this single delete also removes the profile, follows, group
// memberships, group events and post interactions — a complete erasure.
//
// Requires SUPABASE_SERVICE_ROLE_KEY (server-only, never exposed to the client).
// Without it we can't delete the auth record, so we return 501 and the UI falls
// back to wiping app data + signing out, and tells the user to email privacy@.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json(
      { ok: false, error: 'account_deletion_unavailable', message: 'Server not configured for full deletion. Email privacy@nova-app.com.' },
      { status: 501 },
    );
  }

  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 });
  }

  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Verify the caller actually owns the session before deleting anything.
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData.user) {
    return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 401 });
  }

  const userId = userData.user.id;
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) {
    return NextResponse.json({ ok: false, error: 'delete_failed', message: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, deleted: userId });
}
