export const metadata = {
  title: 'Privacy Policy — Nova',
  description: 'Privacy Policy for Nova, the AI-powered event and place discovery app.',
};

export default function PrivacyPage() {
  return (
    <div style={{ background: '#0a0a0f', minHeight: '100vh', padding: '40px 24px', color: '#d0d0e8', fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: '#888899', fontSize: 13, marginBottom: 32 }}>Last updated: June 2026</p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ color: '#a78bfa', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>1. What We Collect</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#888899' }}>
          Nova collects your approximate location (GPS coordinates) solely to show you relevant nearby events and places.
          Your location is never stored on our servers — it is used only within the current session to fetch results from
          third-party event and mapping APIs. All user preferences (liked posts, saved events, language) are stored
          locally on your device using encrypted storage and are never transmitted to our servers.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ color: '#a78bfa', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>2. Third-Party APIs</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#888899' }}>
          Nova uses the following third-party services to provide content:
        </p>
        <ul style={{ fontSize: 14, lineHeight: 2, color: '#888899', paddingLeft: 20, marginTop: 8 }}>
          <li><strong style={{ color: '#d0d0e8' }}>Ticketmaster</strong> — event listings and images</li>
          <li><strong style={{ color: '#d0d0e8' }}>Wikipedia</strong> — sightseeing descriptions and photos</li>
          <li><strong style={{ color: '#d0d0e8' }}>OpenStreetMap / Overpass API</strong> — shops and venue data</li>
          <li><strong style={{ color: '#d0d0e8' }}>Unsplash / Pexels</strong> — photography for posts</li>
          <li><strong style={{ color: '#d0d0e8' }}>Anthropic Claude</strong> — AI event enrichment and web search</li>
          <li><strong style={{ color: '#d0d0e8' }}>Vercel Analytics</strong> — anonymous usage analytics (no personal data)</li>
        </ul>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#888899', marginTop: 8 }}>
          Your coordinates are passed to these services only to retrieve nearby results. No personal identifiers
          are attached to these requests.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ color: '#a78bfa', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>3. Cookies &amp; Storage</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#888899' }}>
          Nova uses <strong style={{ color: '#d0d0e8' }}>localStorage</strong> in your browser to save your preferences
          (language, liked/saved posts, location). No tracking cookies are set. Vercel Analytics uses anonymous,
          cookieless analytics that comply with GDPR, CCPA, and PECR.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ color: '#a78bfa', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>4. Your Rights</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#888899' }}>
          You can clear all locally stored data at any time via Profile → Settings → Clear Data.
          Since we do not store personal data on our servers, there is no account to delete.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ color: '#a78bfa', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>5. Contact</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#888899' }}>
          Questions about this policy? Email us at{' '}
          <a href="mailto:privacy@nova-app.com" style={{ color: '#a78bfa' }}>privacy@nova-app.com</a>.
        </p>
      </section>

      <a href="/" style={{ display: 'inline-block', marginTop: 16, color: '#a78bfa', fontSize: 13, textDecoration: 'none' }}>
        ← Back to Nova
      </a>
    </div>
  );
}
