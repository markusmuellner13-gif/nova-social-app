'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Category, UserPreferences } from '@/types';
import { DEFAULT_PREFERENCES } from '@/data/mockData';

const INTEREST_OPTIONS: { id: Category; emoji: string; label: string; color: string }[] = [
  { id: 'travel',      emoji: '✈️', label: 'Travel',      color: '#3b82f6' },
  { id: 'food',        emoji: '🍕', label: 'Food',        color: '#f97316' },
  { id: 'music',       emoji: '🎵', label: 'Music',       color: '#8b5cf6' },
  { id: 'events',      emoji: '🎉', label: 'Events',      color: '#f43f5e' },
  { id: 'art',         emoji: '🎨', label: 'Art',         color: '#a855f7' },
  { id: 'fitness',     emoji: '💪', label: 'Fitness',     color: '#ef4444' },
  { id: 'outdoors',    emoji: '🏞️', label: 'Outdoors',   color: '#22c55e' },
  { id: 'venues',      emoji: '🍸', label: 'Nightlife',   color: '#ec4899' },
  { id: 'sports',      emoji: '⚽', label: 'Sports',      color: '#16a34a' },
  { id: 'fashion',     emoji: '👗', label: 'Fashion',     color: '#db2777' },
  { id: 'tech',        emoji: '💻', label: 'Tech',        color: '#06b6d4' },
  { id: 'shops',       emoji: '🛍️', label: 'Shopping',   color: '#f59e0b' },
  { id: 'pets',        emoji: '🐾', label: 'Pets',        color: '#84cc16' },
  { id: 'sightseeing', emoji: '🏛️', label: 'Culture',    color: '#0ea5e9' },
  { id: 'community',   emoji: '🤝', label: 'Community',  color: '#14b8a6' },
  { id: 'lifestyle',   emoji: '🌟', label: 'Lifestyle',  color: '#10b981' },
];

