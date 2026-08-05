// The single authority on which photo a post is allowed to show.
//
// A post's photo must be a photo OF THAT POST'S SUBJECT — the venue's own
// picture, the event page's own poster, the landmark's own Commons file.
// Anything else is a STAND-IN: a keyword-matched stock photo, or a random
// filler image that merely looks nice.
//
// Stand-ins are why the same "cozy restaurant interior" turned up on a trattoria
// in Rome and a beisl in Vienna: the lookup key was the post's CATEGORY, not the
// post's subject, so every place in a category drew from the same tiny pool of
// twenty photos. Two unrelated posts sharing a photo is the tell — at most one
// of them could ever have been accurate, and usually neither was.
//
// The rule this module enforces: a real photo, or no photo. Never a stand-in.
// `PostImage` renders a designed cover for the empty case, which is honest —
// it is plainly graphic design and does not pretend to be a photograph.

import type { ApiPost } from './shared';

// Hosts that only ever serve generic imagery. Matched on the registrable host
// and any subdomain, so images./source./api.unsplash.com all count.
const STAND_IN_HOSTS =
  /^(?:[a-z0-9-]+\.)*(?:picsum\.photos|unsplash\.com|pexels\.com|ui-avatars\.com|placehold\.co|via\.placeholder\.com|placeholder\.com|dummyimage\.com|loremflickr\.com|placekitten\.com|fakeimg\.pl|lorempixel\.com)$/i;

/**
 * True when `url` is not a photograph of the post's own subject: missing,
 * relative, a data URI, or served by a known stock/filler host.
 */
export function isStandInImage(url: string | null | undefined): boolean {
  const s = (url ?? '').trim();
  if (!s || !/^https?:\/\//i.test(s)) return true;
  try {
    return STAND_IN_HOSTS.test(new URL(s).hostname);
  } catch {
    return true;
  }
}

/** The URL if it is a real photo of the subject, otherwise `''` (no photo). */
export function realImageUrl(url: string | null | undefined): string {
  const s = (url ?? '').trim();
  return isStandInImage(s) ? '' : s;
}

// ─────────────────────────────────────────────────────────────────────────────
// Photo identity — "are these two URLs the same photograph?"
// ─────────────────────────────────────────────────────────────────────────────

// One photo is referenced at many sizes across sources (`?width=1600` vs
// `?width=800`, `&w=1440&h=1800`, an imgix signature that changes with the
// crop). Keying duplicate detection on the raw URL would call those distinct
// and let the duplicate through, so render parameters are stripped first.
const RENDER_PARAMS = new Set([
  'w', 'h', 'width', 'height', 'maxwidth', 'maxheight', 'size', 'sz',
  'q', 'quality', 'fit', 'crop', 'auto', 'format', 'fm', 'dpr', 'rs', 'resize',
  's', 'ixlib', 'ixid', 'cs',
]);

/**
 * A stable key for "the same photograph", independent of the size it was
 * requested at. Falls back to the raw string for anything unparseable.
 */
export function imageIdentity(url: string): string {
  try {
    const u = new URL(url);
    // Wikimedia serves `/commons/thumb/a/ab/X.jpg/800px-X.jpg` alongside the
    // original `/commons/a/ab/X.jpg` — same file, two shapes of path.
    const path = u.pathname
      .replace(/\/thumb\//, '/')
      .replace(/\/\d+px-[^/]*$/, '')
      .replace(/\/+$/, '');
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !RENDER_PARAMS.has(k.toLowerCase()))
      .map(([k, v]) => `${k.toLowerCase()}=${v}`)
      .sort()
      .join('&');
    return `${u.hostname.toLowerCase()}${path}${params ? `?${params}` : ''}`;
  } catch {
    return url;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Relatedness — when sharing a photo is legitimate
// ─────────────────────────────────────────────────────────────────────────────

// `ß` survives NFD decomposition, so it has to be mapped explicitly or
// "Größenwahn" and "Grossenwahn" hash to different keys.
function norm(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '');
}

/**
 * Identity keys for a post. Two posts count as RELATED when they share any one
 * of them — same organiser, same venue, same source page, or the same title.
 *
 * This is what keeps a three-night run of one show, or two listings for one
 * venue, showing the artist's real photo on every card. Only genuinely
 * unrelated posts get separated.
 */
function relationKeys(p: Pick<ApiPost, 'caption' | 'organizer' | 'eventVenue' | 'location' | 'eventUrl'>): string[] {
  const keys: string[] = [];
  const org = norm(p.organizer);
  if (org.length >= 3) keys.push(`org:${org}`);

  const venue = norm(p.eventVenue || p.location?.name);
  if (venue.length >= 3) keys.push(`venue:${venue}`);

  const title = norm((p.caption ?? '').split('\n')[0]).slice(0, 40);
  if (title.length >= 6) keys.push(`title:${title}`);

  if (p.eventUrl) {
    try {
      const u = new URL(p.eventUrl);
      keys.push(`url:${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`);
    } catch { /* not a URL we can key on */ }
  }
  return keys;
}

/** True when two posts are about the same thing and may share one photograph. */
export function postsAreRelated(a: Parameters<typeof relationKeys>[0], b: Parameters<typeof relationKeys>[0]): boolean {
  const bKeys = new Set(relationKeys(b));
  return relationKeys(a).some(k => bKeys.has(k));
}

// ─────────────────────────────────────────────────────────────────────────────
// The gate every feed response passes through
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Guarantee that every photo in a batch is a real photo of its own post's
 * subject, and that no photograph appears on two UNRELATED posts.
 *
 * A post that loses its photo gets `image: ''` — it is never re-pointed at a
 * substitute, because a substitute is exactly the problem this fixes. Rows
 * already stored in the events DB with a stock URL are cleaned on the way out
 * too, so the fix applies without re-ingesting anything.
 */
export function enforceRealImages<T extends ApiPost>(posts: T[]): T[] {
  // identity → the post that claimed this photograph first
  const claimed = new Map<string, T>();

  return posts.map(post => {
    const gallery = (post.images ?? []).map(realImageUrl).filter(Boolean);
    let image = realImageUrl(post.image) || gallery[0] || '';

    // Keep only the gallery frames this post is entitled to.
    const keptGallery: string[] = [];
    for (const src of gallery) {
      const id = imageIdentity(src);
      const owner = claimed.get(id);
      if (owner && owner.id !== post.id && !postsAreRelated(owner, post)) continue;
      if (!owner) claimed.set(id, post);
      keptGallery.push(src);
    }

    if (image) {
      const id = imageIdentity(image);
      const owner = claimed.get(id);
      if (owner && owner.id !== post.id && !postsAreRelated(owner, post)) {
        image = keptGallery[0] ?? '';
      } else if (!owner) {
        claimed.set(id, post);
      }
    }

    const images = keptGallery.length > 1 ? keptGallery : undefined;
    if (image === post.image && images === post.images) return post;
    return { ...post, image, images };
  });
}
