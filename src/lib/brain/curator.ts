// The curator — Nova Brain's database manager.
//
// Ingestion's job is to bring material in. The curator's job is to decide what
// deserves to stay, and to make what stays good enough to lead a feed:
//
//   • quality-gates every candidate before it reaches Postgres, with a bar that
//     adapts to how much the area actually has to offer;
//   • merges duplicates that arrived from different sources under different ids;
//   • pre-warms the image pipeline so the first real visitor never waits for a
//     cold resize;
//   • records what it accepted and rejected per source, which is the training
//     signal the source-reliability learner runs on.
//
// Everything is fail-soft and gated: without a service-role key it reports what
// it *would* do and writes nothing.

import type { ApiPost } from '@/lib/sources/shared';
import { haversineKm } from '@/lib/sources/shared';
import { assessQuality, qualityFloorFor } from './quality';
import { sourceOf } from './features';
import { recordSourceYield } from '@/lib/sourceStats';

export interface CurationReport {
  considered: number;
  kept: number;
  droppedLowQuality: number;
  mergedDuplicates: number;
  bySource: Record<string, { kept: number; dropped: number }>;
  floor: number;
}

/**
 * Two listings are the same real-world thing when they share a normalised title
 * AND either the same date or a venue within 250m. That catches the common case
 * (one concert listed on both Ticketmaster and Eventbrite, or twice on
 * Eventbrite under different ids) without merging a weekly event's separate
 * dates, which are genuinely different things a user might attend.
 */
function titleKey(post: ApiPost): string {
  // ß and friends aren't decomposed by NFD, so map them explicitly — otherwise
  // "Größenwahn" and "Grossenwahn" key differently and the duplicate survives.
  return (post.caption?.split('\n')[0] ?? '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/ð/g, 'd').replace(/þ/g, 'th')
    .replace(/[^a-z0-9]/g, '').slice(0, 44);
}

function isSameThing(a: ApiPost, b: ApiPost): boolean {
  const ta = titleKey(a);
  if (!ta || ta !== titleKey(b)) return false;
  if (a.eventDateRaw && b.eventDateRaw) return a.eventDateRaw === b.eventDateRaw;
  const la = a.location, lb = b.location;
  if (la?.lat && lb?.lat) return haversineKm(la.lat, la.lng, lb.lat, lb.lng) < 0.25;
  return true;
}

/** Keep the richer of two duplicates — the one a user would rather see. */
function preferred(a: ApiPost, b: ApiPost): ApiPost {
  const qa = assessQuality(a).score;
  const qb = assessQuality(b).score;
  if (qa !== qb) return qa > qb ? a : b;
  return (a.caption?.length ?? 0) >= (b.caption?.length ?? 0) ? a : b;
}

export function mergeDuplicates(posts: ApiPost[]): { merged: ApiPost[]; removed: number } {
  const out: ApiPost[] = [];
  let removed = 0;
  // Bucket by title first so this stays near-linear instead of O(n²) over the
  // whole ingest batch.
  const buckets = new Map<string, ApiPost[]>();
  for (const p of posts) {
    const k = titleKey(p) || `id:${p.id}`;
    const bucket = buckets.get(k);
    if (bucket) bucket.push(p); else buckets.set(k, [p]);
  }
  for (const bucket of buckets.values()) {
    const kept: ApiPost[] = [];
    for (const p of bucket) {
      const idx = kept.findIndex(k => isSameThing(k, p));
      if (idx === -1) kept.push(p);
      else { kept[idx] = preferred(kept[idx], p); removed++; }
    }
    out.push(...kept);
  }
  return { merged: out, removed };
}

/**
 * Decide what to keep from a batch of freshly-fetched candidates.
 * Pure — does no I/O — so it is straightforward to test and to reason about.
 */
export function curate(candidates: ApiPost[]): { kept: ApiPost[]; report: CurationReport } {
  const { merged, removed } = mergeDuplicates(candidates);
  const floor = qualityFloorFor(merged.length);

  const bySource: Record<string, { kept: number; dropped: number }> = {};
  const kept: ApiPost[] = [];
  let droppedLowQuality = 0;

  for (const p of merged) {
    const src = sourceOf(p.id);
    bySource[src] ??= { kept: 0, dropped: 0 };
    if (assessQuality(p).score >= floor) { kept.push(p); bySource[src].kept++; }
    else { droppedLowQuality++; bySource[src].dropped++; }
  }

  return {
    kept,
    report: {
      considered: candidates.length,
      kept: kept.length,
      droppedLowQuality,
      mergedDuplicates: removed,
      bySource,
      floor,
    },
  };
}

/** Feed the curation outcome back into the source-reliability learner. */
export async function recordCuration(report: CurationReport): Promise<void> {
  await Promise.all(
    Object.entries(report.bySource).map(([source, s]) =>
      recordSourceYield(source, s.kept, s.dropped).catch(() => {})
    )
  );
}

/**
 * Warm the image pipeline for posts we just accepted, so the first person to
 * see them gets a cached render instead of paying for the cold resize. Bounded
 * and best-effort: this must never slow ingestion down or fail it.
 */
export async function prewarmImages(
  posts: ApiPost[], origin: string, max = 24, widths: number[] = [480, 1080]
): Promise<number> {
  if (!origin) return 0;
  const targets = posts.filter(p => p.image).slice(0, max);
  let warmed = 0;
  await Promise.all(targets.flatMap(p =>
    widths.map(async w => {
      try {
        const res = await fetch(
          `${origin}/api/image-proxy?url=${encodeURIComponent(p.image)}&w=${w}`,
          { headers: { Accept: 'image/avif,image/webp,image/*' }, signal: AbortSignal.timeout(9000) }
        );
        if (res.ok) { warmed++; await res.arrayBuffer(); }
      } catch { /* best effort */ }
    })
  ));
  return warmed;
}
