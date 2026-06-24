'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Compass, Sparkles, RefreshCw, ChevronDown, MapPin, Loader2, SlidersHorizontal, Bell } from 'lucide-react';
import { MOCK_POSTS, SPONSORED_POSTS } from '@/data/mockData';
import { Category, Post } from '@/types';
import { sortFeed, getTopCategories } from '@/lib/aiEngine';
import { parseMinPrice } from './Post';
import { useApp } from '@/context/AppContext';
import { useAIFeed } from '@/hooks/useAIFeed';
import PostComponent from './Post';
import { useLanguage } from '@/context/LanguageContext';
import AdSlot from './AdSlot';
import FeedSkeleton from './FeedSkeleton';
import TrendingRail from './TrendingRail';

// Ad placement: every AD_EVERY posts starting at AD_START
const AD_START = 3;
const AD_EVERY = 5;

type MainTab = 'discover' | 'events' | 'sightseeing' | 'sport' | 'partners';

// Labels are set dynamically via t.feed in the render

const DISCOVER_CHIP_CATS: { emoji: string; catKey: string; cat: Category }[] = [
  { emoji: '🍽️', catKey: 'restaurants', cat: 'restaurants' },
  { emoji: '🏨',  catKey: 'hotels',      cat: 'hotels'    },
  { emoji: '🚲',  catKey: 'rentals',     cat: 'rentals'   },
  { emoji: '✈️',  catKey: 'travel',      cat: 'travel'    },
  { emoji: '🍕',  catKey: 'food',        cat: 'food'      },
  { emoji: '🎨',  catKey: 'art',         cat: 'art'       },
  { emoji: '💪',  catKey: 'fitness',     cat: 'fitness'   },
  { emoji: '🌿',  catKey: 'lifestyle',   cat: 'lifestyle' },
  { emoji: '🏞️', catKey: 'outdoors',    cat: 'outdoors'  },
  { emoji: '🎵',  catKey: 'music',       cat: 'music'     },
  { emoji: '🛍️', catKey: 'shops',       cat: 'shops'     },
  { emoji: '🎭',  catKey: 'venues',      cat: 'venues'    },
  { emoji: '🤝',  catKey: 'community',   cat: 'community' },
  { emoji: '💻',  catKey: 'tech',        cat: 'tech'      },
  { emoji: '🐾',  catKey: 'pets',        cat: 'pets'      },
  { emoji: '👗',  catKey: 'fashion',     cat: 'fashion'   },
];

const PARTNER_CHIP_CATS: { emoji: string; label: string; cat: Category | null }[] = [
  { emoji: '✨',  label: 'All',           cat: null          },
  { emoji: '🍽️', label: 'Dining',        cat: 'food'        },
  { emoji: '🍸',  label: 'Bars',          cat: 'venues'      },
  { emoji: '🌊',  label: 'Water Sports',  cat: 'sports'      },
  { emoji: '🐾',  label: 'Pets',          cat: 'pets'        },
  { emoji: '💆',  label: 'Wellness',      cat: 'lifestyle'   },
  { emoji: '🏨',  label: 'Stays',         cat: 'travel'      },
  { emoji: '🗺️', label: 'Experiences',   cat: 'sightseeing' },
];

const PAGE_SIZE = 10;

// A post farther than this from the user is treated as a "nearby town", not part
// of the user's own city — keeps a small town's feed from being flooded by a
// bigger neighbour while still showing it (clearly labelled) below a divider.
const LOCAL_RADIUS_KM = 20;

type DateFilter  = 'all' | 'today' | 'weekend' | 'week' | 'month';
type PriceFilter = 'all' | 'free' | 'u20' | 'u50';

const DATE_FILTER_IDS: DateFilter[]  = ['all', 'today', 'weekend', 'week', 'month'];
const PRICE_FILTER_IDS: PriceFilter[] = ['all', 'free', 'u20', 'u50'];

function applyEventFilters(posts: Post[], dateFilter: DateFilter, priceFilter: PriceFilter): Post[] {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return posts.filter(p => {
    if (dateFilter !== 'all' && p.eventDateRaw) {
      const ev = new Date(p.eventDateRaw);
      const days = Math.floor((ev.getTime() - today.getTime()) / 86_400_000);
      if (dateFilter === 'today'   && days !== 0) return false;
      if (dateFilter === 'weekend' && (days > 7 || (ev.getDay() !== 0 && ev.getDay() !== 6))) return false;
      if (dateFilter === 'week'    && days > 7)  return false;
      if (dateFilter === 'month'   && days > 30) return false;
    }
    if (priceFilter !== 'all' && p.price) {
      const min = parseMinPrice(p.price);
      if (priceFilter === 'free' && min > 0)  return false;
      if (priceFilter === 'u20'  && min >= 20) return false;
      if (priceFilter === 'u50'  && min >= 50) return false;
    }
    return true;
  });
}

