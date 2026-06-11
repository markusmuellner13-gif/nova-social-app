'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, Grid3X3, BookmarkIcon, ChevronDown, ChevronUp,
  BadgeCheck, Camera, Sliders, LogOut, Shield, Bell, Trash2,
  MapPin, MapPinOff, Calendar, Users, Star, Trophy, Search,
  UserPlus, UserCheck, X, LogIn, Globe, Heart, Check,
  MessageSquare, FileText, Info, ExternalLink, Phone,
} from 'lucide-react';
import { CURRENT_USER, formatCount } from '@/data/mockData';
import { Category, Post } from '@/types';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { LOCALE_NAMES, LOCALE_FLAGS, Locale } from '@/lib/translations';
import { supabase, searchProfiles, followUser, unfollowUser, SupabaseProfile, signOut } from '@/lib/supabase';

const ALL_LOCALES = Object.keys(LOCALE_NAMES) as Locale[];

const PREF_CONFIG: { key: Category; emoji: string; labelKey: keyof ReturnType<typeof useLanguage>['t']['categories']; color: string }[] = [
  { key: 'travel',      emoji: '✈️', labelKey: 'travel',      color: '#3b82f6' },
  { key: 'food',        emoji: '🍕', labelKey: 'food',        color: '#f97316' },
  { key: 'fashion',     emoji: '👗', labelKey: 'fashion',     color: '#ec4899' },
  { key: 'sports',      emoji: '⚽', labelKey: 'sports',      color: '#22c55e' },
  { key: 'art',         emoji: '🎨', labelKey: 'art',         color: '#a855f7' },
  { key: 'tech',        emoji: '💻', labelKey: 'tech',        color: '#06b6d4' },
  { key: 'fitness',     emoji: '💪', labelKey: 'fitness',     color: '#ef4444' },
  { key: 'music',       emoji: '🎵', labelKey: 'music',       color: '#8b5cf6' },
  { key: 'pets',        emoji: '🐾', labelKey: 'pets',        color: '#f59e0b' },
  { key: 'lifestyle',   emoji: '🌟', labelKey: 'lifestyle',   color: '#10b981' },
  { key: 'events',      emoji: '🎉', labelKey: 'events',      color: '#f43f5e' },
  { key: 'sightseeing', emoji: '🏛️', labelKey: 'sightseeing', color: '#14b8a6' },
];

interface BadgeDef { id: string; emoji: string; nameKey: string; desc: string; color: string; check: (s: BadgeStats) => boolean }
interface BadgeStats { saved: number; going: number; liked: number; reminders: number; followedUsers: number }

const BADGES: BadgeDef[] = [
  { id: 'explorer',    emoji: '🗺️', nameKey: 'Explorer',      color: '#3b82f6', desc: 'Saved your first event',   check: s => s.saved >= 1 },
  { id: 'discoverer',  emoji: '🔍', nameKey: 'Discoverer',    color: '#8b5cf6', desc: 'Saved 5 events',           check: s => s.saved >= 5 },
  { id: 'adventurer',  emoji: '🏔️', nameKey: 'Adventurer',    color: '#f97316', desc: 'Saved 15 events',          check: s => s.saved >= 15 },
  { id: 'event_goer',  emoji: '🎟️', nameKey: 'Event Goer',    color: '#ec4899', desc: 'Marked going to 1 event',  check: s => s.going >= 1 },
  { id: 'socialite',   emoji: '🥂', nameKey: 'Socialite',     color: '#f43f5e', desc: 'Going to 5 events',        check: s => s.going >= 5 },
  { id: 'fan',         emoji: '⭐', nameKey: 'Fan',           color: '#f59e0b', desc: 'Liked 10 posts',           check: s => s.liked >= 10 },
  { id: 'super_fan',   emoji: '🌟', nameKey: 'Super Fan',     color: '#f59e0b', desc: 'Liked 50 posts',           check: s => s.liked >= 50 },
  { id: 'planner',     emoji: '📅', nameKey: 'Planner',       color: '#22c55e', desc: 'Set 3 event reminders',    check: s => s.reminders >= 3 },
  { id: 'connector',   emoji: '🤝', nameKey: 'Connector',     color: '#06b6d4', desc: 'Following 5 people',       check: s => s.followedUsers >= 5 },
];

