'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Compass, Sparkles, RefreshCw, ChevronDown } from 'lucide-react';
import { MOCK_POSTS, MOCK_STORIES, CURRENT_USER } from '@/data/mockData';
import { Category, Post } from '@/types';
import { sortFeed } from '@/lib/aiEngine';
import { useApp } from '@/context/AppContext';
import PostComponent from './Post';
import { StoryItem, YourStory } from './Story';
import StoryViewer from './StoryViewer';

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

export default function FeedTab() {
  const { state, isStorySeen, markStorySeen } = useApp();
  const { preferences, aiProfile, createdPosts } = state;

  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [sortMode, setSortMode] = useState<'for_you' | 'recent'>('for_you');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showNewBanner, setShowNewBanner] = useState(false);
  const [injectedPosts, setInjectedPosts] = useState<Post[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasShownHintRef = useRef(false);

  // Show "new posts" banner after 30s
  useEffect(() => {
    const t = setTimeout(() => setShowNewBanner(true), 30_000);
    return () => clearTimeout(t);
  }, []);

  // All posts pool including created
  const allPosts = useMemo(() => [...createdPosts, ...MOCK_POSTS], [createdPosts]);

  // Stories with computed seen state
  const stories = useMemo(() =>
    MOCK_STORIES.map(s => ({ ...s, seen: isStorySeen(s.id) })),
    [isStorySeen, state.seenStories]
  );

  // AI-sorted feed
  const sortedFeed = useMemo(() => {
    let pool = allPosts;
    if (activeCategory) pool = pool.filter(p => p.category === activeCategory);
    if (sortMode === 'recent') return [...pool].sort((a, b) => b.timestamp - a.timestamp);
    return sortFeed(pool, preferences, aiProfile);
  }, [allPosts, preferences, aiProfile, activeCategory, sortMode]);

  const visiblePosts = useMemo(() => {
    const posts = [...injectedPosts, ...sortedFeed];
    return posts.slice(0, visibleCount);
  }, [sortedFeed, injectedPosts, visibleCount]);

  // Infinite scroll via scroll listener
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 200;
    if (nearBottom && visibleCount < sortedFeed.length + injectedPosts.length) {
      setVisibleCount(c => c + PAGE_SIZE);
    }
  }, [visibleCount, sortedFeed.length, injectedPosts.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Pull-to-refresh touch handling
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (scrollRef.current && scrollRef.current.scrollTop === 0) {
      setTouchStart(e.touches[0].clientY);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (touchStart === null) return;
    const dist = Math.max(0, Math.min(80, e.touches[0].clientY - touchStart));
    setPullDistance(dist);
  }, [touchStart]);

  const handleTouchEnd = useCallback(() => {
    if (pullDistance > 55) {
      setIsRefreshing(true);
      setPullDistance(0);
      setTouchStart(null);
      setTimeout(() => {
        setVisibleCount(PAGE_SIZE);
        setInjectedPosts([]);
        setIsRefreshing(false);
        scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
      }, 900);
    } else {
      setPullDistance(0);
      setTouchStart(null);
    }
  }, [pullDistance]);

  function handleNewPostsBanner() {
    setShowNewBanner(false);
    // Inject 4 "new" posts at top
    const topCatPosts = sortedFeed.filter(p => !injectedPosts.find(ip => ip.id === p.id)).slice(0, 4);
    setInjectedPosts(prev => [...topCatPosts, ...prev]);
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openStory(index: number) {
    setViewerIndex(index);
    setViewerOpen(true);
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
          {/* Sort toggle */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={() => setSortMode(m => m === 'for_you' ? 'recent' : 'for_you')}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full"
            style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}
          >
            {sortMode === 'for_you' ? (
              <><Sparkles size={11} /> For You</>
            ) : (
              <><RefreshCw size={11} /> Recent</>
            )}
            <ChevronDown size={10} />
          </motion.button>
        </div>

        {/* "New posts" banner */}
        <AnimatePresence>
          {showNewBanner && (
            <motion.button
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 40, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={handleNewPostsBanner}
              className="flex items-center justify-center gap-2 w-full text-sm font-semibold overflow-hidden flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.25), rgba(236,72,153,0.2))', color: '#c4b5fd', borderBottom: '1px solid rgba(139,92,246,0.2)' }}
            >
              <Sparkles size={14} /> 4 new posts for you — tap to load
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
          <div
            className="flex gap-3 px-4 py-3 overflow-x-auto flex-shrink-0"
            style={{ borderBottom: '1px solid #1a1a24' }}
          >
            <YourStory avatar={CURRENT_USER.avatar} />
            {stories.map((story, i) => (
              <StoryItem
                key={story.id}
                story={story}
                onPress={() => openStory(i)}
              />
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
                  onClick={() => { setActiveCategory(isActive ? null : cat); setVisibleCount(PAGE_SIZE); }}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
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

          {/* Posts */}
          <div>
            {visiblePosts.map((post, i) => (
              <div key={post.id}>
                {/* "Suggested for you" divider every 5 posts */}
                {i > 0 && i % 5 === 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 px-4 py-2.5"
                    style={{ background: 'rgba(139,92,246,0.04)', borderBottom: '1px solid #1a1a24' }}
                  >
                    <Sparkles size={13} style={{ color: '#8b5cf6' }} />
                    <span className="text-xs font-semibold" style={{ color: '#6648aa' }}>
                      {i === 5 ? 'Based on your top interests' : i === 10 ? 'Because you love this content' : 'Nova AI picked these for you'}
                    </span>
                  </motion.div>
                )}
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, delay: Math.min(i * 0.03, 0.2) }}
                >
                  <PostComponent
                    post={post}
                    showHint={i === 0 && !hasShownHintRef.current}
                  />
                </motion.div>
              </div>
            ))}

            {/* Loading more indicator */}
            {visibleCount < sortedFeed.length + injectedPosts.length && (
              <div className="flex items-center justify-center py-6">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                >
                  <RefreshCw size={20} style={{ color: '#2a2a38' }} />
                </motion.div>
              </div>
            )}

            {/* End of feed */}
            {visibleCount >= sortedFeed.length + injectedPosts.length && sortedFeed.length > 0 && (
              <div className="flex flex-col items-center py-8 px-4">
                <div className="w-10 h-10 rounded-full flex items-center justify-center mb-3" style={{ background: 'rgba(139,92,246,0.1)' }}>
                  <Sparkles size={20} style={{ color: '#8b5cf6' }} />
                </div>
                <p className="text-sm font-semibold text-white">You're all caught up</p>
                <p className="text-xs mt-1 text-center" style={{ color: '#555566' }}>Nova AI is finding more content for you</p>
              </div>
            )}
          </div>

          <div style={{ height: 100 }} />
        </div>
      </div>

      {/* Story viewer overlay */}
      <AnimatePresence>
        {viewerOpen && (
          <StoryViewer
            stories={stories}
            initialIndex={viewerIndex}
            onClose={() => setViewerOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
