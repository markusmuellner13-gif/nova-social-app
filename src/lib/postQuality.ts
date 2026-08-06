// ─────────────────────────────────────────────────────────────────────────────
// The floor a post has to clear before it is allowed on screen.
//
// WHAT THIS FIXES — on 2026-08-06 a card rendered in the live Vienna feed with
// NO text and NO image, 901px tall: a blank slab the user had to scroll past.
// Nothing rejected it, because nothing was checking. Every other guard in the
// codebase is about the photo (`realImage.ts`) or the event data
// (`eventValidation.ts`); no guard asked the simplest question, which is
// whether the post says anything at all.
//
// Nova is a LOCATION-FIRST app: a post exists to tell you that a specific thing
// is happening at a specific place. So the floor is exactly that — it must be
// able to name itself, and it must know where it is. Everything else (photo,
// price, ticket link, opening hours) is genuinely optional and there are real,
// good posts without them.
//
// Deliberately NOT required:
//   • a photo — `PostImage` renders a designed cover, and refusing photoless
//     posts would empty whole categories (measured: only 46% of OSM venues
//     carry any photo lead at all).
//   • a date — places aren't events, and "Date TBC" events are still real.
// ─────────────────────────────────────────────────────────────────────────────

import { postTitle } from './postTitle';

type QualityPost = {
  id?: string;
  title?: string | null;
  caption?: string | null;
  category?: string | null;
  eventVenue?: string | null;
  location?: { name?: string | null; lat?: number; lng?: number } | null;
  user?: { name?: string | null } | null;
};

/** Caption text with the emoji metadata lines stripped — the actual prose. */
function bodyText(caption: string | null | undefined): string {
  if (!caption) return '';
  return String(caption)
    .split('\n')
    .filter((l) => l.trim() && !/^[📅📍🎟🔗🗺🏛🕒📏✨]/u.test(l.trim()))
    .join(' ')
    .trim();
}

/**
 * Can this post name itself and say where it is?
 *
 * `postTitle` is called with an EMPTY fallback on purpose: we want to know
 * whether a real headline exists, not whether one can be invented. A post that
 * only survives via the "Event" placeholder is exactly the blank card.
 */
export function hasCoreContent(post: QualityPost): boolean {
  if (!post) return false;

  // 1. It must be able to name itself.
  if (!postTitle(post, '', 90)) return false;

  // 2. It must know where it is — the whole premise of the app.
  const place = (post.location?.name ?? '').trim() || (post.eventVenue ?? '').trim();
  if (!place) return false;

  // 3. It must have a category, or it can't be filtered, ranked or explained.
  if (!(post.category ?? '').trim()) return false;

  // 4. It must actually say something. A headline alone is a link, not a post.
  //    The title itself counts — a landmark whose only prose is its name is
  //    still a real card — but a post with neither is not.
  if (!bodyText(post.caption) && !(post.title ?? '').trim()) return false;

  return true;
}

/**
 * Drop posts that can't clear the floor.
 *
 * Returns the kept posts. Callers that care can diff the lengths; the feed
 * routes deliberately don't, because a dropped post is not an error — it's a
 * source publishing something unusable, which happens constantly.
 */
export function dropIncompletePosts<T extends QualityPost>(posts: T[]): T[] {
  if (!Array.isArray(posts)) return [];
  return posts.filter(hasCoreContent);
}
