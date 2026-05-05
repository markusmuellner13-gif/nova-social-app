'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Compass, MapPin } from 'lucide-react';
import { MOCK_POSTS, getSortedFeed } from '@/data/mockData';
import { UserPreferences, Category } from '@/types';
import Post from './Post';

interface Props {
  preferences: UserPreferences;
}

const FEATURED_TAGS: { emoji: string; label: string; cat: Category }[] = [
  { emoji: '✈️', label: 'Travel',   cat: 'travel'    },
  { emoji: '🍕', label: 'Food',     cat: 'food'      },
  { emoji: '🎨', label: 'Art',      cat: 'art'       },
  { emoji: '💪', label: 'Active',   cat: 'fitness'   },
  { emoji: '🌿', label: 'Life',     cat: 'lifestyle' },
  { emoji: '🎵', label: 'Music',    cat: 'music'     },
];

export default function FeedTab({ preferences }: Props) {
  const sortedPosts = useMemo(
    () => getSortedFeed(MOCK_POSTS, preferences as unknown as Record<string, number>),
    [preferences]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div
        className="glass flex items-center justify-between px-4 flex-shrink-0"
        style={{ height: 56, borderBottom: '1px solid #1e1e2a' }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
          >
            <Compass size={15} color="white" strokeWidth={2.5} />
          </div>
          <h1
            className="text-xl font-bold"
            style={{
              background: 'linear-gradient(135deg, #c4b5fd, #f0abfc)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Nova
          </h1>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
          <MapPin size={11} />
          For you
        </div>
      </div>

      {/* Scrollable content */}
      <div className="tab-content flex-1 overflow-y-auto">

        {/* Category chips */}
        <div
          className="flex gap-2 px-4 py-3 overflow-x-auto flex-shrink-0"
          style={{ borderBottom: '1px solid #1a1a24' }}
        >
          {FEATURED_TAGS.map(({ emoji, label }) => (
            <span
              key={label}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ background: '#1a1a24', color: '#888899', border: '1px solid #2a2a38' }}
            >
              {emoji} {label}
            </span>
          ))}
        </div>

        {/* Posts */}
        <div>
          {sortedPosts.map((post, i) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: Math.min(i * 0.04, 0.28) }}
            >
              <Post post={post} />
            </motion.div>
          ))}
        </div>

        <div style={{ height: 100 }} />
      </div>
    </div>
  );
}
