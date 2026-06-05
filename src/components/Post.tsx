'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, Bookmark, MessageCircle, Share2, BadgeCheck, MapPin, Calendar, ExternalLink, Sparkles } from 'lucide-react';
import { Post as PostType } from '@/types';
import { formatCount, timeAgo } from '@/data/mockData';
import { useApp } from '@/context/AppContext';
import CommentsSheet from './CommentsSheet';
import UserProfileCard from './UserProfileCard';

interface Props {
  post: PostType;
  showHint?: boolean;
}

export default function Post({ post, showHint = false }: Props) {
  const { isLiked, isSaved, likePost, savePost, addToast } = useApp();
  const liked = isLiked(post.id);
  const saved = isSaved(post.id);

  const [showComments, setShowComments] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showStar, setShowStar] = useState(false);
  const [starKey, setStarKey] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);

  const handleLike = useCallback(() => {
    likePost(post.id, post.category);
    if (!liked) addToast(`Loved it ⭐`, 'success');
  }, [liked, likePost, post.id, post.category, addToast]);

  const handleSave = useCallback(() => {
    savePost(post.id, post.category);
    if (!saved) addToast('Saved to collection', 'success', '🔖');
  }, [saved, savePost, post.id, post.category, addToast]);

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    const text = `Check this out on Nova: "${post.caption.slice(0, 60)}…"`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Nova', text, url }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
      addToast('Link copied!', 'info', '🔗');
    }
  }, [post.caption, addToast]);

  const handleDoubleTap = useCallback(() => {
    if (!liked) likePost(post.id, post.category);
    setStarKey(k => k + 1);
    setShowStar(true);
    setHintDismissed(true);
    setTimeout(() => setShowStar(false), 900);
  }, [liked, likePost, post.id, post.category]);

  const caption = post.caption;
  const isLong = caption.length > 90;

  return (
    <>
      <article className="w-full" style={{ borderBottom: '1px solid #1e1e2a' }}>
        {/* Event banner */}
        {post.isEvent && (
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <div
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
              style={{ background: 'linear-gradient(135deg, rgba(244,63,94,0.2), rgba(139,92,246,0.2))', color: '#f87171', border: '1px solid rgba(244,63,94,0.35)' }}
            >
              <Calendar size={11} />
              EVENT — {post.eventDate}
            </div>
            {post.eventVenue && (
              <span className="text-xs font-medium truncate" style={{ color: '#555566' }}>📍 {post.eventVenue}</span>
            )}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowProfile(true)}
            className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden border"
            style={{ borderColor: '#2a2a38' }}
          >
            <img src={post.user.avatar} alt={post.user.username} className="w-full h-full object-cover" loading="lazy" />
          </motion.button>

          <motion.button className="flex-1 min-w-0 text-left" whileTap={{ scale: 0.98 }} onClick={() => setShowProfile(true)}>
            <div className="flex items-center gap-1">
              <span className="text-sm font-semibold text-white truncate">{post.user.name}</span>
              {post.user.verified && <BadgeCheck size={14} className="flex-shrink-0" style={{ color: '#8b5cf6' }} />}
            </div>
            {post.location?.name && (
              <div className="flex items-center gap-0.5">
                <MapPin size={10} style={{ color: '#8b5cf6' }} />
                <span className="text-xs font-medium" style={{ color: '#a78bfa' }}>{post.location.name}</span>
              </div>
            )}
          </motion.button>

          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize flex-shrink-0"
            style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.25)' }}
          >
            {post.category}
          </span>
        </div>

        {/* Image */}
        <div className="relative w-full" style={{ aspectRatio: '4/5', background: '#13131a' }}>
          {!imgLoaded && <div className="absolute inset-0 shimmer" />}
          <img
            src={post.image}
            alt={post.caption}
            className="w-full h-full object-cover"
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            onDoubleClick={handleDoubleTap}
            style={{ display: imgLoaded ? 'block' : 'none' }}
          />

          {/* Double-tap star burst */}
          <AnimatePresence>
            {showStar && (
              <motion.div
                key={starKey}
                initial={{ scale: 0, opacity: 1 }}
                animate={{ scale: 1.3, opacity: 1 }}
                exit={{ scale: 1.7, opacity: 0 }}
                transition={{ duration: 0.65, ease: 'easeOut' }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
              >
                <Star size={96} fill="#f59e0b" style={{ color: '#f59e0b', filter: 'drop-shadow(0 0 24px #f59e0b)' }} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Double-tap hint */}
          <AnimatePresence>
            {showHint && !hintDismissed && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 1.5, duration: 0.4 }}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-semibold pointer-events-none"
                style={{ background: 'rgba(0,0,0,0.7)', color: 'white', backdropFilter: 'blur(8px)', whiteSpace: 'nowrap' }}
              >
                ✨ Double tap to star
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Actions */}
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-4">
              {/* Star / Like */}
              <motion.button whileTap={{ scale: 0.8 }} onClick={handleLike} className="flex items-center gap-1.5">
                <Star
                  size={25}
                  className={liked ? 'heart-pop' : ''}
                  fill={liked ? '#f59e0b' : 'none'}
                  style={{ color: liked ? '#f59e0b' : '#f0f0ff', transition: 'color 0.2s' }}
                />
                <span className="text-sm font-semibold" style={{ color: liked ? '#f59e0b' : '#888899' }}>
                  {formatCount(post.likes + (liked && !post.liked ? 1 : 0))}
                </span>
              </motion.button>

              {/* Comments */}
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => setShowComments(true)} className="flex items-center gap-1.5">
                <MessageCircle size={23} style={{ color: '#888899' }} />
                <span className="text-sm" style={{ color: '#888899' }}>{formatCount(post.comments)}</span>
              </motion.button>

              {/* Share */}
              <motion.button whileTap={{ scale: 0.85 }} onClick={handleShare} className="flex items-center gap-1.5">
                <Share2 size={21} style={{ color: '#888899' }} />
              </motion.button>
            </div>

            {/* Save */}
            <motion.button whileTap={{ scale: 0.8 }} onClick={handleSave} className="flex items-center gap-1.5">
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
            <span className="font-semibold text-white mr-1">{post.user.username}</span>
            {isLong && !expanded ? (
              <>
                {caption.slice(0, 110)}
                <button onClick={() => setExpanded(true)} className="ml-1 font-semibold" style={{ color: '#a78bfa' }}>
                  more
                </button>
              </>
            ) : (
              caption
            )}
          </p>

          {/* Hashtags */}
          {post.hashtags.length > 0 && (
            <p className="text-sm mt-1" style={{ color: '#6655aa' }}>
              {post.hashtags.slice(0, 4).join(' ')}
            </p>
          )}

            {/* Timestamp */}
          <p className="text-xs mt-2" style={{ color: '#444455' }}>
            {timeAgo(post.timestamp)}
          </p>

          {/* AI source badge + Get Tickets CTA */}
          {post.isAIGenerated && (
            <div className="flex items-center gap-2 mt-2 mb-1 flex-wrap">
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <Sparkles size={10} style={{ color: '#a78bfa' }} />
                <span className="text-xs font-semibold" style={{ color: '#a78bfa' }}>AI Discovered</span>
              </div>
              {post.price && (
                <span className="text-xs font-medium" style={{ color: '#555566' }}>{post.price}</span>
              )}
            </div>
          )}

          {post.isEvent && post.eventUrl && (
            <a
              href={post.eventUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold text-white mt-2 mb-3"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={14} />
              Get Tickets &amp; Info
            </a>
          )}
          {post.isEvent && !post.eventUrl && (
            <div style={{ height: 12 }} />
          )}
          {!post.isEvent && <div style={{ height: 12 }} />}
        </div>
      </article>

      {/* Overlays */}
      <AnimatePresence>
        {showComments && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowComments(false)} />
            <CommentsSheet post={post} onClose={() => setShowComments(false)} />
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProfile && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setShowProfile(false)} />
            <UserProfileCard user={post.user} onClose={() => setShowProfile(false)} />
          </>
        )}
      </AnimatePresence>
    </>
  );
}
