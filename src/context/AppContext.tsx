'use client';

import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';
import { AppPersistedState, UserPreferences, NovaNotification, Post, Toast, LocationState, Reminder, Category } from '@/types';
import { DEFAULT_PREFERENCES, welcomeNotification } from '@/data/appDefaults';
import { learnFromInteraction, learnFromBrowse } from '@/lib/aiEngine';
import { upsertInteraction, deleteInteraction } from '@/lib/supabase';

// Module-level user ID for Supabase sync — set by AppShell when auth state changes
let _supabaseUserId: string | null = null;
export function setSupabaseUser(id: string | null) { _supabaseUserId = id; }

// ── Encryption (AES-GCM via Web Crypto API) ──────────────────────────────────

const KEY_STORE = 'nova_key';
const DATA_STORE = 'nova_enc';

let _keyCache: CryptoKey | null = null;

async function getOrCreateKey(): Promise<CryptoKey> {
  if (_keyCache) return _keyCache;
  try {
    const stored = localStorage.getItem(KEY_STORE);
    if (stored) {
      const raw = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
      _keyCache = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      return _keyCache;
    }
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const exported = await crypto.subtle.exportKey('raw', key);
    const bytes = new Uint8Array(exported);
    localStorage.setItem(KEY_STORE, btoa(String.fromCharCode(...bytes)));
    _keyCache = key;
    return key;
  } catch {
    // Fallback if Web Crypto unavailable (older browsers)
    return null as unknown as CryptoKey;
  }
}

async function encryptSave(state: AppPersistedState): Promise<void> {
  try {
    const key = await getOrCreateKey();
    if (!key) {
      localStorage.setItem(DATA_STORE + '_plain', JSON.stringify(state));
      return;
    }
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(state));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    const combined = new Uint8Array(12 + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), 12);
    localStorage.setItem(DATA_STORE, btoa(String.fromCharCode(...combined)));
  } catch {
    // Fallback to plain JSON
    try { localStorage.setItem(DATA_STORE + '_plain', JSON.stringify(state)); } catch { /* quota */ }
  }
}

async function decryptLoad(): Promise<AppPersistedState | null> {
  try {
    const stored = localStorage.getItem(DATA_STORE);
    if (stored) {
      const key = await getOrCreateKey();
      if (!key) throw new Error('no key');
      const combined = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
      const iv = combined.slice(0, 12);
      const enc = combined.slice(12);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, enc);
      const parsed = JSON.parse(new TextDecoder().decode(decrypted)) as AppPersistedState;
      return migrateState(parsed);
    }
    // Fallback plain
    const plain = localStorage.getItem(DATA_STORE + '_plain');
    if (plain) return migrateState(JSON.parse(plain));
    return null;
  } catch {
    return null;
  }
}

// Notifications older app versions pre-seeded or auto-generated from demo
// content (ids n1…n8 / ai_<timestamp>). Real notifications only ever come from
// live feed posts now, so stored demo ones are dropped on load.
function isLegacyDemoNotification(n: NovaNotification): boolean {
  return /^(n\d+|ai_\d+)$/.test(n.id);
}

function migrateState(raw: Partial<AppPersistedState>): AppPersistedState {
  const interactionPosts = raw.interactionPosts ?? [];
  // Self-heal: only keep liked/saved/going ids that resolve to a stored post
  // snapshot. Drops the demo likes/saves older app versions pre-seeded, and
  // orphaned ids that nothing could display anyway.
  const resolvable = new Set(interactionPosts.map(p => p.id));
  return {
    preferences: { ...DEFAULT_PREFERENCES, ...(raw.preferences ?? {}) },
    likedPosts: (raw.likedPosts ?? []).filter(id => resolvable.has(id)),
    savedPosts: (raw.savedPosts ?? []).filter(id => resolvable.has(id)),
    interactionPosts,
    followedUsers: raw.followedUsers ?? [],
    seenStories: raw.seenStories ?? [],
    goingPosts: (raw.goingPosts ?? []).filter(id => resolvable.has(id)),
    reminders: raw.reminders ?? [],
    hasOnboarded: raw.hasOnboarded ?? false,
    aiProfile: {
      categoryEngagement: raw.aiProfile?.categoryEngagement ?? {},
      totalInteractions: raw.aiProfile?.totalInteractions ?? 0,
      lastActive: raw.aiProfile?.lastActive ?? Date.now(),
      sessionCount: (raw.aiProfile?.sessionCount ?? 0) + 1,
    },
    notifications: (raw.notifications ?? [welcomeNotification()]).filter(n => !isLegacyDemoNotification(n)),
    location: raw.location ?? null,
    locationEnabled: raw.locationEnabled ?? false,
    hasSeenLocationPrompt: raw.hasSeenLocationPrompt ?? false,
  };
}

