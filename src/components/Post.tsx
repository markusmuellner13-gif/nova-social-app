'use client';

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star, Bookmark, MessageCircle, Share2, BadgeCheck, MapPin,
  Calendar, ExternalLink, Sparkles, CheckCircle2, Bell, BellOff, X,
} from 'lucide-react';
import { Post as PostType } from '@/types';
import { formatCount, timeAgo } from '@/data/mockData';
import { useApp } from '@/context/AppContext';
import CommentsSheet from './CommentsSheet';
import UserProfileCard from './UserProfileCard';
import Avatar from './Avatar';

interface Props {
  post: PostType;
  showHint?: boolean;
}

// ── Countdown helper ──────────────────────────────────────────────────────────
function daysUntil(eventDateRaw?: string | null): number | null {
  if (!eventDateRaw) return null;
  const event = new Date(eventDateRaw);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((event.getTime() - today.getTime()) / 86_400_000);
  return diff >= 0 ? diff : null;
}

function countdownLabel(days: number): string {
  if (days === 0) return 'Today!';
  if (days === 1) return 'Tomorrow!';
  return `${days} days away`;
}

// ── Price parser ──────────────────────────────────────────────────────────────
function parseMinPrice(priceStr: string): number {
  const lower = priceStr.toLowerCase();
  if (lower.includes('free') || lower.startsWith('0')) return 0;
  const match = priceStr.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 999;
}

export { parseMinPrice };

// ─────────────────────────────────────────────────────────────────────────────

