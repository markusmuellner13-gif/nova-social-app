// The ranking model — an online logistic-regression classifier that predicts
// "will this user engage with this post?" and is trained by gradient descent on
// real engagement.
//
// This is genuinely trained, not a hand-tuned score: the weights start at zero
// and every observed impression, tap, save, RSVP and ticket click nudges them.
// It is NOT a language model — Nova can't train one of those, and pretending
// otherwise would be a lie. What it IS: a real, continuously-learning model that
// gets measurably better at ordering the feed the more the app is used, small
// enough to update on every interaction and to run on the edge.
//
// Two layers cooperate:
//   • a GLOBAL model, trained on everyone, stored in Redis — good defaults for a
//     brand-new user from their very first session;
//   • a PERSONAL model in localStorage, trained only on this user, blended over
//     the global one so the feed adapts to an individual without needing an
//     account or sending behaviour anywhere.

import { FEATURE_COUNT, type FeatureVector } from './features';

export interface Model {
  w: number[];
  /** How many training examples this model has seen. */
  n: number;
  /** Schema version — a change here retires incompatible stored weights. */
  v: number;
}

export const MODEL_VERSION = 1;

/** Positive engagement is much rarer than an impression; weight it accordingly. */
export const EVENT_WEIGHTS: Record<string, number> = {
  impression: -0.06, // a card seen and scrolled past is weak negative evidence
  open: 0.5,
  like: 1,
  save: 1.2,
  going: 1.5,
  ticket_click: 1.5,
  share: 1.2,
  hide: -1.5,
};

export function emptyModel(): Model {
  return { w: new Array(FEATURE_COUNT).fill(0), n: 0, v: MODEL_VERSION };
}

export function isUsable(m: Model | null | undefined): m is Model {
  return Boolean(
    m && m.v === MODEL_VERSION && Array.isArray(m.w) && m.w.length === FEATURE_COUNT
    && m.w.every(x => Number.isFinite(x))
  );
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));

export function dot(w: number[], x: FeatureVector): number {
  let s = 0;
  for (let i = 0; i < w.length && i < x.length; i++) s += w[i] * x[i];
  return s;
}

/** Predicted probability of engagement, 0–1. */
export function score(model: Model, x: FeatureVector): number {
  return sigmoid(dot(model.w, x));
}

/**
 * One SGD step of logistic regression with L2 regularisation.
 *
 * `label` is 1 for engagement and 0 for a plain impression; `weight` scales the
 * step so a "going" counts for far more than a scroll-past. The learning rate
 * decays as the model matures, so early examples move it quickly and later ones
 * refine it — that is what stops a handful of taps from swinging a well-trained
 * model, and it is why the model genuinely converges instead of oscillating.
 */
export function train(
  model: Model, x: FeatureVector, label: number, weight = 1,
  opts: { l2?: number; lr0?: number } = {}
): Model {
  const l2 = opts.l2 ?? 1e-4;
  const lr0 = opts.lr0 ?? 0.08;
  const lr = lr0 / (1 + model.n / 800);
  const p = score(model, x);
  const err = (label - p) * weight;
  const w = model.w.slice();
  for (let i = 0; i < w.length; i++) {
    const grad = err * (x[i] ?? 0) - l2 * w[i];
    w[i] += lr * grad;
    if (!Number.isFinite(w[i])) w[i] = 0;
    // Keep weights in a sane band so one pathological batch can't blow up the model.
    w[i] = Math.max(-8, Math.min(8, w[i]));
  }
  return { w, n: model.n + 1, v: MODEL_VERSION };
}

/** Apply a batch of examples in one go (used by the nightly training pass). */
export function trainBatch(
  model: Model, batch: { x: FeatureVector; label: number; weight?: number }[]
): Model {
  return batch.reduce((m, b) => train(m, b.x, b.label, b.weight ?? 1), model);
}

/**
 * Blend the shared model with this user's own. `personalWeight` grows with how
 * much the personal model has actually seen, so a new user rides on the global
 * model and a heavy user is ranked mostly by their own behaviour.
 */
export function blend(globalModel: Model, personal: Model | null): Model {
  if (!isUsable(personal) || personal.n === 0) return globalModel;
  const pw = Math.min(0.75, personal.n / (personal.n + 120));
  const w = globalModel.w.map((g, i) => g * (1 - pw) + (personal.w[i] ?? 0) * pw);
  return { w, n: globalModel.n + personal.n, v: MODEL_VERSION };
}

/**
 * Order posts by predicted engagement, with a diversity guard: at most
 * `maxPerCategory` in a row from the same category, so a well-trained model
 * can't collapse the feed into twenty restaurants. Exploration keeps a slice of
 * lower-scoring posts in play so the model keeps learning about things it
 * currently underrates instead of only ever confirming itself.
 */
export function rank<T>(
  items: T[],
  featuresOf: (item: T) => FeatureVector,
  categoryOf: (item: T) => string,
  model: Model,
  opts: { maxPerCategory?: number; explore?: number; seed?: number } = {}
): T[] {
  const maxRun = opts.maxPerCategory ?? 3;
  const explore = opts.explore ?? 0.12;
  let seed = (opts.seed ?? 1) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  const scored = items.map(item => ({
    item,
    category: categoryOf(item),
    // A small deterministic jitter is the exploration term: it occasionally
    // promotes a post the model is unsure about, which is how the model gets
    // training signal outside its current beliefs.
    s: score(model, featuresOf(item)) + (rnd() - 0.5) * explore,
  })).sort((a, b) => b.s - a.s);

  const out: typeof scored = [];
  const held: typeof scored = [];
  let lastCat = '';
  let run = 0;
  for (const entry of scored) {
    if (entry.category === lastCat && run >= maxRun) { held.push(entry); continue; }
    if (entry.category === lastCat) run++; else { lastCat = entry.category; run = 1; }
    out.push(entry);
  }
  return [...out, ...held].map(e => e.item);
}
