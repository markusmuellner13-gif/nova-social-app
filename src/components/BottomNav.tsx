'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Compass, Search, Users, Sparkles, User, Plane } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export type Tab = 'feed' | 'explore' | 'faraway' | 'groups' | 'chat' | 'profile';

interface Props {
  active: Tab;
  onChange: (tab: Tab) => void;
}

// ── Geometry ─────────────────────────────────────────────────────────────────
// Every number that decides where the bar sits lives here, so the bar and
// everything that has to stay clear of it (NAV_CLEARANCE) can never disagree.
//
// The bottom inset, from the most to the least reliable source:
//   1. `--safe-area-inset-bottom` — Capacitor 8 writes the real system-bar
//      inset here on Android, where many WebViews report env() as 0 and the
//      labels would otherwise sit under the gesture bar / 3-button nav.
//   2. `env(safe-area-inset-bottom)` — iOS Safari, iOS home-screen apps,
//      Chrome on Android with viewport-fit=cover.
//   3. 0.
const INSET = 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))';

// Room left under the labels. The iPhone home indicator is a 5pt pill sitting
// 8pt off the bottom edge — it needs ~13pt, not the 34pt the inset reports.
// Applying the full inset left a dark band under the labels that read as "the
// buttons are too high". Reclaiming 22px of it puts the labels just clear of
// the pill:
//   iPhone with home indicator (34px) → 12px
//   Android 3-button nav (~48px)      → 26px  (still fully clear of the buttons)
//   Android gesture nav (~24px)       →  4px
//   no inset at all (0px)             →  4px
// max() keeps it from ever going negative on a device with a small inset.
export const SAFE_BOTTOM = `max(calc(${INSET} - 22px), 4px)`;

// The bar's own content height: 28px icon pill + 2px gap + 14px label line,
// centred with a few px either side. Fixed, so the bar is the same height on
// every device and NAV_CLEARANCE below is exact rather than an estimate (the
// old bar was ~8px taller than the clearance it advertised).
const BAR_HEIGHT = 54;

// Total space the fixed nav occupies. Anything that has to sit clear of the
// nav MUST use this rather than re-deriving it from the raw inset.
export const NAV_CLEARANCE = `calc(${BAR_HEIGHT}px + ${SAFE_BOTTOM})`;

const ACTIVE = '#a78bfa';
const IDLE = '#8a8a9e';

function NavButton({ Icon, label, isActive, onClick, badge, center }: {
  Icon: React.ElementType; label: string;
  isActive: boolean; onClick: () => void; badge?: number; center?: boolean;
}) {
  // Six tabs share the bar, so a long label ("Far Far Away") gets a smaller
  // type size rather than being truncated or wrapped — the name is the point
  // of that tab and an ellipsis would defeat it.
  const long = label.length > 9;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className="relative flex flex-col items-center justify-center flex-1 h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nova-violet rounded-xl"
      style={{ minWidth: 0, gap: 2 }}
    >
      <motion.div
        whileTap={{ scale: 0.82 }}
        className="relative flex items-center justify-center rounded-full"
        style={center ? {
          width: 44, height: 28,
          background: isActive ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : 'linear-gradient(135deg, rgba(139,92,246,0.55), rgba(236,72,153,0.55))',
          boxShadow: isActive ? '0 2px 12px rgba(139,92,246,0.45)' : 'none',
        } : {
          width: 46, height: 28,
          background: isActive ? 'rgba(139,92,246,0.16)' : 'transparent',
          transition: 'background 0.2s',
        }}
      >
        <Icon
          size={center ? 20 : 22}
          strokeWidth={isActive ? 2.3 : 1.8}
          color={center ? 'white' : undefined}
          style={center ? undefined : { color: isActive ? ACTIVE : IDLE, transition: 'color 0.2s' }}
        />
        <AnimatePresence>
          {badge != null && badge > 0 && (
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="absolute -top-1 right-0.5 min-w-4 h-4 rounded-full flex items-center justify-center text-white font-bold"
              style={{ background: 'linear-gradient(135deg, #ec4899, #8b5cf6)', fontSize: 9, padding: '0 3px' }}>
              {badge > 99 ? '99+' : badge}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      <span
        className="font-semibold"
        style={{
          color: isActive ? ACTIVE : IDLE,
          transition: 'color 0.2s',
          letterSpacing: long ? '-0.02em' : '0.01em',
          fontSize: long ? 8.5 : 11,
          lineHeight: '14px',
          whiteSpace: 'nowrap',
        }}
      >
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
    { id: 'faraway', Icon: Plane,    label: t.nav.farAway  },
    { id: 'groups',  Icon: Users,    label: t.nav.groups,  center: true },
    { id: 'chat',    Icon: Sparkles, label: 'AI' },
    { id: 'profile', Icon: User,     label: t.nav.profile  },
  ];

  return (
    <nav
      aria-label="Main"
      className="glass-nav fixed bottom-0 left-0 right-0 z-40"
      style={{
        // Exact height: bar + the trimmed inset. box-sizing is border-box, so
        // the padding sits INSIDE this height and the bar's background runs
        // all the way to the bottom edge of the screen.
        height: NAV_CLEARANCE,
        paddingBottom: SAFE_BOTTOM,
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      <div className="flex items-stretch justify-around" style={{ height: BAR_HEIGHT }}>
        {tabs.map(({ id, Icon, label, badge, center }) => (
          <NavButton
            key={id}
            Icon={Icon}
            label={label}
            isActive={active === id}
            onClick={() => onChange(id)}
            badge={badge}
            center={center}
          />
        ))}
      </div>
      {/* Paint the bar's colour BELOW its own box too. Some browsers leave a
          strip under a bottom:0 element — iOS Safari while its toolbar
          collapses or after the keyboard closes, home-screen web apps on
          launch, Android WebViews whose window is taller than the viewport.
          Without this the bar visibly ended above the screen's edge there.
          Off-screen (and invisible) everywhere else; clipped by the desktop
          frame. */}
      <div
        aria-hidden
        className="pointer-events-none"
        style={{ position: 'absolute', left: 0, right: 0, top: '100%', height: 160, background: '#0f0d14' }}
      />
    </nav>
  );
}
