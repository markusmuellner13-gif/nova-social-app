// Feature extraction — the bridge between a post and something a model can learn from.
//
// Everything here is derived from data the app already has (no extra fetches, no
// LLM call) and every feature is normalised to roughly [0,1] or [-1,1] so a
// linear model can be trained with a single shared learning rate.

import type { ApiPost } from '@/lib/sources/shared';

/** Ordered feature names — the index of each name IS its weight index. */
export const FEATURE_NAMES = [
  'bias',
  'is_event',
  'has_real_photo',
  'has_date',
  'has_venue',
  'has_ticket_url',
  'is_free',
  'proximity',        // 1 = on top of you, 0 = far
  'imminence',        // 1 = today, 0 = months away
  'caption_richness',
  'title_quality',
  'source_reliability',
  'category_affinity', // how much THIS user likes this category
  'time_of_day_fit',
  'popularity',
] as const;

export type FeatureName = typeof FEATURE_NAMES[number];
export type FeatureVector = number[];

export const FEATURE_COUNT = FEATURE_NAMES.length;

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** Stock/filler photos are the ones we'd rather not lead with. */
export function hasRealPhoto(image: string | undefined): boolean {
  if (!image) return false;
  return !/picsum\.photos|ui-avatars\.com|unsplash\.com|pexels\.com/i.test(image);
}

/** Rough "is this a title a human wrote about a real thing" score. */
export function titleQuality(title: string): number {
  const t = (title ?? '').trim();
  if (!t) return 0;
  let score = 0.5;
  if (t.length >= 12 && t.length <= 90) score += 0.25;
  if (t.length > 140) score -= 0.25;
  if (/[a-z]/.test(t) && /[A-Z]/.test(t)) score += 0.1;      // normal casing
  if (t === t.toUpperCase() && t.length > 12) score -= 0.25; // SHOUTING
  if (/(https?:|www\.|\bclick here\b|\bbuy now\b|\$\$\$|!!!)/i.test(t)) score -= 0.4;
  if (/�/.test(t)) score -= 0.5;                             // mojibake
  return clamp01(score);
}

/** Which categories suit which part of the day — a real, checkable regularity. */
export function timeOfDayFit(category: string, hour: number): number {
  const morning = hour >= 6 && hour < 12;
  const afternoon = hour >= 12 && hour < 17;
  const evening = hour >= 17 && hour < 23;
  const night = hour >= 23 || hour < 6;
  switch (category) {
    case 'food': case 'restaurants':      return morning ? 0.7 : afternoon ? 0.9 : evening ? 1 : 0.4;
    case 'fitness': case 'outdoors':      return morning ? 1 : afternoon ? 0.8 : evening ? 0.5 : 0.2;
    case 'sightseeing': case 'travel':    return morning ? 0.9 : afternoon ? 1 : evening ? 0.5 : 0.2;
    case 'music': case 'events':          return morning ? 0.3 : afternoon ? 0.6 : evening ? 1 : 0.8;
    case 'shops': case 'fashion':         return morning ? 0.7 : afternoon ? 1 : evening ? 0.6 : 0.1;
    case 'hotels':                        return night ? 0.9 : 0.6;
    default:                              return 0.6;
  }
}

export interface FeatureContext {
  /** 0–23 local hour of the viewer. */
  hour: number;
  /** How local the user's world is (km) — proximity is scored against this. */
  localKm: number;
  /** Learned per-source reliability, 0–1. */
  sourceReliability: (postId: string) => number;
  /** Learned per-category affinity for this user, 0–1. */
  categoryAffinity: (category: string) => number;
  /** Today, as YYYY-MM-DD. */
  today: string;
}

export function extractFeatures(post: ApiPost, ctx: FeatureContext): FeatureVector {
  const title = (post.caption ?? '').split('\n')[0] ?? '';
  const distance = post.distanceKm;
  const proximity = distance == null
    ? 0.5 // unknown distance: neutral, never a bonus
    : clamp01(1 - distance / Math.max(ctx.localKm * 3, 1));

  let imminence = 0.5;
  if (post.eventDateRaw) {
    const days = Math.round(
      (Date.parse(`${post.eventDateRaw}T12:00:00Z`) - Date.parse(`${ctx.today}T12:00:00Z`)) / 86_400_000
    );
    imminence = Number.isFinite(days) ? clamp01(1 - days / 45) : 0.5;
  }

  const priceStr = (post.price ?? '').toLowerCase();
  const isFree = /free|gratis|kostenlos|gratuito|0[.,]00/.test(priceStr) ? 1 : 0;

  return [
    1,                                                    // bias
    post.isEvent ? 1 : 0,
    hasRealPhoto(post.image) ? 1 : 0,
    post.eventDateRaw ? 1 : 0,
    post.eventVenue ? 1 : 0,
    post.eventUrl ? 1 : 0,
    isFree,
    proximity,
    imminence,
    clamp01((post.caption?.length ?? 0) / 400),
    titleQuality(title),
    clamp01(ctx.sourceReliability(post.id)),
    clamp01(ctx.categoryAffinity(post.category)),
    timeOfDayFit(post.category, ctx.hour),
    clamp01(Math.log10((post.likes ?? 0) + (post.comments ?? 0) + 1) / 3),
  ];
}

/** Which upstream a post id came from — the prefix is the source tag. */
export function sourceOf(postId: string): string {
  const m = /^([a-z_]+?)_/.exec(postId ?? '');
  return m?.[1] ?? 'unknown';
}
