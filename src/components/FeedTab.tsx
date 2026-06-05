'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Compass, Sparkles, RefreshCw, ChevronDown, MapPin, Loader2 } from 'lucide-react';
import { MOCK_POSTS, MOCK_STORIES, CURRENT_USER } from '@/data/mockData';
import { Category, Post } from '@/types';
import { sortFeed } from '@/lib/aiEngine';
import { useApp } from '@/context/AppContext';
import { useAIFeed } from '@/hooks/useAIFeed';
import PostComponent from './Post';
import { StoryItem, YourStory } from './Story';
import StoryViewer from './StoryViewer';
import AdSlot from './AdSlot';

// Insert an ad after every AD_EVERY posts, starting at AD_START
// ~1500 ads/month target: at 50 active sessions/day × 6 ads/session = 300/day → scale with users
const AD_START = 3;
const AD_EVERY = 5;

const CATEGORY_CHIPS: { emoji: string; label: string; cat: Category }[] = [
  { emoji: '🎉', label: 'Events',   cat: 'events'    },
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

function adIndex(i: number): boolean {
  return i >= AD_START && (i - AD_START) % AD_EVERY === 0;
}

interface Props {
  onOpenLocationPrompt: () => void;
}

export default function FeedTab({ onOpenLocationPrompt }: Props) {
  const { state, isStorySeen } = useApp();
  const { preferences, aiProfile, createdPosts } = state;
  const location = state.location;

  // AI feed hook
  const { posts: aiPosts, loading: aiLoading, hasMore: aiHasMore, fetchMore, reset: resetAI } = useAIFeed(location);

  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [sortMode, setSortMode] = useState<'for_you' | 'recent'>('for_you');
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

  // Initial AI feed fetch
  useEffect(() => {
    if (initialFetchDone.current) return;
    initialFetchDone.current = true;
    void fetchMore(activeCategory ?? undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetch when location or category changes
  useEffect(() => {
    if (!initialFetchDone.current) return;
    resetAI();
    adCounter.current = 0;
    void fetchMore(activeCategory ?? undefined);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.city, activeCategory]);

  // New posts banner after 30s
  useEffect(() => {
    const t = setTimeout(() => setShowNewBanner(true), 30_000);
    return () => clearTimeout(t);
  }, []);

  // Stories with live seen state
  const stories = useMemo(
    () => MOCK_STORIES.map(s => ({ ...s, seen: isStorySeen(s.id) })),
    [isStorySeen, state.seenStories]
  );

  // Curated/mock posts (sorted by AI)
  const curatedPool = useMemo(() => {
    let pool = [...createdPosts, ...MOCK_POSTS];
    if (activeCategory) pool = pool.filter(p => p.category === activeCategory);
    if (sortMode === 'recent') return [...pool].sort((a, b) => b.timestamp - a.timestamp);
    return sortFeed(pool, preferences, aiProfile);
  }, [createdPosts, preferences, aiProfile, activeCategory, sortMode]);

  // Build the merged feed: interleave AI posts with curated posts, inject ads
  const mergedFeed = useMemo(() => {
    type FeedItem = { type: 'post'; post: Post } | { type: 'ad'; index: number };
    const items: FeedItem[] = [];
    const curated = [...injectedPosts, ...curatedPool.slice(0, visibleCurated)];

    // Weave: 2 curated → 1 AI → 2 curated → 1 AI …
    let ci = 0; let ai = 0; let slot = 0;
    const totalAI = aiPosts.length;
    const totalCur = curated.length;

    while (ci < totalCur || ai < totalAI) {
      // 2 curated
      for (let k = 0; k < 2 && ci < totalCur; k++, ci++, slot++) {
        if (adIndex(slot)) items.push({ type: 'ad', index: adCounter.current++ });
        items.push({ type: 'post', post: curated[ci] });
      }
      // 1 AI
      if (ai < totalAI) {
        slot++;
        if (adIndex(slot)) items.push({ type: 'ad', index: adCounter.current++ });
        items.push({ type: 'post', post: aiPosts[ai++] });
      }
    }
    return items;
  }, [aiPosts, injectedPosts, curatedPool, visibleCurated]);

  // Infinite scroll + scroll-position tracking for refresh button
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    setScrollY(top);

    // Instagram-style: scrolled back to top after being far down → auto-refresh
    if (top === 0 && prevScrollYRef.current > 400) {
      resetAI();
      adCounter.current = 0;
      void fetchMore(activeCategory ?? undefined);
      setInjectedPosts([]);
      setVisibleCurated(PAGE_SIZE);
    }
    prevScrollYRef.current = top;

    const nearBottom = el.scrollHeight - top - el.clientHeight < 300;
    if (!nearBottom) return;
    if (visibleCurated < curatedPool.length) {
      setVisibleCurated(c => c + PAGE_SIZE);
    }
    if (aiHasMore && !aiLoading) {
      void fetchMore(activeCategory ?? undefined);
    }
  }, [visibleCurated, curatedPool.length, aiHasMore, aiLoading, fetchMore, activeCategory, resetAI]);

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
      void fetchMore(activeCategory ?? undefined);
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
  }, [pullDistance, resetAI, fetchMore, activeCategory]);

  function handleNewPostsBanner() {
    setShowNewBanner(false);
    const fresh = curatedPool.slice(0, 4);
    setInjectedPosts(fresh);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

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
            {/* Location indicator */}
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

            {/* Sort toggle */}
            <motion.button
              whileTap={{ scale: 0.92 }}
              onClick={() => setSortMode(m => m === 'for_you' ? 'recent' : 'for_you')}
              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full"
              style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}
            >
              {sortMode === 'for_you' ? <><Sparkles size={10} /> For You</> : <><RefreshCw size={10} /> Recent</>}
              <ChevronDown size={9} />
            </motion.button>
          </div>
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
              <Sparkles size={14} /> New events just dropped — tap to load
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
          {/* Stories strip */}
          <div className="flex gap-3 px-4 py-3 overflow-x-auto flex-shrink-0" style={{ borderBottom: '1px solid #1a1a24' }}>
            <YourStory avatar={CURRENT_USER.avatar} />
            {stories.map((story, i) => (
              <StoryItem key={story.id} story={story} onPress={() => { setViewerIndex(i); setViewerOpen(true); }} />
            ))}
          </div>

          {/* Category chips */}
          <div className="flex gap-2 px-4 py-3 overflow-x-auto flex-shrink-0" style={{ borderBottom: '1px solid #1a1a24' }}>
            {CATEGORY_CHIPS.map(({ emoji, label, cat }) => {
              const isActive = activeCategory === cat;
              return (
                <motion.button
                  key={cat}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => {
                    setActiveCategory(isActive ? null : cat);
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

          {/* Location AI header */}
          {location?.enabled && aiPosts.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: 'rgba(139,92,246,0.05)', borderBottom: '1px solid #1a1a24' }}>
              <Sparkles size={13} style={{ color: '#8b5cf6' }} />
              <span className="text-xs font-semibold" style={{ color: '#6648aa' }}>
                AI events near {location.city}
              </span>
              <div className="w-1.5 h-1.5 rounded-full ml-1" style={{ background: '#22c55e' }} />
              <span className="text-xs" style={{ color: '#444455' }}>Live</span>
            </div>
          )}

          {/* Feed items */}
          <div>
            {mergedFeed.map((item, i) => {
              if (item.type === 'ad') {
                return (
                  <AdSlot key={`ad_${item.index}`} index={item.index} />
                );
              }
              const post = item.post;
              return (
                <div key={post.id}>
                  {/* Suggested divider every 5 content posts */}
                  {i > 0 && i % 6 === 0 && (
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

            {/* AI loading spinner */}
            {aiLoading && (
              <div className="flex items-center justify-center gap-2 py-6">
                <Loader2 size={20} style={{ color: '#8b5cf6' }} className="animate-spin" />
                <span className="text-xs font-medium" style={{ color: '#555566' }}>
                  {location?.city ? `Finding events in ${location.city}…` : 'Loading more…'}
                </span>
              </div>
            )}

            {/* End of feed */}
            {!aiLoading && !aiHasMore && mergedFeed.length > 0 && (
              <div className="flex flex-col items-center py-8 px-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(139,92,246,0.1)' }}>
                  <Sparkles size={20} style={{ color: '#8b5cf6' }} />
                </div>
                <p className="text-sm font-semibold text-white">You're all caught up ✨</p>
                <p className="text-xs mt-1 text-center" style={{ color: '#555566' }}>Pull down to refresh for new events</p>
              </div>
            )}
          </div>

          <div style={{ height: 100 }} />
        </div>
      </div>

      {/* Story viewer */}
      <AnimatePresence>
        {viewerOpen && (
          <StoryViewer stories={stories} initialIndex={viewerIndex} onClose={() => setViewerOpen(false)} />
        )}
      </AnimatePresence>

      {/* Scroll-to-top refresh button — appears when scrolled down 300px+ */}
      <AnimatePresence>
        {scrollY > 300 && (
          <motion.button
            initial={{ opacity: 0, y: 8, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            onClick={() => {
              scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              // Actual refresh happens in handleScroll when scrollTop hits 0
            }}
            className="fixed left-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold text-white shadow-xl"
            style={{
              top: 68,
              transform: 'translateX(-50%)',
              background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
              boxShadow: '0 4px 16px rgba(139,92,246,0.45)',
            }}
          >
            <RefreshCw size={13} /> Refresh feed
          </motion.button>
        )}
      </AnimatePresence>
    </>
  );
}
