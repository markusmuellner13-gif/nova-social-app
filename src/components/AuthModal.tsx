'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Lock, User, Eye, EyeOff, Check, AlertCircle } from 'lucide-react';
import {
  signUpEmail, signInEmail, signInGoogle, supabase,
  checkUsernameAvailable, usernameMessage, requestPasswordReset,
  type UsernameStatus,
} from '@/lib/supabase';
import { checkPassword, MIN_PASSWORD_LENGTH } from '@/lib/passwordPolicy';
import { checkPasswordBreached, type BreachResult } from '@/lib/passwordBreach';
import TurnstileWidget from './TurnstileWidget';

interface Props {
  onClose: () => void;
}

type AuthMode = 'signin' | 'signup' | 'forgot';

const METER_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];

export default function AuthModal({ onClose }: Props) {
  const [mode, setMode]         = useState<AuthMode>('signin');
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [notice, setNotice]     = useState('');
  const [captchaToken, setCaptchaToken] = useState('');

  const [nameStatus, setNameStatus] = useState<UsernameStatus | 'checking' | ''>('');
  const [breach, setBreach]         = useState<BreachResult | 'checking' | null>(null);

  // Password verdict is pure and cheap, so it recomputes on every keystroke.
  const verdict = useMemo(
    () => checkPassword(password, [email, username]),
    [password, email, username],
  );

  // ── Username availability (debounced) ──────────────────────────────────────
  const nameSeq = useRef(0);
  useEffect(() => {
    if (mode !== 'signup') { setNameStatus(''); return; }
    const candidate = username.trim().toLowerCase();
    if (!candidate) { setNameStatus(''); return; }

    setNameStatus('checking');
    const seq = ++nameSeq.current;
    const t = setTimeout(async () => {
      const status = await checkUsernameAvailable(candidate);
      // Ignore a slow reply that a newer keystroke has already superseded.
      if (seq === nameSeq.current) setNameStatus(status);
    }, 450);
    return () => clearTimeout(t);
  }, [username, mode]);

  // ── Breach check (debounced, only once the local policy is satisfied) ──────
  const breachSeq = useRef(0);
  useEffect(() => {
    if (mode !== 'signup' || !verdict.ok) { setBreach(null); return; }
    setBreach('checking');
    const seq = ++breachSeq.current;
    const t = setTimeout(async () => {
      const result = await checkPasswordBreached(password);
      if (seq === breachSeq.current) setBreach(result);
    }, 600);
    return () => clearTimeout(t);
  }, [password, verdict.ok, mode]);

  const usernameOk = nameStatus === 'available';
  const breachCount =
    breach !== null && breach !== 'checking' && breach.status === 'breached'
      ? breach.count
      : 0;
  const breachBlocks = breachCount > 0;
  const canSubmitSignup = verdict.ok && usernameOk && !breachBlocks && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setNotice('');

    if (mode === 'forgot') {
      setLoading(true);
      try {
        await requestPasswordReset(email.trim(), captchaToken);
        // Always the same message, whether or not the account exists — otherwise
        // this form tells an attacker which emails are registered.
        setNotice('If an account exists for that email, a reset link is on its way.');
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const name = username.trim().toLowerCase();
        if (!verdict.ok) { setError(verdict.problems[0] ?? 'Choose a stronger password'); return; }
        if (!usernameOk)  { setError(usernameMessage(nameStatus as UsernameStatus) || 'Pick a different username'); return; }
        if (breachBlocks) { setError('That password has appeared in a data breach — choose another'); return; }

        await signUpEmail(email, password, name, captchaToken);
        setNotice('Check your email to confirm your account, then sign in.');
        setMode('signin');
        setPassword('');
      } else {
        await signInEmail(email, password, captchaToken);
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

  function switchMode(next: AuthMode) {
    setMode(next);
    setError('');
    setNotice('');
    setBreach(null);
    setNameStatus('');
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

  const title =
    mode === 'signin' ? 'Welcome back 👋' :
    mode === 'signup' ? 'Create account' : 'Reset password';
  const subtitle =
    mode === 'signin' ? 'Sign in to sync your events across devices' :
    mode === 'signup' ? 'Join Nova — discover events near you' :
    'We’ll email you a link to set a new password';

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
            <h2 className="text-xl font-bold text-white">{title}</h2>
            <p className="text-xs mt-1" style={{ color: '#666677' }}>{subtitle}</p>
          </div>
          <button onClick={onClose}><X size={22} style={{ color: '#666677' }} /></button>
        </div>

        {mode !== 'forgot' && (
          <>
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
          </>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {mode === 'signup' && (
            <div>
              <div className="relative">
                <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#666677' }} />
                <input
                  type="text" value={username}
                  onChange={e => setUsername(e.target.value.toLowerCase())}
                  placeholder="Username (e.g. markus.vienna)"
                  className="w-full pl-10 pr-10 py-3.5 rounded-2xl text-sm text-white outline-none"
                  style={{
                    background: '#13131a',
                    border: `1px solid ${
                      nameStatus === '' || nameStatus === 'checking' ? '#2a2a38'
                        : usernameOk ? '#22c55e55' : '#ef444455'
                    }`,
                  }}
                  autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  maxLength={30}
                />
                {usernameOk && (
                  <Check size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2" style={{ color: '#22c55e' }} />
                )}
              </div>
              {nameStatus && nameStatus !== 'checking' && nameStatus !== 'unknown' && (
                <p className="text-xs mt-1.5 px-1" style={{ color: usernameOk ? '#22c55e' : '#f87171' }}>
                  {usernameOk ? 'Username is available' : usernameMessage(nameStatus)}
                </p>
              )}
            </div>
          )}

          <div className="relative">
            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#666677' }} />
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="Email address"
              autoComplete="email"
              className="w-full pl-10 pr-4 py-3.5 rounded-2xl text-sm text-white outline-none"
              style={{ background: '#13131a', border: '1px solid #2a2a38' }}
            />
          </div>

          {mode !== 'forgot' && (
            <div>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#666677' }} />
                <input
                  type={showPass ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? `Password (min ${MIN_PASSWORD_LENGTH} characters)` : 'Password'}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  className="w-full pl-10 pr-12 py-3.5 rounded-2xl text-sm text-white outline-none"
                  style={{ background: '#13131a', border: '1px solid #2a2a38' }}
                />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2">
                  {showPass ? <EyeOff size={16} style={{ color: '#666677' }} /> : <Eye size={16} style={{ color: '#666677' }} />}
                </button>
              </div>

              {/* Strength meter — signup only; on sign-in the password is
                  whatever it already is and judging it would just be noise. */}
              {mode === 'signup' && password.length > 0 && (
                <div className="mt-2 px-1">
                  <div className="flex gap-1 mb-1.5">
                    {[0, 1, 2, 3, 4].map(i => (
                      <div key={i} className="flex-1 h-1 rounded-full transition-colors"
                        style={{ background: i <= verdict.score && verdict.ok ? METER_COLORS[verdict.score] : i <= verdict.score ? '#f97316' : '#2a2a38' }} />
                    ))}
                  </div>
                  <div className="flex items-start gap-1.5">
                    {verdict.ok && breach !== 'checking' && !breachBlocks && (
                      <Check size={13} style={{ color: '#22c55e', marginTop: 1, flexShrink: 0 }} />
                    )}
                    {(!verdict.ok || breachBlocks) && (
                      <AlertCircle size={13} style={{ color: '#f87171', marginTop: 1, flexShrink: 0 }} />
                    )}
                    <p className="text-xs" style={{ color: breachBlocks ? '#f87171' : verdict.ok ? '#22c55e' : '#888899' }}>
                      {breachBlocks
                        ? `Found in a known data breach (${breachCount.toLocaleString()} times) — pick another`
                        : breach === 'checking'
                          ? 'Checking against known breaches…'
                          : verdict.problems[0] ?? verdict.label}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <AnimatePresence>
            {(error || notice) && (
              <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="text-xs px-1" style={{ color: notice ? '#22c55e' : '#f87171' }}>
                {notice || error}
              </motion.p>
            )}
          </AnimatePresence>

          {/* Bot/abuse protection — renders only when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set */}
          <TurnstileWidget onToken={setCaptchaToken} />

          <motion.button whileTap={{ scale: 0.97 }} type="submit"
            disabled={mode === 'signup' ? !canSubmitSignup : loading}
            className="w-full py-3.5 rounded-2xl text-sm font-bold text-white mt-1"
            style={{
              background: (mode === 'signup' ? !canSubmitSignup : loading)
                ? '#2a2a38' : 'linear-gradient(135deg, #8b5cf6, #ec4899)',
              opacity: (mode === 'signup' ? !canSubmitSignup : loading) ? 0.7 : 1,
            }}>
            {loading ? 'Please wait…'
              : mode === 'signin' ? 'Sign In'
              : mode === 'signup' ? 'Create Account'
              : 'Send reset link'}
          </motion.button>
        </form>

        {mode === 'signin' && (
          <p className="text-center text-xs mt-4">
            <button onClick={() => switchMode('forgot')} className="font-semibold" style={{ color: '#a78bfa' }}>
              Forgot your password?
            </button>
          </p>
        )}

        <p className="text-center text-xs mt-5" style={{ color: '#666677' }}>
          {mode === 'signup' ? 'Already have an account? ' : mode === 'forgot' ? 'Remembered it? ' : "Don't have an account? "}
          <button onClick={() => switchMode(mode === 'signup' ? 'signin' : mode === 'forgot' ? 'signin' : 'signup')}
            className="font-semibold" style={{ color: '#a78bfa' }}>
            {mode === 'signup' ? 'Sign in' : mode === 'forgot' ? 'Sign in' : 'Sign up'}
          </button>
        </p>

        {mode === 'signup' && (
          <p className="text-center text-xs mt-3" style={{ color: '#444455' }}>
            By signing up you agree to our Terms of Service & Privacy Policy.
          </p>
        )}
      </motion.div>
    </div>
  );
}
