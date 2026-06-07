'use client';

import { useEffect } from 'react';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: Props) {
  useEffect(() => {
    console.error('[Nova error boundary]', error);
  }, [error]);

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
      <div style={{ fontSize: 64, marginBottom: 16 }}>⚠️</div>
      <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 700, marginBottom: 8, textAlign: 'center' }}>
        Something went wrong
      </h1>
      <p style={{ color: '#888899', fontSize: 14, marginBottom: 8, textAlign: 'center', maxWidth: 320 }}>
        Nova hit an unexpected error. We&apos;ve logged it and will fix it soon.
      </p>
      {error.digest && (
        <p style={{ color: '#444455', fontSize: 12, marginBottom: 24 }}>
          Error ID: {error.digest}
        </p>
      )}
      <button
        onClick={reset}
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
          cursor: 'pointer',
          border: 'none',
        }}
      >
        Try again
      </button>
    </div>
  );
}
