'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import TurnstileWidget from '@/components/TurnstileWidget';

// ─────────────────────────────────────────────────────────────────────────────
// Self-serve paid-post portal. Flow:
//   1. Enter business name + city → VERIFY (Google Places) → only real businesses
//      pass, and we grab the venue's REAL photo (no arbitrary uploads).
//   2. Add a tagline + link, pick a plan → Stripe Checkout.
//   3. On return, the post is published IMMEDIATELY, geo-targeted to the city.
// ─────────────────────────────────────────────────────────────────────────────

const PLANS = [
  { id: 'basic',    name: 'Basic',    price: '€29',  popular: false, tagline: '1 sponsored post in your city feed', features: ['1 active sponsored post', 'City-targeted to locals', 'Link + “Reserve” button', 'Monthly performance email'] },
  { id: 'featured', name: 'Featured', price: '€49',  popular: true,  tagline: 'Priority placement + analytics',      features: ['Everything in Basic', 'Priority feed placement', 'Live impressions & clicks', 'Verified business badge'] },
  { id: 'premium',  name: 'Premium',  price: '€149', popular: false, tagline: 'Top of feed + event boosts',           features: ['Everything in Featured', 'Top-of-feed slots', 'Boost individual events', 'Multiple posts / locations'] },
];

const CATEGORIES: { label: string; value: string }[] = [
  { label: 'Restaurant',        value: 'restaurants' },
  { label: 'Bar / Café',        value: 'restaurants' },
  { label: 'Hotel / B&B',       value: 'hotels' },
  { label: 'Car / Bike Rental', value: 'rentals' },
  { label: 'Shop',              value: 'shops' },
  { label: 'Wellness / Spa',    value: 'lifestyle' },
  { label: 'Tour / Experience', value: 'sightseeing' },
  { label: 'Other',             value: 'lifestyle' },
];

interface Verification {
  verified: boolean; name?: string; address?: string; photo?: string;
  lat?: number; lng?: number; placeId?: string; reason?: string;
}

