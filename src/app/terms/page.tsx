export const metadata = {
  title: 'Terms of Service — Nova',
  description: 'Terms of Service for Nova, the AI-powered event and place discovery app.',
};

export default function TermsPage() {
  return (
    <div style={{ background: '#0a0a0f', minHeight: '100vh', padding: '40px 24px', color: '#d0d0e8', fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '0 auto' }}>
      <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Terms of Service</h1>
      <p style={{ color: '#888899', fontSize: 13, marginBottom: 32 }}>Last updated: June 2026</p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ color: '#a78bfa', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>1. Acceptance</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#888899' }}>
          By using Nova ("the app"), you agree to these Terms of Service. If you do not agree, please stop using the app.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ color: '#a78bfa', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>2. Use of the App</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#888899' }}>
          Nova is a discovery tool. You may browse events, sightseeing, shops, venues and community content.
          You agree not to: (a) attempt to scrape or bulk-download content from Nova; (b) use the app to
          harass, harm, or deceive other users; (c) interfere with or overload our servers; (d) reverse-engineer
          or copy Nova's proprietary AI algorithms.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ color: '#a78bfa', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>3. Content Accuracy</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#888899' }}>
          Event information (dates, prices, venues, URLs) is sourced from third-party APIs and may not always be
          accurate or up to date. Nova is not liable for incorrect information. Always verify event details on the
          official event website before purchasing tickets or attending.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ color: '#a78bfa', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>4. Intellectual Property</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#888899' }}>
          Nova's design, branding, and original code are the property of Nova. Event images and descriptions
          are sourced from third parties under their respective licenses (Ticketmaster, Wikipedia CC, Unsplash/Pexels).
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ color: '#a78bfa', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>5. Limitation of Liability</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#888899' }}>
          Nova is provided "as is" without warranties of any kind. We are not liable for any loss or damage
          arising from your use of the app, reliance on event information, or inability to access the service.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ color: '#a78bfa', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>6. Changes</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#888899' }}>
          We may update these terms at any time. Continued use of Nova after changes constitutes acceptance
          of the updated terms.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ color: '#a78bfa', fontSize: 16, fontWeight: 600, marginBottom: 8 }}>7. Contact</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7, color: '#888899' }}>
          Questions?{' '}
          <a href="mailto:legal@nova-app.com" style={{ color: '#a78bfa' }}>legal@nova-app.com</a>
        </p>
      </section>

      <a href="/" style={{ display: 'inline-block', marginTop: 16, color: '#a78bfa', fontSize: 13, textDecoration: 'none' }}>
        ← Back to Nova
      </a>
    </div>
  );
}
