'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, SupabaseProfile, getProfile, upsertProfile } from '@/lib/supabase';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: SupabaseProfile | null;
  loading: boolean;
  isSupabaseEnabled: boolean;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<SupabaseProfile>) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<SupabaseProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const isSupabaseEnabled = !!supabase;

  const refreshProfile = useCallback(async () => {
    if (!supabase || !user) return;
    const p = await getProfile(user.id);
    setProfile(p);
  }, [user]);

  const updateProfile = useCallback(async (updates: Partial<SupabaseProfile>) => {
    if (!supabase || !user) return;
    // `username` is immutable server-side (migration 007) and upsertProfile
    // strips it anyway; spreading the existing profile in is what used to send
    // it back on every edit.
    const merged = { ...(profile ?? {}), ...updates, id: user.id };
    const result = await upsertProfile(merged as SupabaseProfile);
    if (result) setProfile(result as SupabaseProfile);
  }, [user, profile]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);

      if (s?.user) {
        // The profile is created by the on_auth_user_created trigger, inside the
        // same transaction as the auth.users row (migration 007), so by the time
        // a session exists the profile does too.
        //
        // This used to create it from the client instead, and that was the bug:
        // a username collision made the insert fail with 23505, the failure was
        // console.error'd and dropped, and the account stayed permanently
        // profile-less while still being able to sign in. Client-side creation
        // is gone — a single retry covers a cold read, and nothing here invents
        // a username any more.
        let p = await getProfile(s.user.id);
        if (!p) p = await getProfile(s.user.id);
        setProfile(p);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load profile once user is known
  useEffect(() => {
    if (user) refreshProfile();
  }, [user, refreshProfile]);

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, isSupabaseEnabled, refreshProfile, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}
