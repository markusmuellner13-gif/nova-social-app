'use client';

// The browser half of Nova Brain.
//
// It does three things:
//   1. keeps a PERSONAL model trained only on this device's behaviour;
//   2. batches anonymous feature vectors up to the shared model so everyone
//      benefits from what everyone learns;
//   3. ranks the feed with the blend of the two.
//
// All of it is fail-soft. If the network is down, the personal model still
// trains and still ranks; if localStorage is full, ranking falls back to the
// global weights; if neither exists, the feed is ordered exactly as it was
// before the brain shipped.

import type { Post } from '@/types';
import type { ApiPost } from '@/lib/sources/shared';
import { apiUrl } from '@/lib/apiBase';
import {
  extractFeatures, sourceOf, FEATURE_COUNT,
  type FeatureContext, type FeatureVector,
} from './features';
import {
  blend, emptyModel, isUsable, rank, train, EVENT_WEIGHTS, type Model,
} from './ranker';
import { loadPersonalModel, savePersonalModel } from './store';

// ── Model state ──────────────────────────────────────────────────────────────

let globalModel: Model = emptyModel();
let personalModel: Model | null = null;
let ready = false;

/** Fetch the shared weights once per session; safe to call repeatedly. */
export async function initBrain(): Promise<void> {
  if (ready) return;
  ready = true;
  personalModel = loadPersonalModel();
  try {
    const res = await fetch(apiUrl('/api/brain/feedback'));
    if (res.ok) {
      const m = await res.json() as Model;
      if (isUsable(m)) globalModel = m;
    }
  } catch { /* offline — personal model alone is fine */ }
}

function activeModel(): Model {
  return blend(globalModel, personalModel);
}

// ── Feature context ──────────────────────────────────────────────────────────

let reliability: Record<string, number> = {};
let affinity: Record<string, number> = {};

/** Feed the brain what the app already knows about this user's tastes. */
export function setBrainContext(opts: {
  categoryAffinity?: Record<string, number>;
  sourceReliability?: Record<string, number>;
}): void {
  if (opts.categoryAffinity) affinity = opts.categoryAffinity;
  if (opts.sourceReliability) reliability = opts.sourceReliability;
}

function context(localKm: number): FeatureContext {
  return {
    hour: new Date().getHours(),
    localKm: localKm > 0 ? localKm : 20,
    today: new Date().toISOString().slice(0, 10),
    sourceReliability: (id) => reliability[sourceOf(id)] ?? 0.5,
    categoryAffinity: (cat) => (affinity[cat] ?? 50) / 100,
  };
}

const featureCache = new WeakMap<object, FeatureVector>();

function featuresFor(post: Post, localKm: number): FeatureVector {
  const cached = featureCache.get(post as unknown as object);
  if (cached) return cached;
  const x = extractFeatures(post as unknown as ApiPost, context(localKm));
  featureCache.set(post as unknown as object, x);
  return x;
}

// ── Ranking ──────────────────────────────────────────────────────────────────

/**
 * Order posts by predicted engagement. Returns the input untouched while the
 * model is still untrained, so a fresh install sees the server's own ordering
 * (soonest events first) rather than the output of a model that knows nothing.
 */
export function rankPosts(posts: Post[], localKm = 20, seed = 1): Post[] {
  const model = activeModel();
  if (model.n < 25 || posts.length < 4) return posts;
  return rank(
    posts,
    p => featuresFor(p, localKm),
    p => p.category ?? '',
    model,
    { maxPerCategory: 3, explore: 0.12, seed },
  );
}

// ── Learning ─────────────────────────────────────────────────────────────────

const pending: { x: FeatureVector; action: string }[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Record what a user did with a post. Trains the personal model immediately
 * (so the very next scroll already reflects it) and queues the anonymous
 * feature vector for the shared model.
 */
export function recordInteraction(post: Post, action: keyof typeof EVENT_WEIGHTS | string, localKm = 20): void {
  const w = EVENT_WEIGHTS[action];
  if (w === undefined) return;
  const x = featuresFor(post, localKm);
  if (x.length !== FEATURE_COUNT) return;

  const base = personalModel && isUsable(personalModel) ? personalModel : emptyModel();
  personalModel = train(base, x, w > 0 ? 1 : 0, Math.abs(w));
  savePersonalModel(personalModel);

  pending.push({ x, action });
  scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer || pending.length === 0) return;
  // Send when the batch is worth sending, or after a lull — never per tap.
  const delay = pending.length >= 20 ? 0 : 15_000;
  flushTimer = setTimeout(() => { flushTimer = null; void flushBrain(); }, delay);
}

/** Push queued samples to the shared model. Safe to call any time. */
export async function flushBrain(): Promise<void> {
  if (pending.length === 0) return;
  const samples = pending.splice(0, 100);
  try {
    await fetch(apiUrl('/api/brain/feedback'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ samples }),
      keepalive: true,
    });
  } catch {
    // Network down — drop rather than retrying forever. Losing a few training
    // samples costs nothing; a growing unbounded queue would cost memory.
  }
}

/** How much this device's model has learned — surfaced in the profile screen. */
export function brainStats(): { personal: number; global: number } {
  return { personal: personalModel?.n ?? 0, global: globalModel.n };
}
