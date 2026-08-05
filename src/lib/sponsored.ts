// Server-only: storage + shaping for PAID sponsored posts (#paid-posts).
// A published sponsored post is geo-targeted by city and shown in that city's
// feed. Stored in Redis as a per-city list; expires automatically.

import { cacheGet, cacheSet } from '@/lib/serverCache';
import { slugify, logoUrl } from '@/lib/sources/shared';

export interface SponsoredPost {
  id: string;
  leadId: string;
  business: string;
  category: string;
  city: string;
  citySlug: string;
  image: string;        // the REAL venue photo (Google Places) — never a user upload
  caption: string;
  tagline: string;
  ctaUrl: string;
  ctaLabel: string;
  lat: number;
  lng: number;
  address: string;
  placeId: string;
  verified: boolean;
  createdAt: number;
  expiresAt: number;    // unix ms — auto-hidden after the paid period
}

function key(citySlug: string): string {
  return `nova:sponsored:${citySlug}`;
}

// Active (non-expired) sponsored posts for a city.
export async function listSponsored(city: string): Promise<SponsoredPost[]> {
  const slug = slugify(city);
  if (!slug) return [];
  const all = (await cacheGet<SponsoredPost[]>(key(slug))) ?? [];
  const now = Date.now();
  return all.filter(p => p.expiresAt > now);
}

// Publish (or refresh) a sponsored post for its city. Read-modify-write; volume
// is low enough that a transaction isn't warranted yet.
export async function publishSponsored(post: SponsoredPost): Promise<void> {
  const all = (await cacheGet<SponsoredPost[]>(key(post.citySlug))) ?? [];
  const now = Date.now();
  const kept = all.filter(p => p.expiresAt > now && p.leadId !== post.leadId);
  kept.push(post);
  // 400-day TTL on the Redis key itself; per-post expiresAt does the real gating.
  await cacheSet(key(post.citySlug), kept, 60 * 60 * 24 * 400);
}

// Convert a stored sponsored post into the Post shape the feed/client renders.
export function sponsoredToFeedPost(s: SponsoredPost) {
  const domain = (() => { try { return new URL(s.ctaUrl).hostname; } catch { return ''; } })();
  return {
    id: s.id,
    user: {
      id: `biz_${s.leadId}`,
      name: s.business,
      username: slugify(s.business).replace(/-/g, '') || 'partner',
      // Clearbit's free logo API was retired and the host no longer resolves —
      // `logoUrl` is the surviving keyless equivalent. This was missed when the
      // rest of the app moved off Clearbit, so every partner card was firing a
      // request that could only ever fail.
      avatar: domain ? logoUrl(domain) : s.image,
      bio: `Official Nova partner — ${s.business}`,
      followers: 0, following: 0, posts: 0, verified: true,
    },
    image: s.image,
    caption: `${s.tagline}\n\n📍 ${s.address || s.city}`,
    likes: 0, comments: 0,
    category: s.category,
    hashtags: [`#${s.city.replace(/\s/g, '')}`, `#${s.category}`, '#nova', '#partner'],
    timestamp: s.createdAt,
    location: { name: `${s.business}, ${s.city}`, lat: s.lat, lng: s.lng },
    saved: false, liked: false,
    isEvent: false, isAIGenerated: false, isSponsored: true,
    eventUrl: s.ctaUrl,
    sponsoredCta: s.ctaLabel,
    organizer: s.business,
    price: '',
  };
}
