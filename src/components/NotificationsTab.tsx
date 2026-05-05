'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Heart, MessageCircle, UserPlus, AtSign } from 'lucide-react';
import { MOCK_NOTIFICATIONS, timeAgo } from '@/data/mockData';
import { Notification } from '@/types';

const TYPE_ICON = {
  like: Heart,
  comment: MessageCircle,
  follow: UserPlus,
  mention: AtSign,
};

const TYPE_COLOR = {
  like: '#ec4899',
  comment: '#8b5cf6',
  follow: '#22c55e',
  mention: '#3b82f6',
};

export default function NotificationsTab() {
  const [notifs, setNotifs] = useState(MOCK_NOTIFICATIONS);

  const unread = notifs.filter((n) => !n.read);
  const read = notifs.filter((n) => n.read);

  function markAllRead() {
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="glass flex items-center justify-between px-4 flex-shrink-0"
        style={{ height: 52, borderBottom: '1px solid #1e1e2a' }}
      >
        <h2 className="text-base font-bold text-white">Activity</h2>
        {unread.length > 0 && (
          <button
            onClick={markAllRead}
            className="text-xs font-semibold"
            style={{ color: '#a78bfa' }}
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="tab-content flex-1 overflow-y-auto">
        {/* Unread */}
        {unread.length > 0 && (
          <div>
            <p className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#888899' }}>
              New
            </p>
            {unread.map((notif, i) => (
              <NotifRow key={notif.id} notif={notif} index={i} unread />
            ))}
          </div>
        )}

        {/* Read */}
        {read.length > 0 && (
          <div>
            <p className="px-4 pt-4 pb-2 text-xs font-semibold uppercase tracking-widest" style={{ color: '#888899' }}>
              Earlier
            </p>
            {read.map((notif, i) => (
              <NotifRow key={notif.id} notif={notif} index={i} />
            ))}
          </div>
        )}

        {notifs.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64">
            <Heart size={40} style={{ color: '#2a2a38' }} />
            <p className="text-sm font-semibold text-white mt-3">No activity yet</p>
          </div>
        )}

        <div style={{ height: 80 }} />
      </div>
    </div>
  );
}

function NotifRow({ notif, index, unread }: { notif: Notification; index: number; unread?: boolean }) {
  const Icon = TYPE_ICON[notif.type];
  const color = TYPE_COLOR[notif.type];

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      className="flex items-center gap-3 px-4 py-3"
      style={{
        background: unread ? 'rgba(139,92,246,0.06)' : 'transparent',
        borderBottom: '1px solid #1a1a24',
      }}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <img
          src={notif.user.avatar}
          alt={notif.user.username}
          className="w-11 h-11 rounded-full object-cover"
          loading="lazy"
        />
        <div
          className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: color, border: '2px solid #0a0a0f' }}
        >
          <Icon size={10} color="white" fill={notif.type === 'like' ? 'white' : 'none'} />
        </div>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug" style={{ color: '#d0d0e8' }}>
          <span className="font-semibold text-white">{notif.user.username}</span>
          {' '}
          {notif.text}
        </p>
        <p className="text-xs mt-0.5" style={{ color: '#555566' }}>
          {timeAgo(notif.timestamp)}
        </p>
      </div>

      {/* Post thumb */}
      {notif.postImage && (
        <img
          src={notif.postImage}
          alt=""
          className="w-11 h-11 rounded-lg object-cover flex-shrink-0"
          loading="lazy"
        />
      )}

      {/* Follow button */}
      {notif.type === 'follow' && (
        <button
          className="px-3 py-1.5 rounded-xl text-xs font-semibold flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: 'white' }}
        >
          Follow
        </button>
      )}
    </motion.div>
  );
}
