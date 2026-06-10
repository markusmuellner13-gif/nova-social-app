export const metadata = {
  title: 'Cookie Policy — Nova',
  description: 'Cookie and tracking technology policy for Nova by Leone Nero.',
};

export default function CookiePage() {
  const s = { fontSize: 14, lineHeight: 1.7, color: '#888899' } as const;
  const h = { color: '#a78bfa', fontSize: 16, fontWeight: 600, marginBottom: 8 } as const;
  const section = { marginBottom: 28 } as const;

  return (
    <div style={{ background: '#0a0a0f', minHeight: '100vh', padding: '40px 24px', color: '#d0d0e8', fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Cookie & Tracking Policy</h1>
      <p style={{ color: '#888899', fontSize: 13, marginBottom: 4 }}>Leone Nero — Nova App</p>
      <p style={{ color: '#888899', fontSize: 13, marginBottom: 32 }}>Last updated: June 2026 · Compliant with EU GDPR, Italian D.Lgs. 196/2003 (Codice Privacy) and D.Lgs. 69/2012</p>

      <section style={section}>
        <h2 style={h}>1. What Are Cookies and Similar Technologies</h2>
        <p style={s}>
          Cookies are small text files stored on your device by a website. Nova primarily uses <strong style={{ color: '#d0d0e8' }}>localStorage</strong> and <strong style={{ color: '#d0d0e8' }}>sessionStorage</strong> — browser-based storage mechanisms — rather than traditional HTTP cookies. Under Italian and EU law, these are treated as equivalent technologies and are subject to the same consent rules where applicable.
        </p>
      </section>

      <section style={section}>
        <h2 style={h}>2. Technologies We Use</h2>

        <p style={{ ...s, marginBottom: 12 }}><strong style={{ color: '#d0d0e8' }}>2.1 Strictly Necessary (no consent required)</strong></p>
        <ul style={{ ...s, paddingLeft: 20, marginBottom: 16 }}>
          <li style={{ marginBottom: 6 }}><strong style={{ color: '#d0d0e8' }}>localStorage — User Preferences:</strong> Stores your language selection, feed preferences, liked/saved posts, and event reminders. This data never leaves your device and is encrypted using AES-256-GCM. Basis: contract performance / legitimate interest.</li>
          <li style={{ marginBottom: 6 }}><strong style={{ color: '#d0d0e8' }}>Supabase Auth Session Cookie:</strong> When you sign in, Supabase sets an HTTP-only session cookie to keep you authenticated. This is strictly necessary for the sign-in feature. Expires when you sign out or after 7 days of inactivity.</li>
          <li style={{ marginBottom: 6 }}><strong style={{ color: '#d0d0e8' }}>Rate Limiting (server-side, Redis):</strong> Your IP address is temporarily stored in Upstash Redis to prevent API abuse. Expires after 60 seconds. Not accessible from the browser. Basis: legitimate interest (security).</li>
        </ul>

        <p style={{ ...s, marginBottom: 12 }}><strong style={{ color: '#d0d0e8' }}>2.2 Analytics (minimal, privacy-friendly)</strong></p>
        <ul style={{ ...s, paddingLeft: 20, marginBottom: 16 }}>
          <li style={{ marginBottom: 6 }}><strong style={{ color: '#d0d0e8' }}>Vercel Analytics:</strong> Collects anonymised, aggregated page view data with no personal identifiers. No cross-site tracking, no fingerprinting. Compliant with GDPR without consent under anonymisation. See <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa' }}>Vercel Privacy Policy</a>.</li>
        </ul>

        <p style={{ ...s, marginBottom: 12 }}><strong style={{ color: '#d0d0e8' }}>2.3 Advertising (only when activated)</strong></p>
        <ul style={{ ...s, paddingLeft: 20 }}>
          <li style={{ marginBottom: 6 }}><strong style={{ color: '#d0d0e8' }}>Google AdSense:</strong> Currently not active. If enabled in the future, Google AdSense uses cookies and similar technologies to serve personalised advertisements. Explicit consent will be requested via a cookie banner before AdSense is loaded. See <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa' }}>Google Privacy Policy</a>.</li>
        </ul>
      </section>

      <section style={section}>
        <h2 style={h}>3. Third-Party Services and Their Cookies</h2>
        <p style={s}>Nova fetches content from third-party APIs server-side (Ticketmaster, Unsplash, Pexels, OpenStreetMap, Wikipedia, Anthropic). These requests are made from our servers — not from your browser — so these services do not set cookies on your device. Google OAuth (used for sign-in) may set authentication-related cookies during the sign-in redirect. These are strictly necessary for authentication.</p>
      </section>

      <section style={section}>
        <h2 style={h}>4. Your Rights Under GDPR and Italian Law</h2>
        <ul style={{ ...s, paddingLeft: 20 }}>
          <li style={{ marginBottom: 6 }}><strong style={{ color: '#d0d0e8' }}>Right to withdraw consent:</strong> You can clear all locally stored data at any time via Settings → Clear All Data in the app.</li>
          <li style={{ marginBottom: 6 }}><strong style={{ color: '#d0d0e8' }}>Right to access:</strong> All your preferences are stored locally on your device. If signed in, you may request a copy of your account data by contacting us.</li>
          <li style={{ marginBottom: 6 }}><strong style={{ color: '#d0d0e8' }}>Right to erasure:</strong> Sign out and use Clear All Data to erase local data. To delete your account and associated server-side data, contact us at the address below.</li>
          <li style={{ marginBottom: 6 }}><strong style={{ color: '#d0d0e8' }}>Right to lodge a complaint:</strong> You may lodge a complaint with the Italian data protection authority, the <strong>Garante per la protezione dei dati personali</strong> (<a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa' }}>garanteprivacy.it</a>).</li>
        </ul>
      </section>

      <section style={section}>
        <h2 style={h}>5. Cookie Retention Periods</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a2a38' }}>
                <th style={{ textAlign: 'left', padding: '8px 0', color: '#d0d0e8' }}>Technology</th>
                <th style={{ textAlign: 'left', padding: '8px 12px', color: '#d0d0e8' }}>Type</th>
                <th style={{ textAlign: 'left', padding: '8px 0', color: '#d0d0e8' }}>Retention</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['localStorage preferences', 'Essential', 'Until cleared by user'],
                ['Supabase auth session', 'Essential', '7 days / sign-out'],
                ['Rate limit (server Redis)', 'Essential', '60 seconds'],
                ['Vercel Analytics', 'Analytics (anonymous)', '90 days aggregated'],
                ['Google AdSense', 'Advertising', 'Not active'],
              ].map(([tech, type, ret]) => (
                <tr key={tech} style={{ borderBottom: '1px solid #1a1a24' }}>
                  <td style={{ padding: '10px 0', color: '#888899' }}>{tech}</td>
                  <td style={{ padding: '10px 12px', color: '#888899' }}>{type}</td>
                  <td style={{ padding: '10px 0', color: '#888899' }}>{ret}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={section}>
        <h2 style={h}>6. Contact</h2>
        <p style={s}>
          For questions about this policy or to exercise your rights, contact Leone Nero at:<br />
          <a href="https://markusmuellner13-gif.github.io/leone-nero-website/index.html" target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa' }}>leone-nero.com</a><br />
          Milano, Italy
        </p>
      </section>
    </div>
  );
}
