'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Calendar, Bell, BellOff, MapPin, TrendingUp, Star, ChevronLeft } from 'lucide-react';
import { NovaNotification } from '@/types';
import { timeAgo } from '@/data/appDefaults';
import { useApp } from '@/context/AppContext';
import { useLanguage } from '@/context/LanguageContext';
import CommentsSheet from './CommentsSheet';

const TYPE_ICON = {
  ai_suggestion: Sparkles,
  event: Calendar,
  trending: TrendingUp,
  nearby: MapPin,
  liked_event: Star,
};

const TYPE_COLOR = {
  ai_suggestion: '#f59e0b',
  event: '#f43f5e',
  trending: '#8b5cf6',
  nearby: '#3b82f6',
  liked_event: '#22c55e',
};

function NotifRow({ notif, onPostOpen }: { notif: NovaNotification; onPostOpen: (id: string) => void }) {
  const { markRead } = useApp();
  const type = notif.type as keyof typeof TYPE_ICON;
  const Icon = TYPE_ICON[type] ?? Bell;
  const color = TYPE_COLOR[type] ?? '#888899';

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      onClick={() => {
        markRead(notif.id);
        if (notif.postId) onPostOpen(notif.postId);
      }}
      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
      style={{
        background: !notif.read ? 'rgba(139,92,246,0.06)' : 'transparent',
        borderBottom: '1px solid #1a1a24',
      }}
    >
      {/* Icon avatar */}
      <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}22`, border: `2px solid ${color}44` }}>
        <Icon size={20} style={{ color }} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug" style={{ color: '#d0d0e8' }}>{notif.text}</p>
        <p className="text-xs mt-0.5" style={{ color: '#444455' }}>{timeAgo(notif.timestamp)}</p>
      </div>

      {/* Post thumb */}
      {notif.postImage && (
        <img src={notif.postImage} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" loading="lazy" />
      )}

      {/* Unread dot */}
      {!notif.read && (
        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#8b5cf6' }} />
      )}
    </motion.div>
  );
}

export default function NotificationsTab({ onClose }: { onClose?: () => void } = {}) {
  const { state, markAllRead, addToast } = useApp();
  const { t } = useLanguage();

  const ALLOWED_TYPES = new Set(['ai_suggestion', 'event', 'comment', 'trending', 'nearby', 'liked_event']);
  const notifs = state.notifications.filter(n => ALLOWED_TYPES.has(n.type));
  const unread = notifs.filter(n => !n.read);
  const read   = notifs.filter(n => n.read);
  const [openPostId, setOpenPostId] = useState<string | null>(null);

  // Resolve the tapped notification's post from its own snapshot first (real
  // feed posts carry one), then from the user's stored interaction snapshots.
  const openPost = openPostId
    ? state.notifications.find(n => n.postId === openPostId)?.post
      ?? state.interactionPosts.find(p => p.id === openPostId)
      ?? null
    : null;

  function requestPermission() {
    if ('Notification' in window) {
      Notification.requestPermission().then(p => {
        if (p === 'granted') addToast(t.notifications.enablePush + ' 🔔', 'success');
        else addToast('Notifications blocked — enable in browser settings', 'info');
      });
    }
  }

  const notifPermission = typeof window !== 'undefined' && 'Notification' in window
    ? Notification.permission : 'denied';

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="glass flex items-center justify-between px-4 flex-shrink-0"
          style={{ height: 52, borderBottom: '1px solid #1e1e2a' }}>
          <div className="flex items-center gap-1.5">
            {onClose && (
              <button onClick={onClose} className="w-8 h-8 -ml-2 flex items-center justify-center rounded-full" aria-label="Back" style={{ color: '#c4b5fd' }}>
                <ChevronLeft size={20} />
              </button>
            )}
            <h2 className="text-base font-bold text-white">{t.notifications.title}</h2>
          </div>
          <div className="flex items-center gap-2">
            {unread.length > 0 && (
              <button onClick={markAllRead} className="text-xs font-semibold" style={{ color: '#a78bfa' }}>
                {t.notifications.markAllRead}
              </button>
            )}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={requestPermission}
              className="w-8 h-8 flex items-center justify-center rounded-full"
              style={{ background: '#1a1a24' }}
            >
              {notifPermission === 'granted'
                ? <Bell size={16} style={{ color: '#a78bfa' }} />
                : <BellOff size={16} style={{ color: '#888899' }} />}
            </motion.button>
          </div>
        </div>

        <div className="tab-content flex-1 overflow-y-auto">
          {/* Notification permission prompt */}
          <AnimatePresence>
            {notifPermission === 'default' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="mx-4 mt-4 p-4 rounded-2xl" style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                  <p className="text-sm font-semibold text-white mb-1">{t.notifications.enablePush}</p>
                  <p className="text-xs mb-3" style={{ color: '#888899' }}>{t.notifications.enablePushDesc}</p>
                  <button
                    onClick={requestPermission}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
                  >
                    {t.notifications.enableButton}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* How Nova notifies you — first-run hint */}
          {notifs.length > 0 && (
            <div className="mx-4 mt-4 mb-1 px-4 py-3 rounded-2xl flex items-center gap-3"
              style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
              <Sparkles size={16} style={{ color: '#f59e0b' }} />
              <p className="text-xs" style={{ color: '#888888' }}>
                Nova discovers events, trending spots and new openings near you — personalised to your interests.
              </p>
            </div>
          )}

          {/* Unread */}
          {unread.length > 0 && (
            <div>
              <p className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#888899' }}>
                {t.notifications.new_section}
              </p>
              {unread.map((n) => <NotifRow key={n.id} notif={n} onPostOpen={setOpenPostId} />)}
            </div>
          )}

          {/* Read */}
          {read.length > 0 && (
            <div>
              <p className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#888899' }}>
                {t.notifications.earlier}
              </p>
              {read.map((n) => <NotifRow key={n.id} notif={n} onPostOpen={setOpenPostId} />)}
            </div>
          )}

          {notifs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 px-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                <Sparkles size={28} style={{ color: '#8b5cf6' }} />
              </div>
              <p className="text-sm font-semibold text-white text-center">{t.notifications.empty}</p>
              <p className="text-xs mt-2 text-center" style={{ color: '#555566' }}>{t.notifications.emptyHint}</p>
            </div>
          )}

          <div style={{ height: 80 }} />
        </div>
      </div>

      {/* Post detail from notification */}
      <AnimatePresence>
        {openPost && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.5)' }}
              onClick={() => setOpenPostId(null)} />
            <CommentsSheet post={openPost} onClose={() => setOpenPostId(null)} />
          </>
        )}
      </AnimatePresence>
    </>
  );
}
