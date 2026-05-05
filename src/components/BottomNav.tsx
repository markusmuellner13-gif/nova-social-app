'use client';

import { motion } from 'framer-motion';
import { Home, Search, PlusSquare, Bell, User } from 'lucide-react';

export type Tab = 'feed' | 'search' | 'create' | 'notifications' | 'profile';

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
  notifCount?: number;
}

const TABS: { id: Tab; Icon: React.ElementType; label: string }[] = [
  { id: 'feed', Icon: Home, label: 'Home' },
  { id: 'search', Icon: Search, label: 'Search' },
  { id: 'create', Icon: PlusSquare, label: 'New' },
  { id: 'notifications', Icon: Bell, label: 'Activity' },
  { id: 'profile', Icon: User, label: 'Profile' },
];

export default function BottomNav({ active, onChange, notifCount = 0 }: Props) {
  return (
    <nav
      className="glass-nav fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around"
      style={{ height: 64, paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {TABS.map(({ id, Icon, label }) => {
        const isActive = active === id;
        const isCreate = id === 'create';

        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="flex flex-col items-center justify-center gap-0.5 relative flex-1 h-full"
            style={{ minWidth: 0 }}
          >
            {isCreate ? (
              <motion.div
                whileTap={{ scale: 0.88 }}
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
              >
                <Icon size={20} color="white" strokeWidth={2.5} />
              </motion.div>
            ) : (
              <>
                <motion.div
                  whileTap={{ scale: 0.82 }}
                  animate={{ scale: isActive ? 1 : 1 }}
                  className="relative"
                >
                  <Icon
                    size={24}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    style={{
                      color: isActive ? '#a78bfa' : '#666677',
                      fill: isActive && id !== 'search' && id !== 'notifications' ? 'rgba(167,139,250,0.15)' : 'none',
                      transition: 'color 0.2s, fill 0.2s',
                    }}
                  />
                  {/* Notification badge */}
                  {id === 'notifications' && notifCount > 0 && (
                    <span
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white"
                      style={{ fontSize: 9, fontWeight: 700, background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
                    >
                      {notifCount > 9 ? '9+' : notifCount}
                    </span>
                  )}
                </motion.div>

                {/* Active dot */}
                <motion.div
                  initial={false}
                  animate={{ opacity: isActive ? 1 : 0, scale: isActive ? 1 : 0 }}
                  transition={{ duration: 0.2 }}
                  className="w-1 h-1 rounded-full"
                  style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
                />
              </>
            )}
          </button>
        );
      })}
    </nav>
  );
}
