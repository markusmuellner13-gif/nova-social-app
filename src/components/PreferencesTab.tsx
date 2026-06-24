'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sliders, Bookmark, MapPin, Compass, RotateCcw } from 'lucide-react';
import { MOCK_POSTS } from '@/data/mockData';
import { UserPreferences, Category } from '@/types';

interface Props {
  preferences: UserPreferences;
  onPreferencesChange: (prefs: UserPreferences) => void;
}

const PREF_CONFIG: { key: Category; emoji: string; label: string; color: string; desc: string }[] = [
  { key: 'travel',    emoji: '✈️', label: 'Travel & Destinations', color: '#3b82f6', desc: 'Destinations, trips & adventures' },
  { key: 'food',      emoji: '🍕', label: 'Food & Cuisine',        color: '#f97316', desc: 'Local dishes, restaurants & recipes' },
  { key: 'fashion',   emoji: '👗', label: 'Fashion & Style',       color: '#ec4899', desc: 'Trends, outfits & designers' },
  { key: 'sports',    emoji: '⚽', label: 'Sports & Outdoors',     color: '#22c55e', desc: 'Games, hikes & outdoor activities' },
  { key: 'art',       emoji: '🎨', label: 'Art & Culture',         color: '#a855f7', desc: 'Museums, galleries & creative work' },
  { key: 'tech',      emoji: '💻', label: 'Technology',            color: '#06b6d4', desc: 'Gadgets, apps & innovation' },
  { key: 'fitness',   emoji: '💪', label: 'Fitness & Wellness',    color: '#ef4444', desc: 'Workouts, yoga & healthy living' },
  { key: 'music',     emoji: '🎵', label: 'Music & Events',        color: '#8b5cf6', desc: 'Concerts, festivals & artists' },
  { key: 'pets',      emoji: '🐾', label: 'Pets & Animals',        color: '#f59e0b', desc: 'Wildlife, sanctuaries & pets' },
  { key: 'lifestyle', emoji: '🌟', label: 'Lifestyle',             color: '#10b981', desc: 'Mindfulness, home & slow living' },
  { key: 'shops',     emoji: '🛍️', label: 'Thrift & Vintage',     color: '#d946ef', desc: 'Second-hand, vintage & charity shops' },
  { key: 'venues',    emoji: '🎭', label: 'Venues & Nightlife',    color: '#f43f5e', desc: 'Theatres, clubs & concert halls' },
  { key: 'community', emoji: '🤝', label: 'Community',             color: '#14b8a6', desc: 'Meetups, gatherings & local events' },
  { key: 'restaurants', emoji: '🍽️', label: 'Restaurants & Cafés', color: '#fb923c', desc: 'Local dining, cafés & bars near you' },
  { key: 'hotels',    emoji: '🏨', label: 'Hotels & Stays',        color: '#60a5fa', desc: 'Hotels, hostels & places to stay' },
  { key: 'rentals',   emoji: '🚲', label: 'Rentals',               color: '#34d399', desc: 'Bike, car, boat & equipment rentals' },
];

const savedPosts = MOCK_POSTS.filter((p) => p.saved);

