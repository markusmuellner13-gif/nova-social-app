'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, UserPlus, AtSign, Sparkles, Calendar, Bell, BellOff } from 'lucide-react';
import { NovaNotification } from '@/types';
import { timeAgo } from '@/data/mockData';
import { useApp } from '@/context/AppContext';
import CommentsSheet from './CommentsSheet';
import { MOCK_POSTS } from '@/data/mockData';

const TYPE_ICON = {
  like: Heart, comment: MessageCircle, follow: UserPlus,
  mention: AtSign, ai_suggestion: Sparkles, event: Calendar,
};
const TYPE_COLOR = {
  like: '#ec4899', comment: '#8b5cf6', follow: '#22c55e',
  mention: '#3b82f6', ai_suggestion: '#f59e0b', event: '#f43f5e',
};

function NotifRow({ notif, onPostOpen }: { notif: NovaNotification; onPostOpen: (id: string) => void }) {
  const { followUser, isFollowed, markRead, addToast } = useApp();
  const Icon = TYPE_ICON[notif.type] ?? Bell;
  const color = TYPE_COLOR[notif.type] ?? '#888899';
  const followed = isFollowed(notif.user.id);
  const isAI = notif.type === 'ai_suggestion' || notif.type === 'event';

  function handleFollow() {
    followUser(notif.user.id);
    if (!followed) addToast(`Following @${notif.user.username}`, 'success', '✅');
  }

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
        background: !notif.read
          ? (isAI ? 'rgba(245,158,11,0.06)' : 'rgba(139,92,246,0.06)')
          : 'transparent',
        borderBottom: '1px solid #1a1a24',
      }}
    >
      {/* Avatar with icon badge */}
      <div className="relative flex-shrink-0">
        {isAI ? (
          <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ background: `${color}22`, border: `2px solid ${color}44` }}>
            <Icon size={20} style={{ color }} />
          </div>
        ) : (
          <>
            <img src={notif.user.avatar} alt={notif.user.username} className="w-11 h-11 rounded-full object-cover" loading="lazy" />
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: color, border: '2px solid #0a0a0f' }}>
              <Icon size={10} color="white" fill={notif.type === 'like' ? 'white' : 'none'} />
            </div>
          </>
        )}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug" style={{ color: '#d0d0e8' }}>
          {!isAI && <span className="font-semibold text-white">{notif.user.username} </span>}
          {notif.text}
        </p>
        <p className="text-xs mt-0.5" style={{ color: '#444455' }}>{timeAgo(notif.timestamp)}</p>
      </div>

      {/* Post thumb */}
      {notif.postImage && (
        <img src={notif.postImage} alt="" className="w-11 h-11 rounded-lg object-cover flex-shrink-0" loading="lazy" />
      )}

      {/* Follow button */}
      {notif.type === 'follow' && (
        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={(e) => { e.stopPropagation(); handleFollow(); }}
          className="px-3 py-1.5 rounded-xl text-xs font-bold flex-shrink-0"
          style={{
            background: followed ? 'transparent' : 'linear-gradient(135deg, #8b5cf6, #ec4899)',
            border: followed ? '1px solid #2a2a38' : 'none',
            color: followed ? '#888899' : 'white',
          }}
        >
          {followed ? 'Following' : 'Follow'}
        </motion.button>
      )}
    </motion.div>
  );
}

export default function NotificationsTab() {
  const { state, markAllRead, addToast } = useApp();
  // Only show AI discovery and event notifications — not social like/follow/mention
  const ALLOWED_TYPES = new Set(['ai_suggestion', 'event', 'comment']);
  const notifs = state.notifications.filter(n => ALLOWED_TYPES.has(n.type));
  const unread = notifs.filter(n => !n.read);
  const read = notifs.filter(n => n.read);
  const [openPostId, setOpenPostId] = useState<string | null>(null);

  const openPost = MOCK_POSTS.find(p => p.id === openPostId);

  function requestPermission() {
    if ('Notification' in window) {
      Notification.requestPermission().then(p => {
        if (p === 'granted') addToast('Push notifications enabled 🔔', 'success');
        else addToast('Notifications blocked — you can enable in browser settings', 'info');
      });
    }
  }

  const notifPermission = typeof window !== 'undefined' && 'Notification' in window
    ? Notification.permission : 'denied';

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="glass flex items-center justify-between px-4 flex-shrink-0" style={{ height: 52, borderBottom: '1px solid #1e1e2a' }}>
          <h2 className="text-base font-bold text-white">Activity</h2>
          <div className="flex items-center gap-2">
            {unread.length > 0 && (
              <button onClick={markAllRead} className="text-xs font-semibold" style={{ color: '#a78bfa' }}>
                Mark all read
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
                  <p className="text-sm font-semibold text-white mb-1">Stay in the loop 🔔</p>
                  <p className="text-xs mb-3" style={{ color: '#888899' }}>Enable push notifications so Nova can alert you when new content matches your interests.</p>
                  <button
                    onClick={requestPermission}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
                  >
                    Enable Notifications
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Unread */}
          {unread.length > 0 && (
            <div>
              <p className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#888899' }}>New</p>
              {unread.map((n) => <NotifRow key={n.id} notif={n} onPostOpen={setOpenPostId} />)}
            </div>
          )}

          {/* Read */}
          {read.length > 0 && (
            <div>
              <p className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#888899' }}>Earlier</p>
              {read.map((n) => <NotifRow key={n.id} notif={n} onPostOpen={setOpenPostId} />)}
            </div>
          )}

          {notifs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64">
              <Bell size={40} style={{ color: '#2a2a38' }} />
              <p className="text-sm font-semibold text-white mt-3">No activity yet</p>
              <p className="text-xs mt-1" style={{ color: '#555566' }}>Interactions will appear here</p>
            </div>
          )}
          <div style={{ height: 80 }} />
        </div>
      </div>

      {/* Post detail from notification */}
      <AnimatePresence>
        {openPost && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-30" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setOpenPostId(null)} />
            <CommentsSheet post={openPost} onClose={() => setOpenPostId(null)} />
          </>
        )}
      </AnimatePresence>
    </>
  );
}
