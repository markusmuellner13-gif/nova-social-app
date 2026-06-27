'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Hash, TrendingUp, Flame, MapPin, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { MOCK_POSTS, formatCount } from '@/data/mockData';
import { Post, Category } from '@/types';
import CommentsSheet from './CommentsSheet';
import { useLanguage } from '@/context/LanguageContext';
import { useApp } from '@/context/AppContext';
import { apiUrl } from '@/lib/apiBase';

const WorldMap = dynamic(() => import('./WorldMap'), {
  ssr: false,
  loading: () => <div className="w-full rounded-2xl shimmer" style={{ height: 340 }} />,
});

const NavMap = dynamic(() => import('./NavMap'), { ssr: false });

const CATEGORY_EMOJIS: { id: Category; emoji: string }[] = [
  { id: 'travel',    emoji: '✈️' },
  { id: 'food',      emoji: '🍕' },
  { id: 'fashion',   emoji: '👗' },
  { id: 'sports',    emoji: '⚽' },
  { id: 'art',       emoji: '🎨' },
  { id: 'tech',      emoji: '💻' },
  { id: 'fitness',   emoji: '💪' },
  { id: 'music',     emoji: '🎵' },
  { id: 'pets',      emoji: '🐾' },
  { id: 'lifestyle', emoji: '🌟' },
  { id: 'outdoors',  emoji: '🏞️' },
  { id: 'events',    emoji: '🎉' },
];

function buildTrending(posts: Post[]): string[] {
  const freq: Record<string, number> = {};
  posts.forEach(p => p.hashtags.forEach(h => { freq[h] = (freq[h] ?? 0) + 1; }));
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([tag]) => tag);
}

