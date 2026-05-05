'use client';

import { motion } from 'framer-motion';
import { Compass, Search, Bookmark, SlidersHorizontal } from 'lucide-react';

export type Tab = 'feed' | 'search' | 'saved' | 'preferences';

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
}

const TABS: { id: Tab; Icon: React.ElementType; label: string }[] = [
  { id: 'feed',        Icon: Compass,           label: 'Discover'    },
  { id: 'search',      Icon: Search,            label: 'Explore'     },
  { id: 'saved',       Icon: Bookmark,          label: 'Saved'       },
  { id: 'preferences', Icon: SlidersHorizontal, label: 'Preferences' },
];

export default function BottomNav({ active, onChange }: Props) {
  return (
    <nav
      className="glass-nav fixed bottom-0 left-0 right-0 z-40 flex items-stretch justify-around"
      style={{ height: 82, paddingBottom: 'env(safe-area-inset-bottom, 4px)' }}
    >
      {TABS.map(({ id, Icon, label }) => {
        const isActive = active === id;

        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            className="flex flex-col items-center justify-center gap-1.5 flex-1 h-full"
            style={{ minWidth: 0 }}
          >
            <motion.div
              whileTap={{ scale: 0.8 }}
              className="flex items-center justify-center rounded-2xl transition-all"
              style={{
                width: 48,
                height: 36,
                background: isActive ? 'rgba(139,92,246,0.15)' : 'transparent',
                transition: 'background 0.2s',
              }}
            >
              <Icon
                size={26}
                strokeWidth={isActive ? 2.2 : 1.7}
                style={{
                  color: isActive ? '#a78bfa' : '#55556a',
                  transition: 'color 0.2s',
                }}
              />
            </motion.div>

            <span
              className="text-xs font-semibold"
              style={{
                color: isActive ? '#a78bfa' : '#55556a',
                transition: 'color 0.2s',
                letterSpacing: '0.01em',
              }}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
