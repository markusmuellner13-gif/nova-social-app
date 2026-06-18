import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { publishLeadById } from '@/lib/publishLead';

// ─────────────────────────────────────────────────────────────────────────────
// Stripe webhook — robust publishing path. Fires server-to-server when a
// checkout completes, so a paid post goes live even if the customer closes the
// tab before the success redirect. Idempotent with /api/business/activate.
//
// Verifies Stripe's signature with HMAC-SHA256 (no SDK needed). Requires
// STRIPE_WEBHOOK_SECRET (whsec_…). Until that's set, it safely declines.
//
// Setup: Stripe Dashboard → Developers → Webhooks → Add endpoint
//   URL: https://<your-domain>/api/business/webhook
//   Event: checkout.session.completed
//   Copy the signing secret → add as STRIPE_WEBHOOK_SECRET in Vercel.
// ─────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

function verifySignature(payload: string, header: string, secret: string): boolean {
  try {
    const parts = Object.fromEntries(
      header.split(',').map(kv => { const i = kv.indexOf('='); return [kv.slice(0, i), kv.slice(i + 1)]; })
    ) as Record<string, string>;
    const t = parts['t'];
    const v1 = parts['v1'];
    if (!t || !v1) return false;
    const expected = crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(v1);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Webhook not configured yet — decline cleanly (activation redirect still works).
    return NextResponse.json({ ok: false, error: 'webhook not configured' }, { status: 200 });
  }

  const sig = request.headers.get('stripe-signature') || '';
  const raw = await request.text(); // RAW body required for signature verification

  if (!verifySignature(raw, sig, secret)) {
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 400 });
  }

  let event: { type?: string; data?: { object?: { client_reference_id?: string; payment_status?: string } } };
  try { event = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  if (event.type === 'checkout.session.completed') {
    const session = event.data?.object;
    const leadId = session?.client_reference_id;
    if (leadId && (session?.payment_status === 'paid' || session?.payment_status === undefined)) {
      await publishLeadById(leadId);
    }
  }

  // Always 200 quickly so Stripe doesn't retry a handled event.
  return NextResponse.json({ received: true });
}