// ── Default state ─────────────────────────────────────────────────────────────
// Nothing pre-liked or pre-saved: the profile only ever shows the user's own
// real interactions.

const DEFAULT_STATE: AppPersistedState = {
  preferences: DEFAULT_PREFERENCES as UserPreferences,
  likedPosts: [],
  savedPosts: [],
  interactionPosts: [],
  followedUsers: [],
  seenStories: [],
  goingPosts: [],
  reminders: [],
  hasOnboarded: false,
  aiProfile: { categoryEngagement: {}, totalInteractions: 0, lastActive: Date.now(), sessionCount: 1 },
  notifications: [welcomeNotification()],
  location: null,
  locationEnabled: false,
  hasSeenLocationPrompt: false,
};

// Keep/remove the full-post snapshot depending on whether any interaction
// still references it; capped so localStorage can't fill up
const MAX_SNAPSHOTS = 300;

function syncSnapshot(snapshots: Post[], post: Post, keep: boolean): Post[] {
  const without = snapshots.filter(p => p.id !== post.id);
  if (!keep) return without;
  return [...without, post].slice(-MAX_SNAPSHOTS);
}

// ── Reducer ───────────────────────────────────────────────────────────────────

type Action =
  | { type: 'LOAD'; payload: AppPersistedState }
  | { type: 'LIKE_POST'; post: Post }
  | { type: 'SAVE_POST'; post: Post }
  | { type: 'FOLLOW_USER'; id: string }
  | { type: 'MARK_STORY_SEEN'; id: string }
  | { type: 'MARK_GOING'; post: Post }
  | { type: 'ADD_REMINDER'; reminder: Reminder }
  | { type: 'REMOVE_REMINDER'; postId: string }
  | { type: 'SET_PREFERENCES'; prefs: UserPreferences }
  | { type: 'LEARN_CATEGORY'; category: Category }
  | { type: 'ADD_NOTIFICATION'; notif: NovaNotification }
  | { type: 'MARK_ALL_READ' }
  | { type: 'MARK_READ'; id: string }
  | { type: 'COMPLETE_ONBOARDING'; prefs: UserPreferences }
  | { type: 'SET_LOCATION'; location: LocationState }
  | { type: 'SET_LOCATION_ENABLED'; enabled: boolean }
  | { type: 'SET_SEEN_LOCATION_PROMPT' }
  | { type: 'SYNC_INTERACTIONS'; liked: string[]; saved: string[]; going: string[]; posts: Post[] }
  | { type: 'CLEAR_ALL_DATA' };

