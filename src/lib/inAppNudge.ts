// ─────────────────────────────────────────────────────────────────────────────
// The in-app nudge: "something new landed that you actually care about".
//
// This is the notification that fires while the app is open, and it had three
// problems that together made it the annoying one:
//
//   1. IT REPEATED. The only thing stopping a repeat was a ref inside the feed
//      component, so every remount (switching tabs and back) reset it and the
//      same post announced itself again, forever.
//   2. IT QUOTED THE SOURCE. The body was the post's own first caption line, so
//      an English-speaking user in Vienna got a notification in German — or, as
//      happened with a listing that leaked in from another country, in Hindi.
//   3. IT WASN'T EARNED. "Category is in your top three" was the whole test, so
//      a photoless, dateless listing was as notification-worthy as tonight's
//      headline act.
//
// So: dedupe PERSISTS across mounts and reloads, the copy comes from pushCopy
// in the user's own language with no source text in it at all, and a post has
// to actually score to interrupt someone.
//
// Pure and framework-free apart from an explicitly-injected store → testable.
// ─────────────────────────────────────────────────────────────────────────────

import { buildLocalisedPush, type PushKind } from './pushCopy';
import type { Locale } from './translations';

/** The minimum a post must expose for us to consider interrupting the user. */
export interface NudgeCandidate {
  id: string;
  category: string;
  /** A photo of ITS OWN subject — a designed cover doesn't count. */
  hasPhoto: boolean;
  eventDateRaw?: string | null;
  isEvent?: boolean;
}

export interface NudgeMemory {
  /** Ids we have already announced. Capped — see MAX_REMEMBERED. */
  notified: string[];
  /** When we last interrupted the user, epoch ms. */
  lastAt: number;
}

export const EMPTY_MEMORY: NudgeMemory = { notified: [], lastAt: 0 };

/** Two notifications inside this window is pestering, whatever the content. */
export const MIN_GAP_MS = 45 * 60 * 1000;
/** Enough history that a feed cycling through ~100 posts can't wrap around. */
const MAX_REMEMBERED = 400;

/**
 * Is this post worth interrupting for, and how strongly?
 *
 * Returns 0 for "no". The bar is deliberately above "it exists": an interest
 * match is necessary but not sufficient, because the feed is already filtered
 * to the user's interests — everything in it would pass that test alone.
 */
export function nudgeScore(
  post: NudgeCandidate, topCategories: string[], now = new Date(),
): number {
  if (!topCategories.includes(post.category)) return 0;

  let score = 1;
  if (post.hasPhoto) score += 1.5;

  if (post.eventDateRaw) {
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const day = new Date(`${post.eventDateRaw}T00:00:00`);
    const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);
    if (days < 0) return 0;                      // already happened
    if (days === 0) score += 2.5;                // on today
    else if (days <= 2) score += 1.5;
    else if (days <= 7) score += 0.75;
  } else if (!post.isEvent) {
    // A place isn't news the way a dated event is. It can still win, but it has
    // to do it on the photo and the interest match alone.
    score -= 0.5;
  }

  return Math.max(0, score);
}

/** Which phrasing fits the moment — the same kinds the push digest uses. */
export function nudgeKind(pick: NudgeCandidate, now = new Date()): PushKind {
  const hour = now.getHours();
  const isToday = (() => {
    if (!pick.eventDateRaw) return false;
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const day = new Date(`${pick.eventDateRaw}T00:00:00`);
    return Math.round((day.getTime() - today.getTime()) / 86_400_000) === 0;
  })();

  if (isToday && hour >= 16) return 'tonight';
  if (isToday) return 'today';
  if (pick.eventDateRaw) {
    const dow = now.getDay();
    if (dow === 4 || dow === 5) return 'weekend';
  }
  return 'nearby';
}

export interface NudgeDecision {
  post: NudgeCandidate;
  kind: PushKind;
  /** How many NEW qualifying posts this nudge stands for. Always real. */
  count: number;
  title: string;
  body: string;
}

/**
 * Pick at most one post to announce.
 *
 * Everything that makes this quiet rather than noisy lives here: the memory of
 * what we already said, the gap since we last said anything, and the score bar.
 */
export function chooseNudge(opts: {
  candidates: NudgeCandidate[];
  topCategories: string[];
  memory: NudgeMemory;
  city: string;
  locale: Locale | string;
  now?: Date;
  minGapMs?: number;
}): NudgeDecision | null {
  const { candidates, topCategories, memory, city, locale } = opts;
  const now = opts.now ?? new Date();
  const minGap = opts.minGapMs ?? MIN_GAP_MS;

  if (now.getTime() - memory.lastAt < minGap) return null;

  const seen = new Set(memory.notified);
  const scored = candidates
    .filter(p => !seen.has(p.id))
    .map(p => ({ post: p, score: nudgeScore(p, topCategories, now) }))
    .filter(s => s.score >= 2)          // interest match + a real reason
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return null;

  const pick = scored[0].post;
  const kind = nudgeKind(pick, now);
  // The count has to be true — pushCopy renders it verbatim, so "3 things on
  // tonight" must mean three things are on tonight, not three posts arrived.
  const count = kind === 'tonight' || kind === 'today'
    ? scored.filter(s => s.post.eventDateRaw === pick.eventDateRaw).length
    : scored.length;

  const { title, body } = buildLocalisedPush(kind, { city, count, locale });
  return { post: pick, kind, count, title, body };
}

/** Record that we announced a post, keeping the memory bounded. */
export function rememberNudge(memory: NudgeMemory, id: string, now = Date.now()): NudgeMemory {
  const notified = [id, ...memory.notified.filter(x => x !== id)].slice(0, MAX_REMEMBERED);
  return { notified, lastAt: now };
}

// ── Persistence ──────────────────────────────────────────────────────────────
// Deliberately its own localStorage key rather than part of the encrypted app
// blob: it is not user data, it must survive a state reset, and reading it must
// never be able to throw inside a render.

const STORAGE_KEY = 'nova_nudge_memory';

export function loadNudgeMemory(): NudgeMemory {
  if (typeof window === 'undefined') return EMPTY_MEMORY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_MEMORY;
    const parsed = JSON.parse(raw) as Partial<NudgeMemory>;
    return {
      notified: Array.isArray(parsed.notified) ? parsed.notified.filter(x => typeof x === 'string') : [],
      lastAt: typeof parsed.lastAt === 'number' ? parsed.lastAt : 0,
    };
  } catch { return EMPTY_MEMORY; }
}

export function saveNudgeMemory(memory: NudgeMemory): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(memory)); } catch { /* quota/private mode */ }
}
