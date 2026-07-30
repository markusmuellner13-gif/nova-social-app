// Shared helpers and the post shape returned by every feed source.
// Server-side only — used by /api/events and /api/feed.

export interface ApiPost {
  id: string;
  user: {
    id: string;
    name: string;
    username: string;
    avatar: string;
    bio: string;
    followers: number;
    following: number;
    posts: number;
    verified: boolean;
  };
  image: string;
  images?: string[]; // optional gallery (multiple real photos) for a carousel
  caption: string;
  likes: number;
  comments: number;
  category: string;
  hashtags: string[];
  timestamp: number;
  location: { name: string; lat: number; lng: number };
  saved: boolean;
  liked: boolean;
  isEvent: boolean;
  isAIGenerated: boolean;
  eventDate?: string;
  eventDateRaw?: string | null;
  eventVenue?: string;
  eventUrl?: string;
  organizer?: string;
  price?: string;
  distanceKm?: number;
}

export function fallbackAvatar(name: string) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const colors = ['8b5cf6', 'ec4899', '3b82f6', 'f97316', '22c55e', 'f43f5e', 'a855f7', '06b6d4'];
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${colors[name.charCodeAt(0) % colors.length]}&color=fff&size=80&bold=true`;
}

// Clearbit's free logo API was retired — logo.clearbit.com no longer resolves,
// so every organiser avatar was a dead request that fell through to the letter
// avatar anyway. Google's favicon service is still up and needs no key; the
// Avatar component falls back to a gradient monogram if it 404s.
export function logoUrl(domain: string) {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
}

export function makeUser(name: string, domain?: string) {
  // Strip diacritics before slugifying, otherwise "Grünbergstraße" turns into
  // the unreadable handle "gr.nbergstra.e" (every non-ASCII letter became a dot).
  const slug = name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/gi, 'ss').replace(/ø/gi, 'o').replace(/æ/gi, 'ae').replace(/ð/gi, 'd').replace(/þ/gi, 'th')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')
    .slice(0, 30);
  return {
    id: `org_${slug}`,
    name,
    username: slug,
    avatar: domain ? logoUrl(domain) : fallbackAvatar(name),
    bio: `Official Nova partner — ${name}`,
    followers: 0,
    following: 0,
    posts: 0,
    verified: true,
  };
}

// High-res 4:5 portrait. Bumped from 600×750 → 1080×1350 so event cards look
// crisp on modern high-DPI phones.
export function picsumUrl(seed: string) {
  return `https://picsum.photos/seed/${seed.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 32)}/1440/1800`;
}

