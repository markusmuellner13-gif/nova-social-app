'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Hash, TrendingUp, Flame } from 'lucide-react';
import dynamic from 'next/dynamic';
import { MOCK_POSTS } from '@/data/mockData';
import { Post, Category } from '@/types';
import { formatCount } from '@/data/mockData';

const WorldMap = dynamic(() => import('./WorldMap'), {
  ssr: false,
  loading: () => (
    <div
      className="w-full rounded-2xl shimmer"
      style={{ height: 340 }}
    />
  ),
});

const CATEGORIES: { id: Category; emoji: string; label: string }[] = [
  { id: 'travel', emoji: '✈️', label: 'Travel' },
  { id: 'food', emoji: '🍕', label: 'Food' },
  { id: 'fashion', emoji: '👗', label: 'Fashion' },
  { id: 'sports', emoji: '⚽', label: 'Sports' },
  { id: 'art', emoji: '🎨', label: 'Art' },
  { id: 'tech', emoji: '💻', label: 'Tech' },
  { id: 'fitness', emoji: '💪', label: 'Fitness' },
  { id: 'music', emoji: '🎵', label: 'Music' },
  { id: 'pets', emoji: '🐾', label: 'Pets' },
  { id: 'lifestyle', emoji: '🌟', label: 'Life' },
];

const TRENDING = ['#wanderlust', '#foodie', '#ootd', '#fitness', '#techlife', '#artoftheday', '#musicvibes', '#catsofnova'];

export default function SearchTab() {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredPosts = useMemo(() => {
    let results = MOCK_POSTS;
    if (activeCategory) results = results.filter((p) => p.category === activeCategory);
    if (query.trim()) {
      const q = query.toLowerCase();
      results = results.filter(
        (p) =>
          p.caption.toLowerCase().includes(q) ||
          p.hashtags.some((h) => h.toLowerCase().includes(q)) ||
          p.user.username.toLowerCase().includes(q) ||
          p.location.name.toLowerCase().includes(q)
      );
    }
    return results;
  }, [query, activeCategory]);

  const showResults = query.trim().length > 0 || activeCategory !== null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="glass px-4 pt-3 pb-2 flex-shrink-0"
        style={{ borderBottom: '1px solid #1e1e2a' }}
      >
        <h2 className="text-lg font-bold text-white mb-3">Explore</h2>

        {/* Search bar */}
        <div
          className="flex items-center gap-2 rounded-2xl px-3 py-2.5 transition-all"
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
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search people, places, tags..."
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
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id;
            return (
              <motion.button
                key={cat.id}
                whileTap={{ scale: 0.92 }}
                onClick={() => setActiveCategory(isActive ? null : cat.id)}
                className="flex-shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
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
            <motion.div
              key="discover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* World Map */}
              <div className="px-4 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
                  >
                    <span style={{ fontSize: 12 }}>🌍</span>
                  </div>
                  <h3 className="text-sm font-semibold text-white">Posts Around the World</h3>
                </div>
                <WorldMap posts={MOCK_POSTS} />
              </div>

              {/* Trending tags */}
              <div className="px-4 mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp size={16} style={{ color: '#8b5cf6' }} />
                  <h3 className="text-sm font-semibold text-white">Trending Now</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {TRENDING.map((tag, i) => (
                    <motion.button
                      key={tag}
                      whileTap={{ scale: 0.95 }}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}
                      onClick={() => setQuery(tag.slice(1))}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold"
                      style={{ background: '#1a1a24', color: '#a78bfa', border: '1px solid #2a2a38' }}
                    >
                      <Hash size={11} />
                      {tag.slice(1)}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Hot posts grid */}
              <div className="px-4 mt-6 mb-2">
                <div className="flex items-center gap-2 mb-3">
                  <Flame size={16} style={{ color: '#f97316' }} />
                  <h3 className="text-sm font-semibold text-white">Hot Right Now</h3>
                </div>
              </div>
              <PostGrid posts={MOCK_POSTS.slice(0, 9)} />
            </motion.div>
          ) : (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="px-4 pt-4"
            >
              <p className="text-xs mb-4 font-medium" style={{ color: '#888899' }}>
                {filteredPosts.length} result{filteredPosts.length !== 1 ? 's' : ''}
                {activeCategory && ` in ${CATEGORIES.find((c) => c.id === activeCategory)?.label}`}
              </p>
              <PostGrid posts={filteredPosts} />
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ height: 80 }} />
      </div>
    </div>
  );
}

function PostGrid({ posts }: { posts: Post[] }) {
  if (posts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="text-4xl mb-3">🔍</div>
        <p className="text-sm font-semibold text-white">No posts found</p>
        <p className="text-xs mt-1" style={{ color: '#888899' }}>Try a different search or category</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-0.5">
      {posts.map((post, i) => (
        <motion.div
          key={post.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25, delay: i * 0.03 }}
          className="relative overflow-hidden"
          style={{ aspectRatio: '1', background: '#13131a' }}
        >
          <img
            src={post.image}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {/* Hover overlay */}
          <div
            className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
            style={{ background: 'rgba(0,0,0,0.45)' }}
          >
            <div className="flex gap-2 text-white text-xs font-semibold">
              <span>❤️ {formatCount(post.likes)}</span>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
