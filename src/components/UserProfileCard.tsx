'use client';

import { motion } from 'framer-motion';
import { X, BadgeCheck, MapPin, UserPlus, UserCheck } from 'lucide-react';
import { User } from '@/types';
import { useApp } from '@/context/AppContext';
import Avatar from './Avatar';

interface Props {
  user: User;
  onClose: () => void;
}

// Honest source/organizer card. Feed posts come from real sources (venues,
// organizers, ticket platforms, tourism boards) — not social accounts — so
// this shows who they are, never invented follower counts or post grids.
export default function UserProfileCard({ user, onClose }: Props) {
  const { isFollowed, followUser, addToast } = useApp();
  const followed = isFollowed(user.id);

  function handleFollow() {
    followUser(user.id);
    if (!followed) {
      addToast(`You'll see more from ${user.name}`, 'success', '✅');
    }
  }

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 35 }}
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-3xl overflow-hidden"
      style={{ background: '#0d0d16', borderTop: '1px solid #2a2a38' }}
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

      <div className="px-5 pb-10">
        {/* Avatar + identity */}
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-2xl overflow-hidden flex-shrink-0" style={{ border: '1px solid #2a2a38', background: '#13131a' }}>
            <Avatar src={user.avatar} name={user.name} size={64} className="w-full h-full rounded-2xl" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-base font-bold text-white truncate">{user.name}</p>
              {user.verified && <BadgeCheck size={16} className="flex-shrink-0" style={{ color: '#8b5cf6' }} />}
            </div>
            <p className="text-sm truncate" style={{ color: '#888899' }}>@{user.username}</p>
          </div>
        </div>

        {user.bio && (
          <p className="text-sm leading-relaxed mb-4" style={{ color: '#b0b0c8' }}>{user.bio}</p>
        )}

        <div className="flex items-center gap-2 mb-5 px-3 py-2.5 rounded-xl" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.18)' }}>
          <MapPin size={14} className="flex-shrink-0" style={{ color: '#a78bfa' }} />
          <p className="text-xs leading-snug" style={{ color: '#a78bfa' }}>
            Content from {user.name} shows up in your feed when it&apos;s happening near you.
          </p>
        </div>

        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={handleFollow}
          className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
          style={{
            background: followed ? 'transparent' : 'linear-gradient(135deg, #8b5cf6, #ec4899)',
            border: followed ? '1px solid #2a2a38' : 'none',
            color: followed ? '#888899' : 'white',
          }}
        >
          {followed ? <><UserCheck size={15} /> Following</> : <><UserPlus size={15} /> Follow for more like this</>}
        </motion.button>
      </div>
    </motion.div>
  );
}
