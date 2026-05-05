'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, MapPin, BadgeCheck } from 'lucide-react';
import { Post as PostType } from '@/types';
import { formatCount, timeAgo } from '@/data/mockData';

interface Props {
  post: PostType;
}

export default function Post({ post }: Props) {
  const [liked, setLiked] = useState(post.liked);
  const [saved, setSaved] = useState(post.saved);
  const [likeCount, setLikeCount] = useState(post.likes);
  const [showHeart, setShowHeart] = useState(false);
  const [heartKey, setHeartKey] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const handleLike = useCallback(() => {
    setLiked((prev) => {
      setLikeCount((c) => prev ? c - 1 : c + 1);
      return !prev;
    });
  }, []);

  const handleDoubleTap = useCallback(() => {
    if (!liked) {
      setLiked(true);
      setLikeCount((c) => c + 1);
    }
    setHeartKey((k) => k + 1);
    setShowHeart(true);
    setTimeout(() => setShowHeart(false), 900);
  }, [liked]);

  const caption = post.caption + ' ' + post.hashtags.join(' ');
  const isLong = caption.length > 90;

  return (
    <article className="w-full" style={{ borderBottom: '1px solid #1e1e2a' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="story-ring flex-shrink-0">
          <div className="bg-[#0a0a0f] rounded-full p-0.5">
            <img
              src={post.user.avatar}
              alt={post.user.username}
              className="w-9 h-9 rounded-full object-cover"
              loading="lazy"
            />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-semibold text-white truncate">{post.user.username}</span>
            {post.user.verified && (
              <BadgeCheck size={14} className="flex-shrink-0" style={{ color: '#8b5cf6' }} />
            )}
          </div>
          {post.location && (
            <div className="flex items-center gap-0.5">
              <MapPin size={10} style={{ color: '#888899' }} />
              <span className="text-xs" style={{ color: '#888899' }}>{post.location.name}</span>
            </div>
          )}
        </div>
        <button className="p-1" style={{ color: '#888899' }}>
          <MoreHorizontal size={20} />
        </button>
      </div>

      {/* Image */}
      <div className="relative w-full" style={{ aspectRatio: '4/5', background: '#13131a' }}>
        <img
          src={post.image}
          alt={post.caption}
          className="w-full h-full object-cover"
          loading="lazy"
          onDoubleClick={handleDoubleTap}
        />

        {/* Double-tap heart */}
        <AnimatePresence>
          {showHeart && (
            <motion.div
              key={heartKey}
              initial={{ scale: 0, opacity: 1 }}
              animate={{ scale: 1.2, opacity: 1 }}
              exit={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <Heart
                size={90}
                fill="#ec4899"
                style={{ color: '#ec4899', filter: 'drop-shadow(0 0 16px #ec4899)' }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <motion.button
              whileTap={{ scale: 0.8 }}
              onClick={handleLike}
              className="flex items-center gap-1.5"
            >
              <Heart
                size={26}
                className={liked ? 'heart-pop' : ''}
                fill={liked ? '#ec4899' : 'none'}
                style={{ color: liked ? '#ec4899' : '#f0f0ff', transition: 'color 0.2s' }}
              />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }}>
              <MessageCircle size={25} style={{ color: '#f0f0ff' }} />
            </motion.button>
            <motion.button whileTap={{ scale: 0.85 }}>
              <Send size={23} style={{ color: '#f0f0ff', transform: 'rotate(20deg)' }} />
            </motion.button>
          </div>
          <motion.button
            whileTap={{ scale: 0.8 }}
            onClick={() => setSaved((s) => !s)}
          >
            <Bookmark
              size={24}
              fill={saved ? '#8b5cf6' : 'none'}
              style={{ color: saved ? '#8b5cf6' : '#f0f0ff', transition: 'color 0.2s' }}
            />
          </motion.button>
        </div>

        {/* Likes */}
        <p className="text-sm font-semibold text-white mb-1.5">
          {formatCount(likeCount)} likes
        </p>

        {/* Caption */}
        <p className="text-sm leading-snug" style={{ color: '#e0e0f0' }}>
          <span className="font-semibold text-white mr-1.5">{post.user.username}</span>
          {isLong && !expanded ? (
            <>
              {caption.slice(0, 88)}
              <button
                onClick={() => setExpanded(true)}
                className="ml-1"
                style={{ color: '#888899' }}
              >
                ...more
              </button>
            </>
          ) : (
            caption
          )}
        </p>

        {/* Comments */}
        <button className="mt-1 text-sm" style={{ color: '#888899' }}>
          View all {formatCount(post.comments)} comments
        </button>

        {/* Timestamp */}
        <p className="text-xs mt-1 pb-3" style={{ color: '#555566' }}>
          {timeAgo(post.timestamp)}
        </p>
      </div>
    </article>
  );
}