type ProfileSection = 'liked' | 'saved' | 'calendar' | 'badges';

interface Props { onOpenAuth: () => void }

export default function ProfileTab({ onOpenAuth }: Props) {
  const { state, setPreferences, clearAllData, addToast, setLocationEnabled } = useApp();
  const { user, profile, isSupabaseEnabled } = useAuth();
  const { t, locale, setLocale } = useLanguage();
  const { preferences, savedPosts: savedIds, goingPosts, reminders } = state;

  const [activeSection, setActiveSection] = useState<ProfileSection>('liked');
  const [showPrefs, setShowPrefs]         = useState(false);
  const [showSettings, setShowSettings]   = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showFollowSearch, setShowFollowSearch] = useState(false);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const [showContactSheet, setShowContactSheet] = useState(false);
  const [followQuery, setFollowQuery]     = useState('');
  const [followResults, setFollowResults] = useState<SupabaseProfile[]>([]);
  const [followingIds, setFollowingIds]   = useState<string[]>([]);

  // Only this user's real interactions, resolved from stored post snapshots
  // (+ own created posts) so they survive app restarts
  const interactionPool = useMemo(
    () => [...state.interactionPosts, ...state.createdPosts],
    [state.interactionPosts, state.createdPosts]
  );
  const resolvePosts = (ids: string[]): Post[] =>
    ids.map(id => interactionPool.find(p => p.id === id)).filter((p): p is Post => Boolean(p));

  const likedPosts  = resolvePosts(state.likedPosts);
  const savedPosts  = resolvePosts(savedIds);

  const upcomingEvents: Post[] = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return [...savedPosts, ...resolvePosts(state.goingPosts)]
      .filter((p, i, arr) => p.isEvent && p.eventDateRaw && p.eventDateRaw >= today && arr.findIndex(x => x.id === p.id) === i)
      .sort((a, b) => (a.eventDateRaw ?? '').localeCompare(b.eventDateRaw ?? ''));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedIds, state.likedPosts, state.goingPosts, interactionPool]);

  const badgeStats: BadgeStats = useMemo(() => ({
    saved: savedIds.length,
    going: goingPosts.length,
    liked: state.likedPosts.length,
    reminders: reminders.length,
    followedUsers: state.followedUsers.length,
  }), [savedIds, goingPosts, state.likedPosts, reminders, state.followedUsers]);

  const earnedBadges = BADGES.filter(b => b.check(badgeStats));
  const nextBadge    = BADGES.find(b => !b.check(badgeStats));

  const topInterests = PREF_CONFIG.slice().sort((a, b) =>
    (preferences[b.key as keyof typeof preferences] ?? 0) - (preferences[a.key as keyof typeof preferences] ?? 0)
  ).slice(0, 3);

  async function handleFollowSearch(q: string) {
    setFollowQuery(q);
    if (q.trim().length < 2) { setFollowResults([]); return; }
    const res = await searchProfiles(q.trim());
    setFollowResults(res.filter(p => p.id !== user?.id));
  }

  async function handleToggleFollow(targetId: string) {
    if (!user) return;
    const isFollowing = followingIds.includes(targetId);
    if (isFollowing) {
      await unfollowUser(user.id, targetId);
      setFollowingIds(prev => prev.filter(id => id !== targetId));
    } else {
      await followUser(user.id, targetId);
      setFollowingIds(prev => [...prev, targetId]);
    }
  }

  function handlePrefChange(key: Category, value: number) {
    setPreferences({ ...preferences, [key]: value } as typeof preferences);
  }

  function handleClearData() {
    clearAllData();
    setShowClearConfirm(false);
    addToast(t.settings.clearData, 'info', '🗑️');
  }

  async function handleSignOut() {
    await signOut();
    addToast('Signed out', 'info');
  }

  const displayName = profile?.display_name ?? user?.email?.split('@')[0] ?? CURRENT_USER.username;
  const avatarUrl   = profile?.avatar_url ?? CURRENT_USER.avatar;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glass flex items-center justify-between px-4 flex-shrink-0" style={{ height: 52, borderBottom: '1px solid #1e1e2a' }}>
        <h2 className="text-base font-bold text-white">{profile?.username ?? CURRENT_USER.username}</h2>
        <motion.button whileTap={{ scale: 0.85 }} onClick={() => setShowSettings(!showSettings)}>
          <Settings size={22} style={{ color: '#888899' }} />
        </motion.button>
      </div>

      {/* Settings panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
            className="overflow-hidden flex-shrink-0" style={{ background: '#13131a', borderBottom: '1px solid #1e1e2a' }}>
            {[
              { icon: Camera, label: t.settings.changePhoto, action: () => addToast(t.settings.comingSoon, 'info', '📸') },
              { icon: BadgeCheck, label: t.settings.requestVerification, action: () => addToast(t.settings.verificationSent, 'success') },
              {
                icon: state.locationEnabled ? MapPin : MapPinOff,
                label: state.locationEnabled ? `${t.settings.locationOn}: ${state.location?.city ?? 'On'}` : t.settings.locationOff,
                action: () => {
                  setLocationEnabled(!state.locationEnabled);
                  addToast(state.locationEnabled ? t.settings.locationDisabled : t.settings.locationEnabled, 'info', '📍');
                },
              },
              { icon: Shield, label: t.settings.privacy, action: () => addToast(t.settings.privacyMsg, 'info', '🔒') },
              { icon: Bell, label: t.settings.notificationSettings, action: () => {} },
              { icon: Globe, label: `${t.settings.language} · ${LOCALE_FLAGS[locale]} ${LOCALE_NAMES[locale]}`, action: () => setShowLanguagePicker(true) },
              { icon: Trash2, label: t.settings.clearData, danger: true, action: () => setShowClearConfirm(true) },
              ...(user ? [{ icon: LogOut, label: t.settings.signOut, danger: true, action: handleSignOut }] : []),
            ].map(({ icon: Icon, label, danger, action }) => (
              <button key={label} onClick={action}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium"
                style={{ color: danger ? '#ef4444' : '#d0d0e0', borderBottom: '1px solid #1a1a24' }}>
                <Icon size={18} style={{ color: danger ? '#ef4444' : '#888899' }} />
                {label}
              </button>
            ))}

            {/* Section separator */}
            <div className="px-4 py-2" style={{ borderBottom: '1px solid #1a1a24' }}>
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: '#444455' }}>Contact & Legal</p>
            </div>

            {[
              { icon: MessageSquare, label: 'Contact Leone Nero', action: () => setShowContactSheet(true) },
              { icon: Shield,        label: 'Privacy Policy',     action: () => window.open('/privacy', '_blank') },
              { icon: FileText,      label: 'Terms of Service',   action: () => window.open('/terms', '_blank') },
              { icon: Info,          label: 'Cookie Policy',      action: () => window.open('/cookie', '_blank') },
            ].map(({ icon: Icon, label, action }) => (
              <button key={label} onClick={action}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-sm font-medium"
                style={{ color: '#d0d0e0', borderBottom: '1px solid #1a1a24' }}>
                <Icon size={18} style={{ color: '#888899' }} />
                {label}
                <ExternalLink size={12} style={{ color: '#444455', marginLeft: 'auto' }} />
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Language picker modal */}
      <AnimatePresence>
        {showLanguagePicker && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="w-full rounded-t-3xl px-5 pb-10 pt-5" style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}>
              <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: '#3a3a4a' }} />
              <div className="flex items-center justify-between mb-4">
                <p className="text-base font-bold text-white">{t.settings.selectLanguage}</p>
                <button onClick={() => setShowLanguagePicker(false)}>
                  <X size={20} style={{ color: '#666677' }} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {ALL_LOCALES.map(l => (
                  <motion.button key={l} whileTap={{ scale: 0.95 }}
                    onClick={() => { setLocale(l); setShowLanguagePicker(false); addToast(`${LOCALE_FLAGS[l]} ${LOCALE_NAMES[l]}`, 'success'); }}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-2xl"
                    style={{
                      background: locale === l ? 'rgba(139,92,246,0.15)' : '#13131a',
                      border: locale === l ? '1px solid rgba(139,92,246,0.4)' : '1px solid #2a2a38',
                    }}>
                    <span style={{ fontSize: 22 }}>{LOCALE_FLAGS[l]}</span>
                    <span className="text-sm font-semibold" style={{ color: locale === l ? '#a78bfa' : '#d0d0e0' }}>{LOCALE_NAMES[l]}</span>
                    {locale === l && <Check size={14} style={{ color: '#a78bfa', marginLeft: 'auto' }} />}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Clear confirm */}
      <AnimatePresence>
        {showClearConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center px-6" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}
              className="w-full max-w-sm rounded-3xl p-6" style={{ background: '#13131a', border: '1px solid #2a2a38' }}>
              <h3 className="text-lg font-bold text-white mb-2">{t.settings.clearConfirmTitle}</h3>
              <p className="text-sm mb-5" style={{ color: '#888899' }}>{t.settings.clearConfirmDesc}</p>
              <div className="flex gap-3">
                <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-3 rounded-xl text-sm font-semibold"
                  style={{ background: '#1a1a24', color: '#888899', border: '1px solid #2a2a38' }}>
                  {t.settings.clearCancel}
                </button>
                <button onClick={handleClearData} className="flex-1 py-3 rounded-xl text-sm font-semibold"
                  style={{ background: '#ef4444', color: 'white' }}>
                  {t.settings.clearButton}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contact sheet */}
      <AnimatePresence>
        {showContactSheet && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.6)' }}
              onClick={() => setShowContactSheet(false)} />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl px-5 pb-10 pt-5"
              style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}
            >
              <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ background: '#3a3a4a' }} />

              {/* Brand header */}
              <div className="flex items-center gap-3 mb-6">
                <img src="/icon-192.png" alt="Leone Nero" className="w-12 h-12 rounded-2xl" />
                <div>
                  <p className="text-base font-bold text-white">Leone Nero</p>
                  <p className="text-xs" style={{ color: '#666677' }}>The company behind this app</p>
                </div>
                <button onClick={() => setShowContactSheet(false)} className="ml-auto">
                  <X size={20} style={{ color: '#666677' }} />
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {/* Address */}
                <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ background: '#13131a', border: '1px solid #2a2a38' }}>
                  <MapPin size={18} style={{ color: '#8b5cf6' }} />
                  <div>
                    {/* TODO: update with real address */}
                    <p className="text-sm font-semibold text-white">Milano, Italy</p>
                    <p className="text-xs" style={{ color: '#666677' }}>Headquarters</p>
                  </div>
                </div>

                {/* Phone */}
                <button
                  className="flex items-center gap-3 p-4 rounded-2xl w-full text-left"
                  style={{ background: '#13131a', border: '1px solid #2a2a38' }}
                  onClick={() => window.open('tel:+390200000000')}
                >
                  <Phone size={18} style={{ color: '#ec4899' }} />
                  <div>
                    {/* TODO: update with real phone number */}
                    <p className="text-sm font-semibold text-white">+39 02 0000 0000</p>
                    <p className="text-xs" style={{ color: '#666677' }}>Tap to call</p>
                  </div>
                </button>

                {/* Website */}
                <button
                  className="flex items-center gap-3 p-4 rounded-2xl w-full text-left"
                  style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(236,72,153,0.1))', border: '1px solid rgba(139,92,246,0.3)' }}
                  onClick={() => window.open('https://markusmuellner13-gif.github.io/leone-nero-website/index.html', '_blank', 'noopener')}
                >
                  <Globe size={18} style={{ color: '#a78bfa' }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold" style={{ color: '#a78bfa' }}>leone-nero.com</p>
                    <p className="text-xs" style={{ color: '#666677' }}>Visit our website</p>
                  </div>
                  <ExternalLink size={14} style={{ color: '#a78bfa' }} />
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Follow search modal */}
      <AnimatePresence>
        {showFollowSearch && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0a0a0f' }}>
            <div className="flex items-center gap-3 px-4 pt-14 pb-4" style={{ borderBottom: '1px solid #1e1e2a' }}>
              <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-2xl" style={{ background: '#13131a', border: '1px solid #2a2a38' }}>
                <Search size={16} style={{ color: '#666677' }} />
                <input type="text" value={followQuery} onChange={e => handleFollowSearch(e.target.value)}
                  placeholder={t.common.searchUsers}
                  className="flex-1 bg-transparent text-sm text-white outline-none" autoFocus />
              </div>
              <button onClick={() => { setShowFollowSearch(false); setFollowQuery(''); setFollowResults([]); }}>
                <X size={22} style={{ color: '#888899' }} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pt-4">
              {followResults.map(p => (
                <div key={p.id} className="flex items-center gap-3 py-3" style={{ borderBottom: '1px solid #1a1a24' }}>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-sm font-bold text-white">
                    {(p.display_name || p.username)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{p.display_name}</p>
                    <p className="text-xs" style={{ color: '#666677' }}>@{p.username}</p>
                  </div>
                  <motion.button whileTap={{ scale: 0.9 }} onClick={() => handleToggleFollow(p.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold"
                    style={{
                      background: followingIds.includes(p.id) ? 'rgba(139,92,246,0.15)' : 'linear-gradient(135deg, #8b5cf6, #ec4899)',
                      color: followingIds.includes(p.id) ? '#a78bfa' : 'white',
                    }}>
                    {followingIds.includes(p.id)
                      ? <><UserCheck size={12} /> {t.common.following}</>
                      : <><UserPlus size={12} /> {t.common.follow}</>}
                  </motion.button>
                </div>
              ))}
              {followQuery.length >= 2 && followResults.length === 0 && (
                <p className="text-center text-sm py-8" style={{ color: '#555566' }}>{t.common.noUsersFound}</p>
              )}
            </div>
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
                <img src={avatarUrl} alt={displayName} className="w-20 h-20 rounded-full object-cover" />
              </div>
            </div>
            <div className="flex gap-4">
              {[
                { label: t.profile.events,    value: savedIds.length },
                { label: t.profile.going,     value: goingPosts.length },
                { label: t.profile.following, value: state.followedUsers.length },
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
              <p className="text-sm font-semibold text-white">{displayName}</p>
              {user && <BadgeCheck size={14} style={{ color: '#8b5cf6' }} />}
            </div>
            <p className="text-sm mt-0.5 leading-snug" style={{ color: '#b0b0c8' }}>
              {profile?.bio ?? CURRENT_USER.bio}
            </p>
          </div>

          {/* Top interests */}
          <div className="mt-3 flex gap-2 flex-wrap">
            {topInterests.map(({ emoji, labelKey, key, color }) => (
              <span key={key} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{ background: `${color}18`, color, border: `1px solid ${color}33` }}>
                {emoji} {t.categories[labelKey]}
              </span>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 mt-4">
            {user ? (
              <>
                <button className="flex-1 py-2 rounded-xl text-sm font-semibold text-white" style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}>
                  {t.profile.editProfile}
                </button>
                {supabase && (
                  <button onClick={() => setShowFollowSearch(true)}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5"
                    style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}>
                    <Users size={14} /> {t.profile.findFriends}
                  </button>
                )}
              </>
            ) : (
              <button onClick={onOpenAuth}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                <LogIn size={14} /> {t.profile.signInSync}
              </button>
            )}
          </div>
        </div>

        {/* Badges preview */}
        {(earnedBadges.length > 0 || nextBadge) && (
          <div className="mx-4 mb-4 p-4 rounded-2xl" style={{ background: '#13131a', border: '1px solid #2a2a38' }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Trophy size={16} style={{ color: '#f59e0b' }} />
                <p className="text-sm font-bold text-white">{t.profile.badges_title}</p>
              </div>
              <button onClick={() => setActiveSection('badges')} className="text-xs font-semibold" style={{ color: '#a78bfa' }}>
                {t.profile.seeAll}
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {earnedBadges.slice(0, 5).map(b => (
                <div key={b.id} className="flex flex-col items-center gap-1">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
                    style={{ background: `${b.color}22`, border: `1px solid ${b.color}44` }}>
                    <span style={{ fontSize: 20 }}>{b.emoji}</span>
                  </div>
                </div>
              ))}
              {nextBadge && (
                <div className="flex flex-col items-center gap-1 opacity-40">
                  <div className="w-10 h-10 rounded-2xl flex items-center justify-center border border-dashed" style={{ borderColor: '#2a2a38' }}>
                    <span style={{ fontSize: 20, filter: 'grayscale(1)' }}>{nextBadge.emoji}</span>
                  </div>
                </div>
              )}
            </div>
            {nextBadge && (
              <p className="text-xs mt-2" style={{ color: '#555566' }}>
                {t.profile.nextBadge} <span style={{ color: '#a78bfa' }}>{nextBadge.nameKey}</span> — {nextBadge.desc}
              </p>
            )}
          </div>
        )}

        {/* Feed Preferences */}
        <div className="mx-4 mb-4 rounded-2xl overflow-hidden" style={{ background: '#13131a', border: '1px solid #2a2a38' }}>
          <button className="w-full flex items-center justify-between px-4 py-3.5" onClick={() => setShowPrefs(!showPrefs)}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                <Sliders size={14} color="white" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white">{t.profile.feedPreferences}</p>
                <p className="text-xs" style={{ color: '#888899' }}>{t.profile.feedPreferencesDesc}</p>
              </div>
            </div>
            {showPrefs ? <ChevronUp size={18} style={{ color: '#888899' }} /> : <ChevronDown size={18} style={{ color: '#888899' }} />}
          </button>
          <AnimatePresence>
            {showPrefs && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28 }} className="overflow-hidden">
                <div className="px-4 pb-4 pt-1" style={{ borderTop: '1px solid #2a2a38' }}>
                  <div className="flex flex-col gap-4">
                    {PREF_CONFIG.map(({ key, emoji, labelKey, color }) => {
                      const val = preferences[key as keyof typeof preferences] ?? 50;
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-sm font-medium text-white">{emoji} {t.categories[labelKey]}</span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: `${color}22`, color }}>{val}%</span>
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
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Security info */}
        {!user && isSupabaseEnabled && (
          <div className="mx-4 mb-4 px-4 py-3 rounded-2xl" style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <p className="text-xs font-semibold mb-1" style={{ color: '#a78bfa' }}>{t.profile.dataOnDevice}</p>
            <p className="text-xs" style={{ color: '#555566' }}>{t.profile.dataSyncHint}</p>
          </div>
        )}

        {/* Section tabs */}
        <div className="flex" style={{ borderTop: '1px solid #1e1e2a', borderBottom: '1px solid #1e1e2a' }}>
          {([
            ['liked',    Heart,        t.profile.liked    ],
            ['saved',    BookmarkIcon, t.profile.saved    ],
            ['calendar', Calendar,     t.profile.calendar ],
            ['badges',   Trophy,       t.profile.badges   ],
          ] as const).map(([id, Icon, label]) => (
            <button key={id} onClick={() => setActiveSection(id as ProfileSection)}
              className="flex-1 flex items-center justify-center gap-1 py-3"
              style={{ color: activeSection === id ? '#a78bfa' : '#555566', borderBottom: activeSection === id ? '2px solid #8b5cf6' : '2px solid transparent' }}>
              <Icon size={17} />
              <span className="text-xs font-semibold">{label}</span>
            </button>
          ))}
        </div>

        {/* Liked grid */}
        {activeSection === 'liked' && (
          <div className="grid grid-cols-3 gap-0.5 mt-0.5">
            {likedPosts.map((post, i) => (
              <motion.div key={post.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                className="relative overflow-hidden" style={{ aspectRatio: '1', background: '#13131a' }}>
                <img src={post.image} alt="" className="w-full h-full object-cover object-center" />
                <div className="absolute top-1 right-1">
                  <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }}>
                    <Star size={10} fill="#f59e0b" style={{ color: '#f59e0b' }} />
                  </div>
                </div>
              </motion.div>
            ))}
            {likedPosts.length === 0 && (
              <div className="col-span-3 flex flex-col items-center py-16">
                <Heart size={36} style={{ color: '#2a2a38' }} />
                <p className="text-sm font-semibold text-white mt-3">{t.profile.noLikedPosts}</p>
                <p className="text-xs mt-1" style={{ color: '#888899' }}>{t.profile.noLikedHint}</p>
              </div>
            )}
          </div>
        )}

        {/* Saved grid */}
        {activeSection === 'saved' && (
          <div className="grid grid-cols-3 gap-0.5 mt-0.5">
            {savedPosts.map((post, i) => (
              <motion.div key={post.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                className="relative overflow-hidden" style={{ aspectRatio: '1', background: '#13131a' }}>
                <img src={post.image} alt="" className="w-full h-full object-cover object-center" />
                {post.isEvent && (
                  <div className="absolute bottom-0 left-0 right-0 py-0.5 text-center font-bold"
                    style={{ background: 'rgba(244,63,94,0.85)', color: 'white', fontSize: 9 }}>
                    {t.common.event}
                  </div>
                )}
              </motion.div>
            ))}
            {savedPosts.length === 0 && (
              <div className="col-span-3 flex flex-col items-center py-16">
                <BookmarkIcon size={36} style={{ color: '#2a2a38' }} />
                <p className="text-sm font-semibold text-white mt-3">{t.profile.noSavedPosts}</p>
                <p className="text-xs mt-1" style={{ color: '#888899' }}>{t.profile.noSavedHint}</p>
              </div>
            )}
          </div>
        )}

        {/* Calendar — upcoming saved events timeline */}
        {activeSection === 'calendar' && (
          <div className="px-4 pt-4">
            {upcomingEvents.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-4">
                <Calendar size={36} style={{ color: '#2a2a38' }} />
                <p className="text-sm font-semibold text-white">{t.profile.noUpcomingEvents}</p>
                <p className="text-xs text-center" style={{ color: '#888899' }}>{t.profile.saveEventsHint}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 pb-8">
                {upcomingEvents.map(event => {
                  const days = event.eventDateRaw
                    ? Math.floor((new Date(event.eventDateRaw).getTime() - Date.now()) / 86_400_000)
                    : null;
                  const isGoing = goingPosts.includes(event.id);
                  const daysLabel = days === 0 ? t.profile.today : days === 1 ? t.profile.tomorrow : days !== null ? `${days}${t.profile.daysAway}` : null;
                  return (
                    <div key={event.id} className="flex gap-3 p-4 rounded-2xl" style={{ background: '#13131a', border: '1px solid #2a2a38' }}>
                      <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                        <img src={event.image} alt="" className="w-full h-full object-cover object-center" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{event.caption.split('\n')[0].slice(0, 50)}</p>
                        <p className="text-xs mt-0.5 truncate" style={{ color: '#888899' }}>{event.eventVenue}</p>
                        <div className="flex items-center gap-2 mt-2">
                          {daysLabel && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ background: days !== null && days <= 1 ? 'rgba(244,63,94,0.2)' : 'rgba(139,92,246,0.15)', color: days !== null && days <= 1 ? '#f87171' : '#a78bfa' }}>
                              {daysLabel}
                            </span>
                          )}
                          {isGoing && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e' }}>
                              {t.profile.going_label}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Badges */}
        {activeSection === 'badges' && (
          <div className="px-4 pt-4 pb-8">
            <p className="text-xs font-bold mb-4" style={{ color: '#666677' }}>
              {t.profile.badgesEarned} — {earnedBadges.length} / {BADGES.length}
            </p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {BADGES.map(b => {
                const earned = b.check(badgeStats);
                return (
                  <div key={b.id} className="p-4 rounded-2xl"
                    style={{ background: earned ? `${b.color}11` : '#13131a', border: `1px solid ${earned ? b.color + '44' : '#2a2a38'}`, opacity: earned ? 1 : 0.45 }}>
                    <div className="flex items-center gap-2 mb-2">
                      <span style={{ fontSize: 24, filter: earned ? 'none' : 'grayscale(1)' }}>{b.emoji}</span>
                      <p className="text-sm font-bold" style={{ color: earned ? b.color : '#888899' }}>{b.nameKey}</p>
                    </div>
                    <p className="text-xs" style={{ color: '#666677' }}>{b.desc}</p>
                    {earned && <div className="flex items-center gap-1 mt-2"><Star size={10} fill="#f59e0b" style={{ color: '#f59e0b' }} /><span className="text-xs font-bold" style={{ color: '#f59e0b' }}>{t.profile.earned}</span></div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ height: 100 }} />
      </div>
    </div>
  );
}
