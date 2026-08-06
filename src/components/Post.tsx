'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Star, Bookmark, MessageCircle, Share2, BadgeCheck, MapPin,
  Calendar, ExternalLink, Sparkles, CheckCircle2, Bell, BellOff, X, UserPlus,
} from 'lucide-react';
import { Post as PostType } from '@/types';
import { ensureNotificationPermission } from '@/lib/notifications';
import { postTitle } from '@/lib/postTitle';
import { trackEvent } from '@/lib/track';
import { fetchGoingCount, invalidateGoingCount } from '@/lib/goingCounts';
import { fetchFriendsGoing } from '@/lib/friendsGoing';
import type { FriendGoing } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { formatCount, timeAgo } from '@/data/appDefaults';
import { useApp } from '@/context/AppContext';
import { useLanguage } from '@/context/LanguageContext';
import CommentsSheet from './CommentsSheet';
import UserProfileCard from './UserProfileCard';
import InviteSheet from './InviteSheet';
import Avatar from './Avatar';
import PostImage, { clampAspect } from './PostImage';
import { recordInteraction } from '@/lib/brain/client';

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

// "TONIGHT" / "TOMORROW" / "THIS SAT" for anything imminent, null further out.
// Returned uppercase to sit in the event badge.
function relativeWhen(eventDateRaw?: string | null): string | null {
  if (!eventDateRaw) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const then = new Date(`${eventDateRaw}T00:00:00`);
  if (Number.isNaN(then.getTime())) return null;
  const days = Math.round((then.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return new Date().getHours() >= 16 ? 'TONIGHT' : 'TODAY';
  if (days === 1) return 'TOMORROW';
  if (days <= 6) return `THIS ${then.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase()}`;
  return null;
}

// ── Price parser ──────────────────────────────────────────────────────────────
function parseMinPrice(priceStr: string): number {
  const lower = priceStr.toLowerCase();
  if (lower.includes('free') || lower.startsWith('0')) return 0;
  const match = priceStr.match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 999;
}

export { parseMinPrice };

// "Anna is going" / "Anna and Ben are going" / "Anna and 4 friends are going"
function friendsGoingText(friends: FriendGoing[]): string {
  const n = friends.length;
  const first = friends[0]?.name ?? 'A friend';
  if (n === 1) return `${first} is going`;
  if (n === 2) return `${first} and ${friends[1].name} are going`;
  return `${first} and ${n - 1} friends are going`;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function Post({ post, showHint = false }: Props) {
  const { isLiked, isSaved, isGoing, hasReminder, likePost, savePost, goPost, addReminder, removeReminder, addToast } = useApp();
  const { t } = useLanguage();
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
  const [slide,        setSlide]        = useState(0);
  // The card frame takes the shape of its photo (clamped to the feed's range),
  // so posters are shown whole instead of being cropped into a fixed 4:5 box.
  const [aspect,       setAspect]       = useState<number | null>(null);
  const [hintDismissed, setHintDismissed] = useState(false);
  const [showReminderSheet, setShowReminderSheet] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  // Real counts only: the post's stored count plus this user's own action
  const likeCount  = post.likes + (liked ? 1 : 0);

  // ── Real RSVP count ─────────────────────────────────────────────────────────
  // The aggregate number of people who marked "I'm going" for this event, pulled
  // from the backend (going_counts RPC — counts only, never who). null until it
  // loads / when sync is off, in which case we fall back to the user's own state.
  // We optimistically reflect the user's own toggle against the fetched snapshot
  // so the number moves the instant they tap — without ever inventing a number.
  const [dbGoing, setDbGoing] = useState<number | null>(null);
  const dbIncludedMeRef = useRef(false);
  const isEventPost = post.isEvent && !post.isSponsored;
  useEffect(() => {
    if (!isEventPost) return;
    let active = true;
    dbIncludedMeRef.current = going; // best proxy for whether the snapshot counts me
    fetchGoingCount(post.id).then(n => { if (active) setDbGoing(n); }).catch(() => {});
    return () => { active = false; };
    // Fetch once per post on mount; `going` is intentionally read at mount time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id, isEventPost]);

  const goingCount = dbGoing === null
    ? (going ? 1 : 0)
    : Math.max(0, dbGoing + (going === dbIncludedMeRef.current ? 0 : going ? 1 : -1));

  // ── Friends going (social proof) ────────────────────────────────────────────
  // Which of the people you follow are going to this event. RLS guarantees we
  // only ever see followed-users' RSVPs. Far more compelling than a raw total.
  const { user } = useAuth();
  const [friends, setFriends] = useState<FriendGoing[]>([]);
  useEffect(() => {
    if (!isEventPost || !user) { setFriends([]); return; }
    let active = true;
    fetchFriendsGoing(post.id).then(f => { if (active) setFriends(f); }).catch(() => {});
    return () => { active = false; };
  }, [post.id, isEventPost, user?.id]);

  // ── Advertiser impression tracking (#9) — count once per sponsored render ──
  useEffect(() => {
    if (post.isSponsored) trackEvent('impression', post.id);
  }, [post.isSponsored, post.id]);

  // ── Nova Brain: the negative signal ───────────────────────────────────────
  // A model trained only on likes learns that everything is good. What makes it
  // discriminate is knowing what people SAW and ignored. We count an impression
  // only once the card has been genuinely on screen for a moment — a post that
  // flew past during a fast scroll was never really shown, and scoring it as
  // rejected would teach the model the wrong thing.
  const articleRef = useRef<HTMLElement | null>(null);
  const impressionSent = useRef(false);
  useEffect(() => {
    const el = articleRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
        if (!timer && !impressionSent.current) {
          timer = setTimeout(() => {
            impressionSent.current = true;
            recordInteraction(post, 'impression');
            io.disconnect();
          }, 1200);
        }
      } else if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    }, { threshold: [0, 0.6, 1] });
    io.observe(el);
    return () => { if (timer) clearTimeout(timer); io.disconnect(); };
  }, [post]);

  // ── Countdown for saved events ────────────────────────────────────────────
  const countdown = saved && post.isEvent ? daysUntil(post.eventDateRaw) : null;

  const countdownLabel = (days: number): string => {
    if (days === 0) return t.common.today;
    if (days === 1) return t.common.tomorrow;
    return `${days} ${t.common.daysAway}`;
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  // Every one of these also trains Nova Brain. Only a positive action is
  // reported here — the "seen and scrolled past" negative comes from the
  // impression observer below, so the model learns from both what people take
  // and what they leave.
  const handleLike = useCallback(() => {
    likePost(post);
    if (!liked) { recordInteraction(post, 'like'); addToast('Loved it ⭐', 'success'); }
  }, [liked, likePost, post, addToast]);

  const handleSave = useCallback(() => {
    savePost(post);
    if (!saved) { recordInteraction(post, 'save'); addToast('Saved to collection 🔖', 'success'); }
  }, [saved, savePost, post, addToast]);

  const handleGoing = useCallback(() => {
    goPost(post);
    // Drop the cached aggregate so any other instance refetches the fresh count.
    invalidateGoingCount(post.id);
    if (!going) { recordInteraction(post, 'going'); addToast(t.common.goingLabel, 'success'); }
    else addToast('Removed from going', 'info');
  }, [going, goPost, post, addToast, t.common.goingLabel]);

  // Feature 5/6 — Open the invite/share sheet: a rich, link-previewable Nova page
  // (/e/<id>) sent through WhatsApp/Telegram/X/Email/SMS or the OS share sheet.
  // This is the core growth loop — every invite is a friend brought in.
  const handleShare = useCallback(() => {
    recordInteraction(post, 'share');
    setShowInvite(true);
  }, [post]);

  const handleDoubleTap = useCallback(() => {
    if (!liked) likePost(post);
    setStarKey(k => k + 1);
    setShowStar(true);
    setHintDismissed(true);
    setTimeout(() => setShowStar(false), 900);
  }, [liked, likePost, post]);

  const handleSetReminder = useCallback((minutesBefore: number) => {
    if (!post.eventDateRaw) return;
    // Ask for notification permission so the reminder can actually fire (#4).
    void ensureNotificationPermission();
    addReminder({
      postId: post.id,
      title: postTitle(post, 'Event', 60),
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
  // Swipeable gallery when the post carries multiple real photos; otherwise just
  // the single image (most posts).
  const gallery = post.images && post.images.length > 1 ? post.images : [post.image];

  return (
    <>
      {/* content-visibility keeps off-screen posts unrendered — the feed stays
          smooth no matter how long the endless scroll gets */}
      <article ref={articleRef} className="w-full" style={{ borderBottom: '1px solid #1e1e2a', contentVisibility: 'auto', containIntrinsicSize: 'auto 900px' } as React.CSSProperties}>

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
              ✨ {t.common.partner}
            </div>
            <span className="text-xs font-medium" style={{ color: '#555566' }}>{t.common.sponsored}</span>
          </div>
        )}

        {/* Event banner */}
        {post.isEvent && !post.isSponsored && (
          <div className="flex items-center gap-2 px-4 pt-3 pb-1 flex-wrap">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
              style={{ background: 'linear-gradient(135deg, rgba(244,63,94,0.2), rgba(139,92,246,0.2))', color: '#f87171', border: '1px solid rgba(244,63,94,0.35)' }}>
              <Calendar size={11} />
              {/* Lead with how soon it is. "EVENT — Friday, 31 July 2026" makes
                  you do date arithmetic to answer "is this tonight?"; "TONIGHT"
                  answers it. The full date still follows for anything further
                  out than a week. */}
              {relativeWhen(post.eventDateRaw) ?? t.common.event} — {post.eventDate}
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
                <span className="text-xs font-medium truncate" style={{ color: '#a78bfa' }}>{post.location!.name}</span>
                {typeof post.distanceKm === 'number' && post.distanceKm > 0 && (
                  <span className="text-xs font-semibold flex-shrink-0" style={{ color: '#6d6d80' }}>
                    · {post.distanceKm < 10 ? post.distanceKm.toFixed(1) : Math.round(post.distanceKm)} km
                  </span>
                )}
              </div>
            )}
          </motion.button>

          <span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize flex-shrink-0"
            style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.25)' }}>
            {post.category}
          </span>
        </div>

        {/* Image */}
        <div
          className="relative w-full"
          style={{
            aspectRatio: aspect ? `${clampAspect(aspect)}` : '4/5',
            background: '#13131a',
            transition: 'aspect-ratio 0.25s ease',
          }}
        >
          {!imgLoaded && <div className="absolute inset-0 shimmer" />}
          {gallery.length > 1 ? (
            <div
              className="flex w-full h-full overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
              onDoubleClick={handleDoubleTap}
              style={{ opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.3s' }}
            >
              {gallery.map((src, i) => (
                <PostImage
                  key={i}
                  src={src}
                  alt={post.caption}
                  priority={i === 0}
                  onLoaded={i === 0 ? () => setImgLoaded(true) : undefined}
                  onAspect={i === 0 ? setAspect : undefined}
                  className="flex-shrink-0 snap-center"
                  style={{ minWidth: '100%' }}
                />
              ))}
            </div>
          ) : (
            <PostImage
              src={post.image}
              alt={post.caption}
              priority
              onLoaded={() => setImgLoaded(true)}
              onAspect={setAspect}
              onDoubleClick={handleDoubleTap}
              style={{ opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.3s' }}
            />
          )}

          {/* Gallery indicators */}
          {gallery.length > 1 && (
            <>
              <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-xs font-semibold pointer-events-none"
                style={{ background: 'rgba(0,0,0,0.6)', color: 'white', backdropFilter: 'blur(6px)' }}>
                {slide + 1}/{gallery.length}
              </div>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none">
                {gallery.map((_, i) => (
                  <div key={i} className="rounded-full transition-all"
                    style={{ width: i === slide ? 7 : 5, height: i === slide ? 7 : 5,
                      background: i === slide ? '#fff' : 'rgba(255,255,255,0.5)' }} />
                ))}
              </div>
            </>
          )}

          <AnimatePresence>
            {showStar && (
              <motion.div key={starKey} initial={{ scale: 0, opacity: 1 }} animate={{ scale: 1.3, opacity: 1 }}
                exit={{ scale: 1.7, opacity: 0 }} transition={{ duration: 0.65, ease: 'easeOut' }}
                className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Star size={96} fill="#f59e0b" style={{ color: '#f59e0b', filter: 'drop-shadow(0 0 24px #f59e0b)' }} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Going count pill — visible on the image so social proof is front and centre */}
          {isEventPost && goingCount > 0 && (
            <div
              className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full pointer-events-none"
              style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)', border: '1px solid rgba(34,197,94,0.3)' }}
            >
              <CheckCircle2 size={12} fill="#22c55e" style={{ color: '#22c55e' }} />
              <span className="text-xs font-bold" style={{ color: '#4ade80' }}>{formatCount(goingCount)} going</span>
            </div>
          )}

          <AnimatePresence>
            {showHint && !hintDismissed && (
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                transition={{ delay: 2, duration: 0.4 }}
                onAnimationComplete={() => { setTimeout(() => setHintDismissed(true), 3000); }}
                className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs font-semibold pointer-events-none"
                style={{ background: 'rgba(0,0,0,0.7)', color: 'white', backdropFilter: 'blur(8px)', whiteSpace: 'nowrap' }}>
                {t.common.hintDoubleTap}
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
                {likeCount > 0 && (
                  <span className="text-sm font-semibold" style={{ color: liked ? '#f59e0b' : '#888899' }}>
                    {formatCount(likeCount)}
                  </span>
                )}
              </motion.button>

              {/* Comments */}
              <motion.button whileTap={{ scale: 0.85 }} onClick={() => setShowComments(true)} className="flex items-center gap-1.5">
                <MessageCircle size={23} style={{ color: '#888899' }} />
                {post.comments > 0 && (
                  <span className="text-sm" style={{ color: '#888899' }}>{formatCount(post.comments)}</span>
                )}
              </motion.button>

              {/* Feature 5 — Invite / share with deep link */}
              <motion.button whileTap={{ scale: 0.85 }} onClick={handleShare} className="flex items-center gap-1.5" aria-label="Invite or share">
                {post.isEvent && !post.isSponsored
                  ? <UserPlus size={22} style={{ color: '#888899' }} />
                  : <Share2 size={21} style={{ color: '#888899' }} />}
              </motion.button>

              {/* Feature 2 — Going (event posts only) */}
              {post.isEvent && !post.isSponsored && (
                <motion.button whileTap={{ scale: 0.85 }} onClick={handleGoing} className="flex items-center gap-1.5">
                  <CheckCircle2 size={22}
                    fill={going ? '#22c55e' : 'none'}
                    style={{ color: going ? '#22c55e' : '#888899', transition: 'color 0.2s' }} />
                  {goingCount > 0 && (
                    <span className="text-xs font-semibold" style={{ color: '#22c55e' }}>
                      {formatCount(goingCount)}
                    </span>
                  )}
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
                  {saved ? t.common.saved : t.common.save}
                </span>
              </motion.button>
            </div>
          </div>

          {/* Friends going — social proof from the people you follow */}
          {isEventPost && friends.length > 0 && (
            <div className="flex items-center gap-2 mb-2">
              <div className="flex -space-x-2">
                {friends.slice(0, 3).map(f => (
                  <div key={f.id} className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0"
                    style={{ border: '2px solid #0a0a0f' }}>
                    <Avatar src={f.avatar} name={f.name} size={24} className="w-full h-full rounded-full" />
                  </div>
                ))}
              </div>
              <span className="text-xs font-semibold" style={{ color: '#22c55e' }}>
                {friendsGoingText(friends)}
              </span>
            </div>
          )}

          {/* Caption */}
          <p className="text-sm leading-relaxed" style={{ color: '#d0d0e8' }}>
            <span className="font-semibold text-white mr-1">{post.user.username}</span>
            {isLong && !expanded ? (
              <>
                {caption.slice(0, 110)}
                <button onClick={() => setExpanded(true)} className="ml-1 font-semibold" style={{ color: '#a78bfa' }}>{t.common.more}</button>
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
                <span className="text-xs font-semibold" style={{ color: '#a78bfa' }}>{t.common.aiDiscovered}</span>
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
              onClick={e => { e.stopPropagation(); trackEvent('click', post.id); }}>
              <ExternalLink size={14} />
              {post.sponsoredCta ?? 'Visit Website'}
            </a>
          )}
          {post.isEvent && !post.isSponsored && (
            <div className="flex items-center gap-2 mt-2 mb-3">
              {post.eventUrl && (
                <a href={post.eventUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 flex-1 py-2.5 rounded-xl text-sm font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
                  onClick={e => { e.stopPropagation(); recordInteraction(post, 'ticket_click'); }}>
                  <ExternalLink size={14} />
                  {t.common.getTickets}
                </a>
              )}
              <motion.button whileTap={{ scale: 0.96 }} onClick={() => setShowInvite(true)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold ${post.eventUrl ? 'px-4' : 'flex-1'}`}
                style={{ background: post.eventUrl ? '#1a1a24' : 'linear-gradient(135deg, #22c55e, #10b981)',
                  color: post.eventUrl ? '#c4b5fd' : 'white',
                  border: post.eventUrl ? '1px solid #2a2a38' : 'none' }}>
                <UserPlus size={15} />
                {post.eventUrl ? 'Invite' : 'Invite friends'}
              </motion.button>
            </div>
          )}
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

      {/* Invite / share sheet */}
      <AnimatePresence>
        {showInvite && <InviteSheet post={post} onClose={() => setShowInvite(false)} />}
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
                  <p className="text-base font-bold text-white">{t.common.setReminder}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#666677' }}>
                    {postTitle(post, 'Event', 50)}
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
                    <p className="text-sm font-semibold text-white">{t.common.reminderDay}</p>
                    <p className="text-xs" style={{ color: '#666677' }}>{t.common.reminderDayDesc}</p>
                  </div>
                </motion.button>

                <motion.button whileTap={{ scale: 0.97 }} onClick={() => handleSetReminder(60)}
                  className="flex items-center gap-3 w-full p-4 rounded-2xl text-left"
                  style={{ background: '#13131a', border: '1px solid #2a2a38' }}>
                  <Bell size={20} style={{ color: '#ec4899' }} />
                  <div>
                    <p className="text-sm font-semibold text-white">{t.common.reminderHour}</p>
                    <p className="text-xs" style={{ color: '#666677' }}>{t.common.reminderHourDesc}</p>
                  </div>
                </motion.button>

                {reminded && (
                  <motion.button whileTap={{ scale: 0.97 }} onClick={handleRemoveReminder}
                    className="flex items-center gap-3 w-full p-4 rounded-2xl text-left"
                    style={{ background: '#13131a', border: '1px solid rgba(244,63,94,0.3)' }}>
                    <BellOff size={20} style={{ color: '#f87171' }} />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: '#f87171' }}>{t.common.removeReminder}</p>
                      <p className="text-xs" style={{ color: '#666677' }}>{t.common.removeReminderDesc}</p>
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
