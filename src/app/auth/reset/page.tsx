'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Eye, EyeOff, Check, AlertCircle } from 'lucide-react';
import { supabase, updatePassword } from '@/lib/supabase';
import { checkPassword, MIN_PASSWORD_LENGTH } from '@/lib/passwordPolicy';
import { checkPasswordBreached, type BreachResult } from '@/lib/passwordBreach';

// Landing page for the password-reset email link.
//
// Supabase turns the link into a recovery SESSION (PASSWORD_RECOVERY event), so
// the user is briefly authenticated purely to set a new password. The new
// password goes through exactly the same policy and breach check as signup —
// a reset flow with weaker rules than signup is just a way around the rules.

const METER_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a'];

export default function ResetPassword() {
  const router = useRouter();
  const [ready, setReady]       = useState(false);
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);
  const [breach, setBreach]     = useState<BreachResult | 'checking' | null>(null);

  const verdict = useMemo(() => checkPassword(password), [password]);

  useEffect(() => {
    if (!supabase) return;
    // The recovery session may already be established by the time this mounts,
    // or it may arrive with the PASSWORD_RECOVERY event a tick later.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY' || s) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!verdict.ok) { setBreach(null); return; }
    setBreach('checking');
    let live = true;
    const t = setTimeout(async () => {
      const r = await checkPasswordBreached(password);
      if (live) setBreach(r);
    }, 600);
    return () => { live = false; clearTimeout(t); };
  }, [password, verdict.ok]);

  const breachBlocks = breach !== null && breach !== 'checking' && breach.status === 'breached';
  const canSave = verdict.ok && !breachBlocks && !saving && ready;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await updatePassword(password);
      setDone(true);
      setTimeout(() => router.replace('/'), 1800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update password');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <h1 className="text-xl font-bold text-white mb-1">Set a new password</h1>
        <p className="text-xs mb-6" style={{ color: '#666677' }}>
          {done ? 'Done — signing you in…'
            : ready ? 'Choose a password you don’t use anywhere else.'
            : 'Open this page from the link in your email.'}
        </p>

        {done ? (
          <div className="flex items-center gap-2">
            <Check size={18} style={{ color: '#22c55e' }} />
            <p className="text-sm" style={{ color: '#22c55e' }}>Password updated</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="flex flex-col gap-3">
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: '#666677' }} />
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={`New password (min ${MIN_PASSWORD_LENGTH} characters)`}
                autoComplete="new-password"
                disabled={!ready}
                className="w-full pl-10 pr-12 py-3.5 rounded-2xl text-sm text-white outline-none"
                style={{ background: '#13131a', border: '1px solid #2a2a38' }}
              />
              <button type="button" onClick={() => setShowPass(s => !s)}
                aria-label={showPass ? 'Hide password' : 'Show password'}
                className="absolute right-3.5 top-1/2 -translate-y-1/2">
                {showPass ? <EyeOff size={16} style={{ color: '#666677' }} /> : <Eye size={16} style={{ color: '#666677' }} />}
              </button>
            </div>

            {password.length > 0 && (
              <div className="px-1">
                <div className="flex gap-1 mb-1.5">
                  {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} className="flex-1 h-1 rounded-full"
                      style={{ background: i <= verdict.score && verdict.ok ? METER_COLORS[verdict.score] : i <= verdict.score ? '#f97316' : '#2a2a38' }} />
                  ))}
                </div>
                <div className="flex items-start gap-1.5">
                  {verdict.ok && !breachBlocks && breach !== 'checking' && (
                    <Check size={13} style={{ color: '#22c55e', marginTop: 1, flexShrink: 0 }} />
                  )}
                  {(!verdict.ok || breachBlocks) && (
                    <AlertCircle size={13} style={{ color: '#f87171', marginTop: 1, flexShrink: 0 }} />
                  )}
                  <p className="text-xs" style={{ color: breachBlocks ? '#f87171' : verdict.ok ? '#22c55e' : '#888899' }}>
                    {breachBlocks ? 'Found in a known data breach — pick another'
                      : breach === 'checking' ? 'Checking against known breaches…'
                      : verdict.problems[0] ?? verdict.label}
                  </p>
                </div>
              </div>
            )}

            {error && <p className="text-xs px-1" style={{ color: '#f87171' }}>{error}</p>}

            <button type="submit" disabled={!canSave}
              className="w-full py-3.5 rounded-2xl text-sm font-bold text-white mt-1"
              style={{
                background: canSave ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : '#2a2a38',
                opacity: canSave ? 1 : 0.7,
              }}>
              {saving ? 'Saving…' : 'Update password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
