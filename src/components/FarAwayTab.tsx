'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Loader2, ExternalLink, Ticket, Clock, Star, CalendarDays,
  ChevronRight, RefreshCw, Plane, Bookmark,
} from 'lucide-react';
import { apiUrl } from '@/lib/apiBase';
import { postTitle } from '@/lib/postTitle';
import { useApp } from '@/context/AppContext';
import { useLanguage } from '@/context/LanguageContext';
import PostImage, { coverBackground } from './PostImage';
import CityExplorer from './CityExplorer';
import { NAV_CLEARANCE } from './BottomNav';
import type { LocationState, Post, Category } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Far Far Away — the trip-planning half of Nova.
//
// The feed answers "what is around me". This answers "I am going somewhere,
// what is worth doing" — pick a city, pick when, and get the real things to
// see and do, each with the real page where you book it.
//
// The rule this screen exists to keep: NOVA DOES NOT SELL TICKETS. Every card's
// primary action is an outbound link to the operator, the host is printed on
// the button so nobody is surprised where they land, and a card with no
// verified booking link says "check the website" rather than inventing one.
//
// Layout note — this tab lives inside the shell's `position:absolute; inset:0`
// pane, whose parent is `overflow:hidden`. A tab that does not own a scroll
// container simply gets clipped: taps land, nothing moves. So the root is
// `flex flex-col h-full` with exactly one `.tab-content` scroller under a
// fixed top bar, matching every other tab.
// ─────────────────────────────────────────────────────────────────────────────

type Kind = 'museum' | 'sightseeing' | 'activity' | 'tour' | 'event';
type When = 'anytime' | 'today' | 'weekend' | 'week' | 'month';

interface ActivityPost {
  id: string;
  title?: string;
  caption: string;
  image: string;
  category: string;
  activityKind: Kind;
  location?: { name: string; lat: number; lng: number };
  eventDate?: string;
  eventDateRaw?: string;
  eventVenue?: string;
  eventUrl?: string;
  organizer?: string;
  price?: string;
  ticketUrl?: string;
  ticketHost?: string;
  officialUrl?: string;
  openingHours?: string;
  duration?: string;
  rating?: number;
  distanceKm?: number;
  // The activities API hands back full feed-post rows. These ride along so a
  // shortlisted activity can be stored as an ordinary post and show up in the
  // profile's collection next to everything else the user saved.
  user?: Post['user'];
  likes?: number;
  comments?: number;
  hashtags?: string[];
  timestamp?: number;
  isEvent?: boolean;
}

const KIND_CHIPS: { id: Kind | 'all'; emoji: string; labelKey: string }[] = [
  { id: 'all',         emoji: '✨',  labelKey: 'all' },
  { id: 'sightseeing', emoji: '🗿',  labelKey: 'sightseeing' },
  { id: 'museum',      emoji: '🏛️', labelKey: 'museums' },
  { id: 'activity',    emoji: '🎢',  labelKey: 'activities' },
  { id: 'tour',        emoji: '🚶',  labelKey: 'tours' },
  { id: 'event',       emoji: '🎫',  labelKey: 'events' },
];

const WHEN_CHIPS: When[] = ['anytime', 'today', 'weekend', 'week', 'month'];

const KIND_BADGE: Record<Kind, { emoji: string; tint: string }> = {
  museum:      { emoji: '🏛️', tint: '#a78bfa' },
  sightseeing: { emoji: '🗿',  tint: '#38bdf8' },
  activity:    { emoji: '🎢',  tint: '#34d399' },
  tour:        { emoji: '🚶',  tint: '#fbbf24' },
  event:       { emoji: '🎫',  tint: '#f472b6' },
};

