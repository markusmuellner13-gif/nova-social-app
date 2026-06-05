'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, Grid3X3, BookmarkIcon, ChevronDown, ChevronUp,
  BadgeCheck, Camera, Sliders, LogOut, Shield, Bell, Trash2, X, MapPin, MapPinOff
} from 'lucide-react';
import { CURRENT_USER, MOCK_POSTS, formatCount } from '@/data/mockData';
import { Category } from '@/types';
import { useApp } from '@/context/AppContext';

const PREF_CONFIG: { key: Category; emoji: string; label: string; desc: string; color: string }[] = [
  { key: 'travel',    emoji: '✈️', label: 'Travel & Destinations', desc: 'Trips & adventures',      color: '#3b82f6' },
  { key: 'food',      emoji: '🍕', label: 'Food & Cuisine',        desc: 'Restaurants & recipes',  color: '#f97316' },
  { key: 'fashion',   emoji: '👗', label: 'Fashion & Style',       desc: 'Trends & designers',     color: '#ec4899' },
  { key: 'sports',    emoji: '⚽', label: 'Sports',                desc: 'Games & activities',     color: '#22c55e' },
  { key: 'art',       emoji: '🎨', label: 'Art & Culture',         desc: 'Galleries & creativity', color: '#a855f7' },
  { key: 'tech',      emoji: '💻', label: 'Technology',            desc: 'Gadgets & innovation',   color: '#06b6d4' },
  { key: 'fitness',   emoji: '💪', label: 'Fitness & Wellness',    desc: 'Workouts & yoga',        color: '#ef4444' },
  { key: 'music',     emoji: '🎵', label: 'Music & Events',        desc: 'Concerts & artists',     color: '#8b5cf6' },
  { key: 'pets',      emoji: '🐾', label: 'Pets & Animals',        desc: 'Wildlife & pets',        color: '#f59e0b' },
  { key: 'lifestyle', emoji: '🌟', label: 'Lifestyle',             desc: 'Mindfulness & home',     color: '#10b981' },
  { key: 'events',    emoji: '🎉', label: 'Events',                desc: 'Live & upcoming',        color: '#f43f5e' },
];

type ProfileSection = 'posts' | 'saved';

