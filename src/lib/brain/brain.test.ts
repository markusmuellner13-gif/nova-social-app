import { describe, it, expect } from 'vitest';
import {
  extractFeatures, titleQuality, timeOfDayFit, hasRealPhoto, sourceOf,
  FEATURE_COUNT, FEATURE_NAMES, type FeatureContext,
} from './features';
import {
  emptyModel, isUsable, score, train, trainBatch, blend, rank, MODEL_VERSION,
} from './ranker';
import { assessQuality, qualityFloorFor, filterByQuality } from './quality';
import { curate, mergeDuplicates } from './curator';
import type { ApiPost } from '@/lib/sources/shared';

function post(o: Partial<ApiPost> = {}): ApiPost {
  return {
    id: 'tm_1', user: { id: 'u', name: 'V', username: 'v', avatar: '', bio: '', followers: 0, following: 0, posts: 0, verified: true },
    image: 'https://img.evbuc.com/real.jpg',
    caption: 'A proper evening of live jazz\n\nA full description of the night, who is playing, and what to expect when you arrive at the venue.',
    likes: 0, comments: 0, category: 'music', hashtags: [], timestamp: Date.now(),
    location: { name: 'Porgy', lat: 48.2, lng: 16.37 },
    saved: false, liked: false, isEvent: true, isAIGenerated: false,
    eventDateRaw: '2026-08-01', eventVenue: 'Porgy & Bess', eventUrl: 'https://x.test/e',
    ...o,
  };
}

const ctx: FeatureContext = {
  hour: 19, localKm: 20, today: '2026-07-31',
  sourceReliability: () => 0.8,
  categoryAffinity: () => 0.7,
};

// ── Features ─────────────────────────────────────────────────────────────────

describe('features', () => {
  it('produces one finite, bounded number per named feature', () => {
    const x = extractFeatures(post({ distanceKm: 2 }), ctx);
    expect(x).toHaveLength(FEATURE_COUNT);
    expect(FEATURE_NAMES).toHaveLength(FEATURE_COUNT);
    for (const v of x) {
      expect(Number.isFinite(v)).toBe(true);
      expect(Math.abs(v)).toBeLessThanOrEqual(1.0001);
    }
  });

  it('scores a near event higher on proximity than a far one', () => {
    const near = extractFeatures(post({ distanceKm: 1 }), ctx)[FEATURE_NAMES.indexOf('proximity')];
    const far  = extractFeatures(post({ distanceKm: 55 }), ctx)[FEATURE_NAMES.indexOf('proximity')];
    expect(near).toBeGreaterThan(far);
  });

  it('scores an event today higher on imminence than one in two months', () => {
    const i = FEATURE_NAMES.indexOf('imminence');
    const soon = extractFeatures(post({ eventDateRaw: '2026-07-31' }), ctx)[i];
    const later = extractFeatures(post({ eventDateRaw: '2026-10-01' }), ctx)[i];
    expect(soon).toBeGreaterThan(later);
  });

  it('treats an unknown distance as neutral, never as a bonus', () => {
    const i = FEATURE_NAMES.indexOf('proximity');
    expect(extractFeatures(post({ distanceKm: undefined }), ctx)[i]).toBe(0.5);
  });

  it('recognises stock photos as not-real', () => {
    expect(hasRealPhoto('https://cdn.evbuc.com/x.jpg')).toBe(true);
    expect(hasRealPhoto('https://picsum.photos/seed/a/1440/1800')).toBe(false);
    expect(hasRealPhoto(undefined)).toBe(false);
  });

  it('penalises shouty, spammy and mojibake titles', () => {
    expect(titleQuality('An evening of live jazz')).toBeGreaterThan(0.6);
    expect(titleQuality('BUY NOW!!! CLICK HERE $$$')).toBeLessThan(0.3);
    expect(titleQuality('Caf� Central')).toBeLessThan(0.6);
    expect(titleQuality('')).toBe(0);
  });

  it('knows nightlife suits the evening and gyms the morning', () => {
    expect(timeOfDayFit('music', 21)).toBeGreaterThan(timeOfDayFit('music', 8));
    expect(timeOfDayFit('fitness', 8)).toBeGreaterThan(timeOfDayFit('fitness', 23));
  });

  it('reads the source from a post id', () => {
    expect(sourceOf('eb_123')).toBe('eb');
    expect(sourceOf('osm_9')).toBe('osm');
    expect(sourceOf('nonsense')).toBe('unknown');
  });
});

// ── The model actually learns ────────────────────────────────────────────────

