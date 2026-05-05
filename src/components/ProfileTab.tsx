'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, Grid3X3, BookmarkIcon, ChevronDown, ChevronUp,
  BadgeCheck, Camera, Sliders, Heart, LogOut
} from 'lucide-react';
import { CURRENT_USER, MOCK_POSTS, formatCount } from '@/data/mockData';
import { UserPreferences, Category } from '@/types';

interface Props {
  preferences: UserPreferences;
  onPreferencesChange: (prefs: UserPreferences) => void;
}

const PREF_CONFIG: { key: Category; emoji: string; label: string; color: string }[] = [
  { key: 'travel', emoji: '✈️', label: 'Travel', color: '#3b82f6' },
  { key: 'food', emoji: '🍕', label: 'Food & Dining', color: '#f97316' },
  { key: 'fashion', emoji: '👗', label: 'Fashion & Style', color: '#ec4899' },
  { key: 'sports', emoji: '⚽', label: 'Sports', color: '#22c55e' },
  { key: 'art', emoji: '🎨', label: 'Art & Design', color: '#a855f7' },
  { key: 'tech', emoji: '💻', label: 'Technology', color: '#06b6d4' },
  { key: 'fitness', emoji: '💪', label: 'Fitness', color: '#ef4444' },
  { key: 'music', emoji: '🎵', label: 'Music', color: '#8b5cf6' },
  { key: 'pets', emoji: '🐾', label: 'Pets', color: '#f59e0b' },
  { key: 'lifestyle', emoji: '🌟', label: 'Lifestyle', color: '#10b981' },
];

const myPosts = MOCK_POSTS.slice(0, 9);
const savedPosts = MOCK_POSTS.filter((p) => p.saved);

type ProfileTab = 'posts' | 'saved';

