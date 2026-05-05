'use client';

import { useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, Activity } from 'lucide-react';
import { MOCK_POSTS, MOCK_STORIES, CURRENT_USER, getSortedFeed } from '@/data/mockData';
import { UserPreferences } from '@/types';
import Post from './Post';
import { StoryItem, YourStory } from './Story';

interface Props {
  preferences: UserPreferences;
}

export default function FeedTab({ preferences }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const sortedPosts = useMemo(
    () => getSortedFeed(MOCK_POSTS, preferences as unknown as Record<string, number>),
    [preferences]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div
        className="glass flex items-center justify-between px-4 flex-shrink-0"
        style={{ height: 52, borderBottom: '1px solid #1e1e2a' }}
      >
        <h1
          className="text-2xl font-bold"
          style={{
            background: 'linear-gradient(135deg, #c4b5fd, #f0abfc)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          Nova
        </h1>
        <div className="flex items-center gap-3">
          <motion.button whileTap={{ scale: 0.85 }}>
            <Activity size={23} style={{ color: '#888899' }} />
          </motion.button>
          <motion.button whileTap={{ scale: 0.85 }}>
            <MessageCircle size={23} style={{ color: '#888899' }} />
          </motion.button>
        </div>
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} className="tab-content flex-1 overflow-y-auto">
        {/* Stories */}
        <div
          className="flex gap-4 px-4 py-3 overflow-x-auto flex-shrink-0"
          style={{ borderBottom: '1px solid #1a1a24' }}
        >
          <YourStory avatar={CURRENT_USER.avatar} />
          {MOCK_STORIES.map((story) => (
            <StoryItem
              key={story.id}
              story={story}
              onPress={() => {}}
            />
          ))}
        </div>

        {/* Posts */}
        <div>
          {sortedPosts.map((post, i) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: Math.min(i * 0.05, 0.3) }}
            >
              <Post post={post} />
            </motion.div>
          ))}
        </div>

        {/* Bottom spacer */}
        <div style={{ height: 80 }} />
      </div>
    </div>
  );
}
