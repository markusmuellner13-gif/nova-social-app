'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bookmark, MapPin, Star } from 'lucide-react';
import { MOCK_POSTS, formatCount } from '@/data/mockData';

export default function SavedTab() {
  const [savedPosts] = useState(MOCK_POSTS.filter((p) => p.saved));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="glass flex items-center justify-between px-4 flex-shrink-0"
        style={{ height: 56, borderBottom: '1px solid #1e1e2a' }}
      >
        <div className="flex items-center gap-2">
          <Bookmark size={18} style={{ color: '#a78bfa' }} />
          <h2 className="text-base font-bold text-white">Saved Places</h2>
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
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}
            >
              <Bookmark size={28} style={{ color: '#a78bfa' }} />
            </div>
            <p className="text-base font-bold text-white text-center">Your saved places appear here</p>
            <p className="text-sm mt-2 text-center leading-relaxed" style={{ color: '#888899' }}>
              Tap the bookmark icon on any post in Discover to save it for later
            </p>
          </div>
        ) : (
          <div className="px-4 pt-4 flex flex-col gap-3">
            {savedPosts.map((post, i) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, delay: i * 0.06 }}
                className="rounded-2xl overflow-hidden"
                style={{ background: '#13131a', border: '1px solid #2a2a38' }}
              >
                {/* Image */}
                <div className="relative w-full" style={{ aspectRatio: '16/9' }}>
                  <img
                    src={post.image}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {/* Category badge */}
                  <span
                    className="absolute top-3 left-3 text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                    style={{ background: 'rgba(0,0,0,0.55)', color: '#c4b5fd', backdropFilter: 'blur(8px)' }}
                  >
                    {post.category}
                  </span>
                </div>

                {/* Info */}
                <div className="p-4">
                  <div className="flex items-center gap-1.5 mb-1">
                    <MapPin size={13} style={{ color: '#8b5cf6' }} />
                    <span className="text-xs font-semibold" style={{ color: '#a78bfa' }}>{post.location.name}</span>
                  </div>
                  <p className="text-sm font-semibold text-white mb-1">{post.user.name}</p>
                  <p className="text-sm leading-relaxed line-clamp-2" style={{ color: '#888899' }}>{post.caption}</p>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-1">
                      <Star size={13} fill="#f59e0b" style={{ color: '#f59e0b' }} />
                      <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>{formatCount(post.likes)} interested</span>
                    </div>
                    <span className="text-xs" style={{ color: '#444455' }}>
                      {post.hashtags.slice(0, 2).join(' ')}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        <div style={{ height: 100 }} />
      </div>
    </div>
  );
}
