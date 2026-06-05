'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, BadgeCheck, Grid3X3, MapPin } from 'lucide-react';
import { User, Post } from '@/types';
import { MOCK_POSTS, formatCount } from '@/data/mockData';
import { useApp } from '@/context/AppContext';

interface Props {
  user: User;
  onClose: () => void;
  onPostOpen?: (post: Post) => void;
}

export default function UserProfileCard({ user, onClose, onPostOpen }: Props) {
  const { isFollowed, followUser, addToast } = useApp();
  const followed = isFollowed(user.id);
  const userPosts = MOCK_POSTS.filter(p => p.user.id === user.id).slice(0, 12);

  function handleFollow() {
    followUser(user.id);
    if (!followed) {
      addToast(`Following @${user.username}`, 'success', '✅');
    }
  }

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 35 }}
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-3xl overflow-hidden"
      style={{ height: '80dvh', background: '#0d0d16', borderTop: '1px solid #2a2a38' }}
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
        <div className="w-10 h-1 rounded-full" style={{ background: '#2a2a38' }} />
      </div>

      {/* Close */}
      <div className="flex justify-end px-4 pb-1 flex-shrink-0">
        <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#1a1a24' }}>
          <X size={16} style={{ color: '#888899' }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Cover gradient */}
        <div className="h-20 w-full" style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(236,72,153,0.2))' }} />

        {/* Avatar + info */}
        <div className="px-4 -mt-10">
          <div className="flex items-end justify-between mb-3">
            <div className="story-ring flex-shrink-0">
              <div className="bg-[#0d0d16] p-0.5 rounded-full">
                <img src={user.avatar} alt={user.name} className="w-16 h-16 rounded-full object-cover" />
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={handleFollow}
              className="px-5 py-2 rounded-xl text-sm font-bold transition-all"
              style={{
                background: followed ? 'transparent' : 'linear-gradient(135deg, #8b5cf6, #ec4899)',
                border: followed ? '1px solid #2a2a38' : 'none',
                color: followed ? '#888899' : 'white',
              }}
            >
              {followed ? 'Following' : 'Follow'}
            </motion.button>
          </div>

          <div className="flex items-center gap-1.5 mb-1">
            <p className="text-base font-bold text-white">{user.name}</p>
            {user.verified && <BadgeCheck size={16} style={{ color: '#8b5cf6' }} />}
          </div>
          <p className="text-sm" style={{ color: '#888899' }}>@{user.username}</p>
          <p className="text-sm mt-2 leading-snug" style={{ color: '#b0b0c8' }}>{user.bio}</p>

          {/* Stats */}
          <div className="flex gap-6 mt-4 mb-4">
            {[
              { label: 'Posts', value: user.posts },
              { label: 'Followers', value: user.followers },
              { label: 'Following', value: user.following },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col items-center">
                <span className="text-base font-bold text-white">{formatCount(value)}</span>
                <span className="text-xs" style={{ color: '#888899' }}>{label}</span>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div className="flex items-center gap-2 mb-3" style={{ borderTop: '1px solid #1e1e2a', paddingTop: 12 }}>
            <Grid3X3 size={16} style={{ color: '#888899' }} />
            <span className="text-xs font-semibold" style={{ color: '#888899' }}>POSTS</span>
          </div>
        </div>

        {/* Post grid */}
        {userPosts.length > 0 ? (
          <div className="grid grid-cols-3 gap-0.5">
            {userPosts.map((post) => (
              <motion.button
                key={post.id}
                whileTap={{ opacity: 0.7 }}
                onClick={() => onPostOpen?.(post)}
                className="relative overflow-hidden"
                style={{ aspectRatio: '1', background: '#13131a' }}
              >
                <img src={post.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                {post.isEvent && (
                  <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-xs font-bold" style={{ background: 'rgba(236,72,153,0.85)', color: 'white', fontSize: 9 }}>
                    EVENT
                  </div>
                )}
              </motion.button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center py-12 px-4">
            <Grid3X3 size={36} style={{ color: '#2a2a38' }} />
            <p className="text-sm text-white mt-3">No posts yet</p>
          </div>
        )}

        <div style={{ height: 24 }} />
      </div>
    </motion.div>
  );
}