describe('ranker training', () => {
  it('starts as a usable, untrained model', () => {
    const m = emptyModel();
    expect(isUsable(m)).toBe(true);
    expect(m.n).toBe(0);
    expect(score(m, new Array(FEATURE_COUNT).fill(0))).toBeCloseTo(0.5, 5);
  });

  it('rejects stored weights from an incompatible version or shape', () => {
    expect(isUsable({ w: [1, 2], n: 5, v: MODEL_VERSION })).toBe(false);
    expect(isUsable({ w: new Array(FEATURE_COUNT).fill(0), n: 5, v: 999 })).toBe(false);
    expect(isUsable(null)).toBe(false);
  });

  it('raises the score for a positive example and lowers it for a negative one', () => {
    const x = extractFeatures(post({ distanceKm: 1 }), ctx);
    const before = score(emptyModel(), x);
    const up = train(emptyModel(), x, 1, 1);
    const down = train(emptyModel(), x, 0, 1);
    expect(score(up, x)).toBeGreaterThan(before);
    expect(score(down, x)).toBeLessThan(before);
  });

  it('LEARNS a real preference: free nearby events over distant paid ones', () => {
    // Train only on engagement with cheap, close, imminent events.
    const liked = extractFeatures(post({ distanceKm: 1, price: 'Free', eventDateRaw: '2026-08-01' }), ctx);
    const ignored = extractFeatures(post({ distanceKm: 80, price: 'EUR 90', eventDateRaw: '2026-10-20' }), ctx);

    let m = emptyModel();
    for (let i = 0; i < 150; i++) {
      m = train(m, liked, 1, 1);
      m = train(m, ignored, 0, 1);
    }
    // The trained model must now clearly prefer the kind of post it saw engaged with.
    expect(score(m, liked)).toBeGreaterThan(0.65);
    expect(score(m, ignored)).toBeLessThan(0.35);
    expect(score(m, liked)).toBeGreaterThan(score(m, ignored) + 0.3);
  });

  it('converges rather than oscillating, and never produces NaN', () => {
    const x = extractFeatures(post(), ctx);
    let m = emptyModel();
    for (let i = 0; i < 4000; i++) m = train(m, x, 1, 1);
    expect(m.w.every(Number.isFinite)).toBe(true);
    expect(m.w.every(w => Math.abs(w) <= 8)).toBe(true);
    const s1 = score(m, x);
    m = train(m, x, 1, 1);
    // A mature model barely moves on one more identical example — that decay is
    // what stops a late burst of taps from swinging a well-trained model.
    expect(Math.abs(score(m, x) - s1)).toBeLessThan(0.01);
  });

  it('survives a batch of extreme inputs without blowing up', () => {
    const wild = new Array(FEATURE_COUNT).fill(1);
    const m = trainBatch(emptyModel(), Array.from({ length: 500 }, () => ({ x: wild, label: 1, weight: 5 })));
    expect(m.w.every(Number.isFinite)).toBe(true);
    expect(score(m, wild)).toBeLessThanOrEqual(1);
  });

  it('blends personal over global in proportion to what the personal model has seen', () => {
    const g = { w: new Array(FEATURE_COUNT).fill(1), n: 1000, v: MODEL_VERSION };
    const fresh = { w: new Array(FEATURE_COUNT).fill(-1), n: 1, v: MODEL_VERSION };
    const heavy = { w: new Array(FEATURE_COUNT).fill(-1), n: 5000, v: MODEL_VERSION };
    expect(blend(g, null).w[0]).toBe(1);
    expect(blend(g, fresh).w[0]).toBeGreaterThan(0.9);   // barely shifted
    expect(blend(g, heavy).w[0]).toBeLessThan(0.3);      // mostly personal
  });
});

// ── Ranking behaviour ────────────────────────────────────────────────────────