export default function PreferencesTab({ preferences, onPreferencesChange }: Props) {
  const [activeSection, setActiveSection] = useState<'prefs' | 'saved'>('prefs');

  function handlePrefChange(key: Category, value: number) {
    onPreferencesChange({ ...preferences, [key]: value });
  }

  const topInterests = PREF_CONFIG
    .slice()
    .sort((a, b) => (preferences[b.key] ?? 0) - (preferences[a.key] ?? 0))
    .slice(0, 3);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="glass flex items-center justify-between px-4 flex-shrink-0"
        style={{ height: 56, borderBottom: '1px solid #1e1e2a' }}
      >
        <div className="flex items-center gap-2">
          <Sliders size={18} style={{ color: '#a78bfa' }} />
          <h2 className="text-base font-bold text-white">My Preferences</h2>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full" style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.2)' }}>
          <Compass size={11} />
          Your feed, your rules
        </div>
      </div>

      <div className="tab-content flex-1 overflow-y-auto">

        {/* Top interests banner */}
        <div className="px-4 pt-4 pb-3">
          <div
            className="rounded-2xl p-4"
            style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(236,72,153,0.1))', border: '1px solid rgba(139,92,246,0.2)' }}
          >
            <p className="text-xs font-semibold mb-2" style={{ color: '#a78bfa' }}>YOUR TOP INTERESTS</p>
            <div className="flex gap-2 flex-wrap">
              {topInterests.map(({ emoji, label, key, color }) => (
                <span
                  key={key}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
                >
                  {emoji} {label.split(' ')[0]}
                </span>
              ))}
            </div>
            <p className="text-xs mt-3 leading-relaxed" style={{ color: '#888899' }}>
              These interests shape what appears in your Discover feed. Adjust the sliders below to tune it.
            </p>
          </div>
        </div>

        {/* Section tabs */}
        <div
          className="flex mx-4 rounded-xl overflow-hidden mb-4"
          style={{ background: '#13131a', border: '1px solid #2a2a38' }}
        >
          {([['prefs', Sliders, 'Feed Interests'], ['saved', Bookmark, 'Saved Places']] as const).map(([id, Icon, label]) => (
            <button
              key={id}
              onClick={() => setActiveSection(id)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold transition-all"
              style={{
                color: activeSection === id ? 'white' : '#555566',
                background: activeSection === id ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : 'transparent',
                borderRadius: 10,
              }}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeSection === 'prefs' ? (
            <motion.div
              key="prefs"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="px-4"
            >
              <p className="text-xs mb-5 leading-relaxed" style={{ color: '#888899' }}>
                Drag each slider to control how much content of that type appears in your Discover feed. Higher = more of it.
              </p>

              <div className="flex flex-col gap-6">
                {PREF_CONFIG.map(({ key, emoji, label, desc, color }) => {
                  const val = preferences[key];
                  return (
                    <div key={key}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: 18 }}>{emoji}</span>
                          <div>
                            <p className="text-sm font-semibold text-white leading-tight">{label}</p>
                            <p className="text-xs leading-tight" style={{ color: '#555566' }}>{desc}</p>
                          </div>
                        </div>
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ml-2"
                          style={{ background: `${color}22`, color }}
                        >
                          {val}%
                        </span>
                      </div>
                      <div className="relative mt-2">
                        <div
                          className="absolute top-1/2 left-0 h-1 rounded-full pointer-events-none"
                          style={{
                            width: `${val}%`,
                            background: `linear-gradient(90deg, ${color}88, ${color})`,
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

              <button
                className="mt-6 w-full py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: '#1a1a24', color: '#888899', border: '1px solid #2a2a38' }}
                onClick={() => {
                  const reset = Object.fromEntries(PREF_CONFIG.map(({ key }) => [key, 50])) as unknown as UserPreferences;
                  onPreferencesChange(reset);
                }}
              >
                <RotateCcw size={14} />
                Reset All to 50%
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="saved"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {savedPosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <Bookmark size={40} style={{ color: '#2a2a38' }} />
                  <p className="text-sm font-semibold text-white mt-4">No saved places yet</p>
                  <p className="text-xs mt-2 text-center" style={{ color: '#888899' }}>
                    Tap the bookmark icon on any post to save it here for later
                  </p>
                </div>
              ) : (
                <div>
                  <p className="px-4 pb-3 text-xs font-medium" style={{ color: '#888899' }}>
                    {savedPosts.length} saved place{savedPosts.length !== 1 ? 's' : ''}
                  </p>
                  {savedPosts.map((post) => (
                    <div
                      key={post.id}
                      className="flex items-center gap-3 mx-4 mb-3 rounded-2xl overflow-hidden"
                      style={{ background: '#13131a', border: '1px solid #2a2a38' }}
                    >
                      <img
                        src={post.image}
                        alt=""
                        className="w-20 h-20 object-cover flex-shrink-0"
                        loading="lazy"
                      />
                      <div className="flex-1 min-w-0 py-2 pr-3">
                        <div className="flex items-center gap-1 mb-0.5">
                          <MapPin size={11} style={{ color: '#8b5cf6' }} />
                          <span className="text-xs font-semibold" style={{ color: '#a78bfa' }}>{post.location.name}</span>
                        </div>
                        <p className="text-sm font-semibold text-white truncate">{post.user.name}</p>
                        <p className="text-xs mt-0.5 line-clamp-2 leading-snug" style={{ color: '#888899' }}>{post.caption}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div style={{ height: 100 }} />
      </div>
    </div>
  );
}
