import { NextRequest, NextResponse } from 'next/server';
import { cacheEnabled, cacheSet } from '@/lib/serverCache';

// ─────────────────────────────────────────────────────────────────────────────
// Self-serve paid-post checkout (#8) — the monetization entry point.
//
// A business picks a plan and we create a Stripe Checkout subscription session
// via Stripe's REST API (no SDK dependency → nothing to install, can't break the
// build). We use inline price_data so you don't have to pre-create products in
// the Stripe dashboard.
//
// Every submission is also stored as a PENDING, UNVERIFIED lead (#10) so you can
// review/approve businesses before their sponsored post goes live.
//
// Gated on STRIPE_SECRET_KEY: without it, the lead is still captured and the API
// returns { queued: true } so the portal works as a waitlist until you add keys.
// ─────────────────────────────────────────────────────────────────────────────

interface PlanDef { name: string; amount: number } // amount in cents (EUR), per month
const PLANS: Record<string, PlanDef> = {
  basic:    { name: 'Nova Basic — Local Sponsored Post',    amount: 2900 },
  featured: { name: 'Nova Featured — Priority Placement',   amount: 4900 },
  premium:  { name: 'Nova Premium — Top of Feed + Boosts',  amount: 14900 },
};

export async function POST(request: NextRequest) {
  let body: Record<string, string> = {};
  try { body = await request.json(); } catch { /* keep empty */ }

  const planId   = (body.plan || 'featured').toLowerCase();
  const plan     = PLANS[planId] ?? PLANS.featured;
  const business = (body.business || '').slice(0, 120).trim();
  const email    = (body.email || '').slice(0, 160).trim();
  const city     = (body.city || '').slice(0, 80).trim();
  const category = (body.category || '').slice(0, 40).trim();
  const website  = (body.website || '').slice(0, 200).trim();
  // Ad content + verification payload (from /api/business/verify)
  const tagline  = (body.tagline || '').slice(0, 240).trim();
  const ctaUrl   = (body.ctaUrl || website || '').slice(0, 240).trim();
  const ctaLabel = (body.ctaLabel || 'Visit').slice(0, 30).trim();
  const verified = body.verified === 'true' || body.verified === '1';
  const placeId  = (body.placeId || '').slice(0, 120);
  const photo    = (body.photo || '').slice(0, 600);
  const address  = (body.address || '').slice(0, 200);
  const lat      = parseFloat(body.lat || '0') || 0;
  const lng      = parseFloat(body.lng || '0') || 0;

  if (!business || !email) {
    return NextResponse.json({ ok: false, error: 'Business name and email are required.' }, { status: 400 });
  }

  const leadId = `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const lead = {
    id: leadId, business, email, city, category, website,
    plan: planId, amount: plan.amount,
    tagline, ctaUrl, ctaLabel,
    verified, placeId, photo, address, lat, lng,
    status: 'pending', published: false, createdAt: new Date().toISOString(),
  };

  // Capture the lead regardless of payment configuration (waitlist / review queue).
  if (cacheEnabled) {
    await cacheSet(`nova:business:lead:${leadId}`, lead, 60 * 60 * 24 * 400);
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const origin = new URL(request.url).origin;

  if (!stripeKey) {
    // No payment backend yet — behave as a waitlist so the portal is still useful.
    return NextResponse.json({ ok: true, queued: true, leadId });
  }

  // Build a Stripe Checkout subscription session via REST (form-encoded).
  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  // session_id lets the success page activate (publish) the post immediately.
  form.set('success_url', `${origin}/business?status=success&session_id={CHECKOUT_SESSION_ID}`);
  form.set('cancel_url', `${origin}/business?status=cancelled`);
  form.set('customer_email', email);
  form.set('client_reference_id', leadId);
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', 'eur');
  form.set('line_items[0][price_data][unit_amount]', String(plan.amount));
  form.set('line_items[0][price_data][recurring][interval]', 'month');
  form.set('line_items[0][price_data][product_data][name]', plan.name);
  form.set('metadata[business]', business);
  form.set('metadata[city]', city);
  form.set('metadata[category]', category);
  form.set('metadata[leadId]', leadId);

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json() as { url?: string; error?: { message?: string } };
    if (!res.ok || !data.url) {
      return NextResponse.json({ ok: false, error: data.error?.message ?? 'Stripe error' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, url: data.url, leadId });
  } catch {
    return NextResponse.json({ ok: false, error: 'Could not reach payment provider.' }, { status: 502 });
  }
}