export default function SearchTab() {
  const { t } = useLanguage();
  const { state } = useApp();
  const categories = CATEGORY_EMOJIS.map(({ id, emoji }) => ({ id, emoji, label: t.categories[id] }));
  const location = state.location;

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [focused, setFocused] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [mapPosts, setMapPosts] = useState<Post[]>([]);
  const [showNav, setShowNav] = useState(false);
  const [navTarget, setNavTarget] = useState<Post | null>(null);
  const [localHotPosts, setLocalHotPosts] = useState<Post[]>([]);
  const [localHotLoading, setLocalHotLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevCityRef = useRef<string | null>(null);

  // Real, live events worldwide for the globe map
  useEffect(() => {
    let cancelled = false;
    fetch(apiUrl('/api/map'))
      .then(res => (res.ok ? res.json() : null))
      .then((data: { posts?: Post[] } | null) => {
        if (cancelled) return;
        const real = data?.posts ?? [];
        if (real.length > 0) setMapPosts(real);
      })
      .catch(() => { /* keep fallback */ });
    return () => { cancelled = true; };
  }, []);

  // Fetch location-specific "Hot Right Now" posts whenever the city changes
  const fetchLocalHot = useCallback(async () => {
    if (!location?.city) return;
    if (location.city === prevCityRef.current) return;
    prevCityRef.current = location.city;
    setLocalHotLoading(true);
    try {
      const params = new URLSearchParams({
        city:     location.city,
        country:  location.country,
        lat:      location.lat.toFixed(3),
        lng:      location.lng.toFixed(3),
        category: 'discover',
        count:    '18',
        page:     '0',
        radius:   '15',
        days:     '60',
      });
      const res = await fetch(apiUrl(`/api/feed?${params}`), {
        signal: AbortSignal.timeout?.(18_000) ?? undefined,
      });
      if (!res.ok) return;
      const data = (await res.json()) as { posts?: Post[] };
      const posts = data.posts ?? [];
      if (posts.length > 0) setLocalHotPosts(posts);
    } catch { /* keep fallback */ } finally {
      setLocalHotLoading(false);
    }
  }, [location?.city, location?.country, location?.lat, location?.lng]);

  useEffect(() => { void fetchLocalHot(); }, [fetchLocalHot]);

  const globePosts = mapPosts.length > 0 ? mapPosts : MOCK_POSTS;
  const globeFocus = location
    ? { lat: location.lat, lng: location.lng }
    : null;

  // Search pool: prefer real local posts, fall back to global mock posts
  const searchPool = localHotPosts.length > 0 ? localHotPosts : MOCK_POSTS;

  // Trending tags derived from actual post data — local posts first, then global
  const trending = useMemo(
    () => buildTrending(localHotPosts.length > 0 ? localHotPosts : MOCK_POSTS),
    [localHotPosts]
  );

  const filteredPosts = useMemo(() => {
    let results = searchPool;
    if (activeCategory) results = results.filter(p => p.category === activeCategory);
    if (query.trim()) {
      const q = query.toLowerCase().replace('#', '');
      results = results.filter(
        p =>
          p.caption.toLowerCase().includes(q) ||
          p.hashtags.some(h => h.toLowerCase().includes(q)) ||
          p.user.username.toLowerCase().includes(q) ||
          p.location?.name?.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    }
    return results;
  }, [query, activeCategory, searchPool]);

  const showResults = query.trim().length > 0 || activeCategory !== null;

  function handleTrendingClick(tag: string) {
    setQuery(tag.startsWith('#') ? tag.slice(1) : tag);
    inputRef.current?.focus();
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="glass px-4 pt-3 pb-2 flex-shrink-0" style={{ borderBottom: '1px solid #1e1e2a' }}>
          <h2 className="text-lg font-bold text-white mb-3">Explore</h2>

          {/* Search bar */}
          <div
            className="flex items-center gap-2 rounded-2xl px-3 py-2.5"
            style={{
              background: '#16161f',
              border: `1px solid ${focused ? '#8b5cf6' : '#2a2a38'}`,
              transition: 'border-color 0.2s',
            }}
          >
            <Search size={16} style={{ color: focused ? '#a78bfa' : '#888899', transition: 'color 0.2s' }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Search people, places, tags, events…"
              className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#555566] font-medium"
            />
            <AnimatePresence>
              {query && (
                <motion.button
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0 }}
                  onClick={() => setQuery('')}
                >
                  <X size={15} style={{ color: '#888899' }} />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Category chips */}
          <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
            {categories.map(cat => {
              const isActive = activeCategory === cat.id;
              return (
                <motion.button
                  key={cat.id}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setActiveCategory(isActive ? null : cat.id)}
                  className="flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
                  style={{
                    background: isActive ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : '#1a1a24',
                    color: isActive ? 'white' : '#888899',
                    border: isActive ? 'none' : '1px solid #2a2a38',
                  }}
                >
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="tab-content flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {!showResults ? (
              <motion.div key="discover" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {/* World Map */}
                <div className="px-4 pt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                      <span style={{ fontSize: 12 }}>🌍</span>
                    </div>
                    <h3 className="text-sm font-semibold text-white">Live Events Around the World</h3>
                  </div>
                  <WorldMap
                    posts={globePosts}
                    onPostOpen={setSelectedPost}
                    focus={globeFocus}
                    onNavigate={(p) => { setNavTarget(p); setShowNav(true); }}
                  />
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => { setNavTarget(null); setShowNav(true); }}
                    className="mt-3 w-full py-3 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', boxShadow: '0 4px 16px rgba(139,92,246,0.35)' }}
                  >
                    🧭 Open Map &amp; Navigate
                  </motion.button>
                </div>

                {/* Trending */}
                <div className="px-4 mt-6">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={16} style={{ color: '#8b5cf6' }} />
                    <h3 className="text-sm font-semibold text-white">Trending Now</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {trending.map((tag, i) => (
                      <motion.button
                        key={tag}
                        whileTap={{ scale: 0.95 }}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        onClick={() => handleTrendingClick(tag)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold"
                        style={{ background: '#1a1a24', color: '#a78bfa', border: '1px solid #2a2a38' }}
                      >
                        <Hash size={11} />
                        {tag.startsWith('#') ? tag.slice(1) : tag}
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Hot posts grid — location-aware */}
                <div className="mt-6 mb-2">
                  <div className="flex items-center gap-2 mb-3 px-4">
                    <Flame size={16} style={{ color: '#f97316' }} />
                    <h3 className="text-sm font-semibold text-white">
                      {location?.city ? `Hot in ${location.city}` : 'Hot Right Now'}
                    </h3>
                    {location?.city && (
                      <div className="flex items-center gap-1 ml-auto">
                        <MapPin size={10} style={{ color: '#a78bfa' }} />
                        <span className="text-xs" style={{ color: '#a78bfa' }}>{location.city}</span>
                      </div>
                    )}
                    {localHotLoading && <Loader2 size={12} style={{ color: '#8b5cf6', marginLeft: 'auto' }} className="animate-spin" />}
                  </div>
                  <PostGrid
                    posts={localHotPosts.length > 0 ? localHotPosts.slice(0, 18) : MOCK_POSTS.slice(0, 18)}
                    onPostOpen={setSelectedPost}
                  />
                </div>
              </motion.div>
            ) : (
              <motion.div key="results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="px-4 pt-4">
                <p className="text-xs mb-4 font-medium" style={{ color: '#888899' }}>
                  {filteredPosts.length} result{filteredPosts.length !== 1 ? 's' : ''}
                  {activeCategory && ` in ${categories.find(c => c.id === activeCategory)?.label}`}
                  {query && ` for "${query}"`}
                </p>
                <PostGrid posts={filteredPosts} onPostOpen={setSelectedPost} query={query} onSuggestion={s => { setQuery(s); }} />
              </motion.div>
            )}
          </AnimatePresence>
          <div style={{ height: 80 }} />
        </div>
      </div>

      {/* Full-screen map + in-app navigation */}
      {showNav && (
        <NavMap
          posts={globePosts}
          userLocation={globeFocus}
          initialTarget={navTarget}
          onClose={() => setShowNav(false)}
        />
      )}

      {/* Post detail sheet */}
      <AnimatePresence>
        {selectedPost && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.5)' }}
              onClick={() => setSelectedPost(null)} />
            <CommentsSheet post={selectedPost} onClose={() => setSelectedPost(null)} />
          </>
        )}
      </AnimatePresence>
    </>
  );
}

const SEARCH_SUGGESTIONS = [
  '🎵 Live music', '🍕 Food markets', '🎨 Art exhibitions',
  '🏃 Fitness events', '🎉 Weekend parties', '🍸 Rooftop bars',
  '🎭 Theatre shows', '🌿 Outdoor activities',
];

function PostGrid({ posts, onPostOpen, query, onSuggestion }: { posts: Post[]; onPostOpen: (p: Post) => void; query?: string; onSuggestion?: (s: string) => void }) {
  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <div className="text-4xl mb-3">🔍</div>
        <p className="text-sm font-semibold text-white mb-1">No results{query ? ` for "${query}"` : ''}</p>
        <p className="text-xs mb-6" style={{ color: '#888899' }}>Try one of these instead</p>
        <div className="flex flex-wrap gap-2 justify-center">
          {SEARCH_SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => onSuggestion?.(s.replace(/^[^\s]+\s/, ''))}
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: '#1a1a24', color: '#c4b5fd', border: '1px solid #2a2a38' }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 gap-0.5">
      {posts.map((post, i) => (
        <motion.button
          key={post.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, delay: i * 0.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => onPostOpen(post)}
          className="relative overflow-hidden"
          style={{ aspectRatio: '1', background: '#13131a' }}
        >
          <img src={post.image} alt="" className="w-full h-full object-cover" loading="lazy" />
          {post.isEvent && (
            <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: 'rgba(244,63,94,0.85)', color: 'white', fontSize: 9 }}>
              EVENT
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.45)' }}>
            <span className="text-white text-xs font-semibold">⭐ {formatCount(post.likes)}</span>
          </div>
        </motion.button>
      ))}
    </div>
  );
}