export default function Post({ post, showHint = false }: Props) {
  const { isLiked, isSaved, isGoing, hasReminder, likePost, savePost, goPost, addReminder, removeReminder, addToast } = useApp();
  const liked  = isLiked(post.id);
  const saved  = isSaved(post.id);
  const going  = isGoing(post.id);
  const reminded = hasReminder(post.id);

  const [showComments, setShowComments] = useState(false);
  const [showProfile,  setShowProfile]  = useState(false);
  const [showStar,     setShowStar]     = useState(false);
  const [starKey,      setStarKey]      = useState(0);
  const [expanded,     setExpanded]     = useState(false);
  const [imgLoaded,    setImgLoaded]    = useState(false);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [showReminderSheet, setShowReminderSheet] = useState(false);

  // ── Going count (deterministic base + 1 if user is going) ────────────────
  const baseGoingCount = useMemo(() => Math.floor(post.likes * 0.08), [post.likes]);
  const goingCount     = going ? baseGoingCount + 1 : baseGoingCount;

  // ── Countdown for saved events ────────────────────────────────────────────
  const countdown = saved && post.isEvent ? daysUntil(post.eventDateRaw) : null;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleLike = useCallback(() => {
    likePost(post.id, post.category);
    if (!liked) addToast('Loved it ⭐', 'success');
  }, [liked, likePost, post.id, post.category, addToast]);

  const handleSave = useCallback(() => {
    savePost(post.id, post.category);
    if (!saved) addToast('Saved to collection 🔖', 'success');
  }, [saved, savePost, post.id, post.category, addToast]);

  const handleGoing = useCallback(() => {
    goPost(post.id);
    if (!going) addToast("You're going! 🎉", 'success');
    else addToast('Removed from going', 'info');
  }, [going, goPost, post.id, addToast]);

  // Feature 5 — Deep link share: uses real event URL when available
  const handleShare = useCallback(async () => {
    const eventTitle = post.caption.split('\n')[0].slice(0, 80);
    const shareUrl   = (post.isEvent && post.eventUrl) ? post.eventUrl : window.location.href;
    const text = post.isEvent && post.eventUrl
      ? `${eventTitle}\n\nFound on Nova — ${shareUrl}`
      : `Check this out on Nova: "${eventTitle}…" ${shareUrl}`;

    if (navigator.share) {
      try { await navigator.share({ title: 'Nova', text, url: shareUrl }); }
      catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      addToast('Link copied!', 'info', '🔗');
    }
  }, [post, addToast]);

  const handleDoubleTap = useCallback(() => {
    if (!liked) likePost(post.id, post.category);
    setStarKey(k => k + 1);
    setShowStar(true);
    setHintDismissed(true);
    setTimeout(() => setShowStar(false), 900);
  }, [liked, likePost, post.id, post.category]);

  const handleSetReminder = useCallback((minutesBefore: number) => {
    if (!post.eventDateRaw) return;
    addReminder({
      postId: post.id,
      title: post.caption.split('\n')[0].slice(0, 60),
      venue: post.eventVenue ?? post.location?.name ?? '',
      eventDateRaw: post.eventDateRaw,
      minutesBefore,
    });
    addToast(`Reminder set ${minutesBefore === 1440 ? '1 day' : '1 hour'} before 🔔`, 'success');
    setShowReminderSheet(false);
  }, [post, addReminder, addToast]);

  const handleRemoveReminder = useCallback(() => {
    removeReminder(post.id);
    addToast('Reminder removed', 'info');
    setShowReminderSheet(false);
  }, [post.id, removeReminder, addToast]);

  const caption = post.caption;
  const isLong  = caption.length > 90;

  return (
    <>
      <article className="w-full" style={{ borderBottom: '1px solid #1e1e2a' }}>

        {/* Feature 6 — Countdown badge on saved events */}
        {countdown !== null && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="flex items-center gap-2 px-4 pt-2.5"
          >
            <div
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
              style={{
                background: countdown <= 1
                  ? 'linear-gradient(135deg, rgba(244,63,94,0.25), rgba(139,92,246,0.2))'
                  : 'rgba(139,92,246,0.12)',
                color: countdown <= 1 ? '#f87171' : '#a78bfa',
                border: `1px solid ${countdown <= 1 ? 'rgba(244,63,94,0.4)' : 'rgba(139,92,246,0.25)'}`,
              }}
            >
              ⏰ {countdownLabel(countdown)}
            </div>
          </motion.div>
        )}

        {/* Sponsored banner */}
        {post.isSponsored && (
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)' }}>
              ✨ PARTNER
            </div>
            <span className="text-xs font-medium" style={{ color: '#555566' }}>Sponsored</span>
          </div>
        )}

        {/* Event banner */}
        {post.isEvent && !post.isSponsored && (
          <div className="flex items-center gap-2 px-4 pt-3 pb-1 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
              style={{ background: 'linear-gradient(135deg, rgba(244,63,94,0.2), rgba(139,92,246,0.2))', color: '#f87171', border: '1px solid rgba(244,63,94,0.35)' }}>
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
          <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowProfile(true)}
            className="flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden border"
            style={{ borderColor: '#2a2a38', background: '#13131a' }}>
            <Avatar src={post.user.avatar} name={post.user.name} size={40} className="w-full h-full rounded-xl" />
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

          <span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize flex-shrink-0"
            style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.25)' }}>
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
            onLoad={() => setImgLoaded(true)}
            onError={() => setImgLoaded(true)}
            onDoubleClick={handleDoubleTap}
            style={{ opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.3s' }}
          />

          <AnimatePresence>
            {showStar && (
              <motion.div key={starKey} initial={{ scale: 0, opacity: 1 }} animate={{ scale: 1.3, opacity: 1 }}
                exit={{ scale: 1.7, opacity: 0 }} transition={{ duration: 0.65, ease: 'easeOut' }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Star size={96} fill="#f59e0b" style={{ color: '#f59e0b', filter: 'drop-shadow(0 0 24px #f59e0b)' }} />
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {showHint && !hintDismissed && (
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                transition={{ delay: 1.5, duration: 0.4 }}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-semibold pointer-events-none"
                style={{ background: 'rgba(0,0,0,0.7)', color: 'white', backdropFilter: 'blur(8px)', whiteSpace: 'nowrap' }}>
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
                <Star size={25} className={liked ? 'heart-pop' : ''}
                  fill={liked ? '#f59e0b' : 'none'}
                  style={{ color: liked ? '#f59e0b' : '#f0f0ff', transition: 'color 0.2s' }} />
                <span className="text-sm font-semibold" style={{ color: liked ? '#f59e0b' : '#888899' }}>
                  {formatCount(post.likes + (liked && !post.liked ? 1 : 0))}
                </span>
              </motion.button>

              {/* Comments */}
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => setShowComments(true)} className="flex items-center gap-1.5">
                <MessageCircle size={23} style={{ color: '#888899' }} />
                <span className="text-sm" style={{ color: '#888899' }}>{formatCount(post.comments)}</span>
              </motion.button>

              {/* Feature 5 — Share with deep link */}
              <motion.button whileTap={{ scale: 0.85 }} onClick={handleShare} className="flex items-center gap-1.5">
                <Share2 size={21} style={{ color: '#888899' }} />
              </motion.button>

              {/* Feature 2 — Going (event posts only) */}
              {post.isEvent && !post.isSponsored && (
                <motion.button whileTap={{ scale: 0.85 }} onClick={handleGoing} className="flex items-center gap-1.5">
                  <CheckCircle2 size={22}
                    fill={going ? '#22c55e' : 'none'}
                    style={{ color: going ? '#22c55e' : '#888899', transition: 'color 0.2s' }} />
                  <span className="text-xs font-semibold" style={{ color: going ? '#22c55e' : '#888899' }}>
                    {formatCount(goingCount)}
                  </span>
                </motion.button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Feature 1 — Reminder bell (event posts only) */}
              {post.isEvent && !post.isSponsored && post.eventDateRaw && (
                <motion.button whileTap={{ scale: 0.8 }} onClick={() => setShowReminderSheet(true)}
                  className="flex items-center gap-1">
                  <Bell size={20}
                    fill={reminded ? '#8b5cf6' : 'none'}
                    style={{ color: reminded ? '#8b5cf6' : '#888899', transition: 'color 0.2s' }} />
                </motion.button>
              )}

              {/* Save */}
              <motion.button whileTap={{ scale: 0.8 }} onClick={handleSave} className="flex items-center gap-1.5">
                <Bookmark size={23}
                  fill={saved ? '#8b5cf6' : 'none'}
                  style={{ color: saved ? '#8b5cf6' : '#f0f0ff', transition: 'color 0.2s' }} />
                <span className="text-sm font-medium" style={{ color: saved ? '#8b5cf6' : '#888899' }}>
                  {saved ? 'Saved' : 'Save'}
                </span>
              </motion.button>
            </div>
          </div>

          {/* Caption */}
          <p className="text-sm leading-relaxed" style={{ color: '#d0d0e8' }}>
            <span className="font-semibold text-white mr-1">{post.user.username}</span>
            {isLong && !expanded ? (
              <>
                {caption.slice(0, 110)}
                <button onClick={() => setExpanded(true)} className="ml-1 font-semibold" style={{ color: '#a78bfa' }}>more</button>
              </>
            ) : caption}
          </p>

          {/* Hashtags */}
          {post.hashtags.length > 0 && (
            <p className="text-sm mt-1" style={{ color: '#6655aa' }}>{post.hashtags.slice(0, 4).join(' ')}</p>
          )}

          <p className="text-xs mt-2" style={{ color: '#444455' }}>{timeAgo(post.timestamp)}</p>

          {/* AI badge */}
          {post.isAIGenerated && (
            <div className="flex items-center gap-2 mt-2 mb-1 flex-wrap">
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <Sparkles size={10} style={{ color: '#a78bfa' }} />
                <span className="text-xs font-semibold" style={{ color: '#a78bfa' }}>AI Discovered</span>
              </div>
              {post.price && (
                <span className="text-xs font-medium" style={{ color: '#555566' }}>{post.price}</span>
              )}
            </div>
          )}

          {/* CTA buttons */}
          {post.isSponsored && post.eventUrl && (
            <a href={post.eventUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold mt-2 mb-3"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #f97316)', color: '#0a0a0f' }}
              onClick={e => e.stopPropagation()}>
              <ExternalLink size={14} />
              {post.sponsoredCta ?? 'Visit Website'}
            </a>
          )}
          {post.isEvent && !post.isSponsored && post.eventUrl && (
            <a href={post.eventUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold text-white mt-2 mb-3"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
              onClick={e => e.stopPropagation()}>
              <ExternalLink size={14} />
              Get Tickets &amp; Info
            </a>
          )}
          {post.isEvent && !post.isSponsored && !post.eventUrl && <div style={{ height: 12 }} />}
          {!post.isEvent && !post.isSponsored && <div style={{ height: 12 }} />}
        </div>
      </article>

      {/* ── Overlays ── */}
      <AnimatePresence>
        {showComments && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.5)' }}
              onClick={() => setShowComments(false)} />
            <CommentsSheet post={post} onClose={() => setShowComments(false)} />
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProfile && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.5)' }}
              onClick={() => setShowProfile(false)} />
            <UserProfileCard user={post.user} onClose={() => setShowProfile(false)} />
          </>
        )}
      </AnimatePresence>

      {/* Feature 1 — Reminder bottom sheet */}
      <AnimatePresence>
        {showReminderSheet && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.6)' }}
              onClick={() => setShowReminderSheet(false)} />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl px-5 pb-10 pt-5"
              style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}
            >
              {/* Drag handle */}
              <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: '#3a3a4a' }} />

              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-base font-bold text-white">Set Event Reminder</p>
                  <p className="text-xs mt-0.5" style={{ color: '#666677' }}>
                    {post.caption.split('\n')[0].slice(0, 50)}
                  </p>
                </div>
                <button onClick={() => setShowReminderSheet(false)}>
                  <X size={20} style={{ color: '#666677' }} />
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <motion.button whileTap={{ scale: 0.97 }} onClick={() => handleSetReminder(1440)}
                  className="flex items-center gap-3 w-full p-4 rounded-2xl text-left"
                  style={{ background: reminded ? 'rgba(139,92,246,0.15)' : '#13131a', border: '1px solid #2a2a38' }}>
                  <Bell size={20} style={{ color: '#8b5cf6' }} />
                  <div>
                    <p className="text-sm font-semibold text-white">1 day before</p>
                    <p className="text-xs" style={{ color: '#666677' }}>Get notified the day before the event</p>
                  </div>
                </motion.button>

                <motion.button whileTap={{ scale: 0.97 }} onClick={() => handleSetReminder(60)}
                  className="flex items-center gap-3 w-full p-4 rounded-2xl text-left"
                  style={{ background: '#13131a', border: '1px solid #2a2a38' }}>
                  <Bell size={20} style={{ color: '#ec4899' }} />
                  <div>
                    <p className="text-sm font-semibold text-white">1 hour before</p>
                    <p className="text-xs" style={{ color: '#666677' }}>Get notified 1 hour before start time</p>
                  </div>
                </motion.button>

                {reminded && (
                  <motion.button whileTap={{ scale: 0.97 }} onClick={handleRemoveReminder}
                    className="flex items-center gap-3 w-full p-4 rounded-2xl text-left"
                    style={{ background: '#13131a', border: '1px solid rgba(244,63,94,0.3)' }}>
                    <BellOff size={20} style={{ color: '#f87171' }} />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: '#f87171' }}>Remove reminder</p>
                      <p className="text-xs" style={{ color: '#666677' }}>Turn off notifications for this event</p>
                    </div>
                  </motion.button>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
