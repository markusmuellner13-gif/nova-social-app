import type { Post } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Shareable event links (#6)
//
// Every event becomes a public, link-previewable page at /e/<id>?d=<payload>.
// The essential fields are packed into a base64url payload in the URL, so the
// public page renders rich Open Graph tags (title, image, description) — making
// links shared to WhatsApp / Instagram / iMessage look great — WITHOUT needing a
// database round-trip. This is Nova's main free growth loop: every share is an ad.
// ─────────────────────────────────────────────────────────────────────────────

export interface SharePayload {
  t: string;   // title
  i: string;   // image url
  d: string;   // date label
  v: string;   // venue
  c: string;   // city / location name
  u: string;   // external event url
  g: string;   // category
  p: string;   // price
}

function toBase64Url(s: string): string {
  const b64 = typeof btoa !== 'undefined'
    ? btoa(unescape(encodeURIComponent(s)))
    : Buffer.from(s, 'utf-8').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof atob !== 'undefined') return decodeURIComponent(escape(atob(b64)));
  return Buffer.from(b64, 'base64').toString('utf-8');
}

export function encodeSharePayload(post: Post): string {
  const payload: SharePayload = {
    t: (post.caption.split('\n')[0] || post.organizer || 'Event on Nova').slice(0, 120),
    i: post.image?.slice(0, 400) ?? '',
    d: post.eventDate ?? '',
    v: post.eventVenue ?? post.location?.name ?? '',
    c: post.location?.name ?? '',
    u: post.eventUrl ?? '',
    g: post.category ?? '',
    p: post.price ?? '',
  };
  return toBase64Url(JSON.stringify(payload));
}

export function decodeSharePayload(encoded: string): SharePayload | null {
  try {
    const obj = JSON.parse(fromBase64Url(encoded)) as Partial<SharePayload>;
    if (!obj || typeof obj.t !== 'string') return null;
    return {
      t: obj.t ?? '', i: obj.i ?? '', d: obj.d ?? '', v: obj.v ?? '',
      c: obj.c ?? '', u: obj.u ?? '', g: obj.g ?? '', p: obj.p ?? '',
    };
  } catch { return null; }
}

// Build the full shareable Nova URL for a post.
export function buildShareUrl(post: Post, origin: string): string {
  const id = encodeURIComponent(post.id);
  return `${origin}/e/${id}?d=${encodeSharePayload(post)}`;
}
