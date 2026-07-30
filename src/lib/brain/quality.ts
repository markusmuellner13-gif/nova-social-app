// The quality gate — Nova Brain's judgement about whether a post is good enough
// to keep, and whether it is good enough to lead the feed.
//
// `eventValidation.ts` already answers "is this row structurally valid?" (real
// date, real coordinates, not spam). This answers the softer question the app
// actually cares about: "is this worth a user's screen?" A technically valid
// event with a stock photo, a 6-word description and no venue is real — but it
// is filler, and filler is what makes a feed feel cheap.
//
// The thresholds are learned, not guessed: the curator records the quality score
// of everything that later gets engagement, and raises or lowers the bar so that
// roughly the top slice survives. That keeps the gate honest as the mix of
// sources changes.

import type { ApiPost } from '@/lib/sources/shared';
import { hasRealPhoto, titleQuality } from './features';

export interface QualityBreakdown {
  score: number;                 // 0–1
  reasons: string[];             // what cost it points — useful in cron logs
}

/** Filler descriptions the crawlers produce when a page had nothing to say. */
const THIN_DESC = /^(join us|come along|more info|details? (to follow|tbc)|see website|n\/?a)\b/i;

export function assessQuality(post: ApiPost): QualityBreakdown {
  const reasons: string[] = [];
  const caption = post.caption ?? '';
  const title = caption.split('\n')[0] ?? '';
  const body = caption.slice(title.length).trim();

  let score = 0;

  // A real photo of the actual thing is the single biggest driver of how the
  // feed feels, so it carries the most weight.
  if (hasRealPhoto(post.image)) score += 0.30;
  else reasons.push('stock_or_missing_photo');

  const tq = titleQuality(title);
  score += tq * 0.20;
  if (tq < 0.4) reasons.push('weak_title');

  if (body.length >= 120) score += 0.15;
  else if (body.length >= 50) score += 0.08;
  else reasons.push('thin_description');
  if (THIN_DESC.test(body)) { score -= 0.08; reasons.push('boilerplate_description'); }

  if (post.location?.lat || post.location?.lng) score += 0.10;
  else reasons.push('no_coordinates');

  if (post.isEvent) {
    if (post.eventDateRaw) score += 0.10; else reasons.push('event_without_date');
    if (post.eventVenue) score += 0.05; else reasons.push('event_without_venue');
    if (post.eventUrl) score += 0.05; else reasons.push('event_without_link');
  } else {
    // A place earns the same points by being findable and described.
    if (post.eventUrl || post.organizer) score += 0.10;
    if (post.location?.name) score += 0.10;
  }

  if ((post.images?.length ?? 0) > 1) score += 0.05; // a real gallery

  return { score: Math.max(0, Math.min(1, score)), reasons };
}

/**
 * Default bar for entering the database. Deliberately forgiving — a small town
 * with three real listings must not be emptied out by a strict gate. The curator
 * tunes the effective bar upward only where there is plenty to choose from.
 */
export const BASE_QUALITY_FLOOR = 0.35;

/**
 * The bar to apply for a given city, given how much material is available.
 * Somewhere with hundreds of candidates can afford to be picky; somewhere with
 * five cannot, and showing five honest mediocre listings beats showing none.
 */
export function qualityFloorFor(candidateCount: number): number {
  if (candidateCount >= 200) return 0.55;
  if (candidateCount >= 80) return 0.48;
  if (candidateCount >= 25) return 0.42;
  return BASE_QUALITY_FLOOR;
}

/** Split a batch into what we keep and what we drop, with reasons for the log. */
export function filterByQuality(
  posts: ApiPost[], floor = BASE_QUALITY_FLOOR
): { kept: ApiPost[]; dropped: { post: ApiPost; q: QualityBreakdown }[] } {
  const kept: ApiPost[] = [];
  const dropped: { post: ApiPost; q: QualityBreakdown }[] = [];
  for (const p of posts) {
    const q = assessQuality(p);
    if (q.score >= floor) kept.push(p);
    else dropped.push({ post: p, q });
  }
  return { kept, dropped };
}
