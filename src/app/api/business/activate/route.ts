import { NextRequest, NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/serverCache';
import { publishSponsored, SponsoredPost } from '@/lib/sponsored';
import { slugify } from '@/lib/sources/shared';

// ─────────────────────────────────────────────────────────────────────────────
// Activate a paid post (#paid-posts) — called when Stripe redirects the customer
// back with ?session_id=… . We confirm the payment directly with Stripe (so it
// can't be faked from the client), then publish the sponsored post IMMEDIATELY,
// geo-targeted to the business's city. No webhook secret needed.
//
// PLAN_DAYS maps the plan to how long the post stays live before renewal.
// ─────────────────────────────────────────────────────────────────────────────

interface Lead {
  id: string; business: string; email: string; city: string; category: string;
  website?: string; plan: string;
  tagline?: string; ctaUrl?: string; ctaLabel?: string;
  verified?: boolean; placeId?: string; photo?: string;
  address?: string; lat?: number; lng?: number;
  status?: string; published?: boolean;
}

const PLAN_DAYS = 31;

export async function GET(request: NextRequest) {
  const sessionId = (new URL(request.url).searchParams.get('session_id') || '').slice(0, 200);
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!sessionId || !stripeKey) {
    return NextResponse.json({ ok: false, error: 'missing session or payment config' }, { status: 400 });
  }

  try {
    // Verify the session is paid, straight from Stripe.
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${stripeKey}` },
      signal: AbortSignal.timeout(8000),
    });
    const session = await res.json() as {
      payment_status?: string; client_reference_id?: string; status?: string;
    };
    if (!res.ok) return NextResponse.json({ ok: false, error: 'session lookup failed' }, { status: 502 });
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      return NextResponse.json({ ok: false, error: 'not paid yet' }, { status: 402 });
    }

    const leadId = session.client_reference_id;
    if (!leadId) return NextResponse.json({ ok: false, error: 'no lead reference' }, { status: 400 });

    const lead = await cacheGet<Lead>(`nova:business:lead:${leadId}`);
    if (!lead) return NextResponse.json({ ok: false, error: 'lead not found' }, { status: 404 });

    // Idempotent: if already published, just confirm.
    if (lead.published) return NextResponse.json({ ok: true, published: true, alreadyLive: true });

    // Only publish automatically for verified real businesses with a real photo.
    if (!lead.verified || !lead.photo) {
      lead.status = 'paid_pending_review';
      await cacheSet(`nova:business:lead:${leadId}`, lead, 60 * 60 * 24 * 400);
      return NextResponse.json({ ok: true, published: false, pendingReview: true });
    }

    const now = Date.now();
    const citySlug = slugify(lead.city || 'nearby');
    const sponsored: SponsoredPost = {
      id: `paid_${leadId}`,
      leadId,
      business: lead.business,
      category: (lead.category || 'lifestyle').toLowerCase(),
      city: lead.city || '',
      citySlug,
      image: lead.photo,
      caption: lead.tagline ?? lead.business,
      tagline: lead.tagline ?? `Discover ${lead.business} in ${lead.city}.`,
      ctaUrl: lead.ctaUrl || lead.website || '#',
      ctaLabel: lead.ctaLabel || 'Visit',
      lat: lead.lat ?? 0,
      lng: lead.lng ?? 0,
      address: lead.address ?? lead.city ?? '',
      placeId: lead.placeId ?? '',
      verified: true,
      createdAt: now,
      expiresAt: now + PLAN_DAYS * 24 * 60 * 60 * 1000,
    };
    await publishSponsored(sponsored);

    lead.status = 'live';
    lead.published = true;
    await cacheSet(`nova:business:lead:${leadId}`, lead, 60 * 60 * 24 * 400);

    return NextResponse.json({ ok: true, published: true, city: lead.city });
  } catch {
    return NextResponse.json({ ok: false, error: 'activation error' }, { status: 500 });
  }
}
