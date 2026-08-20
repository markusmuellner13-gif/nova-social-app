// ─────────────────────────────────────────────────────────────────────────────
// Getting the data OUT of the page, before anyone tries to understand it.
//
// Almost every modern listing site — whatever framework it is written in —
// ships its data as JSON inside the HTML it serves to a plain fetch, because
// that is how server-side rendering hydrates the client. That is the crack we
// read through: no browser, no JS execution, no API key.
//
// Four places worth looking, in rough order of how clean the data is:
//   ld+json       schema.org, the publisher meant it to be machine-read
//   next-data     Next.js hands its whole page props tree over
//   json-script   generic <script type="application/json"> islands
//   inline-state  window.__NUXT__ / __INITIAL_STATE__ / __APOLLO_STATE__
//
// Everything here is bounded (payload size, count, nesting) and fail-soft: a
// page that yields nothing is normal, not an error.
// ─────────────────────────────────────────────────────────────────────────────

import type { Payload, PayloadSource } from './types';

/** Refuse to JSON.parse anything bigger than this — a 4MB blob is a tarpit. */
const MAX_PAYLOAD_CHARS = 3_000_000;
/** Stop after this many payloads; pages with hundreds of json islands exist. */
const MAX_PAYLOADS = 40;

/** All <script> blocks with their attributes, cheaply and without a DOM. */
function* scriptBlocks(html: string): Generator<{ attrs: string; body: string }> {
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    yield { attrs: m[1] ?? '', body: m[2] ?? '' };
  }
}

function attr(attrs: string, name: string): string | undefined {
  const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m?.[1];
}

function parseJson(text: string): unknown {
  const t = text.trim();
  if (!t || t.length > MAX_PAYLOAD_CHARS) return undefined;
  if (t[0] !== '{' && t[0] !== '[') return undefined;
  try { return JSON.parse(t); } catch { return undefined; }
}

/**
 * Salvage individual objects from a block that isn't valid JSON as a whole.
 * Publishers concatenate several JSON-LD objects into one script tag, or leave
 * a trailing comma; one bad character shouldn't cost us the entire page.
 */
function salvageObjects(text: string, out: unknown[]): void {
  for (const chunk of text.match(/\{[\s\S]*?\}(?=\s*[,\]]|\s*$)/g) ?? []) {
    const v = parseJson(chunk);
    if (v !== undefined) out.push(v);
    if (out.length > 50) return;
  }
}

/**
 * `window.__NUXT__ = {...};` and friends. We take the balanced brace span after
 * the `=` rather than a lazy regex, because these blobs contain every kind of
 * bracket inside strings and a naive match truncates them into garbage.
 */
function inlineStateBlobs(js: string): string[] {
  const out: string[] = [];
  const re = /\b(?:window\.)?(__NUXT__|__INITIAL_STATE__|__APOLLO_STATE__|__PRELOADED_STATE__|__data)\s*=\s*(?=[{[])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(js)) !== null && out.length < 4) {
    const span = balancedSpan(js, m.index + m[0].length);
    if (span) out.push(span);
  }
  return out;
}

/**
 * Read one balanced {...} / [...] starting at `start`, respecting string
 * literals and escapes so a brace inside a caption can't end the span early.
 */
export function balancedSpan(src: string, start: number): string | null {
  const open = src[start];
  if (open !== '{' && open !== '[') return null;
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr: string | null = null, escaped = false;
  for (let i = start; i < src.length && i - start < MAX_PAYLOAD_CHARS; i++) {
    const c = src[i];
    if (inStr) {
      if (escaped) { escaped = false; continue; }
      if (c === '\\') { escaped = true; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") { inStr = c; continue; }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

/** Every JSON payload we can find in the page, tagged with where it came from. */
export function harvestPayloads(html: string): Payload[] {
  const out: Payload[] = [];
  if (!html) return out;

  for (const { attrs, body } of scriptBlocks(html)) {
    if (out.length >= MAX_PAYLOADS) break;
    const type = (attr(attrs, 'type') ?? '').toLowerCase();
    const id = attr(attrs, 'id');

    let source: PayloadSource | null = null;
    if (type.includes('ld+json')) source = 'ld+json';
    else if (id === '__NEXT_DATA__') source = 'next-data';
    else if (type === 'application/json' || type === 'text/json') source = 'json-script';

    if (source) {
      const data = parseJson(body);
      if (data !== undefined) { out.push({ source, id, data }); continue; }
      // Invalid as a whole — salvage what we can, but only for JSON-LD where
      // concatenated objects are a known publisher habit.
      if (source === 'ld+json') {
        const salvaged: unknown[] = [];
        salvageObjects(body, salvaged);
        for (const data2 of salvaged) out.push({ source, id, data: data2 });
      }
      continue;
    }

    // Untyped/classic script — the only thing we want is assigned app state.
    if (!type || type.includes('javascript')) {
      if (body.length > MAX_PAYLOAD_CHARS) continue;
      for (const blob of inlineStateBlobs(body)) {
        const data = parseJson(blob);
        if (data !== undefined) out.push({ source: 'inline-state', data });
      }
    }
  }

  return out;
}

/** Follow a learned path into a payload. Returns undefined on any mismatch. */
export function walkPath(root: unknown, path: string[]): unknown {
  let cur: unknown = root;
  for (const step of path) {
    if (cur === null || cur === undefined) return undefined;
    if (Array.isArray(cur)) {
      const i = Number(step);
      if (!Number.isInteger(i) || i < 0 || i >= cur.length) return undefined;
      cur = cur[i];
    } else if (typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[step];
    } else {
      return undefined;
    }
  }
  return cur;
}

/** Meta tags (og:*, twitter:*, name=*) as a flat map — the last-resort reader. */
export function harvestMeta(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const head = html.slice(0, 200_000);
  const re = /<meta\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(head)) !== null) {
    const attrs = m[1] ?? '';
    const key = attr(attrs, 'property') ?? attr(attrs, 'name') ?? attr(attrs, 'itemprop');
    const value = attr(attrs, 'content');
    if (key && value && !(key in out)) out[key.toLowerCase()] = value;
  }
  return out;
}
