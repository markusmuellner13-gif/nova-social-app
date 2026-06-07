'use client';

import React, { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';
import { AppPersistedState, UserPreferences, Category, NovaNotification, Post, Toast, AIProfile, LocationState, Reminder } from '@/types';
import { DEFAULT_PREFERENCES, MOCK_NOTIFICATIONS, MOCK_POSTS } from '@/data/mockData';
import { learnFromInteraction, generateAINotification, getTopCategories } from '@/lib/aiEngine';
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

function migrateState(raw: Partial<AppPersistedState>): AppPersistedState {
  return {
    preferences: { ...DEFAULT_PREFERENCES, ...(raw.preferences ?? {}) },
    likedPosts: raw.likedPosts ?? DEFAULT_STATE.likedPosts,
    savedPosts: raw.savedPosts ?? DEFAULT_STATE.savedPosts,
    followedUsers: raw.followedUsers ?? [],
    seenStories: raw.seenStories ?? ['s3', 's5', 's8'],
    goingPosts: raw.goingPosts ?? [],
    reminders: raw.reminders ?? [],
    hasOnboarded: raw.hasOnboarded ?? false,
    aiProfile: {
      categoryEngagement: raw.aiProfile?.categoryEngagement ?? {},
      totalInteractions: raw.aiProfile?.totalInteractions ?? 0,
      lastActive: raw.aiProfile?.lastActive ?? Date.now(),
      sessionCount: (raw.aiProfile?.sessionCount ?? 0) + 1,
    },
    notifications: raw.notifications ?? MOCK_NOTIFICATIONS,
    createdPosts: raw.createdPosts ?? [],
    location: raw.location ?? null,
    locationEnabled: raw.locationEnabled ?? false,
    hasSeenLocationPrompt: raw.hasSeenLocationPrompt ?? false,
  };
}

// ── Default state ─────────────────────────────────────────────────────────────

const DEFAULT_STATE: AppPersistedState = {
  preferences: DEFAULT_PREFERENCES as UserPreferences,
  likedPosts: MOCK_POSTS.filter(p => p.liked).map(p => p.id),
  savedPosts: MOCK_POSTS.filter(p => p.saved).map(p => p.id),
  followedUsers: [],
  seenStories: ['s3', 's5', 's8'],
  goingPosts: [],
  reminders: [],
  hasOnboarded: false,
  aiProfile: { categoryEngagement: {}, totalInteractions: 0, lastActive: Date.now(), sessionCount: 1 },
  notifications: MOCK_NOTIFICATIONS,
  createdPosts: [],
  location: null,
  locationEnabled: false,
  hasSeenLocationPrompt: false,
};

// ── Reducer ───────────────────────────────────────────────────────────────────

type Action =
  | { type: 'LOAD'; payload: AppPersistedState }
  | { type: 'LIKE_POST'; id: string; category: Category }
  | { type: 'SAVE_POST'; id: string; category: Category }
  | { type: 'FOLLOW_USER'; id: string }
  | { type: 'MARK_STORY_SEEN'; id: string }
  | { type: 'MARK_GOING'; id: string }
  | { type: 'ADD_REMINDER'; reminder: Reminder }
  | { type: 'REMOVE_REMINDER'; postId: string }
  | { type: 'SET_PREFERENCES'; prefs: UserPreferences }
  | { type: 'ADD_NOTIFICATION'; notif: NovaNotification }
  | { type: 'MARK_ALL_READ' }
  | { type: 'MARK_READ'; id: string }
  | { type: 'ADD_CREATED_POST'; post: Post }
  | { type: 'COMPLETE_ONBOARDING'; prefs: UserPreferences }
  | { type: 'SET_LOCATION'; location: LocationState }
  | { type: 'SET_LOCATION_ENABLED'; enabled: boolean }
  | { type: 'SET_SEEN_LOCATION_PROMPT' }
  | { type: 'SYNC_INTERACTIONS'; liked: string[]; saved: string[]; going: string[] }
  | { type: 'CLEAR_ALL_DATA' };

function reducer(state: AppPersistedState, action: Action): AppPersistedState {
  switch (action.type) {
    case 'LOAD':
      return action.payload;

    case 'LIKE_POST': {
      const has = state.likedPosts.includes(action.id);
      return {
        ...state,
        likedPosts: has ? state.likedPosts.filter(id => id !== action.id) : [...state.likedPosts, action.id],
        aiProfile: learnFromInteraction(state.aiProfile, action.category, has ? 'weak' : 'medium'),
      };
    }

    case 'SAVE_POST': {
      const has = state.savedPosts.includes(action.id);
      return {
        ...state,
        savedPosts: has ? state.savedPosts.filter(id => id !== action.id) : [...state.savedPosts, action.id],
        aiProfile: has ? state.aiProfile : learnFromInteraction(state.aiProfile, action.category, 'strong'),
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
      const has = state.goingPosts.includes(action.id);
      return { ...state, goingPosts: has ? state.goingPosts.filter(id => id !== action.id) : [...state.goingPosts, action.id] };
    }

    case 'ADD_REMINDER': {
      const filtered = state.reminders.filter(r => r.postId !== action.reminder.postId);
      return { ...state, reminders: [...filtered, action.reminder] };
    }

    case 'REMOVE_REMINDER':
      return { ...state, reminders: state.reminders.filter(r => r.postId !== action.postId) };

    case 'SET_PREFERENCES':
      return { ...state, preferences: action.prefs };

    case 'ADD_NOTIFICATION':
      return {
        ...state,
        notifications: [action.notif, ...state.notifications].slice(0, 50),
      };

    case 'MARK_ALL_READ':
      return { ...state, notifications: state.notifications.map(n => ({ ...n, read: true })) };

    case 'MARK_READ':
      return { ...state, notifications: state.notifications.map(n => n.id === action.id ? { ...n, read: true } : n) };

    case 'ADD_CREATED_POST':
      return { ...state, createdPosts: [action.post, ...state.createdPosts] };

    case 'COMPLETE_ONBOARDING':
      return { ...state, hasOnboarded: true, preferences: action.prefs };

    case 'SET_LOCATION':
      return { ...state, location: action.location, locationEnabled: true };

    case 'SET_LOCATION_ENABLED':
      return { ...state, locationEnabled: action.enabled, location: action.enabled ? state.location : null };

    case 'SET_SEEN_LOCATION_PROMPT':
      return { ...state, hasSeenLocationPrompt: true };

    case 'SYNC_INTERACTIONS':
      return {
        ...state,
        likedPosts: Array.from(new Set([...state.likedPosts, ...action.liked])),
        savedPosts: Array.from(new Set([...state.savedPosts, ...action.saved])),
        goingPosts: Array.from(new Set([...state.goingPosts, ...action.going])),
      };

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
  likePost: (id: string, category: Category) => void;
  savePost: (id: string, category: Category) => void;
  followUser: (id: string) => void;
  markStorySeen: (id: string) => void;
  goPost: (id: string) => void;
  addReminder: (reminder: Reminder) => void;
  removeReminder: (postId: string) => void;
  setPreferences: (prefs: UserPreferences) => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  addCreatedPost: (post: Post) => void;
  completeOnboarding: (prefs: UserPreferences) => void;
  setLocation: (loc: LocationState) => void;
  setLocationEnabled: (enabled: boolean) => void;
  markSeenLocationPrompt: () => void;
  clearAllData: () => void;
  syncInteractions: (data: { likedPosts: string[]; savedPosts: string[]; goingPosts: string[] }) => void;
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
  const aiTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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

  // AI periodic notification engine
  useEffect(() => {
    // Request notification permission after 5s
    const permTimer = setTimeout(() => {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }, 5000);

    // Generate AI notifications every 3 minutes
    aiTimerRef.current = setInterval(() => {
      const topCats = getTopCategories(state.preferences, state.aiProfile, 3);
      const topCat = topCats[Math.floor(Math.random() * topCats.length)];
      const candidatePosts = MOCK_POSTS.filter(
        p => p.category === topCat &&
          !state.notifications.some(n => n.postId === p.id && n.type === 'ai_suggestion')
      );
      if (candidatePosts.length === 0) return;

      const randomPost = candidatePosts[Math.floor(Math.random() * candidatePosts.length)];
      const notifUser = randomPost.user;
      const generated = generateAINotification(randomPost, state.preferences, notifUser);
      const notif: NovaNotification = {
        ...generated,
        id: `ai_${Date.now()}`,
        type: randomPost.isEvent ? 'event' : 'ai_suggestion',
      };

      dispatch({ type: 'ADD_NOTIFICATION', notif });

      // Browser notification
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Nova — New for you ✨', {
            body: notif.text,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
          });
        } catch { /* permission revoked mid-session */ }
      }
    }, 3 * 60 * 1000);

    return () => {
      clearTimeout(permTimer);
      if (aiTimerRef.current) clearInterval(aiTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.preferences, state.aiProfile]);

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
    likePost: (id, category) => {
      dispatch({ type: 'LIKE_POST', id, category });
      if (_supabaseUserId) {
        (state.likedPosts.includes(id)
          ? deleteInteraction(_supabaseUserId, id, 'like')
          : upsertInteraction(_supabaseUserId, id, 'like')
        ).catch(console.error);
      }
    },
    savePost: (id, category) => {
      dispatch({ type: 'SAVE_POST', id, category });
      if (_supabaseUserId) {
        (state.savedPosts.includes(id)
          ? deleteInteraction(_supabaseUserId, id, 'save')
          : upsertInteraction(_supabaseUserId, id, 'save')
        ).catch(console.error);
      }
    },
    followUser: (id) => dispatch({ type: 'FOLLOW_USER', id }),
    markStorySeen: (id) => dispatch({ type: 'MARK_STORY_SEEN', id }),
    goPost: (id) => {
      dispatch({ type: 'MARK_GOING', id });
      if (_supabaseUserId) {
        (state.goingPosts.includes(id)
          ? deleteInteraction(_supabaseUserId, id, 'going')
          : upsertInteraction(_supabaseUserId, id, 'going')
        ).catch(console.error);
      }
    },
    addReminder: (reminder) => dispatch({ type: 'ADD_REMINDER', reminder }),
    removeReminder: (postId) => dispatch({ type: 'REMOVE_REMINDER', postId }),
    setPreferences: (prefs) => dispatch({ type: 'SET_PREFERENCES', prefs }),
    markAllRead: () => dispatch({ type: 'MARK_ALL_READ' }),
    markRead: (id) => dispatch({ type: 'MARK_READ', id }),
    addCreatedPost: (post) => dispatch({ type: 'ADD_CREATED_POST', post }),
    completeOnboarding: (prefs) => dispatch({ type: 'COMPLETE_ONBOARDING', prefs }),
    setLocation: (location) => dispatch({ type: 'SET_LOCATION', location }),
    setLocationEnabled: (enabled) => dispatch({ type: 'SET_LOCATION_ENABLED', enabled }),
    markSeenLocationPrompt: () => dispatch({ type: 'SET_SEEN_LOCATION_PROMPT' }),
    syncInteractions: (data) => dispatch({ type: 'SYNC_INTERACTIONS', liked: data.likedPosts, saved: data.savedPosts, going: data.goingPosts }),
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
