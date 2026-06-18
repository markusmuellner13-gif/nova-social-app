// Server-only: turn a PAID business lead into a live, geo-targeted sponsored
// post. Shared by the success-redirect activation (/api/business/activate) and
// the Stripe webhook (/api/business/webhook) so both publish identically and
// idempotently.

import { cacheGet, cacheSet } from '@/lib/serverCache';
import { publishSponsored, SponsoredPost } from '@/lib/sponsored';
import { slugify } from '@/lib/sources/shared';

export interface Lead {
  id: string; business: string; email: string; city: string; category: string;
  website?: string; plan: string;
  tagline?: string; ctaUrl?: string; ctaLabel?: string;
  verified?: boolean; placeId?: string; photo?: string;
  address?: string; lat?: number; lng?: number;
  status?: string; published?: boolean;
}

const PLAN_DAYS = 31;

export type PublishResult = 'live' | 'pending_review' | 'not_found' | 'already';

export async function publishLeadById(leadId: string): Promise<PublishResult> {
  const lead = await cacheGet<Lead>(`nova:business:lead:${leadId}`);
  if (!lead) return 'not_found';
  if (lead.published) return 'already';

  // Auto-publish only verified real businesses with a real photo; otherwise the
  // payment is held for manual review (keeps the feed trustworthy).
  if (!lead.verified || !lead.photo) {
    lead.status = 'paid_pending_review';
    await cacheSet(`nova:business:lead:${leadId}`, lead, 60 * 60 * 24 * 400);
    return 'pending_review';
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
  return 'live';
}
