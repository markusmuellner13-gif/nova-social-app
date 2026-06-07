'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { signUpEmail, signInEmail, signInGoogle, supabase } from '@/lib/supabase';

interface Props {
  onClose: () => void;
}

type AuthMode = 'signin' | 'signup';

export default function AuthModal({ onClose }: Props) {
  const [mode, setMode]         = useState<AuthMode>('signin');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signup') {
        if (!username.trim()) { setError('Username is required'); setLoading(false); return; }
        if (username.length < 3) { setError('Username must be at least 3 characters'); setLoading(false); return; }
        await signUpEmail(email, password, username.trim().toLowerCase());
        setError('Check your email to confirm your account, then sign in.');
        setMode('signin');
      } else {
        await signInEmail(email, password);
        onClose();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg.includes('Invalid login') ? 'Incorrect email or password' : msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError('');
    try { await signInGoogle(); }
    catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed';
      setError(msg);
    }
  }

  if (!supabase) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
        <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
          onClick={e => e.stopPropagation()}
          className="w-full rounded-t-3xl p-8" style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}>
          <p className="text-white font-bold text-center mb-2">Accounts not yet configured</p>
          <p className="text-xs text-center" style={{ color: '#888899' }}>
            Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to Vercel to enable accounts.
          </p>
          <button onClick={onClose} className="mt-4 w-full py-3 rounded-xl text-sm font-semibold text-white" style={{ background: '#2a2a38' }}>Close</button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        onClick={e => e.stopPropagation()}
        className="w-full rounded-t-3xl px-5 pb-12 pt-5"
        style={{ background: '#1a1a24', border: '1px solid #2a2a38', maxHeight: '92dvh', overflowY: 'auto' }}
      >
        {/* Handle */}
        <div className="w-10 h-1 rounded-full mx-auto mb-6" style={{ background: '#3a3a4a' }} />

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">
              {mode === 'signin' ? 'Welcome back 👋' : 'Create account'}
            </h2>
            <p className="text-xs mt-1" style={{ color: '#666677' }}>
              {mode === 'signin' ? 'Sign in to sync your events across devices' : 'Join Nova — discover events near you'}
            </p>
          </div>
          <button onClick={onClose}><X size={22} style={{ color: '#666677' }} /></button>
        </div>

        {/* Google sign in */}
        <motion.button whileTap={{ scale: 0.97 }} onClick={handleGoogle}
          className="w-full flex items-center justify-center gap-3 py-3.5 rounded-2xl font-semibold text-sm mb-4"
          style={{ background: '#13131a', border: '1px solid #2a2a38', color: 'white' }}>
          <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </motion.button>

        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px" style={{ background: '#2a2a38' }} />
          <span className="text-xs" style={{ color: '#555566' }}>or</span>
          <div className="flex-1 h-px" style={{ background: '#2a2a38' }} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === 'signup' && (
            <div className="relative">
              <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#666677' }} />
              <input
                type="text" value={username} onChange={e => setUsername(e.target.value)}
                placeholder="Username (e.g. markus.vienna)"
                className="w-full pl-10 pr-4 py-3.5 rounded-2xl text-sm text-white outline-none"
                style={{ background: '#13131a', border: '1px solid #2a2a38' }}
                autoCapitalize="none" autoCorrect="off" spellCheck={false}
              />
            </div>
          )}

          <div className="relative">
            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#666677' }} />
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email address"
              className="w-full pl-10 pr-4 py-3.5 rounded-2xl text-sm text-white outline-none"
              style={{ background: '#13131a', border: '1px solid #2a2a38' }}
            />
          </div>

          <div className="relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#666677' }} />
            <input
              type={showPass ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Password (min 6 chars)"
              className="w-full pl-10 pr-12 py-3.5 rounded-2xl text-sm text-white outline-none"
              style={{ background: '#13131a', border: '1px solid #2a2a38' }}
            />
            <button type="button" onClick={() => setShowPass(s => !s)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2">
              {showPass ? <EyeOff size={16} style={{ color: '#666677' }} /> : <Eye size={16} style={{ color: '#666677' }} />}
            </button>
          </div>

          <AnimatePresence>
            {error && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="text-xs px-1" style={{ color: error.includes('Check your email') ? '#22c55e' : '#f87171' }}>
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <motion.button whileTap={{ scale: 0.97 }} type="submit" disabled={loading}
            className="w-full py-3.5 rounded-2xl text-sm font-bold text-white mt-1"
            style={{ background: loading ? '#2a2a38' : 'linear-gradient(135deg, #8b5cf6, #ec4899)', opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </motion.button>
        </form>

        <p className="text-center text-xs mt-5" style={{ color: '#666677' }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}
            className="font-semibold" style={{ color: '#a78bfa' }}>
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>

        <p className="text-center text-xs mt-3" style={{ color: '#444455' }}>
          By signing up you agree to our Terms of Service & Privacy Policy.
        </p>
      </motion.div>
    </div>
  );
}
