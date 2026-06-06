'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Compass, Sparkles, RefreshCw, ChevronDown, MapPin, Loader2, SlidersHorizontal } from 'lucide-react';
import { MOCK_POSTS, MOCK_STORIES, CURRENT_USER, SPONSORED_POSTS } from '@/data/mockData';
import { Category, Post } from '@/types';
import { sortFeed, getTopCategories } from '@/lib/aiEngine';
import { parseMinPrice } from './Post';
import { useApp } from '@/context/AppContext';
import { useAIFeed } from '@/hooks/useAIFeed';
import PostComponent from './Post';
import { StoryItem, YourStory } from './Story';
import StoryViewer from './StoryViewer';
import AdSlot from './AdSlot';

// Ad placement: every AD_EVERY posts starting at AD_START
const AD_START = 3;
const AD_EVERY = 5;

type MainTab = 'discover' | 'events' | 'sightseeing' | 'sport' | 'partners';

const MAIN_TABS: { id: MainTab; label: string; emoji: string }[] = [
  { id: 'events',      label: 'Events',      emoji: '🎉' },
  { id: 'sightseeing', label: 'Sightseeing', emoji: '🏛️' },
  { id: 'sport',       label: 'Sport',       emoji: '⚽' },
  { id: 'partners',    label: 'Partners',    emoji: '✨' },
];

const DISCOVER_CHIPS: { emoji: string; label: string; cat: Category }[] = [
  { emoji: '✈️', label: 'Travel',   cat: 'travel'    },
  { emoji: '🍕', label: 'Food',     cat: 'food'      },
  { emoji: '🎨', label: 'Art',      cat: 'art'       },
  { emoji: '💪', label: 'Active',   cat: 'fitness'   },
  { emoji: '🌿', label: 'Life',     cat: 'lifestyle' },
  { emoji: '🎵', label: 'Music',    cat: 'music'     },
  { emoji: '💻', label: 'Tech',     cat: 'tech'      },
  { emoji: '🐾', label: 'Pets',     cat: 'pets'      },
  { emoji: '👗', label: 'Fashion',  cat: 'fashion'   },
];

const PAGE_SIZE = 10;

type DateFilter  = 'all' | 'today' | 'weekend' | 'week' | 'month';
type PriceFilter = 'all' | 'free' | 'u20' | 'u50';

const DATE_FILTERS:  { id: DateFilter;  label: string }[] = [
  { id: 'all', label: 'All dates' }, { id: 'today', label: 'Today' },
  { id: 'weekend', label: 'Weekend' }, { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
];
const PRICE_FILTERS: { id: PriceFilter; label: string }[] = [
  { id: 'all', label: 'Any price' }, { id: 'free', label: 'Free' },
  { id: 'u20', label: 'Under €20' }, { id: 'u50', label: 'Under €50' },
];

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

function sortByEventDate(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => {
    const aDate = a.eventDateRaw ? new Date(a.eventDateRaw).getTime() : a.timestamp;
    const bDate = b.eventDateRaw ? new Date(b.eventDateRaw).getTime() : b.timestamp;
    return aDate - bDate;
  });
}

interface Props {
  onOpenLocationPrompt: () => void;
}

