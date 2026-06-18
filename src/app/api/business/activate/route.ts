import { NextRequest, NextResponse } from 'next/server';
import { publishLeadById } from '@/lib/publishLead';

// Activate a paid post when Stripe redirects the customer back with
// ?session_id=… . We confirm the payment directly with Stripe (so it can't be
// faked from the client), then publish the sponsored post IMMEDIATELY. The
// Stripe webhook (/api/business/webhook) is the robust fallback if the customer
// closes the tab before the redirect. Both are idempotent.
export async function GET(request: NextRequest) {
  const sessionId = (new URL(request.url).searchParams.get('session_id') || '').slice(0, 200);
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!sessionId || !stripeKey) {
    return NextResponse.json({ ok: false, error: 'missing session or payment config' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
      signal: AbortSignal.timeout(8000),
    });
    const session = await res.json() as { payment_status?: string; client_reference_id?: string; status?: string };
    if (!res.ok) return NextResponse.json({ ok: false, error: 'session lookup failed' }, { status: 502 });
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return NextResponse.json({ ok: false, error: 'not paid yet' }, { status: 402 });
    }
    const leadId = session.client_reference_id;
    if (!leadId) return NextResponse.json({ ok: false, error: 'no lead reference' }, { status: 400 });

    const result = await publishLeadById(leadId);
    if (result === 'not_found') return NextResponse.json({ ok: false, error: 'lead not found' }, { status: 404 });
    return NextResponse.json({
      ok: true,
      published: result === 'live' || result === 'already',
      pendingReview: result === 'pending_review',
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'activation error' }, { status: 500 });
  }
}