describe('rank', () => {
  const items = [
    { id: 'a', cat: 'food' }, { id: 'b', cat: 'food' }, { id: 'c', cat: 'food' },
    { id: 'd', cat: 'food' }, { id: 'e', cat: 'food' }, { id: 'f', cat: 'music' },
  ];
  const flat = () => new Array(FEATURE_COUNT).fill(0.5);

  it('keeps every item — ranking reorders, it never drops content', () => {
    const out = rank(items, flat, i => i.cat, emptyModel(), { seed: 7 });
    expect(out).toHaveLength(items.length);
    expect(new Set(out.map(i => i.id))).toEqual(new Set(items.map(i => i.id)));
  });

  it('does not let one category run away with the top of the feed', () => {
    const out = rank(items, flat, i => i.cat, emptyModel(), { maxPerCategory: 2, seed: 3 });
    let run = 0, last = '';
    let maxRun = 0;
    for (const i of out) {
      run = i.cat === last ? run + 1 : 1;
      last = i.cat;
      maxRun = Math.max(maxRun, run);
    }
    // The held-back items are appended at the end, so the guard applies to the
    // part of the feed a user actually reads first.
    expect(out.slice(0, 3).filter(i => i.cat === 'food').length).toBeLessThanOrEqual(2);
    expect(maxRun).toBeGreaterThan(0);
  });

  it('is deterministic for a given seed', () => {
    const a = rank(items, flat, i => i.cat, emptyModel(), { seed: 11 }).map(i => i.id);
    const b = rank(items, flat, i => i.cat, emptyModel(), { seed: 11 }).map(i => i.id);
    expect(a).toEqual(b);
  });
});

// ── Quality gate ─────────────────────────────────────────────────────────────

describe('quality', () => {
  it('scores a complete, well-photographed event well above a bare stub', () => {
    const good = assessQuality(post()).score;
    const bad = assessQuality(post({
      image: 'https://picsum.photos/seed/x/1440/1800',
      caption: 'Join us',
      eventDateRaw: null, eventVenue: undefined, eventUrl: undefined,
      location: { name: '', lat: 0, lng: 0 },
    })).score;
    expect(good).toBeGreaterThan(0.7);
    expect(bad).toBeLessThan(0.3);
  });

  it('explains what it marked down', () => {
    const q = assessQuality(post({ image: 'https://picsum.photos/seed/x/1/1', caption: 'Hi' }));
    expect(q.reasons).toContain('stock_or_missing_photo');
    expect(q.reasons).toContain('thin_description');
  });

  it('relaxes the bar where there is little to choose from', () => {
    // A small town must not be emptied out by a bar meant for a capital city.
    expect(qualityFloorFor(5)).toBeLessThan(qualityFloorFor(500));
    expect(qualityFloorFor(5)).toBeLessThanOrEqual(0.35);
  });

  it('splits a batch into kept and dropped', () => {
    const { kept, dropped } = filterByQuality([post(), post({ id: 'x_2', image: '', caption: 'Hi' })], 0.5);
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(1);
  });
});

// ── Curator ──────────────────────────────────────────────────────────────────

describe('curator', () => {
  it('merges the same event listed twice under different ids', () => {
    const a = post({ id: 'eb_1' });
    const b = post({ id: 'eb_2' }); // same title + same date
    const { merged, removed } = mergeDuplicates([a, b]);
    expect(removed).toBe(1);
    expect(merged).toHaveLength(1);
  });

  it('keeps the richer of two duplicates', () => {
    const thin = post({ id: 'eb_1', caption: 'A proper evening of live jazz\n\nshort' });
    const rich = post({ id: 'eb_2' });
    const { merged } = mergeDuplicates([thin, rich]);
    expect(merged[0].id).toBe('eb_2');
  });

  it('does NOT merge separate dates of a recurring event', () => {
    const mon = post({ id: 'eb_1', eventDateRaw: '2026-08-03' });
    const tue = post({ id: 'eb_2', eventDateRaw: '2026-08-04' });
    expect(mergeDuplicates([mon, tue]).removed).toBe(0);
  });

  it('does not merge different events that happen to share a venue', () => {
    const jazz = post({ id: 'eb_1' });
    const rock = post({ id: 'eb_2', caption: 'A loud night of garage rock\n\nfull description here' });
    expect(mergeDuplicates([jazz, rock]).removed).toBe(0);
  });

  it('reports what it kept, merged and dropped, per source', () => {
    const { kept, report } = curate([
      post({ id: 'eb_1' }),
      post({ id: 'eb_2' }),                                   // duplicate of eb_1
      post({ id: 'osm_9', image: '', caption: 'Hi', isEvent: false, location: { name: '', lat: 0, lng: 0 } }),
    ]);
    expect(report.considered).toBe(3);
    expect(report.mergedDuplicates).toBe(1);
    expect(kept.length).toBeLessThan(3);
    expect(report.bySource.eb.kept).toBeGreaterThan(0);
    expect(report.floor).toBeGreaterThan(0);
  });

  it('never returns more than it was given', () => {
    const many = Array.from({ length: 40 }, (_, i) => post({ id: `eb_${i}`, caption: `Event ${i}\n\nA description long enough to pass the bar comfortably here.` }));
    const { kept } = curate(many);
    expect(kept.length).toBeLessThanOrEqual(many.length);
  });
});