export default function ProfileTab() {
  const { state, setPreferences, clearAllData, addToast, setLocationEnabled } = useApp();
  const { preferences, savedPosts: savedIds, createdPosts } = state;

  const [activeSection, setActiveSection] = useState<ProfileSection>('posts');
  const [showPrefs, setShowPrefs] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const myPosts = [...createdPosts, ...MOCK_POSTS.slice(0, 9)];
  const savedPosts = MOCK_POSTS.filter(p => savedIds.includes(p.id));

  // Top interests derived from preferences
  const topInterests = PREF_CONFIG
    .slice()
    .sort((a, b) => (preferences[b.key as keyof typeof preferences] ?? 0) - (preferences[a.key as keyof typeof preferences] ?? 0))
    .slice(0, 3);

  function handlePrefChange(key: Category, value: number) {
    setPreferences({ ...preferences, [key]: value } as typeof preferences);
  }

  function handleResetPrefs() {
    const reset = Object.fromEntries(PREF_CONFIG.map(({ key }) => [key, 50])) as unknown as typeof preferences;
    setPreferences(reset);
    addToast('Preferences reset', 'info', '↺');
  }

  function handleClearData() {
    clearAllData();
    setShowClearConfirm(false);
    addToast('All data cleared', 'info', '🗑️');
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glass flex items-center justify-between px-4 flex-shrink-0" style={{ height: 52, borderBottom: '1px solid #1e1e2a' }}>
        <h2 className="text-base font-bold text-white">{CURRENT_USER.username}</h2>
        <motion.button whileTap={{ scale: 0.85 }} onClick={() => setShowSettings(!showSettings)}>
          <Settings size={22} style={{ color: '#888899' }} />
        </motion.button>
      </div>

      {/* Settings panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden flex-shrink-0"
            style={{ background: '#13131a', borderBottom: '1px solid #1e1e2a' }}
          >
            {[
              { icon: Camera, label: 'Change Profile Photo', action: () => addToast('Coming soon', 'info', '📸') },
              { icon: BadgeCheck, label: 'Request Verification', action: () => addToast('Application submitted ✓', 'success') },
              { icon: state.locationEnabled ? MapPin : MapPinOff, label: state.locationEnabled ? `Location: ${state.location?.city ?? 'On'}` : 'Enable Location', action: () => { setLocationEnabled(!state.locationEnabled); addToast(state.locationEnabled ? 'Location disabled' : 'Location enabled', 'info', '📍'); } },
              { icon: Shield, label: 'Privacy & Security', action: () => addToast('Your data is AES-256 encrypted on this device', 'info', '🔒') },
              { icon: Bell, label: 'Notification Settings', action: () => { } },
              { icon: Trash2, label: 'Clear All Data', danger: true, action: () => setShowClearConfirm(true) },
              { icon: LogOut, label: 'Log Out', danger: true, action: () => addToast('Logged out', 'info') },
            ].map(({ icon: Icon, label, danger, action }) => (
              <button
                key={label}
                onClick={action}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium"
                style={{ color: danger ? '#ef4444' : '#d0d0e0', borderBottom: '1px solid #1a1a24' }}
              >
                <Icon size={18} style={{ color: danger ? '#ef4444' : '#888899' }} />
                {label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clear data confirm */}
      <AnimatePresence>
        {showClearConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            style={{ background: 'rgba(0,0,0,0.7)' }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="w-full max-w-sm rounded-3xl p-6"
              style={{ background: '#13131a', border: '1px solid #2a2a38' }}
            >
              <h3 className="text-lg font-bold text-white mb-2">Clear all data?</h3>
              <p className="text-sm mb-5" style={{ color: '#888899' }}>This will delete all your preferences, likes, saves, and account data. Cannot be undone.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-3 rounded-xl text-sm font-semibold" style={{ background: '#1a1a24', color: '#888899', border: '1px solid #2a2a38' }}>Cancel</button>
                <button onClick={handleClearData} className="flex-1 py-3 rounded-xl text-sm font-semibold" style={{ background: '#ef4444', color: 'white' }}>Clear</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scrollable content */}
      <div className="tab-content flex-1 overflow-y-auto">
        {/* Profile info */}
        <div className="px-4 pt-5 pb-4">
          <div className="flex items-center gap-5">
            <div className="story-ring flex-shrink-0">
              <div className="bg-[#0a0a0f] p-1 rounded-full">
                <img src={CURRENT_USER.avatar} alt={CURRENT_USER.name} className="w-20 h-20 rounded-full object-cover" />
              </div>
            </div>
            <div className="flex gap-5">
              {[
                { label: 'Posts', value: CURRENT_USER.posts + createdPosts.length },
                { label: 'Followers', value: CURRENT_USER.followers },
                { label: 'Following', value: CURRENT_USER.following + state.followedUsers.length },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col items-center">
                  <span className="text-lg font-bold text-white">{formatCount(value)}</span>
                  <span className="text-xs" style={{ color: '#888899' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-semibold text-white">{CURRENT_USER.name}</p>
              <BadgeCheck size={14} style={{ color: '#8b5cf6' }} />
            </div>
            <p className="text-sm mt-0.5 leading-snug" style={{ color: '#b0b0c8' }}>{CURRENT_USER.bio}</p>
          </div>

          {/* Top interests banner */}
          <div className="mt-3 flex gap-2 flex-wrap">
            {topInterests.map(({ emoji, label, key, color }) => (
              <span key={key} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{ background: `${color}18`, color, border: `1px solid ${color}33` }}>
                {emoji} {label.split(' ')[0]}
              </span>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-4">
            <button className="flex-1 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}>
              Edit Profile
            </button>
            <button className="flex-1 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}>
              Share Profile
            </button>
          </div>
        </div>

        {/* Feed Preferences */}
        <div className="mx-4 mb-4 rounded-2xl overflow-hidden" style={{ background: '#13131a', border: '1px solid #2a2a38' }}>
          <button className="w-full flex items-center justify-between px-4 py-3.5" onClick={() => setShowPrefs(!showPrefs)}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                <Sliders size={14} color="white" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">Feed Preferences</p>
                <p className="text-xs" style={{ color: '#888899' }}>Tune your AI algorithm</p>
              </div>
            </div>
            {showPrefs ? <ChevronUp size={18} style={{ color: '#888899' }} /> : <ChevronDown size={18} style={{ color: '#888899' }} />}
          </button>

          <AnimatePresence>
            {showPrefs && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4 pt-1" style={{ borderTop: '1px solid #2a2a38' }}>
                  <p className="text-xs mb-4 leading-relaxed" style={{ color: '#888899' }}>
                    Drag sliders to control how much content of each type appears. The AI learns your taste on top of these.
                  </p>
                  <div className="flex flex-col gap-5">
                    {PREF_CONFIG.map(({ key, emoji, label, color }) => {
                      const val = preferences[key as keyof typeof preferences] ?? 50;
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span style={{ fontSize: 16 }}>{emoji}</span>
                              <span className="text-sm font-medium text-white">{label}</span>
                            </div>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}22`, color }}>
                              {val}%
                            </span>
                          </div>
                          <div className="relative">
                            <div className="absolute top-1/2 left-0 h-1 rounded-full pointer-events-none"
                              style={{ width: `${val}%`, background: `linear-gradient(90deg, ${color}88, ${color})`, transform: 'translateY(-50%)', zIndex: 1 }} />
                            <input type="range" min={0} max={100} value={val}
                              onChange={(e) => handlePrefChange(key, Number(e.target.value))}
                              className="relative w-full" style={{ zIndex: 2 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    onClick={handleResetPrefs}
                    className="mt-5 w-full py-2.5 rounded-xl text-sm font-semibold"
                    style={{ background: '#1a1a24', color: '#888899', border: '1px solid #2a2a38' }}
                  >
                    Reset All to 50%
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Security info */}
        <div className="mx-4 mb-4 px-4 py-3 rounded-2xl flex items-center gap-3" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
          <Shield size={16} style={{ color: '#22c55e' }} />
          <div>
            <p className="text-xs font-semibold" style={{ color: '#22c55e' }}>Data secured on your device</p>
            <p className="text-xs" style={{ color: '#555566' }}>AES-256 encrypted · Never shared · Zero servers</p>
          </div>
        </div>

        {/* Posts / Saved tabs */}
        <div className="flex" style={{ borderTop: '1px solid #1e1e2a', borderBottom: '1px solid #1e1e2a' }}>
          {([['posts', Grid3X3, 'Posts'], ['saved', BookmarkIcon, 'Saved']] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-3"
              style={{
                color: activeSection === id ? '#a78bfa' : '#555566',
                borderBottom: activeSection === id ? '2px solid #8b5cf6' : '2px solid transparent',
              }}
            >
              <Icon size={20} />
              <span className="text-xs font-semibold">{label}</span>
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-3 gap-0.5 mt-0.5">
          {(activeSection === 'posts' ? myPosts : savedPosts).map((post, i) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.03 }}
              className="relative overflow-hidden"
              style={{ aspectRatio: '1', background: '#13131a' }}
            >
              <img src={post.image} alt="" className="w-full h-full object-cover" loading="lazy" />
              {post.isEvent && (
                <div className="absolute bottom-0 left-0 right-0 py-0.5 text-center text-xs font-bold" style={{ background: 'rgba(244,63,94,0.85)', color: 'white', fontSize: 9 }}>
                  EVENT
                </div>
              )}
            </motion.div>
          ))}
          {activeSection === 'saved' && savedPosts.length === 0 && (
            <div className="col-span-3 flex flex-col items-center py-16">
              <BookmarkIcon size={36} style={{ color: '#2a2a38' }} />
              <p className="text-sm font-semibold text-white mt-3">No saved posts yet</p>
              <p className="text-xs mt-1" style={{ color: '#888899' }}>Tap 🔖 on any post to save it</p>
            </div>
          )}
        </div>

        <div style={{ height: 100 }} />
      </div>
    </div>
  );
}
