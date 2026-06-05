'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bookmark, MapPin, Star, ChevronDown, ChevronUp, X } from 'lucide-react';
import { MOCK_POSTS, formatCount } from '@/data/mockData';
import { Category, Post } from '@/types';
import { useApp } from '@/context/AppContext';
import CommentsSheet from './CommentsSheet';

const CATEGORY_LABELS: Partial<Record<Category, { emoji: string; label: string }>> = {
  travel:    { emoji: '✈️', label: 'Travel' },
  food:      { emoji: '🍕', label: 'Food' },
  fashion:   { emoji: '👗', label: 'Fashion' },
  sports:    { emoji: '⚽', label: 'Sports' },
  art:       { emoji: '🎨', label: 'Art' },
  tech:      { emoji: '💻', label: 'Tech' },
  fitness:   { emoji: '💪', label: 'Fitness' },
  music:     { emoji: '🎵', label: 'Music' },
  pets:      { emoji: '🐾', label: 'Pets' },
  lifestyle: { emoji: '🌟', label: 'Lifestyle' },
  events:    { emoji: '🎉', label: 'Events' },
};

export default function SavedTab() {
  const { state, savePost, addToast } = useApp();
  const savedIds = state.savedPosts;
  const savedPosts = MOCK_POSTS.filter(p => savedIds.includes(p.id));

  // Group by category
  const collections = Object.entries(
    savedPosts.reduce<Record<string, Post[]>>((acc, post) => {
      if (!acc[post.category]) acc[post.category] = [];
      acc[post.category].push(post);
      return acc;
    }, {})
  ) as [Category, Post[]][];

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openPost, setOpenPost] = useState<Post | null>(null);

  function toggleCollection(cat: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  function handleUnsave(post: Post) {
    savePost(post.id, post.category);
    addToast('Removed from saved', 'info', '🗑️');
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="glass flex items-center justify-between px-4 flex-shrink-0" style={{ height: 56, borderBottom: '1px solid #1e1e2a' }}>
          <div className="flex items-center gap-2">
            <Bookmark size={18} style={{ color: '#a78bfa' }} />
            <h2 className="text-base font-bold text-white">Collections</h2>
          </div>
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}
          >
            {savedPosts.length} saved
          </span>
        </div>

        <div className="tab-content flex-1 overflow-y-auto">
          {savedPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 px-8">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <Bookmark size={28} style={{ color: '#a78bfa' }} />
              </div>
              <p className="text-base font-bold text-white text-center">Your collections are empty</p>
              <p className="text-sm mt-2 text-center leading-relaxed" style={{ color: '#888899' }}>
                Tap the bookmark on any post to save it here, organised by category.
              </p>
            </div>
          ) : (
            <div className="pt-3 pb-4">
              {collections.map(([cat, posts]) => {
                const meta = CATEGORY_LABELS[cat];
                const isCollapsed = collapsed.has(cat);
                return (
                  <div key={cat} className="mb-4 mx-4">
                    {/* Collection header */}
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={() => toggleCollection(cat)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-2xl mb-2"
                      style={{ background: '#13131a', border: '1px solid #2a2a38' }}
                    >
                      <div className="flex items-center gap-2">
                        <span style={{ fontSize: 20 }}>{meta?.emoji ?? '📌'}</span>
                        <div className="text-left">
                          <p className="text-sm font-bold text-white">{meta?.label ?? cat}</p>
                          <p className="text-xs" style={{ color: '#888899' }}>{posts.length} post{posts.length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {/* Preview thumbnails */}
                        <div className="flex -space-x-1.5">
                          {posts.slice(0, 3).map((p) => (
                            <img key={p.id} src={p.image} alt="" className="w-7 h-7 rounded-lg object-cover border" style={{ borderColor: '#0a0a0f' }} />
                          ))}
                        </div>
                        {isCollapsed ? <ChevronDown size={16} style={{ color: '#555566' }} /> : <ChevronUp size={16} style={{ color: '#555566' }} />}
                      </div>
                    </motion.button>

                    {/* Collection items */}
                    <AnimatePresence>
                      {!isCollapsed && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25 }}
                          className="overflow-hidden"
                        >
                          <div className="flex flex-col gap-2">
                            {posts.map((post) => (
                              <motion.div
                                key={post.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="rounded-2xl overflow-hidden flex gap-3 p-3 cursor-pointer"
                                style={{ background: '#13131a', border: '1px solid #2a2a38' }}
                                onClick={() => setOpenPost(post)}
                              >
                                <img src={post.image} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0" loading="lazy" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1 mb-0.5">
                                    <MapPin size={11} style={{ color: '#8b5cf6' }} />
                                    <span className="text-xs font-semibold truncate" style={{ color: '#a78bfa' }}>{post.location?.name}</span>
                                  </div>
                                  <p className="text-sm font-semibold text-white truncate">{post.user.name}</p>
                                  <p className="text-xs mt-0.5 line-clamp-1 leading-snug" style={{ color: '#888899' }}>{post.caption}</p>
                                  <div className="flex items-center gap-1 mt-1.5">
                                    <Star size={11} fill="#f59e0b" style={{ color: '#f59e0b' }} />
                                    <span className="text-xs" style={{ color: '#f59e0b' }}>{formatCount(post.likes)}</span>
                                  </div>
                                </div>
                                {/* Unsave button */}
                                <motion.button
                                  whileTap={{ scale: 0.85 }}
                                  onClick={(e) => { e.stopPropagation(); handleUnsave(post); }}
                                  className="flex-shrink-0 self-start p-1.5 rounded-lg"
                                  style={{ background: 'rgba(139,92,246,0.1)' }}
                                >
                                  <X size={14} style={{ color: '#888899' }} />
                                </motion.button>
                              </motion.div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ height: 100 }} />
        </div>
      </div>

      <AnimatePresence>
        {openPost && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setOpenPost(null)} />
            <CommentsSheet post={openPost} onClose={() => setOpenPost(null)} />
          </>
        )}
      </AnimatePresence>
    </>
  );
}
