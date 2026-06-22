'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Compass, Search, Users, Sparkles, User } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export type Tab = 'feed' | 'explore' | 'groups' | 'chat' | 'profile';

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
        style={{ width: 44, height: 34, background: isActive ? 'rgba(139,92,246,0.15)' : 'transparent' }}>
        <Icon size={24} strokeWidth={isActive ? 2.2 : 1.7}
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
  const { t } = useLanguage();

  const tabs: { id: Tab; Icon: React.ElementType; label: string; badge?: number; center?: boolean }[] = [
    { id: 'feed',    Icon: Compass,  label: t.nav.discover },
    { id: 'explore', Icon: Search,   label: t.nav.explore  },
    { id: 'groups',  Icon: Users,    label: t.nav.groups,  center: true },
    { id: 'chat',    Icon: Sparkles, label: 'Nova AI' },
    { id: 'profile', Icon: User,     label: t.nav.profile  },
  ];

  return (
    <nav className="glass-nav fixed bottom-0 left-0 right-0 z-40 flex items-stretch justify-around"
      style={{
        // The button row gets a fixed 60px of real estate; the device's
        // safe-area inset is ADDED below that (not subtracted from it, which is
        // what box-sizing:border-box would do to a plain fixed height — squeezing
        // the icons so they appear to spill out of the bar). This way every
        // button always sits fully inside the bar's field, on any phone, and the
        // bar still hugs the bottom edge.
        height: 'calc(60px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
      {tabs.map(({ id, Icon, label, badge, center }) =>
        center ? (
          <button key={id} onClick={() => onChange(id)} className="flex flex-col items-center justify-center gap-1 flex-1 h-full" style={{ minWidth: 0 }}>
            <motion.div whileTap={{ scale: 0.85 }} className="flex items-center justify-center rounded-2xl"
              style={{ width: 46, height: 34, background: active === id ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : 'linear-gradient(135deg, rgba(139,92,246,0.55), rgba(236,72,153,0.55))', boxShadow: active === id ? '0 2px 10px rgba(139,92,246,0.4)' : 'none' }}>
              <Icon size={22} color="white" strokeWidth={active === id ? 2.5 : 1.8} />
            </motion.div>
            <span className="text-xs font-semibold" style={{ color: active === id ? '#a78bfa' : '#55556a', letterSpacing: '0.01em' }}>{t.nav.groups}</span>
          </button>
        ) : (
          <NavButton key={id} id={id} Icon={Icon} label={label} isActive={active === id} onClick={() => onChange(id)} badge={badge} />
        )
      )}
    </nav>
  );
}
