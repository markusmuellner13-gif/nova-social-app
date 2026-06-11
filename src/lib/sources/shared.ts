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

export function logoUrl(domain: string) { return `https://logo.clearbit.com/${domain}`; }

export function makeUser(name: string, domain?: string) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '.').slice(0, 30);
  return {
    id: `org_${slug}`,
    name,
    username: slug,
    avatar: domain ? logoUrl(domain) : fallbackAvatar(name),
    bio: `Official Nova partner — ${name}`,
    followers: Math.floor(Math.random() * 5_000_000) + 10_000,
    following: 0,
    posts: Math.floor(Math.random() * 50_000) + 100,
    verified: true,
  };
}

export function picsumUrl(seed: string) {
  return `https://picsum.photos/seed/${seed.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 32)}/600/750`;
}

// Route rate-limited image sources (Unsplash, Pexels, Wikipedia) through our
// CDN-cached proxy so repeated views are served from edge cache, not the origin API.
export function proxyImage(url: string): string {
  if (!url) return url;
  if (
    url.includes('images.unsplash.com') ||
    url.includes('images.pexels.com')   ||
    url.includes('upload.wikimedia.org')
  ) {
    return `/api/image-proxy?url=${encodeURIComponent(url)}`;
  }
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
    return `${base}${sep}auto=format&fit=crop&w=600&h=750&q=80&crop=faces,entropy`;
  } catch { return null; }
}

async function fetchPexelsImage(query: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=3&orientation=portrait`,
      { headers: { Authorization: key }, signal: AbortSignal.timeout(3500) }
    );
    if (!res.ok) return null;
    const d = await res.json() as { photos?: { src?: { large2x?: string; large?: string } }[] };
    // Use large2x if available, then append crop params for perfect 4:5 framing
    const src = d.photos?.[0]?.src;
    const base = src?.large2x ?? src?.large;
    if (!base) return null;
    // Pexels supports ?w=&h=&fit=crop via their CDN
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}w=600&h=750&fit=crop`;
  } catch { return null; }
}

export async function getImage(query: string, unsplashKey?: string, pexelsKey?: string, seed?: string): Promise<string> {
  if (unsplashKey) { const u = await fetchUnsplashImage(query, unsplashKey); if (u) return proxyImage(u); }
  if (pexelsKey)   { const u = await fetchPexelsImage(query, pexelsKey);     if (u) return proxyImage(u); }
  return picsumUrl(seed ?? query);
}
