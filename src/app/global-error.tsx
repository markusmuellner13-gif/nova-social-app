'use client';

import { useEffect } from 'react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    console.error('[Nova global error]', error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          margin: 0,
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
        <div style={{ fontSize: 64, marginBottom: 16 }}>💥</div>
        <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>
          Nova crashed
        </h1>
        <p style={{ color: '#888899', fontSize: 14, marginBottom: 32, textAlign: 'center', maxWidth: 320 }}>
          Something went seriously wrong. Tap below to reload.
        </p>
        <button
          onClick={reset}
          style={{
            padding: '12px 24px',
            borderRadius: 12,
            background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
            color: 'white',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            border: 'none',
          }}
        >
          Reload Nova
        </button>
      </body>
    </html>
  );
}