/** "Fri 12 Sep" — short, and never a raw ISO string in front of the user. */
function shortDate(raw?: string): string | null {
  if (!raw) return null;
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Widen an activity back into an ordinary Post so it can go through the same
 * save pipeline as the feed (local state + Supabase + the profile grid). The
 * defaults only ever fill in fields the API omitted; nothing is invented that
 * the card itself displays.
 */
function toPost(a: ActivityPost, kindLabel: string): Post {
  return {
    id: a.id,
    user: a.user ?? {
      id: 'nova-activities', name: kindLabel, username: 'nova',
      avatar: '', bio: '', followers: 0, following: 0, posts: 0,
    },
    image: a.image,
    title: a.title,
    caption: a.caption,
    likes: a.likes ?? 0,
    comments: a.comments ?? 0,
    category: (a.category || 'travel') as Category,
    hashtags: a.hashtags ?? [],
    timestamp: a.timestamp ?? Date.now(),
    location: a.location,
    saved: true,
    liked: false,
    isEvent: a.isEvent ?? a.activityKind === 'event',
    eventDate: a.eventDate,
    eventDateRaw: a.eventDateRaw,
    eventVenue: a.eventVenue,
    eventUrl: a.ticketUrl ?? a.officialUrl ?? a.eventUrl,
    organizer: a.organizer,
    price: a.price,
    distanceKm: a.distanceKm,
  };
}

export default function FarAwayTab() {
  const { t } = useLanguage();
  const { state } = useApp();
  const copy = t.farAway;

  // The destination is this tab's own state — picking Lisbon here must not
  // repoint the user's local feed, which is anchored to where they actually are.
  const [destination, setDestination] = useState<LocationState | null>(null);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [kind, setKind] = useState<Kind | 'all'>('all');
  const [when, setWhen] = useState<When>('anytime');
  const [posts, setPosts] = useState<ActivityPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reqIdRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Default to where the user is, purely as a starting point they can change.
  const city = destination ?? state.location ?? null;
  // Read the primitives out here rather than inside the callback: a dependency
  // on the object itself would refire the fetch on every render that produced
  // a new location object with identical contents.
  const cityName = city?.city ?? '';
  const cityCountry = city?.country ?? '';
  const cityLat = city?.lat ?? 0;
  const cityLng = city?.lng ?? 0;
  const failedCopy = copy.failed;

  const load = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (!cityName && !cityLat) return;
    const myReq = ++reqIdRef.current;
    if (!opts.silent) { setLoading(true); setError(null); }
    try {
      const params = new URLSearchParams({
        city: cityName,
        country: cityCountry,
        lat: String(cityLat),
        lng: String(cityLng),
        when,
        count: '18',
      });
      if (kind !== 'all') params.set('kinds', kind);
      const res = await fetch(apiUrl(`/api/activities?${params}`));
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json() as { posts?: ActivityPost[] };
      if (myReq !== reqIdRef.current) return;      // a newer request superseded us
      setPosts(Array.isArray(data.posts) ? data.posts : []);
    } catch {
      if (myReq === reqIdRef.current) setError(failedCopy);
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  }, [cityName, cityCountry, cityLat, cityLng, kind, when, failedCopy]);

  useEffect(() => { void load(); }, [load]);

  // A new filter means a new list — reading it from halfway down is disorienting.
  const toTop = useCallback(() => scrollRef.current?.scrollTo({ top: 0 }), []);
  const pickKind = useCallback((k: Kind | 'all') => { setKind(k); toTop(); }, [toTop]);
  const pickWhen = useCallback((w: When) => { setWhen(w); toTop(); }, [toTop]);

  const hasCity = Boolean(cityName);

  return (
    <div className="flex flex-col h-full">
      {/* ── Top bar — the destination stays visible and one tap away, however
             far down the list the user has planned. ───────────────────────── */}
      <div className="glass flex items-center justify-between gap-2 px-4 flex-shrink-0"
        style={{ height: 56, borderBottom: '1px solid #1e1e2a' }}>
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
            <Plane size={15} color="white" strokeWidth={2.5} />
          </div>
          <h1 className="text-xl font-bold truncate" style={{
            background: 'linear-gradient(135deg, #c4b5fd, #f0abfc)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            {copy.title}
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {hasCity && (
            <motion.button whileTap={{ scale: 0.9 }} onClick={() => void load()}
              aria-label={copy.retry} className="p-1.5 rounded-full"
              style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} style={{ color: '#a78bfa' }} />
            </motion.button>
          )}
          <motion.button whileTap={{ scale: 0.92 }} onClick={() => setShowCityPicker(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium max-w-[45vw]"
            style={hasCity
              ? { background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }
              : { background: 'rgba(236,72,153,0.1)', color: '#f9a8d4', border: '1px solid rgba(236,72,153,0.2)' }}>
            <MapPin size={10} className="flex-shrink-0" />
            <span className="truncate">{hasCity ? cityName : copy.pickCity}</span>
          </motion.button>
        </div>
      </div>

      {/* ── Scrollable content ─────────────────────────────────────────────── */}
      <div ref={scrollRef} className="tab-content flex-1 overflow-y-auto"
        style={{ paddingBottom: NAV_CLEARANCE }}>

        <p className="px-4 pt-3 pb-2 text-xs" style={{ color: '#666677' }}>{copy.subtitle}</p>

        {/* Filters stick to the top of the scroller: on a planning screen you
            re-cut the same city by kind and by date constantly, and hunting back
            up a long list for the chips every time is the whole friction. */}
        <div className="sticky top-0 z-10 pt-1" style={{ background: '#0a0a0f' }}>
          <div className="flex gap-2 overflow-x-auto px-4 pb-2 no-scrollbar">
            {KIND_CHIPS.map(chip => {
              const active = kind === chip.id;
              return (
                <motion.button key={chip.id} whileTap={{ scale: 0.94 }} onClick={() => pickKind(chip.id)}
                  aria-pressed={active}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full flex-shrink-0 text-xs font-semibold"
                  style={{
                    background: active ? 'linear-gradient(135deg,#8b5cf6,#ec4899)' : '#13131a',
                    border: `1px solid ${active ? 'transparent' : '#2a2a38'}`,
                    color: active ? '#fff' : '#888899',
                  }}>
                  <span>{chip.emoji}</span>
                  <span>{copy.chips[chip.labelKey as keyof typeof copy.chips]}</span>
                </motion.button>
              );
            })}
          </div>

          <div className="flex gap-2 overflow-x-auto px-4 pb-3 no-scrollbar">
            {WHEN_CHIPS.map(w => {
              const active = when === w;
              return (
                <motion.button key={w} whileTap={{ scale: 0.94 }} onClick={() => pickWhen(w)}
                  aria-pressed={active}
                  className="flex items-center gap-1 px-3 py-1 rounded-full flex-shrink-0 text-[11px] font-semibold"
                  style={{
                    background: active ? 'rgba(139,92,246,0.18)' : 'transparent',
                    border: `1px solid ${active ? 'rgba(139,92,246,0.5)' : '#2a2a38'}`,
                    color: active ? '#a78bfa' : '#666677',
                  }}>
                  {w === 'anytime' ? null : <CalendarDays size={11} />}
                  {copy.when[w]}
                </motion.button>
              );
            })}
          </div>
          <div style={{ height: 1, background: '#1e1e2a' }} />
        </div>

        {/* We link out, we don't sell. Said once, plainly, above the results. */}
        <p className="px-4 pt-3 pb-3 text-[10px] leading-relaxed" style={{ color: '#55556a' }}>
          {copy.disclaimer}
        </p>

        {/* ── Results ──────────────────────────────────────────────────────── */}
        <div className="px-4 flex flex-col gap-3">
          {!hasCity && (
            <div className="text-center py-12">
              <div className="mx-auto mb-4 flex items-center justify-center rounded-2xl"
                style={{ width: 56, height: 56, background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}>
                <Plane size={26} color="#fff" />
              </div>
              <p className="text-sm mb-4" style={{ color: '#666677' }}>{copy.pickCityHint}</p>
              <button onClick={() => setShowCityPicker(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}>
                <MapPin size={14} /> {copy.pickCity} <ChevronRight size={14} />
              </button>
            </div>
          )}

          {hasCity && loading && posts.length === 0 && (
            <>
              <div className="flex items-center gap-2 justify-center py-4">
                <Loader2 size={14} className="animate-spin" style={{ color: '#8b5cf6' }} />
                <span className="text-xs" style={{ color: '#666677' }}>
                  {copy.finding} {cityName}…
                </span>
              </div>
              {[0, 1, 2].map(i => (
                <div key={i} className="rounded-2xl shimmer" style={{ height: 260 }} />
              ))}
            </>
          )}

          {hasCity && !loading && error && (
            <div className="text-center py-10">
              <p className="text-sm mb-3" style={{ color: '#888899' }}>{error}</p>
              <button onClick={() => void load()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white"
                style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}>
                <RefreshCw size={13} /> {copy.retry}
              </button>
            </div>
          )}

          {hasCity && !loading && !error && posts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-sm mb-1" style={{ color: '#888899' }}>
                {copy.empty} {cityName}
              </p>
              <p className="text-xs" style={{ color: '#55556a' }}>{copy.emptyHint}</p>
            </div>
          )}

          <AnimatePresence mode="popLayout">
            {posts.map((post, i) => (
              <ActivityCard key={post.id} post={post} index={i} copy={copy} />
            ))}
          </AnimatePresence>
        </div>
      </div>

      {showCityPicker && (
        <CityExplorer
          currentCity={city?.city ?? ''}
          onSelectCity={loc => { setDestination(loc); setPosts([]); toTop(); }}
          onClose={() => setShowCityPicker(false)}
        />
      )}
    </div>
  );
}

function ActivityCard({ post, index, copy }: {
  post: ActivityPost;
  index: number;
  copy: ReturnType<typeof useLanguage>['t']['farAway'];
}) {
  const { isSaved, savePost, addToast } = useApp();
  const badge = KIND_BADGE[post.activityKind] ?? KIND_BADGE.activity;
  const kindLabel = copy.kinds[post.activityKind];
  const title = postTitle(post, kindLabel);
  const date = shortDate(post.eventDateRaw);
  const saved = isSaved(post.id);
  // Where the button sends them: the verified booking page if we found one,
  // otherwise the operator's own page. Never a search we can't stand behind.
  const outbound = post.ticketUrl ?? post.officialUrl ?? post.eventUrl;
  const isTicketLink = Boolean(post.ticketUrl);
  const host = post.ticketHost ?? (() => {
    try { return outbound ? new URL(outbound).hostname.replace(/^www\./, '') : ''; } catch { return ''; }
  })();

  const summary = (post.caption ?? '')
    .split('\n')
    .find(line => line.trim().length > 30 && !line.startsWith('📅') && !line.startsWith('📍')
      && !line.startsWith('🎟️') && !line.startsWith('🔗'))
    ?.trim();

  // Shortlisting is the actual work of planning a trip: gather the maybes now,
  // decide later. It goes through the same store as a saved feed post, so the
  // list is one list — in the profile, and synced when signed in.
  const handleSave = useCallback(() => {
    savePost(toPost(post, kindLabel));
    if (!saved) addToast('Saved to collection 🔖', 'success');
  }, [savePost, post, kindLabel, saved, addToast]);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="rounded-2xl overflow-hidden"
      style={{ background: '#13131a', border: '1px solid #2a2a38' }}
    >
      {/* Photo — or the designed gradient cover, which is plainly a graphic and
          so can never be mistaken for a photo of the place.
          PostImage owns the fit: it fills this frame, letterboxes with its own
          blurred fill for photos outside the card's aspect range, and paints the
          designed cover underneath until the photo actually arrives. */}
      <div className="relative" style={{ height: 180 }}>
        {post.image ? (
          <PostImage src={post.image} alt={title} priority={index < 2} />
        ) : (
          <div className="w-full h-full flex items-center justify-center"
            style={{ height: 180, background: coverBackground(post.id) }}>
            <span style={{ fontSize: 40 }}>{badge.emoji}</span>
          </div>
        )}
        <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg"
          style={{ background: 'rgba(10,10,15,0.75)', backdropFilter: 'blur(6px)' }}>
          <span style={{ fontSize: 11 }}>{badge.emoji}</span>
          <span className="text-[10px] font-bold" style={{ color: badge.tint }}>
            {kindLabel}
          </span>
        </div>
        <div className="absolute top-2 right-2 flex items-center gap-1.5">
          {date && (
            <div className="px-2 py-1 rounded-lg" style={{ background: 'rgba(139,92,246,0.9)' }}>
              <span className="text-[10px] font-bold text-white">{date}</span>
            </div>
          )}
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={handleSave}
            aria-pressed={saved}
            aria-label="Save"
            className="flex items-center justify-center rounded-lg"
            style={{
              width: 28, height: 28,
              background: saved ? 'rgba(139,92,246,0.9)' : 'rgba(10,10,15,0.75)',
              backdropFilter: 'blur(6px)',
            }}>
            <Bookmark size={14} color="#fff" fill={saved ? '#fff' : 'transparent'} />
          </motion.button>
        </div>
      </div>

      <div className="p-3.5">
        <h3 className="text-sm font-bold text-white leading-snug mb-1">{title}</h3>

        {summary && (
          <p className="text-xs leading-relaxed mb-2 line-clamp-2" style={{ color: '#888899' }}>
            {summary}
          </p>
        )}

        {/* Facts we actually read from the source — each one omitted when absent
            rather than filled with a plausible-looking guess. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
          {post.eventVenue && (
            <span className="flex items-center gap-1 text-[11px]" style={{ color: '#666677' }}>
              <MapPin size={11} /> <span className="truncate max-w-[160px]">{post.eventVenue}</span>
            </span>
          )}
          {post.openingHours && (
            <span className="flex items-center gap-1 text-[11px]" style={{ color: '#666677' }}>
              <Clock size={11} /> <span className="truncate max-w-[140px]">{post.openingHours}</span>
            </span>
          )}
          {post.duration && (
            <span className="flex items-center gap-1 text-[11px]" style={{ color: '#666677' }}>
              <Clock size={11} /> {post.duration}
            </span>
          )}
          {typeof post.rating === 'number' && (
            <span className="flex items-center gap-1 text-[11px]" style={{ color: '#fbbf24' }}>
              <Star size={11} fill="#fbbf24" /> {post.rating.toFixed(1)}
            </span>
          )}
          {typeof post.distanceKm === 'number' && (
            <span className="text-[11px]" style={{ color: '#666677' }}>
              {post.distanceKm.toFixed(1)} km
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {post.price && (
            <div className="flex-shrink-0">
              <p className="text-[9px]" style={{ color: '#55556a' }}>{copy.from}</p>
              <p className="text-sm font-black" style={{ color: '#34d399' }}>{post.price}</p>
            </div>
          )}
          {outbound ? (
            <a
              href={outbound}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold text-white"
              style={{
                background: isTicketLink
                  ? 'linear-gradient(135deg,#8b5cf6,#ec4899)'
                  : 'rgba(139,92,246,0.15)',
                border: isTicketLink ? 'none' : '1px solid rgba(139,92,246,0.35)',
                color: isTicketLink ? '#fff' : '#a78bfa',
              }}
            >
              {isTicketLink ? <Ticket size={13} /> : <ExternalLink size={13} />}
              {isTicketLink ? copy.getTickets : copy.visitSite}
            </a>
          ) : (
            <span className="flex-1 text-center text-[11px] py-2.5" style={{ color: '#55556a' }}>
              {copy.noLink}
            </span>
          )}
        </div>

        {/* Say where the tap goes BEFORE it happens. */}
        {outbound && host && (
          <p className="text-[9px] text-center mt-1.5" style={{ color: '#55556a' }}>
            {copy.booksOn} {host}
          </p>
        )}
      </div>
    </motion.article>
  );
}
