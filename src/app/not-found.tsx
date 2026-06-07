import Link from 'next/link';

export const metadata = {
  title: '404 — Nova',
};

export default function NotFound() {
  return (
    <div
      style={{
        background: '#0a0a0f',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ fontSize: 64, marginBottom: 16 }}>🔍</div>
      <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>
        Page not found
      </h1>
      <p style={{ color: '#888899', fontSize: 14, marginBottom: 32, textAlign: 'center', maxWidth: 320 }}>
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Link
        href="/"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 24px',
          borderRadius: 12,
          background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
          color: 'white',
          fontWeight: 600,
          fontSize: 14,
          textDecoration: 'none',
        }}
      >
        ← Back to Nova
      </Link>
    </div>
  );
}
