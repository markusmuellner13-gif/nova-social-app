'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MapPin, Loader2, ExternalLink, Ticket, Clock, Star, CalendarDays,
  ChevronRight, RefreshCw, Plane,
} from 'lucide-react';
import { apiUrl } from '@/lib/apiBase';
import { postTitle } from '@/lib/postTitle';
import { useApp } from '@/context/AppContext';
import { useLanguage } from '@/context/LanguageContext';
import PostImage, { coverBackground } from './PostImage';
import CityExplorer from './CityExplorer';
import { NAV_CLEARANCE } from './BottomNav';
import type { LocationState } from '@/types';

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

  const hasCity = Boolean(cityName);

  return (
    <div className="min-h-full" style={{ paddingBottom: NAV_CLEARANCE }}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 mb-1">
          <Plane size={18} style={{ color: '#a78bfa' }} />
          <h1 className="text-2xl font-black text-white tracking-tight">{copy.title}</h1>
        </div>
        <p className="text-xs mb-3" style={{ color: '#666677' }}>{copy.subtitle}</p>

        {/* Destination picker */}
        <button
          onClick={() => setShowCityPicker(true)}
          className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left"
          style={{ background: '#13131a', border: '1px solid #2a2a38' }}
        >
          <div className="flex items-center justify-center rounded-xl flex-shrink-0"
            style={{ width: 34, height: 34, background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}>
            <MapPin size={17} color="#fff" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold" style={{ color: '#a78bfa' }}>{copy.destination}</p>
            <p className="text-sm font-semibold text-white truncate">
              {hasCity ? cityName : copy.pickCity}
            </p>
          </div>
          <ChevronRight size={18} style={{ color: '#55556a' }} />
        </button>
      </div>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto px-4 pb-2 no-scrollbar">
        {KIND_CHIPS.map(chip => {
          const active = kind === chip.id;
          return (
            <motion.button key={chip.id} whileTap={{ scale: 0.94 }} onClick={() => setKind(chip.id)}
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
            <motion.button key={w} whileTap={{ scale: 0.94 }} onClick={() => setWhen(w)}
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

      {/* We link out, we don't sell. Said once, plainly, above the results. */}
      <p className="px-4 pb-3 text-[10px] leading-relaxed" style={{ color: '#55556a' }}>
        {copy.disclaimer}
      </p>

      {/* ── Results ────────────────────────────────────────────────────────── */}
      <div className="px-4 flex flex-col gap-3">
        {!hasCity && (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: '#666677' }}>{copy.pickCityHint}</p>
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

      {showCityPicker && (
        <CityExplorer
          currentCity={city?.city ?? ''}
          onSelectCity={loc => { setDestination(loc); setPosts([]); }}
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
  const badge = KIND_BADGE[post.activityKind] ?? KIND_BADGE.activity;
  const title = postTitle(post, copy.kinds[post.activityKind]);
  const date = shortDate(post.eventDateRaw);
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
            {copy.kinds[post.activityKind]}
          </span>
        </div>
        {date && (
          <div className="absolute top-2 right-2 px-2 py-1 rounded-lg"
            style={{ background: 'rgba(139,92,246,0.9)' }}>
            <span className="text-[10px] font-bold text-white">{date}</span>
          </div>
        )}
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
