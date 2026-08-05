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
// Images
// ─────────────────────────────────────────────────────────────────────────────
//
// There is deliberately no keyword photo lookup here any more. Unsplash and
// Pexels were queried with the post's CATEGORY ("cozy restaurant interior
// dinner table"), so every restaurant on earth without its own photo drew from
// the same twenty results — which is how unrelated posts ended up sharing a
// picture that belonged to neither of them. picsum went further and served an
// unrelated photograph on purpose.
//
// A post now shows a photo of its own subject or no photo at all. See
// `realImage.ts` for the gate, and `PostImage` for the designed empty state.
