'use client';

import { useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Self-serve business portal (#8 + #10) — where a restaurant / hotel / rental /
// shop signs up to run a sponsored post. Picks a plan → Stripe Checkout. If
// Stripe isn't configured yet, it captures the lead as a waitlist entry.
// ─────────────────────────────────────────────────────────────────────────────

const PLANS = [
  { id: 'basic',    name: 'Basic',    price: '€29', tagline: '1 sponsored post in your city feed', features: ['1 active sponsored post', 'City-targeted to locals', 'Link + “Reserve” button', 'Monthly performance email'] },
  { id: 'featured', name: 'Featured', price: '€49', tagline: 'Priority placement + analytics', popular: true, features: ['Everything in Basic', 'Priority feed placement', 'Live impressions & clicks dashboard', 'Verified business badge'] },
  { id: 'premium',  name: 'Premium',  price: '€149', tagline: 'Top of feed + event boosts', features: ['Everything in Featured', 'Top-of-feed slots', 'Boost individual events', 'Multiple posts / locations'] },
];

const CATEGORIES = ['Restaurant', 'Bar / Café', 'Hotel / B&B', 'Car / Bike Rental', 'Shop', 'Wellness / Spa', 'Tour / Experience', 'Other'];

export default function BusinessPage() {
  const [plan, setPlan] = useState('featured');
  const [form, setForm] = useState({ business: '', email: '', city: '', category: 'Restaurant', website: '' });
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | 'paid' | 'queued'>(null);
  const [error, setError] = useState('');

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.business.trim() || !form.email.trim()) { setError('Please enter your business name and email.'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/business/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, plan }),
      });
      const data = await res.json() as { ok: boolean; url?: string; queued?: boolean; error?: string };
      if (!data.ok) { setError(data.error ?? 'Something went wrong. Please try again.'); setSubmitting(false); return; }
      if (data.url) { window.location.href = data.url; return; }
      setDone(data.queued ? 'queued' : 'paid');
    } catch {
      setError('Network error. Please try again.');
    }
    setSubmitting(false);
  }

  const input: React.CSSProperties = {
    width: '100%', padding: '12px 14px', borderRadius: 12, background: '#13131a',
    border: '1px solid #2a2a38', color: '#fff', fontSize: 14, outline: 'none',
  };
  const label: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#9aa', marginBottom: 6, display: 'block' };

  if (done) {
    return (
      <main style={{ height: '100dvh', overflowY: 'auto', background: '#0a0a0f', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>🎉</div>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>You’re on the list!</h1>
        <p style={{ color: '#9aa', maxWidth: 380 }}>
          Thanks, {form.business}. We’ve received your request for the <b>{PLANS.find(p => p.id === plan)?.name}</b> plan
          {' '}and will reach out at {form.email} to verify your business and get your post live.
        </p>
        <a href="/" style={{ marginTop: 8, padding: '12px 22px', borderRadius: 14, background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', color: '#fff', fontWeight: 700, textDecoration: 'none' }}>Back to Nova</a>
      </main>
    );
  }

  return (
    <main style={{ height: '100dvh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: '#0a0a0f', color: '#fff' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '28px 18px 60px' }}>
        {/* Hero */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <span style={{ fontSize: 22, fontWeight: 900, background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Nova</span>
          <span style={{ fontSize: 12, color: '#666677' }}>for business</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2 }}>Get discovered by locals & visitors near you</h1>
        <p style={{ color: '#9aa', marginTop: 10, fontSize: 15 }}>
          Put your restaurant, hotel, rental or shop in front of people exactly when they’re looking for somewhere to go — in your city, in real time.
        </p>

        {/* Plans */}
        <div style={{ display: 'grid', gap: 12, marginTop: 24 }}>
          {PLANS.map(p => {
            const active = plan === p.id;
            return (
              <button key={p.id} type="button" onClick={() => setPlan(p.id)}
                style={{
                  textAlign: 'left', padding: 16, borderRadius: 16, cursor: 'pointer',
                  background: active ? 'rgba(139,92,246,0.12)' : '#13131a',
                  border: `1.5px solid ${active ? '#8b5cf6' : '#2a2a38'}`,
                  position: 'relative',
                }}>
                {p.popular && <span style={{ position: 'absolute', top: -9, right: 14, fontSize: 10, fontWeight: 800, background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', color: '#fff', padding: '3px 9px', borderRadius: 999 }}>MOST POPULAR</span>}
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 17, fontWeight: 800 }}>{p.name}</span>
                  <span style={{ fontSize: 18, fontWeight: 800 }}>{p.price}<span style={{ fontSize: 12, color: '#9aa', fontWeight: 600 }}>/mo</span></span>
                </div>
                <p style={{ color: '#9aa', fontSize: 13, marginTop: 4 }}>{p.tagline}</p>
                <ul style={{ marginTop: 10, display: 'grid', gap: 5 }}>
                  {p.features.map(f => (
                    <li key={f} style={{ fontSize: 12.5, color: '#c8c8e0', display: 'flex', gap: 7 }}>
                      <span style={{ color: '#22c55e' }}>✓</span>{f}
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ marginTop: 26, display: 'grid', gap: 14 }}>
          <div>
            <label style={label}>Business name *</label>
            <input style={input} required value={form.business} onChange={e => set('business', e.target.value)} placeholder="e.g. Trattoria da Marco" />
          </div>
          <div>
            <label style={label}>Email *</label>
            <input style={input} required type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="you@business.com" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={label}>City</label>
              <input style={input} value={form.city} onChange={e => set('city', e.target.value)} placeholder="Rome" />
            </div>
            <div>
              <label style={label}>Category</label>
              <select style={input} value={form.category} onChange={e => set('category', e.target.value)}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={label}>Website (optional)</label>
            <input style={input} value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://…" />
          </div>

          {error && (
            <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, background: 'rgba(244,63,94,0.18)', border: '1px solid rgba(244,63,94,0.4)', borderRadius: 10, padding: '10px 12px' }}>
              ⚠️ {error}
            </p>
          )}

          {/* Sticky so it's always reachable, even before scrolling the form */}
          <div style={{ position: 'sticky', bottom: 0, paddingTop: 8, paddingBottom: 12, background: 'linear-gradient(to top, #0a0a0f 70%, transparent)' }}>
            <button type="submit" disabled={submitting}
              style={{
                width: '100%', padding: '15px', borderRadius: 14, border: 'none', cursor: submitting ? 'default' : 'pointer',
                background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', color: '#fff', fontWeight: 800, fontSize: 16,
                opacity: submitting ? 0.6 : 1,
              }}>
              {submitting ? 'Processing…' : `Continue to payment — ${PLANS.find(p => p.id === plan)?.price}/mo`}
            </button>
            <p style={{ fontSize: 11, color: '#666677', textAlign: 'center', marginTop: 8 }}>
              Cancel anytime. We verify every business before its post goes live.
            </p>
          </div>
        </form>
      </div>
    </main>
  );
}
