'use client';

import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { Story as StoryType } from '@/types';

interface StoryItemProps {
  story: StoryType;
  onPress: () => void;
}

export function StoryItem({ story, onPress }: StoryItemProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onPress}
      className="flex flex-col items-center gap-1.5 flex-shrink-0"
    >
      <div className={story.seen ? 'story-ring-seen' : 'story-ring'}>
        <div className="bg-[#0a0a0f] p-0.5 rounded-full">
          <img
            src={story.user.avatar}
            alt={story.user.username}
            className="w-14 h-14 rounded-full object-cover"
            loading="lazy"
          />
        </div>
      </div>
      <span
        className="text-xs font-medium max-w-[64px] truncate"
        style={{ color: story.seen ? '#555566' : '#d0d0e8' }}
      >
        {story.user.username.split('.')[0]}
      </span>
    </motion.button>
  );
}

interface YourStoryProps {
  avatar: string;
}

export function YourStory({ avatar }: YourStoryProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      className="flex flex-col items-center gap-1.5 flex-shrink-0"
    >
      <div className="relative">
        <div className="w-[60px] h-[60px] rounded-full overflow-hidden border-2" style={{ borderColor: '#2a2a38' }}>
          <img
            src={avatar}
            alt="Your story"
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
        <div
          className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', border: '2px solid #0a0a0f' }}
        >
          <Plus size={11} color="white" strokeWidth={3} />
        </div>
      </div>
      <span className="text-xs font-medium" style={{ color: '#888899' }}>
        Your story
      </span>
    </motion.button>
  );
}
