import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — Nova',
  description: 'Privacy Policy for Nova, the AI-powered event and place discovery app.',
};

const S: React.CSSProperties = { fontSize: 14, lineHeight: 1.7, color: '#888899' };
const H: React.CSSProperties = { color: '#a78bfa', fontSize: 16, fontWeight: 600, marginBottom: 8 };
const STRONG: React.CSSProperties = { color: '#d0d0e8' };

export default function PrivacyPage() {
  return (
    <div style={{ background: '#0a0a0f', minHeight: '100vh', padding: '40px 24px', color: '#d0d0e8', fontFamily: 'system-ui, sans-serif', maxWidth: 760, margin: '0 auto' }}>
      <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: '#888899', fontSize: 13, marginBottom: 4 }}>Last updated: 20 June 2026</p>
      <p style={{ color: '#888899', fontSize: 13, marginBottom: 32 }}>
        This policy is provided under Regulation (EU) 2016/679 (&ldquo;GDPR&rdquo;) and Italian Legislative Decree
        196/2003 (&ldquo;Codice Privacy&rdquo;) as amended by D.Lgs. 101/2018.
      </p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={H}>1. Data Controller</h2>
        <p style={S}>
          The data controller is <strong style={STRONG}>Leone Nero</strong> (the &ldquo;Company&rdquo;), based in
          Milano, Italy. For any privacy request you can contact us at{' '}
          <a href="mailto:privacy@nova-app.com" style={{ color: '#a78bfa' }}>privacy@nova-app.com</a>.
          A data protection contact / DPO can be reached at the same address.
          <br /><span style={{ color: '#555566' }}>[Company legal name, registered address, VAT/P.IVA and any DPO details to be finalised before public launch.]</span>
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={H}>2. What We Collect &amp; Why (Legal Basis)</h2>
        <ul style={{ ...S, paddingLeft: 20, lineHeight: 2 }}>
          <li><strong style={STRONG}>Approximate location</strong> (GPS or IP-derived) — to show nearby events and places.
            <em> Legal basis: consent (device location) / legitimate interest (coarse IP location).</em></li>
          <li><strong style={STRONG}>Account data</strong> (email, username, display name, avatar) — only if you create an account, to provide sign-in and cross-device sync.
            <em> Legal basis: performance of a contract (Art. 6(1)(b)).</em></li>
          <li><strong style={STRONG}>Activity</strong> (likes, saves, &ldquo;going&rdquo;, follows, groups) — to power your profile and feed when signed in.
            <em> Legal basis: performance of a contract.</em></li>
          <li><strong style={STRONG}>On-device preferences</strong> (language, interests, liked/saved items) — stored locally in your browser; not sent to our servers unless you sign in.
            <em> Legal basis: legitimate interest / consent.</em></li>
          <li><strong style={STRONG}>Anonymous analytics</strong> — only with your consent (see our Cookie Policy).
            <em> Legal basis: consent (Art. 6(1)(a)).</em></li>
        </ul>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={H}>3. Processors &amp; Third Parties</h2>
        <p style={S}>We share the minimum data necessary with the following sub-processors / service providers:</p>
        <ul style={{ ...S, paddingLeft: 20, lineHeight: 2, marginTop: 8 }}>
          <li><strong style={STRONG}>Vercel</strong> — hosting &amp; anonymous analytics (EU/US)</li>
          <li><strong style={STRONG}>Supabase</strong> — authentication &amp; database (EU region, eu-north-1)</li>
          <li><strong style={STRONG}>Upstash</strong> — caching / rate limiting</li>
          <li><strong style={STRONG}>Anthropic</strong> — AI enrichment of event descriptions (no personal identifiers sent)</li>
          <li><strong style={STRONG}>Stripe</strong> — payment processing for business customers only</li>
          <li><strong style={STRONG}>Ticketmaster, SeatGeek, OpenStreetMap/Nominatim, Wikipedia, Unsplash, Pexels, Google Places</strong> — content &amp; imagery; only coordinates / search terms are sent, never your identity</li>
        </ul>
        <p style={{ ...S, marginTop: 8 }}>
          Where a provider processes data outside the EEA, transfers are covered by Standard Contractual Clauses or an adequacy decision.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={H}>4. Retention</h2>
        <p style={S}>
          On-device data persists until you clear it. Account data is kept while your account exists and deleted when you
          delete your account. Cached content expires automatically (minutes to hours). Advertiser analytics counters are
          retained up to 90 days. Business payment records are retained as required by Italian tax/accounting law.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={H}>5. Your Rights</h2>
        <p style={S}>
          Under the GDPR you have the right to access, rectify, erase, restrict, port, and object to the processing of your
          data, and to withdraw consent at any time. In the app:
        </p>
        <ul style={{ ...S, paddingLeft: 20, lineHeight: 2, marginTop: 8 }}>
          <li><strong style={STRONG}>Access / portability:</strong> Profile → Settings → <em>Download my data</em> (JSON export).</li>
          <li><strong style={STRONG}>Erasure:</strong> Profile → Settings → <em>Delete account &amp; data</em>, or <em>Clear Data</em> for on-device data.</li>
          <li><strong style={STRONG}>Withdraw consent:</strong> via the Cookie Policy controls.</li>
        </ul>
        <p style={{ ...S, marginTop: 8 }}>
          You also have the right to lodge a complaint with the Italian Data Protection Authority
          (<a href="https://www.garanteprivacy.it" target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa' }}>Garante per la protezione dei dati personali</a>).
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={H}>6. Children</h2>
        <p style={S}>
          Nova is not intended for children under 14. In Italy the minimum age for consenting to information-society services
          is 14 (Art. 8 GDPR as implemented by D.Lgs. 101/2018). Users confirm they meet this age requirement during
          onboarding. If you believe a child has provided us data, contact us and we will delete it.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={H}>7. Security</h2>
        <p style={S}>
          We use HTTPS everywhere, strict security headers, a content security policy, per-IP rate limiting, row-level
          security on our database, and signed/verified payment webhooks. No system is perfectly secure, but we apply
          industry-standard safeguards proportionate to the risk.
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={H}>8. Contact</h2>
        <p style={S}>
          Questions or requests? Email{' '}
          <a href="mailto:privacy@nova-app.com" style={{ color: '#a78bfa' }}>privacy@nova-app.com</a>. See also our{' '}
          <Link href="/cookie" style={{ color: '#a78bfa' }}>Cookie Policy</Link> and{' '}
          <Link href="/terms" style={{ color: '#a78bfa' }}>Terms of Service</Link>.
        </p>
      </section>

      <Link href="/" style={{ display: 'inline-block', marginTop: 16, color: '#a78bfa', fontSize: 13, textDecoration: 'none' }}>
        ← Back to Nova
      </Link>
    </div>
  );
}
