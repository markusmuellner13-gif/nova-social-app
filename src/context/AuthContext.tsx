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
    const merged = { id: user.id, ...(profile ?? {}), ...updates };
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
        // Ensure profile exists
        const existing = await getProfile(s.user.id);
        if (!existing) {
          const username = s.user.user_metadata?.username
            ?? s.user.email?.split('@')[0]
            ?? `user_${s.user.id.slice(0, 6)}`;
          await upsertProfile({
            id: s.user.id,
            username,
            display_name: s.user.user_metadata?.full_name ?? username,
            avatar_url: s.user.user_metadata?.avatar_url,
          });
        }
        setProfile(existing ?? await getProfile(s.user.id));
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
