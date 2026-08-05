'use client';

import React, { useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, Link2, Share2, Users } from 'lucide-react';
import { Post } from '@/types';
import { buildShareUrl } from '@/lib/shareLink';
import { coverBackground } from '@/components/PostImage';
import { useApp } from '@/context/AppContext';

interface Props {
  post: Post;
  onClose: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Invite / share sheet — the growth loop.
//
// Lets a user invite their friends & contacts to an event (or any post) through
// the social apps they already use: WhatsApp, Telegram, Messenger, X, Email,
// SMS, or the OS-native share sheet (which exposes their full contact list and
// every installed app). Every channel pre-fills a friendly invite message plus
// the rich, link-previewable Nova event page (/e/<id>) so the link unfurls into
// a proper card wherever it lands.
// ─────────────────────────────────────────────────────────────────────────────

interface Channel {
  key: string;
  label: string;
  emoji: string;
  href: (text: string, url: string) => string;
  // Brand-ish background for the round icon tile
  bg: string;
}

const CHANNELS: Channel[] = [
  { key: 'whatsapp', label: 'WhatsApp', emoji: '💬', bg: 'rgba(37,211,102,0.18)',
    href: (t, u) => `https://wa.me/?text=${encodeURIComponent(`${t}\n${u}`)}` },
  { key: 'telegram', label: 'Telegram', emoji: '✈️', bg: 'rgba(34,158,217,0.18)',
    href: (t, u) => `https://t.me/share/url?url=${encodeURIComponent(u)}&text=${encodeURIComponent(t)}` },
  { key: 'messenger', label: 'Messenger', emoji: '📨', bg: 'rgba(0,132,255,0.18)',
    href: (t, u) => `https://www.facebook.com/dialog/send?link=${encodeURIComponent(u)}&app_id=140586622674265&redirect_uri=${encodeURIComponent(u)}` },
  { key: 'x', label: 'X', emoji: '𝕏', bg: 'rgba(120,120,140,0.18)',
    href: (t, u) => `https://twitter.com/intent/tweet?text=${encodeURIComponent(t)}&url=${encodeURIComponent(u)}` },
  { key: 'facebook', label: 'Facebook', emoji: '👍', bg: 'rgba(24,119,242,0.18)',
    href: (t, u) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(u)}&quote=${encodeURIComponent(t)}` },
  { key: 'email', label: 'Email', emoji: '✉️', bg: 'rgba(139,92,246,0.18)',
    href: (t, u) => `mailto:?subject=${encodeURIComponent('Join me on Nova')}&body=${encodeURIComponent(`${t}\n\n${u}`)}` },
  { key: 'sms', label: 'Messages', emoji: '📱', bg: 'rgba(52,199,89,0.18)',
    href: (t, u) => `sms:?&body=${encodeURIComponent(`${t} ${u}`)}` },
];

export default function InviteSheet({ post, onClose }: Props) {
  const { addToast } = useApp();

  const title = useMemo(() => post.caption.split('\n')[0].slice(0, 90), [post.caption]);
  const shareUrl = useMemo(
    () => buildShareUrl(post, typeof window !== 'undefined' ? window.location.origin : ''),
    [post]
  );

  // A warm, human invite line — tuned for events so it reads like "come with me".
  const inviteText = useMemo(() => {
    if (post.isEvent) {
      const when = post.eventDate ? ` on ${post.eventDate}` : '';
      const where = post.eventVenue ? ` at ${post.eventVenue}` : (post.location?.name ? ` in ${post.location!.name}` : '');
      return `Let's go to ${title}${when}${where}! 🎉 Found it on Nova — you in?`;
    }
    return `Check this out on Nova — ${title} ✨`;
  }, [post, title]);

  const openChannel = useCallback((channel: Channel) => {
    const href = channel.href(inviteText, shareUrl);
    if (channel.key === 'email' || channel.key === 'sms') {
      window.location.href = href;
    } else {
      window.open(href, '_blank', 'noopener,noreferrer');
    }
    onClose();
  }, [inviteText, shareUrl, onClose]);

  const handleNativeShare = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: 'Nova', text: inviteText, url: shareUrl });
        onClose();
      } catch { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(`${inviteText} ${shareUrl}`);
        addToast('Invite link copied!', 'success', '🔗');
      } catch { /* clipboard blocked */ }
      onClose();
    }
  }, [inviteText, shareUrl, addToast, onClose]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      addToast('Link copied!', 'success', '🔗');
    } catch { /* clipboard blocked */ }
    onClose();
  }, [shareUrl, addToast, onClose]);

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose} />
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl px-5 pt-4"
        style={{ background: '#15151f', border: '1px solid #2a2a38', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
      >
        {/* Drag handle */}
        <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: '#3a3a4a' }} />

        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
              <Users size={16} color="white" />
            </div>
            <div>
              <p className="text-base font-bold text-white">{post.isEvent ? 'Invite friends' : 'Share'}</p>
              <p className="text-xs" style={{ color: '#888899' }}>
                {post.isEvent ? 'Bring your crew along' : 'Send this to someone'}
              </p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close"><X size={20} style={{ color: '#666677' }} /></button>
        </div>

        {/* Event preview chip */}
        <div className="flex items-center gap-3 my-4 p-3 rounded-2xl" style={{ background: '#0d0d16', border: '1px solid #2a2a38' }}>
          <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0" style={{ background: coverBackground(post.id) }}>
            {post.image && <img src={post.image} alt="" className="w-full h-full object-cover" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white truncate">{title}</p>
            {(post.eventDate || post.location?.name) && (
              <p className="text-xs truncate" style={{ color: '#a78bfa' }}>
                {[post.eventDate, post.eventVenue || post.location?.name].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        </div>

        {/* Channels */}
        <div className="grid grid-cols-4 gap-3 mb-2">
          {CHANNELS.map(c => (
            <motion.button key={c.key} whileTap={{ scale: 0.9 }} onClick={() => openChannel(c)}
              className="flex flex-col items-center gap-1.5">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                style={{ background: c.bg, border: '1px solid #2a2a38' }}>
                {c.emoji}
              </div>
              <span className="text-xs font-medium" style={{ color: '#aaaabb' }}>{c.label}</span>
            </motion.button>
          ))}

          {/* More — OS native share sheet (full contact list + every app) */}
          <motion.button whileTap={{ scale: 0.9 }} onClick={handleNativeShare}
            className="flex flex-col items-center gap-1.5">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(236,72,153,0.18)', border: '1px solid #2a2a38' }}>
              <Share2 size={22} style={{ color: '#f9a8d4' }} />
            </div>
            <span className="text-xs font-medium" style={{ color: '#aaaabb' }}>More</span>
          </motion.button>
        </div>

        {/* Copy link row */}
        <motion.button whileTap={{ scale: 0.98 }} onClick={handleCopy}
          className="flex items-center gap-3 w-full p-3.5 rounded-2xl mt-3"
          style={{ background: '#0d0d16', border: '1px solid #2a2a38' }}>
          <Link2 size={18} style={{ color: '#a78bfa' }} />
          <span className="text-sm font-medium text-white truncate flex-1 text-left">{shareUrl.replace(/^https?:\/\//, '')}</span>
          <span className="text-xs font-bold px-3 py-1.5 rounded-lg" style={{ background: 'rgba(139,92,246,0.15)', color: '#c4b5fd' }}>Copy</span>
        </motion.button>
      </motion.div>
    </>
  );
}
