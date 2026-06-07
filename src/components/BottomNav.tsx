'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Compass, Search, Users, Bell, User } from 'lucide-react';
import { useApp } from '@/context/AppContext';

export type Tab = 'feed' | 'explore' | 'groups' | 'notifications' | 'profile';

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
}

function NavButton({ id, Icon, label, isActive, onClick, badge }: {
  id: Tab; Icon: React.ElementType; label: string;
  isActive: boolean; onClick: () => void; badge?: number;
}) {
  return (
    <button onClick={onClick} className="flex flex-col items-center justify-center gap-1 flex-1 h-full" style={{ minWidth: 0 }}>
      <motion.div whileTap={{ scale: 0.8 }} className="relative flex items-center justify-center rounded-2xl transition-all"
        style={{ width: 48, height: 36, background: isActive ? 'rgba(139,92,246,0.15)' : 'transparent' }}>
        <Icon size={26} strokeWidth={isActive ? 2.2 : 1.7}
          style={{ color: isActive ? '#a78bfa' : '#55556a', transition: 'color 0.2s' }} />
        <AnimatePresence>
          {badge != null && badge > 0 && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="absolute -top-0.5 -right-0.5 min-w-4 h-4 rounded-full flex items-center justify-center text-white font-bold"
              style={{ background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', fontSize: 9, padding: '0 3px' }}>
              {badge > 99 ? '99+' : badge}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      <span className="text-xs font-semibold" style={{ color: isActive ? '#a78bfa' : '#55556a', transition: 'color 0.2s', letterSpacing: '0.01em' }}>
        {label}
      </span>
    </button>
  );
}

export default function BottomNav({ active, onChange }: Props) {
  const { unreadCount } = useApp();

  const tabs: { id: Tab; Icon: React.ElementType; label: string; badge?: number; center?: boolean }[] = [
    { id: 'feed',          Icon: Compass, label: 'Discover'  },
    { id: 'explore',       Icon: Search,  label: 'Explore'   },
    { id: 'groups',        Icon: Users,   label: 'Groups',   center: true },
    { id: 'notifications', Icon: Bell,    label: 'Activity',  badge: unreadCount },
    { id: 'profile',       Icon: User,    label: 'Profile'   },
  ];

  return (
    <nav className="glass-nav fixed bottom-0 left-0 right-0 z-40 flex items-stretch justify-around"
      style={{ height: 82, paddingBottom: 'env(safe-area-inset-bottom, 4px)' }}>
      {tabs.map(({ id, Icon, label, badge, center }) =>
        center ? (
          <button key={id} onClick={() => onChange(id)} className="flex flex-col items-center justify-center flex-1 h-full">
            <motion.div whileTap={{ scale: 0.85 }} className="flex items-center justify-center rounded-2xl"
              style={{ width: 52, height: 40, background: active === id ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : 'linear-gradient(135deg, rgba(139,92,246,0.6), rgba(236,72,153,0.6))', boxShadow: '0 4px 16px rgba(139,92,246,0.35)' }}>
              <Icon size={24} color="white" strokeWidth={active === id ? 2.5 : 1.8} />
            </motion.div>
            <span className="text-xs font-semibold mt-1" style={{ color: active === id ? '#a78bfa' : '#55556a' }}>Groups</span>
          </button>
        ) : (
          <NavButton key={id} id={id} Icon={Icon} label={label} isActive={active === id} onClick={() => onChange(id)} badge={badge} />
        )
      )}
    </nav>
  );
}