export default function FeedTab({ onOpenLocationPrompt }: Props) {
  const { state, isStorySeen } = useApp();
  const { preferences, aiProfile, createdPosts } = state;
  const location = state.location;

  const { posts: aiPosts, loading: aiLoading, hasMore: aiHasMore, fetchMore, reset: resetAI } = useAIFeed(location);

  const [activeMainTab, setActiveMainTab] = useState<MainTab>('discover');
  const [activeChipCategory, setActiveChipCategory] = useState<Category | null>(null);
  const [sortMode, setSortMode] = useState<'for_you' | 'recent'>('for_you');
  const [dateFilter,  setDateFilter]  = useState<DateFilter>('all');
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [visibleCurated, setVisibleCurated] = useState(PAGE_SIZE);
  const [showNewBanner, setShowNewBanner] = useState(false);
  const [injectedPosts, setInjectedPosts] = useState<Post[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
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
    if (activeMainTab === 'discover')    return activeChipCategory ?? undefined;
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

  const stories = useMemo(
    () => MOCK_STORIES.map(s => ({ ...s, seen: isStorySeen(s.id) })),
    [isStorySeen, state.seenStories]
  );

  // Curated/mock pool for discover mode
  const curatedPool = useMemo(() => {
    let pool = [...createdPosts, ...MOCK_POSTS];
    if (activeChipCategory) pool = pool.filter(p => p.category === activeChipCategory);
    if (sortMode === 'recent') return [...pool].sort((a, b) => b.timestamp - a.timestamp);
    return sortFeed(pool, preferences, aiProfile);
  }, [createdPosts, preferences, aiProfile, activeChipCategory, sortMode]);

  // Mock posts for specific main tabs (events / sport)
  const mockTabPool = useMemo((): Post[] => {
    if (activeMainTab === 'events')  return sortByEventDate(MOCK_POSTS.filter(p => p.category === 'events'));
    if (activeMainTab === 'sport')   return sortByEventDate(MOCK_POSTS.filter(p => p.category === 'sports'));
    if (activeMainTab === 'sightseeing') return MOCK_POSTS.filter(p => p.category === 'travel');
    return [];
  }, [activeMainTab]);

  // Build merged feed depending on active tab
  const mergedFeed = useMemo(() => {
    type FeedItem = { type: 'post'; post: Post } | { type: 'ad'; index: number };
    const items: FeedItem[] = [];
    let adIdx = 0;

    if (activeMainTab === 'partners') {
      // Partners: sponsored posts only, ad every 3
      SPONSORED_POSTS.forEach((post, i) => {
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

    // Events / Sightseeing / Sport: merge AI posts + matching mock posts, sort chronologically
    const combinedRaw = [...mockTabPool];
    const aiSorted = activeMainTab === 'sightseeing'
      ? [...aiPosts].sort((a, b) => b.timestamp - a.timestamp)
      : sortByEventDate(aiPosts);

    // Interleave: show AI posts first (they're location-aware), then mock
    const combinedAll = [...aiSorted, ...combinedRaw];
    // Feature 3 — apply date+price filters on event tabs
    const combined = (activeMainTab === 'events' || activeMainTab === 'sport')
      ? applyEventFilters(combinedAll, dateFilter, priceFilter)
      : combinedAll;

    combined.forEach((post, i) => {
      if (adIndex(i)) items.push({ type: 'ad', index: adIdx++ });
      items.push({ type: 'post', post });
    });

    return items;
  }, [activeMainTab, aiPosts, injectedPosts, curatedPool, visibleCurated, mockTabPool, dateFilter, priceFilter]);

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

    const nearBottom = el.scrollHeight - top - el.clientHeight < 300;
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
    setActiveMainTab(tab);
    setActiveChipCategory(null);
    setVisibleCurated(PAGE_SIZE);
    setInjectedPosts([]);
    setShowNewBanner(false);
    setDateFilter('all');
    setPriceFilter('all');
    setShowFilters(false);
    scrollRef.current?.scrollTo({ top: 0 });
  }

  const isTabLoading = activeMainTab !== 'partners' && aiLoading && mergedFeed.length === 0;

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
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
                <MapPin size={10} />
                {location.city}
              </div>
            ) : (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={onOpenLocationPrompt}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ background: 'rgba(236,72,153,0.1)', color: '#f9a8d4', border: '1px solid rgba(236,72,153,0.2)' }}
              >
                <MapPin size={10} /> Enable location
              </motion.button>
            )}

            {activeMainTab === 'discover' && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => setSortMode(m => m === 'for_you' ? 'recent' : 'for_you')}
                className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full"
                style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}
              >
                {sortMode === 'for_you' ? <><Sparkles size={10} /> For You</> : <><RefreshCw size={10} /> Recent</>}
                <ChevronDown size={9} />
              </motion.button>
            )}
          </div>
        </div>

        {/* ── Main category tabs ── */}
        <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid #1e1e2a', background: '#0d0d16' }}>
          {MAIN_TABS.map(({ id, label, emoji }) => {
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
              <Sparkles size={14} /> New content just dropped — tap to load
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
          {/* Stories strip — discover mode only */}
          {activeMainTab === 'discover' && (
            <div className="flex gap-3 px-4 py-3 overflow-x-auto flex-shrink-0" style={{ borderBottom: '1px solid #1a1a24' }}>
              <YourStory avatar={CURRENT_USER.avatar} />
              {stories.map((story, i) => (
                <StoryItem key={story.id} story={story} onPress={() => { setViewerIndex(i); setViewerOpen(true); }} />
              ))}
            </div>
          )}

          {/* Category chips — discover mode only */}
          {activeMainTab === 'discover' && (
            <div className="flex gap-2 px-4 py-3 overflow-x-auto flex-shrink-0" style={{ borderBottom: '1px solid #1a1a24' }}>
              {DISCOVER_CHIPS.map(({ emoji, label, cat }) => {
                const isActive = activeChipCategory === cat;
                return (
                  <motion.button
                    key={cat}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => {
                      setActiveChipCategory(isActive ? null : cat);
                      setVisibleCurated(PAGE_SIZE);
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
                  Filters
                  {(dateFilter !== 'all' || priceFilter !== 'all') && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </motion.button>

                {/* Active filter chips */}
                {dateFilter !== 'all' && (
                  <motion.button whileTap={{ scale: 0.94 }} onClick={() => setDateFilter('all')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                    style={{ background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.35)' }}>
                    {DATE_FILTERS.find(f => f.id === dateFilter)?.label} ✕
                  </motion.button>
                )}
                {priceFilter !== 'all' && (
                  <motion.button whileTap={{ scale: 0.94 }} onClick={() => setPriceFilter('all')}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                    style={{ background: 'rgba(236,72,153,0.2)', color: '#f9a8d4', border: '1px solid rgba(236,72,153,0.35)' }}>
                    {PRICE_FILTERS.find(f => f.id === priceFilter)?.label} ✕
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
                      <p className="text-xs font-bold mb-2" style={{ color: '#666677' }}>DATE</p>
                      <div className="flex gap-2 flex-wrap mb-3">
                        {DATE_FILTERS.map(f => (
                          <motion.button key={f.id} whileTap={{ scale: 0.93 }}
                            onClick={() => setDateFilter(f.id)}
                            className="px-3 py-1.5 rounded-full text-xs font-semibold"
                            style={{
                              background: dateFilter === f.id ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : '#1a1a24',
                              color: dateFilter === f.id ? 'white' : '#888899',
                              border: dateFilter === f.id ? 'none' : '1px solid #2a2a38',
                            }}>
                            {f.label}
                          </motion.button>
                        ))}
                      </div>
                      <p className="text-xs font-bold mb-2" style={{ color: '#666677' }}>PRICE</p>
                      <div className="flex gap-2 flex-wrap">
                        {PRICE_FILTERS.map(f => (
                          <motion.button key={f.id} whileTap={{ scale: 0.93 }}
                            onClick={() => setPriceFilter(f.id)}
                            className="px-3 py-1.5 rounded-full text-xs font-semibold"
                            style={{
                              background: priceFilter === f.id ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : '#1a1a24',
                              color: priceFilter === f.id ? 'white' : '#888899',
                              border: priceFilter === f.id ? 'none' : '1px solid #2a2a38',
                            }}>
                            {f.label}
                          </motion.button>
                        ))}
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
                  <span className="text-xs font-bold" style={{ color: '#f59e0b' }}>Featured Partners</span>
                  <span className="text-xs ml-auto" style={{ color: '#444455' }}>Sponsored placements</span>
                </>
              ) : (
                <>
                  <Sparkles size={13} style={{ color: '#8b5cf6' }} />
                  <span className="text-xs font-bold" style={{ color: '#a78bfa' }}>
                    {activeMainTab === 'events' && `Events near ${location?.city ?? 'you'}`}
                    {activeMainTab === 'sightseeing' && `Sightseeing near ${location?.city ?? 'you'}`}
                    {activeMainTab === 'sport' && `Sport near ${location?.city ?? 'you'}`}
                  </span>
                  {activeMainTab !== 'sightseeing' && (
                    <span className="text-xs ml-2" style={{ color: '#444455' }}>Sorted by date</span>
                  )}
                  {aiLoading && <Loader2 size={11} style={{ color: '#8b5cf6', marginLeft: 'auto' }} className="animate-spin" />}
                  {!aiLoading && <div className="w-1.5 h-1.5 rounded-full ml-auto" style={{ background: '#22c55e' }} />}
                </>
              )}
            </div>
          )}

          {/* Location AI header — discover only */}
          {activeMainTab === 'discover' && location?.enabled && aiPosts.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'rgba(139,92,246,0.05)', borderBottom: '1px solid #1a1a24' }}>
              <Sparkles size={13} style={{ color: '#8b5cf6' }} />
              <span className="text-xs font-semibold" style={{ color: '#6648aa' }}>
                AI events near {location.city}
              </span>
              <div className="w-1.5 h-1.5 rounded-full ml-1" style={{ background: '#22c55e' }} />
              <span className="text-xs" style={{ color: '#444455' }}>Live</span>
            </div>
          )}

          {/* Initial loading state */}
          {isTabLoading && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <Loader2 size={28} style={{ color: '#8b5cf6' }} className="animate-spin" />
              <p className="text-sm font-medium" style={{ color: '#555566' }}>
                {location?.city
                  ? `Finding ${activeMainTab === 'discover' ? 'events' : activeMainTab} in ${location.city}…`
                  : 'Loading…'}
              </p>
            </div>
          )}

          {/* Feed items */}
          {!isTabLoading && (
            <div>
              {mergedFeed.map((item, i) => {
                if (item.type === 'ad') {
                  return <AdSlot key={`ad_${item.index}`} index={item.index} />;
                }
                const post = item.post;
                return (
                  <div key={post.id}>
                    {activeMainTab === 'discover' && i > 0 && i % 6 === 0 && (
                      <div className="flex items-center gap-2 px-4 py-2" style={{ background: 'rgba(139,92,246,0.04)', borderBottom: '1px solid #1a1a24' }}>
                        <Sparkles size={12} style={{ color: '#8b5cf6' }} />
                        <span className="text-xs font-semibold" style={{ color: '#6648aa' }}>
                          {i === 6 ? 'Based on your top interests' : i === 12 ? 'More you\'ll love' : 'Curated just for you'}
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
                    {location?.city ? `Finding more in ${location.city}…` : 'Loading more…'}
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
                    {activeMainTab === 'partners' ? 'Want to be featured here?' : 'You\'re all caught up ✨'}
                  </p>
                  <p className="text-xs mt-1 text-center" style={{ color: '#555566' }}>
                    {activeMainTab === 'partners'
                      ? 'Contact us at partners@nova-app.com · From €300/month'
                      : 'Pull down to refresh for new content'}
                  </p>
                </div>
              )}
            </div>
          )}

          <div style={{ height: 100 }} />
        </div>
      </div>

      {/* Story viewer */}
      <AnimatePresence>
        {viewerOpen && (
          <StoryViewer stories={stories} initialIndex={viewerIndex} onClose={() => setViewerOpen(false)} />
        )}
      </AnimatePresence>

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
            <RefreshCw size={13} /> Back to top
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
