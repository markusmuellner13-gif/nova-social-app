'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Bookmark, MoreHorizontal, MapPin, BadgeCheck, Info } from 'lucide-react';
import { Post as PostType } from '@/types';
import { formatCount, timeAgo } from '@/data/mockData';

interface Props {
  post: PostType;
}

export default function Post({ post }: Props) {
  const [interested, setInterested] = useState(post.liked);
  const [saved, setSaved] = useState(post.saved);
  const [interestCount, setInterestCount] = useState(post.likes);
  const [showStar, setShowStar] = useState(false);
  const [starKey, setStarKey] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const handleInterest = useCallback(() => {
    setInterested((prev) => {
      setInterestCount((c) => prev ? c - 1 : c + 1);
      return !prev;
    });
  }, []);

  const handleDoubleTap = useCallback(() => {
    if (!interested) {
      setInterested(true);
      setInterestCount((c) => c + 1);
    }
    setStarKey((k) => k + 1);
    setShowStar(true);
    setTimeout(() => setShowStar(false), 900);
  }, [interested]);

  const caption = post.caption + ' ' + post.hashtags.join(' ');
  const isLong = caption.length > 90;

  return (
    <article className="w-full" style={{ borderBottom: '1px solid #1e1e2a' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden border" style={{ borderColor: '#2a2a38' }}>
          <img
            src={post.user.avatar}
            alt={post.user.username}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-sm font-semibold text-white truncate">{post.user.name}</span>
            {post.user.verified && (
              <BadgeCheck size={14} className="flex-shrink-0" style={{ color: '#8b5cf6' }} />
            )}
          </div>
          {post.location && (
            <div className="flex items-center gap-0.5">
              <MapPin size={10} style={{ color: '#8b5cf6' }} />
              <span className="text-xs font-medium" style={{ color: '#a78bfa' }}>{post.location.name}</span>
            </div>
          )}
        </div>
        {/* Category badge */}
        <span
          className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize flex-shrink-0"
          style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.25)' }}
        >
          {post.category}
        </span>
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

        {/* Double-tap star */}
        <AnimatePresence>
          {showStar && (
            <motion.div
              key={starKey}
              initial={{ scale: 0, opacity: 1 }}
              animate={{ scale: 1.2, opacity: 1 }}
              exit={{ scale: 1.6, opacity: 0 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <Star
                size={90}
                fill="#f59e0b"
                style={{ color: '#f59e0b', filter: 'drop-shadow(0 0 20px #f59e0b)' }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Actions */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-3">
            {/* Interested / star */}
            <motion.button
              whileTap={{ scale: 0.8 }}
              onClick={handleInterest}
              className="flex items-center gap-1.5"
            >
              <Star
                size={25}
                className={interested ? 'heart-pop' : ''}
                fill={interested ? '#f59e0b' : 'none'}
                style={{ color: interested ? '#f59e0b' : '#f0f0ff', transition: 'color 0.2s' }}
              />
              <span className="text-sm font-semibold" style={{ color: interested ? '#f59e0b' : '#888899' }}>
                {formatCount(interestCount)}
              </span>
            </motion.button>

            {/* Info / details */}
            <motion.button whileTap={{ scale: 0.85 }} className="flex items-center gap-1.5">
              <Info size={22} style={{ color: '#888899' }} />
              <span className="text-sm" style={{ color: '#888899' }}>Details</span>
            </motion.button>
          </div>

          {/* Save */}
          <motion.button
            whileTap={{ scale: 0.8 }}
            onClick={() => setSaved((s) => !s)}
            className="flex items-center gap-1.5"
          >
            <Bookmark
              size={23}
              fill={saved ? '#8b5cf6' : 'none'}
              style={{ color: saved ? '#8b5cf6' : '#f0f0ff', transition: 'color 0.2s' }}
            />
            <span className="text-sm font-medium" style={{ color: saved ? '#8b5cf6' : '#888899' }}>
              {saved ? 'Saved' : 'Save'}
            </span>
          </motion.button>
        </div>

        {/* Caption */}
        <p className="text-sm leading-relaxed" style={{ color: '#d0d0e8' }}>
          {isLong && !expanded ? (
            <>
              {caption.slice(0, 120)}
              <button
                onClick={() => setExpanded(true)}
                className="ml-1 font-semibold"
                style={{ color: '#a78bfa' }}
              >
                read more
              </button>
            </>
          ) : (
            caption
          )}
        </p>

        {/* Timestamp */}
        <p className="text-xs mt-2 pb-3" style={{ color: '#444455' }}>
          {timeAgo(post.timestamp)}
        </p>
      </div>
    </article>
  );
}