function reducer(state: AppPersistedState, action: Action): AppPersistedState {
  switch (action.type) {
    case 'LOAD':
      return action.payload;

    case 'LIKE_POST': {
      const { post } = action;
      const has = state.likedPosts.includes(post.id);
      const likedPosts = has ? state.likedPosts.filter(id => id !== post.id) : [...state.likedPosts, post.id];
      const stillUsed = likedPosts.includes(post.id) || state.savedPosts.includes(post.id) || state.goingPosts.includes(post.id);
      return {
        ...state,
        likedPosts,
        interactionPosts: syncSnapshot(state.interactionPosts, post, stillUsed),
        aiProfile: learnFromInteraction(state.aiProfile, post.category, has ? 'weak' : 'medium'),
      };
    }

    case 'SAVE_POST': {
      const { post } = action;
      const has = state.savedPosts.includes(post.id);
      const savedPosts = has ? state.savedPosts.filter(id => id !== post.id) : [...state.savedPosts, post.id];
      const stillUsed = savedPosts.includes(post.id) || state.likedPosts.includes(post.id) || state.goingPosts.includes(post.id);
      return {
        ...state,
        savedPosts,
        interactionPosts: syncSnapshot(state.interactionPosts, post, stillUsed),
        aiProfile: has ? state.aiProfile : learnFromInteraction(state.aiProfile, post.category, 'strong'),
      };
    }

    case 'FOLLOW_USER': {
      const has = state.followedUsers.includes(action.id);
      return {
        ...state,
        followedUsers: has ? state.followedUsers.filter(id => id !== action.id) : [...state.followedUsers, action.id],
      };
    }

    case 'MARK_STORY_SEEN':
      if (state.seenStories.includes(action.id)) return state;
      return { ...state, seenStories: [...state.seenStories, action.id] };

    case 'MARK_GOING': {
      const { post } = action;
      const has = state.goingPosts.includes(post.id);
      const goingPosts = has ? state.goingPosts.filter(id => id !== post.id) : [...state.goingPosts, post.id];
      const stillUsed = goingPosts.includes(post.id) || state.likedPosts.includes(post.id) || state.savedPosts.includes(post.id);
      return {
        ...state,
        goingPosts,
        interactionPosts: syncSnapshot(state.interactionPosts, post, stillUsed),
      };
    }

    case 'ADD_REMINDER': {
      const filtered = state.reminders.filter(r => r.postId !== action.reminder.postId);
      return { ...state, reminders: [...filtered, action.reminder] };
    }

    case 'REMOVE_REMINDER':
      return { ...state, reminders: state.reminders.filter(r => r.postId !== action.postId) };

    case 'SET_PREFERENCES':
      return { ...state, preferences: action.prefs };

    case 'LEARN_CATEGORY':
      return { ...state, aiProfile: learnFromBrowse(state.aiProfile, action.category) };

    case 'ADD_NOTIFICATION':
      // Same event/post can trigger this from more than one code path (feed
      // refresh + push, or a re-fired effect) — de-dupe by id so it never
      // shows the same notification two or three times in the list.
      if (state.notifications.some(n => n.id === action.notif.id)) return state;
      return {
        ...state,
        notifications: [action.notif, ...state.notifications].slice(0, 50),
      };

    case 'MARK_ALL_READ':
      return { ...state, notifications: state.notifications.map(n => ({ ...n, read: true })) };

    case 'MARK_READ':
      return { ...state, notifications: state.notifications.map(n => n.id === action.id ? { ...n, read: true } : n) };

    case 'COMPLETE_ONBOARDING':
      return { ...state, hasOnboarded: true, preferences: action.prefs };

    case 'SET_LOCATION':
      return { ...state, location: action.location, locationEnabled: true };

    case 'SET_LOCATION_ENABLED':
      return { ...state, locationEnabled: action.enabled, location: action.enabled ? state.location : null };

    case 'SET_SEEN_LOCATION_PROMPT':
      return { ...state, hasSeenLocationPrompt: true };

    case 'SYNC_INTERACTIONS': {
      // Merge remote snapshots (from other devices) — local copies win
      const existing = new Set(state.interactionPosts.map(p => p.id));
      const remoteNew = action.posts.filter(p => p?.id && !existing.has(p.id));
      return {
        ...state,
        likedPosts: Array.from(new Set([...state.likedPosts, ...action.liked])),
        savedPosts: Array.from(new Set([...state.savedPosts, ...action.saved])),
        goingPosts: Array.from(new Set([...state.goingPosts, ...action.going])),
        interactionPosts: [...remoteNew, ...state.interactionPosts].slice(-MAX_SNAPSHOTS),
      };
    }

    case 'CLEAR_ALL_DATA':
      return { ...DEFAULT_STATE, hasOnboarded: false };

    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppPersistedState;
  isLiked: (id: string) => boolean;
  isSaved: (id: string) => boolean;
  isFollowed: (id: string) => boolean;
  isStorySeen: (id: string) => boolean;
  isGoing: (id: string) => boolean;
  hasReminder: (id: string) => boolean;
  unreadCount: number;
  likePost: (post: Post) => void;
  savePost: (post: Post) => void;
  followUser: (id: string) => void;
  markStorySeen: (id: string) => void;
  goPost: (post: Post) => void;
  addReminder: (reminder: Reminder) => void;
  removeReminder: (postId: string) => void;
  setPreferences: (prefs: UserPreferences) => void;
  learnCategory: (category: Category) => void;
  addNotification: (notif: NovaNotification) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  completeOnboarding: (prefs: UserPreferences) => void;
  setLocation: (loc: LocationState) => void;
  setLocationEnabled: (enabled: boolean) => void;
  markSeenLocationPrompt: () => void;
  clearAllData: () => void;
  syncInteractions: (data: { likedPosts: string[]; savedPosts: string[]; goingPosts: string[]; posts: Post[] }) => void;
  // Toasts
  toasts: Toast[];
  addToast: (message: string, type?: Toast['type'], icon?: string) => void;
  removeToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  // Load persisted state on mount
  useEffect(() => {
    decryptLoad().then(loaded => {
      if (loaded) {
        dispatch({ type: 'LOAD', payload: loaded });
      }
      loadedRef.current = true;
    });
  }, []);

  // Save state to encrypted localStorage (debounced)
  useEffect(() => {
    if (!loadedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => encryptSave(state), 400);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [state]);

  // Ask for notification permission once, shortly after launch. Notifications
  // themselves only ever fire for REAL content: new feed events (FeedTab),
  // reminders (below), and the server push digest — never invented activity.
  useEffect(() => {
    const permTimer = setTimeout(() => {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }, 5000);
    return () => clearTimeout(permTimer);
  }, []);

  // Reminder scheduler — re-runs whenever reminders change
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const now = Date.now();

    for (const r of state.reminders) {
      if (!r.eventDateRaw) continue;
      // Parse event date at noon (time-of-day unknown, noon is safe)
      const eventMs = new Date(`${r.eventDateRaw}T12:00:00`).getTime();
      const fireMs  = eventMs - r.minutesBefore * 60 * 1000;
      const msUntil = fireMs - now;
      // Only schedule if within the next 7 days and still in the future
      if (msUntil <= 0 || msUntil > 7 * 24 * 60 * 60 * 1000) continue;

      const t = setTimeout(() => {
        if (Notification.permission === 'granted') {
          try {
            new Notification('Nova — Upcoming event 🎉', {
              body: `${r.title}${r.venue ? ` at ${r.venue}` : ''} — ${r.minutesBefore === 1440 ? 'tomorrow!' : 'in 1 hour!'}`,
              icon: '/favicon.ico',
              badge: '/favicon.ico',
            });
          } catch { /* permission revoked mid-session */ }
        }
      }, msUntil);
      timers.push(t);
    }

    return () => timers.forEach(clearTimeout);
  }, [state.reminders]);

  // Toast helpers
  const addToast = useCallback((message: string, type: Toast['type'] = 'success', icon?: string) => {
    const id = `t_${Date.now()}`;
    setToasts(prev => [...prev, { id, message, type, icon }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2800);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const unreadCount = state.notifications.filter(n => !n.read).length;

  const value: AppContextValue = {
    state,
    isLiked: (id) => state.likedPosts.includes(id),
    isSaved: (id) => state.savedPosts.includes(id),
    isFollowed: (id) => state.followedUsers.includes(id),
    isStorySeen: (id) => state.seenStories.includes(id),
    isGoing: (id) => state.goingPosts.includes(id),
    hasReminder: (id) => state.reminders.some(r => r.postId === id),
    unreadCount,
    likePost: (post) => {
      dispatch({ type: 'LIKE_POST', post });
      if (_supabaseUserId) {
        // Sync the full snapshot so other signed-in devices can display it
        (state.likedPosts.includes(post.id)
          ? deleteInteraction(_supabaseUserId, post.id, 'like')
          : upsertInteraction(_supabaseUserId, post.id, 'like', post as unknown as Record<string, unknown>)
        ).catch(console.error);
      }
    },
    savePost: (post) => {
      dispatch({ type: 'SAVE_POST', post });
      if (_supabaseUserId) {
        (state.savedPosts.includes(post.id)
          ? deleteInteraction(_supabaseUserId, post.id, 'save')
          : upsertInteraction(_supabaseUserId, post.id, 'save', post as unknown as Record<string, unknown>)
        ).catch(console.error);
      }
    },
    followUser: (id) => dispatch({ type: 'FOLLOW_USER', id }),
    markStorySeen: (id) => dispatch({ type: 'MARK_STORY_SEEN', id }),
    goPost: (post) => {
      dispatch({ type: 'MARK_GOING', post });
      if (_supabaseUserId) {
        (state.goingPosts.includes(post.id)
          ? deleteInteraction(_supabaseUserId, post.id, 'going')
          : upsertInteraction(_supabaseUserId, post.id, 'going', post as unknown as Record<string, unknown>)
        ).catch(console.error);
      }
    },
    addReminder: (reminder) => dispatch({ type: 'ADD_REMINDER', reminder }),
    removeReminder: (postId) => dispatch({ type: 'REMOVE_REMINDER', postId }),
    setPreferences: (prefs) => dispatch({ type: 'SET_PREFERENCES', prefs }),
    learnCategory: (category) => dispatch({ type: 'LEARN_CATEGORY', category }),
    addNotification: (notif) => dispatch({ type: 'ADD_NOTIFICATION', notif }),
    markAllRead: () => dispatch({ type: 'MARK_ALL_READ' }),
    markRead: (id) => dispatch({ type: 'MARK_READ', id }),
    completeOnboarding: (prefs) => dispatch({ type: 'COMPLETE_ONBOARDING', prefs }),
    setLocation: (location) => dispatch({ type: 'SET_LOCATION', location }),
    setLocationEnabled: (enabled) => dispatch({ type: 'SET_LOCATION_ENABLED', enabled }),
    markSeenLocationPrompt: () => dispatch({ type: 'SET_SEEN_LOCATION_PROMPT' }),
    syncInteractions: (data) => dispatch({ type: 'SYNC_INTERACTIONS', liked: data.likedPosts, saved: data.savedPosts, going: data.goingPosts, posts: data.posts }),
    clearAllData: () => {
      dispatch({ type: 'CLEAR_ALL_DATA' });
      localStorage.removeItem(DATA_STORE);
      localStorage.removeItem(DATA_STORE + '_plain');
      localStorage.removeItem(KEY_STORE);
      _keyCache = null;
    },
    toasts,
    addToast,
    removeToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