function adIndex(i: number): boolean {
  return i >= AD_START && (i - AD_START) % AD_EVERY === 0;
}

// A small time-aware greeting so the feed feels live and personal — pairs with
// the AI's time-of-day ranking (mornings lean food/active, evenings lean
// nightlife/events).
function greeting(hour = new Date().getHours()): { emoji: string; text: string } {
  if (hour >= 5  && hour < 11) return { emoji: '☀️', text: 'Good morning' };
  if (hour >= 11 && hour < 17) return { emoji: '🌤️', text: 'Good afternoon' };
  if (hour >= 17 && hour < 22) return { emoji: '🌆', text: 'Good evening' };
  return { emoji: '🌙', text: 'Up late' };
}

function sortByEventDate(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => {
    const aDate = a.eventDateRaw ? new Date(a.eventDateRaw).getTime() : a.timestamp;
    const bDate = b.eventDateRaw ? new Date(b.eventDateRaw).getTime() : b.timestamp;
    return aDate - bDate;
  });
}

interface Props {
  onOpenLocationPrompt: () => void;
  onOpenCityExplorer: () => void;
  onOpenNotifications: () => void;
}

export default function FeedTab({ onOpenLocationPrompt, onOpenCityExplorer, onOpenNotifications }: Props) {
  const { state, unreadCount, learnCategory } = useApp();
  const { t } = useLanguage();
  const { preferences, aiProfile } = state;
  const location = state.location;

  const { posts: aiPosts, loading: aiLoading, hasMore: aiHasMore, fetchMore, reset: resetAI } = useAIFeed(location);

  const [activeMainTab, setActiveMainTab] = useState<MainTab>('discover');
  const [activeChipCategory, setActiveChipCategory] = useState<Category | null>(null);
  const [sortMode, setSortMode] = useState<'for_you' | 'recent'>('for_you');
  const [dateFilter,  setDateFilter]  = useState<DateFilter>('all');
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [visibleCurated, setVisibleCurated] = useState(PAGE_SIZE);
  const [showNewBanner, setShowNewBanner] = useState(false);
  const [injectedPosts, setInjectedPosts] = useState<Post[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [partnerCatFilter, setPartnerCatFilter] = useState<Category | null>(null);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialFetchDone = useRef(false);
  const adCounter = useRef(0);
  const [scrollY, setScrollY] = useState(0);
  const prevScrollYRef = useRef(0);

  // Derived AI category from active main tab
  const aiCategory = useMemo((): string | undefined => {
    if (activeMainTab === 'events')      return 'events';
    if (activeMainTab === 'sightseeing') return 'sightseeing';
    if (activeMainTab === 'sport')       return 'sports';
    if (activeMainTab === 'discover')    return activeChipCategory ?? 'discover';
    return undefined;
  }, [activeMainTab, activeChipCategory]);

  // Initial fetch
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;
    void fetchMore(aiCategory);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when location or derived category changes
  useEffect(() => {
    if (!initialFetchDone.current) return;
    resetAI();
    adCounter.current = 0;
    void fetchMore(aiCategory);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.city, aiCategory]);

  // New posts banner after 30s (discover mode only)
  useEffect(() => {
    if (activeMainTab !== 'discover') return;
    const t = setTimeout(() => setShowNewBanner(true), 30_000);
    return () => clearTimeout(t);
  }, [activeMainTab]);

  // Feature 4 — Push notification when background refresh adds matching events
  const prevAiIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (aiPosts.length === 0) return;
    if (prevAiIdsRef.current.size === 0) {
      prevAiIdsRef.current = new Set(aiPosts.map(p => p.id));
      return;
    }
    const newPosts = aiPosts.filter(p => !prevAiIdsRef.current.has(p.id));
    prevAiIdsRef.current = new Set(aiPosts.map(p => p.id));
    if (newPosts.length === 0) return;

    const topCats = getTopCategories(preferences, aiProfile, 3);
    const match = newPosts.find(p => topCats.includes(p.category as Category));
    if (!match) return;

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('Nova — New event just listed ✨', {
          body: match.caption.split('\n')[0].slice(0, 80),
          icon: '/favicon.ico',
        });
      } catch { /* permission revoked */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiPosts.length]);

  // Whether we know where the user is — if so, the feed shows ONLY real
  // location-based content (no generic mock posts from other cities)
  const hasCity = Boolean(location?.city);

  // Curated pool for discover mode — user-created posts always; generic mock
  // posts only as a fallback when no location is known yet
  const curatedPool = useMemo(() => {
    let pool = hasCity ? [] : [...MOCK_POSTS];
    if (activeChipCategory) pool = pool.filter(p => p.category === activeChipCategory);
    if (sortMode === 'recent') return [...pool].sort((a, b) => b.timestamp - a.timestamp);
    return sortFeed(pool, preferences, aiProfile);
  }, [preferences, aiProfile, activeChipCategory, sortMode, hasCity]);

  // Events / Sport / Sightseeing tabs show ONLY real location-based data —
  // never demo posts pretending to be local events

  // Build merged feed depending on active tab
  const mergedFeed = useMemo(() => {
    type FeedItem =
      | { type: 'post'; post: Post }
      | { type: 'ad'; index: number }
      | { type: 'divider'; city: string; localEmpty: boolean; district?: string };
    const items: FeedItem[] = [];
    let adIdx = 0;

    if (activeMainTab === 'partners') {
      // Partners: sponsored posts filtered by category chip, ad every 3
      const filtered = partnerCatFilter
        ? SPONSORED_POSTS.filter(p => p.category === partnerCatFilter)
        : SPONSORED_POSTS;
      filtered.forEach((post, i) => {
        if (i > 0 && i % 3 === 0) items.push({ type: 'ad', index: adIdx++ });
        items.push({ type: 'post', post });
      });
      return items;
    }

    if (activeMainTab === 'discover') {
      // Original weave: 2 curated → 1 AI → repeat, with ads
      const curated = [...injectedPosts, ...curatedPool.slice(0, visibleCurated)];
      let ci = 0; let ai = 0; let slot = 0;
      const totalAI = aiPosts.length;
      const totalCur = curated.length;

      while (ci < totalCur || ai < totalAI) {
        for (let k = 0; k < 2 && ci < totalCur; k++, ci++, slot++) {
          if (adIndex(slot)) items.push({ type: 'ad', index: adIdx++ });
          items.push({ type: 'post', post: curated[ci] });
        }
        if (ai < totalAI) {
          slot++;
          if (adIndex(slot)) items.push({ type: 'ad', index: adIdx++ });
          items.push({ type: 'post', post: aiPosts[ai++] });
        }
      }
      return items;
    }

    // Events / Sightseeing / Sport: real location-based posts only.
    // Split into the user's OWN city vs. nearby towns, by the post's ACTUAL
    // distance from the user (source-agnostic — works whether the post came from
    // the DB, Ticketmaster's auto-expanded radius, or the live crawl). A small
    // town (Baden) leads with its own content; a bigger neighbour (Vienna, ~24km)
    // only appears below the "nearby towns" divider, clearly labelled.
    const sortOne = (arr: Post[]) => activeMainTab === 'sightseeing'
      ? [...arr].sort((a, b) => b.timestamp - a.timestamp)
      : sortByEventDate(arr);
    const filterOne = (arr: Post[]) => (activeMainTab === 'events' || activeMainTab === 'sport')
      ? applyEventFilters(arr, dateFilter, priceFilter)
      : arr;

    // Local ring adapts to the place (district for a town, metro for a city).
    const localKm = location?.localKm ?? LOCAL_RADIUS_KM;
    const isNearby = (p: Post) => typeof p.distanceKm === 'number' && p.distanceKm > localKm;
    const localSorted  = filterOne(sortOne(hasCity ? aiPosts.filter(p => !isNearby(p)) : aiPosts));
    const nearbySorted = filterOne(sortOne(hasCity ? aiPosts.filter(isNearby) : []));

    let slot = 0;
    const pushPosts = (arr: Post[]) => arr.forEach(post => {
      if (adIndex(slot)) items.push({ type: 'ad', index: adIdx++ });
      items.push({ type: 'post', post });
      slot++;
    });

    if (localSorted.length > 0) {
      pushPosts(localSorted);
      if (nearbySorted.length > 0) {
        items.push({ type: 'divider', city: location?.city ?? '', localEmpty: false, district: location?.district });
        pushPosts(nearbySorted);
      }
    } else if (nearbySorted.length > 0) {
      // Nothing happening in the user's own town right now — be honest and lead
      // with a "nearby" note rather than passing a neighbour off as local.
      items.push({ type: 'divider', city: location?.city ?? '', localEmpty: true, district: location?.district });
      pushPosts(nearbySorted);
    }

    return items;
  }, [activeMainTab, aiPosts, injectedPosts, curatedPool, visibleCurated, dateFilter, priceFilter, partnerCatFilter, hasCity, location?.city]);

  // Infinite scroll + scroll-position tracking
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    setScrollY(top);

    if (top === 0 && prevScrollYRef.current > 400 && activeMainTab === 'discover') {
      resetAI();
      adCounter.current = 0;
      void fetchMore(aiCategory);
      setInjectedPosts([]);
      setVisibleCurated(PAGE_SIZE);
    }
    prevScrollYRef.current = top;

    // Trigger well before the actual bottom (≈4 screens of runway) so the next
    // batch is already loading — combined with the hook's 2-page prefetch the
    // user keeps a deep buffer and almost never waits on a spinner.
    const nearBottom = el.scrollHeight - top - el.clientHeight < 2400;
    if (!nearBottom) return;
    if (activeMainTab === 'discover' && visibleCurated < curatedPool.length) {
      setVisibleCurated(c => c + PAGE_SIZE);
    }
    if (activeMainTab !== 'partners' && aiHasMore && !aiLoading) {
      void fetchMore(aiCategory);
    }
  }, [visibleCurated, curatedPool.length, aiHasMore, aiLoading, fetchMore, aiCategory, resetAI, activeMainTab]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Pull-to-refresh
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (scrollRef.current?.scrollTop === 0) setTouchStart(e.touches[0].clientY);
  }, []);
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStart === null) return;
    setPullDistance(Math.max(0, Math.min(80, e.touches[0].clientY - touchStart)));
  }, [touchStart]);
  const handleTouchEnd = useCallback(() => {
    if (pullDistance > 55) {
      setIsRefreshing(true);
      setPullDistance(0);
      setTouchStart(null);
      resetAI();
      adCounter.current = 0;
      void fetchMore(aiCategory);
      setTimeout(() => {
        setInjectedPosts([]);
        setVisibleCurated(PAGE_SIZE);
        setIsRefreshing(false);
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }, 900);
    } else {
      setPullDistance(0);
      setTouchStart(null);
    }
  }, [pullDistance, resetAI, fetchMore, aiCategory]);

  function handleNewPostsBanner() {
    setShowNewBanner(false);
    setInjectedPosts(curatedPool.slice(0, 4));
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleMainTabChange(tab: MainTab) {
    if (tab === activeMainTab) return;
    // Learn from which section the user opens (events / sights / sport).
    if (tab === 'events') learnCategory('events');
    else if (tab === 'sightseeing') learnCategory('sightseeing');
    else if (tab === 'sport') learnCategory('sports');
    setActiveMainTab(tab);
    setActiveChipCategory(null);
    setVisibleCurated(PAGE_SIZE);
    setInjectedPosts([]);
    setShowNewBanner(false);
    setDateFilter('all');
    setPriceFilter('all');
    setShowFilters(false);
    setPartnerCatFilter(null);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  // ── "Trending near you" rail (discover) ───────────────────────────────────
  // A curated top-of-feed strip: real-photo posts scored by how soon (events) and
  // how near they are. Tapping one jumps the feed to it.
  const trendingPosts = useMemo(() => {
    if (activeMainTab !== 'discover' || !hasCity) return [];
    const score = (p: Post) => {
      let s = 0;
      if (p.isEvent && p.eventDateRaw) {
        const days = Math.max(0, (new Date(p.eventDateRaw).getTime() - Date.now()) / 86_400_000);
        s += Math.max(0, 30 - days) + 6; // upcoming events lead
      }
      if (typeof p.distanceKm === 'number') s += Math.max(0, 25 - p.distanceKm);
      return s;
    };
    const realPhoto = aiPosts.filter(p => p.image && !p.image.includes('picsum'));
    const pool = realPhoto.length >= 3 ? realPhoto : aiPosts;
    return [...pool].sort((a, b) => score(b) - score(a)).slice(0, 8);
  }, [activeMainTab, hasCity, aiPosts]);

  const handleSelectTrending = useCallback((postId: string) => {
    const el = scrollRef.current?.querySelector(`[data-post-id="${CSS.escape(postId)}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const isTabLoading = activeMainTab !== 'partners' && aiLoading && mergedFeed.length === 0;

  // Skeleton is a FALLBACK, not a default: only reveal it if the first content
  // hasn't arrived within a short grace period. Cached or fast responses (the
  // common case) never trigger a skeleton flash — the feed just appears.
  const [showSkeleton, setShowSkeleton] = useState(false);
  useEffect(() => {
    if (!isTabLoading) { setShowSkeleton(false); return; }
    const t = setTimeout(() => setShowSkeleton(true), 400);
    return () => clearTimeout(t);
  }, [isTabLoading]);

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Top bar */}
        <div className="glass flex items-center justify-between px-4 flex-shrink-0" style={{ height: 56, borderBottom: '1px solid #1e1e2a' }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
              <Compass size={15} color="white" strokeWidth={2.5} />
            </div>
            <h1 className="text-xl font-bold" style={{ background: 'linear-gradient(135deg, #c4b5fd, #f0abfc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              Nova
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {location?.enabled ? (
              <motion.button whileTap={{ scale: 0.92 }} onClick={onOpenCityExplorer}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                <MapPin size={10} />
                {location.city}
              </motion.button>
            ) : (
              <motion.button whileTap={{ scale: 0.92 }} onClick={onOpenCityExplorer}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ background: 'rgba(236,72,153,0.1)', color: '#f9a8d4', border: '1px solid rgba(236,72,153,0.2)' }}>
                <MapPin size={10} /> {t.feed.chooseCity}
              </motion.button>
            )}

            {activeMainTab === 'discover' && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => setSortMode(m => m === 'for_you' ? 'recent' : 'for_you')}
                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}
              >
                {sortMode === 'for_you' ? <><Sparkles size={10} /> {t.feed.forYou}</> : <><RefreshCw size={10} /> {t.feed.recent}</>}
                <ChevronDown size={9} />
              </motion.button>
            )}

            {/* Notifications bell (Instagram-style) */}
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={onOpenNotifications}
              aria-label="Notifications"
              className="relative w-8 h-8 flex items-center justify-center rounded-full"
              style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}
            >
              <Bell size={16} style={{ color: '#c4b5fd' }} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 rounded-full flex items-center justify-center text-white font-bold"
                  style={{ background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', fontSize: 9, padding: '0 3px' }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </motion.button>
          </div>
        </div>

        {/* ── Main category tabs ── */}
        <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid #1e1e2a', background: '#0d0d16' }}>
          {([
            { id: 'events',      label: t.feed.events,      emoji: '🎉' },
            { id: 'sightseeing', label: t.feed.sightseeing, emoji: '🏛️' },
            { id: 'sport',       label: t.feed.sport,       emoji: '⚽' },
            { id: 'partners',    label: t.feed.partners,    emoji: '✨' },
          ] as { id: MainTab; label: string; emoji: string }[]).map(({ id, label, emoji }) => {
            const isActive = activeMainTab === id;
            return (
              <motion.button
                key={id}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleMainTabChange(id)}
                className="flex-1 flex flex-col items-center justify-center py-2.5 relative"
                style={{ minWidth: 0 }}
              >
                <span className="text-base leading-none mb-0.5">{emoji}</span>
                <span className="text-xs font-bold" style={{ color: isActive ? '#c4b5fd' : '#555566' }}>
                  {label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="tab-indicator"
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                    style={{ background: 'linear-gradient(90deg, #8b5cf6, #ec4899)' }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>

        {/* New posts banner */}
        <AnimatePresence>
          {showNewBanner && (
            <motion.button
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 40, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              onClick={handleNewPostsBanner}
              className="flex items-center justify-center gap-2 w-full text-sm font-semibold overflow-hidden flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(236,72,153,0.2))', color: '#c4b5fd', borderBottom: '1px solid rgba(139,92,246,0.2)' }}
            >
              <Sparkles size={14} /> {t.feed.newContent}
            </motion.button>
          )}
        </AnimatePresence>

        {/* Pull-to-refresh indicator */}
        <AnimatePresence>
          {(pullDistance > 10 || isRefreshing) && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: isRefreshing ? 44 : Math.min(pullDistance * 0.55, 44) }}
              exit={{ height: 0 }}
              className="flex items-center justify-center overflow-hidden flex-shrink-0"
              style={{ borderBottom: '1px solid #1a1a24' }}
            >
              <motion.div animate={isRefreshing ? { rotate: 360 } : {}} transition={isRefreshing ? { repeat: Infinity, duration: 0.8, ease: 'linear' } : {}}>
                <RefreshCw size={18} style={{ color: '#8b5cf6' }} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          className="tab-content flex-1 overflow-y-auto"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Enable-location banner — shown until we know the user's city */}
          {!hasCity && (
            <div className="px-4 py-3" style={{ borderBottom: '1px solid #1a1a24' }}>
              <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(236,72,153,0.12))', border: '1px solid rgba(139,92,246,0.25)' }}>
                <div className="flex items-center gap-2 mb-1">
                  <MapPin size={15} style={{ color: '#c4b5fd' }} />
                  <span className="text-sm font-bold text-white">{t.feed.enableLocationTitle}</span>
                </div>
                <p className="text-xs mb-3" style={{ color: '#a3a3b5' }}>{t.feed.enableLocationDesc}</p>
                <div className="flex gap-2">
                  <motion.button whileTap={{ scale: 0.95 }} onClick={onOpenLocationPrompt}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                    📍 {t.settings.locationOff}
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} onClick={onOpenCityExplorer}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold"
                    style={{ background: '#1a1a24', color: '#c4b5fd', border: '1px solid #2a2a38' }}>
                    🏙️ {t.feed.chooseCity}
                  </motion.button>
                </div>
              </div>
            </div>
          )}

          {/* Category chips — discover mode only */}
          {activeMainTab === 'discover' && (
            <div className="flex gap-2 px-4 py-3 overflow-x-auto flex-shrink-0" style={{ borderBottom: '1px solid #1a1a24' }}>
              {DISCOVER_CHIP_CATS.map(({ emoji, catKey, cat }) => {
                const isActive = activeChipCategory === cat;
                const label = t.categories[catKey as keyof typeof t.categories] ?? catKey;
                return (
                  <motion.button
                    key={cat}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => {
                      const next = isActive ? null : cat;
                      setActiveChipCategory(next);
                      setVisibleCurated(PAGE_SIZE);
                      // Opening a category is an implicit interest signal — let
                      // Nova quietly learn from what the user actually browses.
                      if (next) learnCategory(next);
                    }}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{
                      background: isActive ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : '#1a1a24',
                      color: isActive ? 'white' : '#888899',
                      border: isActive ? 'none' : '1px solid #2a2a38',
                    }}
                  >
                    {emoji} {label}
                  </motion.button>
                );
              })}
            </div>
          )}

          {/* Feature 3 — Date + Price filters for Events and Sport tabs */}
          {(activeMainTab === 'events' || activeMainTab === 'sport') && (
            <div>
              {/* Filter toggle bar */}
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid #1a1a24' }}>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => setShowFilters(f => !f)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{
                    background: (dateFilter !== 'all' || priceFilter !== 'all') ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : '#1a1a24',
                    color: (dateFilter !== 'all' || priceFilter !== 'all') ? 'white' : '#888899',
                    border: '1px solid #2a2a38',
                  }}
                >
                  <SlidersHorizontal size={12} />
                  {t.feed.filters}
                  {(dateFilter !== 'all' || priceFilter !== 'all') && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </motion.button>

                {/* Active filter chips */}
                {dateFilter !== 'all' && (
                  <motion.button whileTap={{ scale: 0.94 }} onClick={() => setDateFilter('all')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                    style={{ background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.35)' }}>
                    {dateFilter === 'today' ? t.feed.today : dateFilter === 'weekend' ? t.feed.weekend : dateFilter === 'week' ? t.feed.thisWeek : t.feed.thisMonth} ✕
                  </motion.button>
                )}
                {priceFilter !== 'all' && (
                  <motion.button whileTap={{ scale: 0.94 }} onClick={() => setPriceFilter('all')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                    style={{ background: 'rgba(236,72,153,0.2)', color: '#f9a8d4', border: '1px solid rgba(236,72,153,0.35)' }}>
                    {priceFilter === 'free' ? t.feed.free : priceFilter === 'u20' ? 'Under €20' : 'Under €50'} ✕
                  </motion.button>
                )}
              </div>

              {/* Expanded filter panel */}
              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                    style={{ borderBottom: '1px solid #1a1a24', background: '#0d0d16' }}
                  >
                    <div className="px-4 pt-3 pb-2">
                      <p className="text-xs font-bold mb-2" style={{ color: '#666677' }}>{t.feed.date}</p>
                      <div className="flex gap-2 flex-wrap mb-3">
                        {DATE_FILTER_IDS.map(id => {
                          const label = id === 'all' ? t.feed.allDates : id === 'today' ? t.feed.today : id === 'weekend' ? t.feed.weekend : id === 'week' ? t.feed.thisWeek : t.feed.thisMonth;
                          return (
                            <motion.button key={id} whileTap={{ scale: 0.93 }}
                              onClick={() => setDateFilter(id)}
                              className="px-3 py-1.5 rounded-full text-xs font-semibold"
                              style={{
                                background: dateFilter === id ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : '#1a1a24',
                                color: dateFilter === id ? 'white' : '#888899',
                                border: dateFilter === id ? 'none' : '1px solid #2a2a38',
                              }}>
                              {label}
                            </motion.button>
                          );
                        })}
                      </div>
                      <p className="text-xs font-bold mb-2" style={{ color: '#666677' }}>{t.feed.price}</p>
                      <div className="flex gap-2 flex-wrap">
                        {PRICE_FILTER_IDS.map(id => {
                          const label = id === 'all' ? t.feed.anyPrice : id === 'free' ? t.feed.free : id === 'u20' ? 'Under €20' : 'Under €50';
                          return (
                            <motion.button key={id} whileTap={{ scale: 0.93 }}
                              onClick={() => setPriceFilter(id)}
                              className="px-3 py-1.5 rounded-full text-xs font-semibold"
                              style={{
                                background: priceFilter === id ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : '#1a1a24',
                                color: priceFilter === id ? 'white' : '#888899',
                                border: priceFilter === id ? 'none' : '1px solid #2a2a38',
                              }}>
                              {label}
                            </motion.button>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Tab header for non-discover tabs */}
          {activeMainTab !== 'discover' && (
            <div className="flex items-center gap-2 px-4 py-3" style={{ background: 'rgba(139,92,246,0.05)', borderBottom: '1px solid #1a1a24' }}>
              {activeMainTab === 'partners' ? (
                <>
                  <span style={{ color: '#f59e0b' }}>✨</span>
                  <span className="text-xs font-bold" style={{ color: '#f59e0b' }}>Local Businesses &amp; Partners</span>
                  <span className="text-xs ml-auto px-2 py-0.5 rounded-full" style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>Promoted</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} style={{ color: '#8b5cf6' }} />
                  <span className="text-xs font-bold" style={{ color: '#a78bfa' }}>
                    {activeMainTab === 'events' && `${t.feed.eventsNear} ${location?.city ?? 'you'}`}
                    {activeMainTab === 'sightseeing' && `${t.feed.sightseeingNear} ${location?.city ?? 'you'}`}
                    {activeMainTab === 'sport' && `${t.feed.sportNear} ${location?.city ?? 'you'}`}
                  </span>
                  {activeMainTab !== 'sightseeing' && (
                    <span className="text-xs ml-2" style={{ color: '#444455' }}>{t.feed.sortedByDate}</span>
                  )}
                  {aiLoading && <Loader2 size={11} style={{ color: '#8b5cf6', marginLeft: 'auto' }} className="animate-spin" />}
                  {!aiLoading && <div className="w-1.5 h-1.5 rounded-full ml-auto" style={{ background: '#22c55e' }} />}
                </>
              )}
            </div>
          )}

          {/* Partner category filter chips */}
          {activeMainTab === 'partners' && (
            <div
              className="flex gap-2 px-4 py-3 overflow-x-auto flex-shrink-0"
              style={{ borderBottom: '1px solid #1a1a24', background: '#0d0d16' }}
            >
              {PARTNER_CHIP_CATS.map(({ emoji, label, cat }) => {
                const isActive = partnerCatFilter === cat;
                return (
                  <motion.button
                    key={cat ?? 'all'}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setPartnerCatFilter(cat)}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                    style={{
                      background: isActive ? 'linear-gradient(135deg, #f59e0b, #ec4899)' : '#1a1a24',
                      color: isActive ? 'white' : '#888899',
                      border: isActive ? 'none' : '1px solid #2a2a38',
                    }}
                  >
                    {emoji} {label}
                  </motion.button>
                );
              })}
            </div>
          )}

          {/* Location AI header — discover only. Time-aware greeting + the
              user's city/district makes the feed feel live and personal. */}
          {activeMainTab === 'discover' && location?.enabled && aiPosts.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'rgba(139,92,246,0.05)', borderBottom: '1px solid #1a1a24' }}>
              <span className="text-sm leading-none">{greeting().emoji}</span>
              <span className="text-xs font-semibold" style={{ color: '#a78bfa' }}>
                {greeting().text} — what&apos;s on in {location.city}
              </span>
              <div className="w-1.5 h-1.5 rounded-full ml-auto" style={{ background: '#22c55e' }} />
              <span className="text-xs" style={{ color: '#556' }}>Live</span>
            </div>
          )}

          {/* Trending-near-you rail — discover only, a curated lead-in */}
          {activeMainTab === 'discover' && trendingPosts.length >= 3 && (
            <TrendingRail posts={trendingPosts} onSelect={handleSelectTrending} />
          )}

          {/* Loading fallback — only appears if content is slow to arrive
              (delayed), so a fast/cached feed never flashes a skeleton. */}
          {showSkeleton && (
            <>
              <div className="flex items-center justify-center gap-2 py-3">
                <Loader2 size={13} style={{ color: '#8b5cf6' }} className="animate-spin" />
                <p className="text-xs font-medium" style={{ color: '#777788' }}>
                  {location?.city
                    ? `${t.feed.findingEvents} ${location.city}…`
                    : t.feed.loading}
                </p>
              </div>
              <FeedSkeleton count={4} />
            </>
          )}

          {/* Honest empty state — no invented events when sources are empty */}
          {!isTabLoading && !aiLoading && activeMainTab !== 'partners' && mergedFeed.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 px-8 gap-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <MapPin size={26} style={{ color: '#a78bfa' }} />
              </div>
              <p className="text-sm font-bold text-white text-center">{t.profile.noUpcomingEvents}</p>
              <p className="text-xs text-center" style={{ color: '#888899' }}>{t.feed.pullRefresh}</p>
            </div>
          )}

          {/* Feed items */}
          {!isTabLoading && (
            <div>
              {mergedFeed.map((item, i) => {
                if (item.type === 'ad') {
                  return <AdSlot key={`ad_${item.index}`} index={item.index} />;
                }
                if (item.type === 'divider') {
                  return (
                    <div key={`divider_${i}`} className="px-4 py-6 flex flex-col items-center text-center gap-1.5"
                      style={{ background: 'linear-gradient(180deg, rgba(139,92,246,0.10), transparent)', borderTop: '1px solid #1e1e2a', borderBottom: '1px solid #1e1e2a' }}>
                      <div className="w-9 h-9 rounded-full flex items-center justify-center mb-0.5" style={{ background: 'rgba(139,92,246,0.15)' }}>
                        <span style={{ fontSize: 18 }}>{item.localEmpty ? '📍' : '🎉'}</span>
                      </div>
                      {item.localEmpty ? (
                        <>
                          <p className="text-sm font-bold text-white">Nothing on in {item.city} right now</p>
                          <p className="text-xs max-w-[260px]" style={{ color: '#888899' }}>
                            {item.district ? `${item.city} and the ${item.district} district` : item.city} look quiet at the moment — here&apos;s what&apos;s happening in nearby towns 👇
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-bold text-white">That&apos;s everything in {item.district ? `the ${item.district} district` : item.city}!</p>
                          <p className="text-xs max-w-[260px]" style={{ color: '#888899' }}>
                            You&apos;ve reached the end for {item.city}{item.district ? ` & its district` : ''}. Keep scrolling for nearby towns 👇
                          </p>
                        </>
                      )}
                    </div>
                  );
                }
                const post = item.post;
                return (
                  <div key={post.id} data-post-id={post.id}>
                    {activeMainTab === 'discover' && i > 0 && i % 6 === 0 && (
                      <div className="flex items-center gap-2 px-4 py-2" style={{ background: 'rgba(139,92,246,0.04)', borderBottom: '1px solid #1a1a24' }}>
                        <Sparkles size={12} style={{ color: '#8b5cf6' }} />
                        <span className="text-xs font-semibold" style={{ color: '#6648aa' }}>
                          {i === 6 ? t.feed.basedOnInterests : i === 12 ? t.feed.moreLove : t.feed.curatedForYou}
                        </span>
                      </div>
                    )}
                    <motion.div
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: Math.min(i * 0.02, 0.15) }}
                    >
                      <PostComponent post={post} showHint={i === 0} />
                    </motion.div>
                  </div>
                );
              })}

              {/* Loading more spinner */}
              {aiLoading && mergedFeed.length > 0 && (
                <div className="flex items-center justify-center gap-2 py-6">
                  <Loader2 size={20} style={{ color: '#8b5cf6' }} className="animate-spin" />
                  <span className="text-xs font-medium" style={{ color: '#555566' }}>
                    {location?.city ? `${t.feed.findingMore} ${location.city}…` : t.feed.loadingMore}
                  </span>
                </div>
              )}

              {/* End of feed */}
              {!aiLoading && (activeMainTab === 'partners' || !aiHasMore) && mergedFeed.length > 0 && (
                <div className="flex flex-col items-center py-8 px-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(139,92,246,0.1)' }}>
                    <Sparkles size={20} style={{ color: '#8b5cf6' }} />
                  </div>
                  <p className="text-sm font-semibold text-white">
                    {activeMainTab === 'partners' ? '🏪 List your business on Nova' : t.feed.allCaughtUp}
                  </p>
                  <p className="text-xs mt-1 text-center" style={{ color: '#555566' }}>
                    {activeMainTab === 'partners'
                      ? 'Restaurants, bars, rentals & more — reach thousands of users. contact@nova-app.com'
                      : t.feed.pullRefresh}
                  </p>
                </div>
              )}
            </div>
          )}

          <div style={{ height: 100 }} />
        </div>
      </div>

      {/* Scroll-to-top button */}
      <AnimatePresence>
        {scrollY > 300 && (
          <motion.button
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            onClick={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed left-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold text-white shadow-xl"
            style={{
              top: 68,
              transform: 'translateX(-50%)',
              background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
              boxShadow: '0 4px 16px rgba(139,92,246,0.45)',
            }}
          >
            <RefreshCw size={13} /> {t.feed.backToTop}
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