export default function Onboarding() {
  const { completeOnboarding } = useApp();
  const [screen, setScreen] = useState<0 | 1 | 2>(0);
  const [selected, setSelected] = useState<Set<Category>>(new Set());
  // Italy (Art. 8 GDPR / D.Lgs. 101/2018) sets the digital-consent age at 14.
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  function toggleInterest(cat: Category) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  function handleContinue() {
    if (screen === 0) { if (!ageConfirmed) return; setScreen(1); return; }
    if (screen === 1) {
      if (selected.size < 3) return;
      setScreen(2);
      setTimeout(() => {
        const prefs = { ...DEFAULT_PREFERENCES } as Record<string, number>;
        selected.forEach(cat => { prefs[cat] = 90; });
        completeOnboarding(prefs as unknown as UserPreferences);
      }, 1600);
      return;
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{ background: 'linear-gradient(160deg, #0d0618 0%, #120824 40%, #0a0a0f 70%, #06060e 100%)' }}
    >
      {/* Background orbs */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl pointer-events-none"
        style={{ width: 300, height: 300, background: 'rgba(139,92,246,0.15)' }} />
      <div className="absolute top-2/3 left-1/4 rounded-full blur-3xl pointer-events-none"
        style={{ width: 200, height: 200, background: 'rgba(236,72,153,0.1)' }} />

      <AnimatePresence mode="wait">

        {/* Screen 0: Welcome */}
        {screen === 0 && (
          <motion.div
            key="welcome"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col items-center px-8 text-center"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.6, type: 'spring', stiffness: 200 }}
              className="w-28 h-28 rounded-3xl flex items-center justify-center mb-6 shadow-2xl"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
            >
              <svg width="60" height="60" viewBox="0 0 52 52" fill="none">
                <path d="M26 6 L42 20 L42 42 L10 42 L10 20 Z" fill="none" stroke="white" strokeWidth="3" strokeLinejoin="round" />
                <circle cx="26" cy="28" r="6" fill="white" opacity="0.9" />
                <path d="M18 20 Q26 12 34 20" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              </svg>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
              className="text-4xl font-bold mb-3"
              style={{ background: 'linear-gradient(135deg, #c4b5fd, #f0abfc, #fbcfe8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
            >
              Welcome to Nova
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-base leading-relaxed mb-2"
              style={{ color: '#b0b0c8' }}
            >
              Your personal AI-powered universe of content, events, and people that actually match your world.
            </motion.p>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="flex flex-col gap-2 mt-4 mb-10 text-left w-full"
            >
              {[
                { icon: '🧠', text: 'AI learns your taste over time' },
                { icon: '🔔', text: 'Get notified when it matters' },
                { icon: '🔒', text: 'All data stored securely on your device' },
              ].map(({ icon, text }) => (
                <div key={text} className="flex items-center gap-3 px-4 py-2.5 rounded-xl" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <span className="text-sm font-medium" style={{ color: '#c4b5fd' }}>{text}</span>
                </div>
              ))}
            </motion.div>

            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.85 }}
              type="button"
              onClick={() => setAgeConfirmed(v => !v)}
              className="w-full flex items-start gap-3 mb-3 text-left"
            >
              <span
                className="flex-shrink-0 mt-0.5 w-5 h-5 rounded-md flex items-center justify-center"
                style={{
                  background: ageConfirmed ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : '#13131a',
                  border: ageConfirmed ? 'none' : '1px solid #2a2a38',
                }}
              >
                {ageConfirmed && <CheckCircle2 size={14} color="white" />}
              </span>
              <span className="text-xs leading-relaxed" style={{ color: '#9a9aae' }}>
                I confirm I am at least 14 years old and I accept the{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa' }}>Terms</a> and{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa' }}>Privacy Policy</a>.
              </span>
            </motion.button>

            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              whileTap={{ scale: ageConfirmed ? 0.97 : 1 }}
              onClick={handleContinue}
              disabled={!ageConfirmed}
              className="w-full py-4 rounded-2xl text-base font-bold text-white flex items-center justify-center gap-2 transition-opacity"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', opacity: ageConfirmed ? 1 : 0.5 }}
            >
              Get Started <ChevronRight size={20} />
            </motion.button>
          </motion.div>
        )}

        {/* Screen 1: Pick interests */}
        {screen === 1 && (
          <motion.div
            key="interests"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col w-full h-full px-5 pt-14 pb-6 overflow-y-auto"
          >
            <div className="mb-5 text-center">
              <Sparkles size={28} className="mx-auto mb-3" style={{ color: '#a78bfa' }} />
              <h2 className="text-2xl font-bold text-white mb-1">What are you into?</h2>
              <p className="text-sm" style={{ color: '#888899' }}>
                Pick at least 3. Your AI feed starts here.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 flex-1">
              {INTEREST_OPTIONS.map(({ id, emoji, label, color }) => {
                const isOn = selected.has(id);
                return (
                  <motion.button
                    key={id}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => toggleInterest(id)}
                    className="flex flex-col items-center justify-center gap-2 rounded-2xl py-4 relative overflow-hidden"
                    style={{
                      background: isOn ? `${color}22` : '#13131a',
                      border: isOn ? `2px solid ${color}88` : '2px solid #2a2a38',
                      transition: 'all 0.2s',
                    }}
                  >
                    {isOn && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute top-2 right-2"
                      >
                        <CheckCircle2 size={16} style={{ color }} />
                      </motion.div>
                    )}
                    <span style={{ fontSize: 28 }}>{emoji}</span>
                    <span className="text-xs font-semibold" style={{ color: isOn ? color : '#888899' }}>{label}</span>
                  </motion.button>
                );
              })}
            </div>

            <div className="mt-4">
              <p className="text-center text-xs mb-3" style={{ color: selected.size >= 3 ? '#a78bfa' : '#555566' }}>
                {selected.size < 3 ? `Select ${3 - selected.size} more` : `${selected.size} selected — looking good!`}
              </p>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleContinue}
                disabled={selected.size < 3}
                className="w-full py-4 rounded-2xl text-base font-bold text-white flex items-center justify-center gap-2 transition-opacity"
                style={{
                  background: selected.size >= 3 ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : '#2a2a38',
                  opacity: selected.size >= 3 ? 1 : 0.5,
                }}
              >
                Build my feed <ChevronRight size={20} />
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* Screen 2: Done */}
        {screen === 2 && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 20 }}
            className="flex flex-col items-center px-8 text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
              className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
            >
              <Sparkles size={44} color="white" />
            </motion.div>
            <h2 className="text-3xl font-bold text-white mb-2">Your feed is ready ✨</h2>
            <p className="text-sm leading-relaxed" style={{ color: '#888899' }}>
              The AI is learning your taste right now. The more you interact, the smarter it gets.
            </p>
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              className="mt-6 text-xs font-medium"
              style={{ color: '#a78bfa' }}
            >
              Opening Nova…
            </motion.div>
          </motion.div>
        )}

      </AnimatePresence>

      {/* Progress dots */}
      {screen < 2 && (
        <div className="absolute bottom-10 flex gap-2">
          {[0, 1].map(i => (
            <div
              key={i}
              className="rounded-full transition-all"
              style={{
                width: screen === i ? 24 : 8,
                height: 8,
                background: screen === i ? 'linear-gradient(90deg, #8b5cf6, #ec4899)' : '#2a2a38',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