// Pull the real, high-quality hero image a page advertises to social crawlers
// (og:image / twitter:image / link rel=image_src). This is how we get the
// ACTUAL event photo rather than a stock stand-in. Fail-soft → null.
export async function fetchOgImage(pageUrl: string, timeoutMs = 4500): Promise<string | null> {
  if (!pageUrl || !/^https?:\/\//.test(pageUrl)) return null;
  try {
    const res = await fetch(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NovaBot/1.0; +https://nova-app.com)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 120_000); // <head> is near the top
    const patterns = [
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m?.[1]) {
        let src = m[1].trim().replace(/&amp;/g, '&');
        if (src.startsWith('//')) src = `https:${src}`;
        if (/^https?:\/\//.test(src)) return src;
      }
    }
    return null;
  } catch { return null; }
}

// Sources now store the ORIGINAL absolute image URL. Proxying, resolution
// upgrading and resizing all happen at render time (`PostImage` → the sized
// /api/image-proxy), which means:
//   • the same stored post works on the web and inside the native shell, where a
//     root-relative "/api/…" URL would point at the Capacitor bundle, not the API;
//   • every row already in the events DB gets the new high-res pipeline for free,
//     with no re-ingestion;
//   • share/OG previews get a real absolute URL instead of a relative one.
// Kept as a function so the call sites (and their intent) stay unchanged.
export function proxyImage(url: string): string {
  return url;
}

export function todayStr() { return new Date().toISOString().split('T')[0]; }

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Attach distance from the user to every post that has real coordinates
export function withDistance(posts: ApiPost[], userLat: number, userLng: number): ApiPost[] {
  return posts.map(p => {
    const { lat, lng } = p.location ?? { lat: 0, lng: 0 };
    if (!lat && !lng) return p;
    const d = haversineKm(userLat, userLng, lat, lng);
    if (!Number.isFinite(d) || d > 5000) return p;
    return { ...p, distanceKm: Math.round(d * 10) / 10 };
  });
}

// Cross-source dedupe — the same concert often appears on Ticketmaster AND
// Eventbrite. Key: normalised title + event date (or venue for places).
function dedupeKey(p: ApiPost): string {
  const title = (p.caption.split('\n')[0] || p.organizer || p.id)
    .toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
  return `${title}|${p.eventDateRaw ?? p.location?.name ?? ''}`;
}

export function dedupePosts(posts: ApiPost[]): ApiPost[] {
  const seen = new Set<string>();
  const out: ApiPost[] = [];
  for (const p of posts) {
    const key = dedupeKey(p);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

// Drop events whose date already passed
export function dropExpired(posts: ApiPost[]): ApiPost[] {
  const today = todayStr();
  return posts.filter(p => !p.eventDateRaw || p.eventDateRaw >= today);
}

// ─────────────────────────────────────────────────────────────────────────────
// Image helpers — Unsplash → Pexels → picsum
// ─────────────────────────────────────────────────────────────────────────────

async function fetchUnsplashImage(query: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=portrait&content_filter=high`,
      { headers: { Authorization: `Client-ID ${key}` }, signal: AbortSignal.timeout(3500) }
    );
    if (!res.ok) return null;
    const d = await res.json() as { urls?: { raw?: string; regular?: string } };
    // Use raw URL with explicit crop dimensions for perfect 4:5 portrait framing
    const base = d.urls?.raw ?? d.urls?.regular;
    if (!base) return null;
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}auto=format&fit=crop&w=1440&h=1800&q=85&crop=faces,entropy`;
  } catch { return null; }
}

// Small deterministic hash so a given post always maps to the SAME photo in a
// result set (stable across reloads) while DIFFERENT posts pick different ones —
// this is what stops twenty restaurants all sharing the one top stock photo.
function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

async function fetchPexelsImage(query: string, key: string, seed?: string): Promise<string | null> {
  try {
    // Pull a page of candidates (not just the first) so different posts on the
    // same query can each take a different, relevant photo.
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=20&orientation=portrait`,
      { headers: { Authorization: key }, signal: AbortSignal.timeout(3500) }
    );
    if (!res.ok) return null;
    const d = await res.json() as { photos?: { src?: { large2x?: string; large?: string } }[] };
    const photos = d.photos ?? [];
    if (photos.length === 0) return null;
    const idx = seed ? hashSeed(seed) % photos.length : 0;
    const src = photos[idx]?.src ?? photos[0]?.src;
    const base = src?.large2x ?? src?.large;
    if (!base) return null;
    // Pexels supports ?w=&h=&fit=crop via their CDN
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}w=1440&h=1800&fit=crop`;
  } catch { return null; }
}

export async function getImage(query: string, unsplashKey?: string, pexelsKey?: string, seed?: string): Promise<string> {
  if (unsplashKey) { const u = await fetchUnsplashImage(query, unsplashKey); if (u) return proxyImage(u); }
  if (pexelsKey)   { const u = await fetchPexelsImage(query, pexelsKey, seed); if (u) return proxyImage(u); }
  return picsumUrl(seed ?? query);
}

// Final safety net so NO two posts in a single feed response share an image. Real
// venue photos (OSM/Places/og:image) are kept as-is; only a genuine collision
// (usually a repeated stock fallback) is broken by re-seeding that post to a
// unique deterministic image. Keeps the feed feeling curated, never copy-pasted.
export function ensureUniqueImages<T extends { id: string; image: string }>(posts: T[]): T[] {
  const seen = new Set<string>();
  return posts.map(p => {
    const img = p.image ?? '';
    if (img && !seen.has(img)) { seen.add(img); return p; }
    let next = picsumUrl(p.id);
    let n = 0;
    while (seen.has(next) && n < 5) { next = picsumUrl(`${p.id}_${n++}`); }
    seen.add(next);
    return { ...p, image: next };
  });
}
