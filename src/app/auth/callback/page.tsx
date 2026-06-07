'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// Handles the Google OAuth PKCE callback.
// Supabase redirects here with ?code=... after Google authentication.
// We exchange the code for a session client-side, then send the user home.
export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code && supabase) {
      supabase.auth
        .exchangeCodeForSession(code)
        .finally(() => router.replace('/'));
    } else {
      router.replace('/');
    }
  }, [router]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0a0a0f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 26,
          fontWeight: 900,
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        N
      </div>
      <p style={{ color: '#a78bfa', fontSize: 14, fontWeight: 600, fontFamily: 'sans-serif' }}>
        Signing you in…
      </p>
    </div>
  );
}