export default function ProfileTab({ preferences, onPreferencesChange }: Props) {
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const [showPrefs, setShowPrefs] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  function handlePrefChange(key: Category, value: number) {
    onPreferencesChange({ ...preferences, [key]: value });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="glass flex items-center justify-between px-4 flex-shrink-0"
        style={{ height: 52, borderBottom: '1px solid #1e1e2a' }}
      >
        <h2 className="text-base font-bold text-white">{CURRENT_USER.username}</h2>
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={() => setShowSettings(!showSettings)}
        >
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
            className="overflow-hidden"
            style={{ background: '#13131a', borderBottom: '1px solid #1e1e2a' }}
          >
            {[
              { icon: Camera, label: 'Change Profile Photo' },
              { icon: BadgeCheck, label: 'Request Verification' },
              { icon: Heart, label: 'Liked Posts' },
              { icon: LogOut, label: 'Log Out', danger: true },
            ].map(({ icon: Icon, label, danger }) => (
              <button
                key={label}
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

      {/* Scrollable content */}
      <div className="tab-content flex-1 overflow-y-auto">
        {/* Profile info */}
        <div className="px-4 pt-5 pb-4">
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div className="story-ring flex-shrink-0">
              <div className="bg-[#0a0a0f] p-1 rounded-full">
                <img
                  src={CURRENT_USER.avatar}
                  alt={CURRENT_USER.name}
                  className="w-20 h-20 rounded-full object-cover"
                />
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-5">
              {[
                { label: 'Posts', value: CURRENT_USER.posts },
                { label: 'Followers', value: CURRENT_USER.followers },
                { label: 'Following', value: CURRENT_USER.following },
              ].map(({ label, value }) => (
                <div key={label} className="flex flex-col items-center">
                  <span className="text-lg font-bold text-white">{formatCount(value)}</span>
                  <span className="text-xs" style={{ color: '#888899' }}>{label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Name & bio */}
          <div className="mt-4">
            <p className="text-sm font-semibold text-white">{CURRENT_USER.name}</p>
            <p className="text-sm mt-0.5 leading-snug" style={{ color: '#b0b0c8' }}>{CURRENT_USER.bio}</p>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-4">
            <button
              className="flex-1 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}
            >
              Edit Profile
            </button>
            <button
              className="flex-1 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}
            >
              Share Profile
            </button>
          </div>
        </div>

        {/* ─── Preferences section ─── */}
        <div
          className="mx-4 mb-4 rounded-2xl overflow-hidden"
          style={{ background: '#13131a', border: '1px solid #2a2a38' }}
        >
          <button
            className="w-full flex items-center justify-between px-4 py-3.5"
            onClick={() => setShowPrefs(!showPrefs)}
          >
            <div className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
              >
                <Sliders size={14} color="white" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">Feed Preferences</p>
                <p className="text-xs" style={{ color: '#888899' }}>Tune your algorithm</p>
              </div>
            </div>
            {showPrefs ? (
              <ChevronUp size={18} style={{ color: '#888899' }} />
            ) : (
              <ChevronDown size={18} style={{ color: '#888899' }} />
            )}
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
                <div
                  className="px-4 pb-4 pt-1"
                  style={{ borderTop: '1px solid #2a2a38' }}
                >
                  <p className="text-xs mb-4 leading-relaxed" style={{ color: '#888899' }}>
                    Drag the sliders to control how much content of each type appears in your feed. Higher = more.
                  </p>
                  <div className="flex flex-col gap-5">
                    {PREF_CONFIG.map(({ key, emoji, label, color }) => {
                      const val = preferences[key];
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span style={{ fontSize: 16 }}>{emoji}</span>
                              <span className="text-sm font-medium text-white">{label}</span>
                            </div>
                            <span
                              className="text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ background: `${color}22`, color }}
                            >
                              {val}%
                            </span>
                          </div>
                          <div className="relative">
                            {/* Track fill */}
                            <div
                              className="absolute top-1/2 left-0 h-1 rounded-full pointer-events-none"
                              style={{
                                width: `${val}%`,
                                background: `linear-gradient(90deg, ${color}99, ${color})`,
                                transform: 'translateY(-50%)',
                                zIndex: 1,
                              }}
                            />
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={val}
                              onChange={(e) => handlePrefChange(key, Number(e.target.value))}
                              className="relative w-full"
                              style={{ zIndex: 2 }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Reset button */}
                  <button
                    className="mt-5 w-full py-2.5 rounded-xl text-sm font-semibold"
                    style={{ background: '#1a1a24', color: '#888899', border: '1px solid #2a2a38' }}
                    onClick={() => {
                      const reset = Object.fromEntries(PREF_CONFIG.map(({ key }) => [key, 50])) as unknown as UserPreferences;
                      onPreferencesChange(reset);
                    }}
                  >
                    Reset to Default
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Post / Saved tabs */}
        <div
          className="flex"
          style={{ borderTop: '1px solid #1e1e2a', borderBottom: '1px solid #1e1e2a' }}
        >
          {([['posts', Grid3X3, 'Posts'], ['saved', BookmarkIcon, 'Saved']] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as ProfileTab)}
              className="flex-1 flex items-center justify-center gap-1.5 py-3"
              style={{
                color: activeTab === id ? '#a78bfa' : '#555566',
                borderBottom: activeTab === id ? '2px solid #8b5cf6' : '2px solid transparent',
                transition: 'color 0.2s',
              }}
            >
              <Icon size={20} />
              <span className="text-xs font-semibold">{label}</span>
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-3 gap-0.5 mt-0.5">
          {(activeTab === 'posts' ? myPosts : savedPosts).map((post, i) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.04 }}
              className="relative overflow-hidden"
              style={{ aspectRatio: '1', background: '#13131a' }}
            >
              <img
                src={post.image}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </motion.div>
          ))}
          {activeTab === 'saved' && savedPosts.length === 0 && (
            <div className="col-span-3 flex flex-col items-center py-16">
              <BookmarkIcon size={36} style={{ color: '#2a2a38' }} />
              <p className="text-sm font-semibold text-white mt-3">No saved posts</p>
              <p className="text-xs mt-1" style={{ color: '#888899' }}>Tap 🔖 on any post to save it</p>
            </div>
          )}
        </div>

        <div style={{ height: 80 }} />
      </div>
    </div>
  );
}