export default function BusinessPage() {
  const [plan, setPlan] = useState('featured');
  const [form, setForm] = useState({
    business: '', email: '', city: '', categoryLabel: 'Restaurant',
    website: '', tagline: '', ctaLabel: 'Reserve a table',
  });
  const [verif, setVerif] = useState<Verification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<null | 'live' | 'review' | 'queued'>(null);
  const [captchaToken, setCaptchaToken] = useState('');

  // Human-verification is required only when a Turnstile site key is configured.
  const captchaRequired = !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const captchaReady = !captchaRequired || captchaToken.length > 0;

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const catValue = CATEGORIES.find(c => c.label === form.categoryLabel)?.value ?? 'lifestyle';

  // ── On return from Stripe: publish the post immediately ────────────────────
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('status') !== 'success') return;
    const sessionId = sp.get('session_id');
    if (!sessionId) { setResult('review'); return; }
    (async () => {
      try {
        const res = await fetch(`/api/business/activate?session_id=${encodeURIComponent(sessionId)}`);
        const data = await res.json() as { ok: boolean; published?: boolean; pendingReview?: boolean };
        setResult(data.ok && data.published ? 'live' : 'review');
      } catch { setResult('review'); }
      // Clean the URL so a refresh doesn't re-trigger
      window.history.replaceState({}, '', '/business');
    })();
  }, []);

  // ── Step 1: verify the business is real ────────────────────────────────────
  const handleVerify = useCallback(async () => {
    setError('');
    if (!form.business.trim()) { setError('Enter your business name first.'); return; }
    setVerifying(true);
    try {
      const res = await fetch('/api/business/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business: form.business, city: form.city }),
      });
      const data = await res.json() as Verification;
      setVerif(data);
      if (!data.verified && data.reason === 'not_found') {
        setError('We couldn’t find that business on the map. Check the name/city spelling, or continue for manual review.');
      }
    } catch {
      setVerif({ verified: false, reason: 'error' });
      setError('Verification failed — you can still continue for manual review.');
    } finally { setVerifying(false); }
  }, [form.business, form.city]);

  // ── Step 2: checkout ───────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.business.trim() || !form.email.trim()) { setError('Business name and email are required.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/business/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business: form.business, email: form.email, city: form.city,
          category: catValue, website: form.website,
          tagline: form.tagline, ctaUrl: form.website, ctaLabel: form.ctaLabel,
          plan,
          turnstileToken: captchaToken,
          verified: verif?.verified ? 'true' : 'false',
          placeId: verif?.placeId ?? '', photo: verif?.photo ?? '',
          address: verif?.address ?? '',
          lat: String(verif?.lat ?? ''), lng: String(verif?.lng ?? ''),
        }),
      });
      const data = await res.json() as { ok: boolean; url?: string; queued?: boolean; error?: string };
      if (!data.ok) { setError(data.error ?? 'Something went wrong.'); setSubmitting(false); return; }
      if (data.url) { window.location.href = data.url; return; }
      setResult('queued');
    } catch { setError('Network error. Please try again.'); }
    setSubmitting(false);
  }

  const input: React.CSSProperties = {
    width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12,
    background: '#13131a', border: '1px solid #2a2a38', color: '#fff', fontSize: 16, outline: 'none',
  };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#9aa', marginBottom: 6, display: 'block' };

  // ── Result screen ──────────────────────────────────────────────────────────
  if (result) {
    const copy = result === 'live'
      ? { icon: '🎉', title: 'Your post is live!', body: `It’s now showing to people browsing ${form.city || 'your city'} on Nova.` }
      : result === 'queued'
      ? { icon: '✅', title: 'You’re on the list!', body: 'Payments aren’t enabled yet — we saved your request and will be in touch.' }
      : { icon: '🕓', title: 'Payment received — pending review', body: 'We’ll verify your business and publish your post shortly.' };
    return (
      <main style={{ height: '100dvh', overflowY: 'auto', background: '#0a0a0f', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>{copy.icon}</div>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>{copy.title}</h1>
        <p style={{ color: '#9aa', maxWidth: 380 }}>{copy.body}</p>
        <Link href="/" style={{ marginTop: 8, padding: '12px 22px', borderRadius: 14, background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', color: '#fff', fontWeight: 700, textDecoration: 'none' }}>Open Nova</Link>
      </main>
    );
  }

  const canCheckout = verif !== null; // must attempt verification first

  return (
    <main style={{ height: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: '#0a0a0f', color: '#fff' }}>
      <div style={{ width: '100%', maxWidth: 560, margin: '0 auto', padding: '28px 18px 40px', boxSizing: 'border-box' }}>
        {/* Hero */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 22, fontWeight: 900, background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Nova</span>
          <span style={{ fontSize: 12, color: '#666677' }}>for business</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.2 }}>Get discovered by locals & visitors near you</h1>
        <p style={{ color: '#9aa', marginTop: 10, fontSize: 15 }}>
          Put your business in front of people looking for somewhere to go — in your city, in real time. We verify every business, so the feed stays trustworthy.
        </p>

        <form onSubmit={handleSubmit} style={{ marginTop: 22, display: 'grid', gap: 14 }}>
          {/* Step 1 — verify */}
          <div style={{ padding: 16, borderRadius: 16, background: '#13131a', border: '1px solid #2a2a38', display: 'grid', gap: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: '#a78bfa' }}>STEP 1 · VERIFY YOUR BUSINESS</p>
            <div>
              <label style={label}>Business name *</label>
              <input style={input} required value={form.business} onChange={e => { set('business', e.target.value); setVerif(null); }} placeholder="e.g. Trattoria da Marco" />
            </div>
            <div>
              <label style={label}>City</label>
              <input style={input} value={form.city} onChange={e => { set('city', e.target.value); setVerif(null); }} placeholder="Rome" />
            </div>
            <button type="button" onClick={handleVerify} disabled={verifying}
              style={{ padding: '12px', borderRadius: 12, border: '1px solid #8b5cf6', background: 'rgba(139,92,246,0.12)', color: '#c7b3ff', fontWeight: 700, cursor: 'pointer' }}>
              {verifying ? 'Checking…' : verif?.verified ? '✓ Verified — re-check' : 'Verify my business'}
            </button>

            {/* Verified card */}
            {verif?.verified && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10, borderRadius: 12, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.35)' }}>
                {verif.photo
                  ? <img src={verif.photo} alt={verif.name} style={{ width: 54, height: 54, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                  : <div style={{ width: 54, height: 54, borderRadius: 10, background: '#1a1a24', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>🏪</div>}
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: '#22c55e' }}>✓ Verified real business</p>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>{verif.name}</p>
                  <p style={{ fontSize: 12, color: '#9aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{verif.address}</p>
                </div>
              </div>
            )}
            {verif && !verif.verified && verif.reason === 'verification_unavailable' && (
              <p style={{ fontSize: 12, color: '#9aa' }}>Automatic verification isn’t enabled — your business will be reviewed manually before going live.</p>
            )}
          </div>

          {/* Step 2 — details (always visible, but verification is encouraged) */}
          <div style={{ padding: 16, borderRadius: 16, background: '#13131a', border: '1px solid #2a2a38', display: 'grid', gap: 12 }}>
            <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: '#a78bfa' }}>STEP 2 · YOUR POST</p>
            <div>
              <label style={label}>Email *</label>
              <input style={input} required type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@business.com" />
            </div>
            <div>
              <label style={label}>Category</label>
              <select style={input} value={form.categoryLabel} onChange={e => set('categoryLabel', e.target.value)}>
                {CATEGORIES.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Tagline shown on your post</label>
              <textarea style={{ ...input, minHeight: 70, resize: 'vertical' }} value={form.tagline} maxLength={240}
                onChange={e => set('tagline', e.target.value)} placeholder="e.g. Authentic wood-fired pizza in the heart of Trastevere. Book your table tonight!" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={label}>Website / booking link</label>
                <input style={input} value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://…" />
              </div>
              <div>
                <label style={label}>Button text</label>
                <input style={input} value={form.ctaLabel} onChange={e => set('ctaLabel', e.target.value)} placeholder="Reserve a table" />
              </div>
            </div>
          </div>

          {/* Plans */}
          <p style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', color: '#a78bfa', marginTop: 4 }}>STEP 3 · CHOOSE A PLAN</p>
          <div style={{ display: 'grid', gap: 12 }}>
            {PLANS.map(p => {
              const active = plan === p.id;
              return (
                <button key={p.id} type="button" onClick={() => setPlan(p.id)}
                  style={{ textAlign: 'left', padding: 16, borderRadius: 16, cursor: 'pointer', position: 'relative',
                    background: active ? 'rgba(139,92,246,0.12)' : '#13131a', border: `1.5px solid ${active ? '#8b5cf6' : '#2a2a38'}` }}>
                  {p.popular && <span style={{ position: 'absolute', top: -9, right: 14, fontSize: 10, fontWeight: 800, background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', color: '#fff', padding: '3px 9px', borderRadius: 999 }}>MOST POPULAR</span>}
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 17, fontWeight: 800 }}>{p.name}</span>
                    <span style={{ fontSize: 18, fontWeight: 800 }}>{p.price}<span style={{ fontSize: 12, color: '#9aa', fontWeight: 600 }}>/mo</span></span>
                  </div>
                  <p style={{ color: '#9aa', fontSize: 13, marginTop: 4 }}>{p.tagline}</p>
                  <ul style={{ marginTop: 10, display: 'grid', gap: 5 }}>
                    {p.features.map(f => (
                      <li key={f} style={{ fontSize: 12.5, color: '#c8c8e0', display: 'flex', gap: 7 }}><span style={{ color: '#22c55e' }}>✓</span>{f}</li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>

          {error && (
            <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, background: 'rgba(244,63,94,0.18)', border: '1px solid rgba(244,63,94,0.4)', borderRadius: 10, padding: '10px 12px' }}>⚠️ {error}</p>
          )}

          {/* Human verification (Cloudflare Turnstile — only renders when configured) */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <TurnstileWidget onToken={setCaptchaToken} />
          </div>

          {/* Sticky submit */}
          <div style={{ position: 'sticky', bottom: 0, paddingTop: 8, paddingBottom: 12, background: 'linear-gradient(to top, #0a0a0f 70%, transparent)' }}>
            <button type="submit" disabled={submitting || !canCheckout || !captchaReady}
              style={{ width: '100%', padding: '15px', borderRadius: 14, border: 'none', cursor: (submitting || !canCheckout || !captchaReady) ? 'default' : 'pointer',
                background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', color: '#fff', fontWeight: 800, fontSize: 16, opacity: (submitting || !canCheckout || !captchaReady) ? 0.55 : 1 }}>
              {submitting ? 'Processing…' : !canCheckout ? 'Verify your business first ↑' : !captchaReady ? 'Complete the verification check ↑' : `Continue to payment — ${PLANS.find(p => p.id === plan)?.price}/mo`}
            </button>
            <p style={{ fontSize: 11, color: '#666677', textAlign: 'center', marginTop: 8 }}>
              Cancel anytime. Verified businesses go live instantly.
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}
