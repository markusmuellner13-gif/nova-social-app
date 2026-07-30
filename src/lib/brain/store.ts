// Where Nova Brain keeps what it has learned.
//
// The GLOBAL model lives in Redis so every instance and every cold start shares
// one set of weights. The PERSONAL model lives in the browser's localStorage —
// it never leaves the device, which means personalisation costs us no storage,
// no privacy surface and no GDPR headache.
//
// Both degrade to "untrained model" rather than throwing: with no Redis the app
// simply ranks by the global defaults, exactly as it did before the brain existed.

import { cacheGet, cacheSet } from '@/lib/serverCache';
import { emptyModel, isUsable, MODEL_VERSION, type Model } from './ranker';

const GLOBAL_KEY = `nova:brain:model:v${MODEL_VERSION}`;
const GLOBAL_TTL = 60 * 60 * 24 * 400; // ~13 months — the model should outlive a quiet period
const LOCAL_KEY = `nova_brain_model_v${MODEL_VERSION}`;

// ── Global (server) ──────────────────────────────────────────────────────────

export async function loadGlobalModel(): Promise<Model> {
  try {
    const m = await cacheGet<Model>(GLOBAL_KEY);
    return isUsable(m) ? m : emptyModel();
  } catch {
    return emptyModel();
  }
}

export async function saveGlobalModel(model: Model): Promise<void> {
  if (!isUsable(model)) return;
  try { await cacheSet(GLOBAL_KEY, model, GLOBAL_TTL); } catch { /* no Redis — fine */ }
}

// ── Personal (browser) ───────────────────────────────────────────────────────

export function loadPersonalModel(): Model | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return null;
    const m = JSON.parse(raw) as Model;
    return isUsable(m) ? m : null;
  } catch { return null; }
}

export function savePersonalModel(model: Model): void {
  if (typeof window === 'undefined' || !isUsable(model)) return;
  try { window.localStorage.setItem(LOCAL_KEY, JSON.stringify(model)); } catch { /* quota */ }
}

export function clearPersonalModel(): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ }
}
