import type { Metadata } from 'next';
import { decodeSharePayload } from '@/lib/shareLink';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://nova-phi-liart.vercel.app';

type SP = Promise<{ d?: string | string[] }>;
type PP = Promise<{ id: string }>;

function firstStr(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? '') : (v ?? '');
}

// ── Open Graph / Twitter metadata so shared links preview beautifully ─────────
export async function generateMetadata({ searchParams }: { params: PP; searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  const data = decodeSharePayload(firstStr(sp.d));
  if (!data) {
    return { title: 'Nova — discover what’s happening near you' };
  }
  const title = data.t;
  const description = [data.d, data.v, data.p].filter(Boolean).join(' · ') || 'Discover local events on Nova';
  const images = data.i ? [{ url: data.i }] : [];

  return {
    metadataBase: new URL(SITE_URL),
    title: `${title} · Nova`,
    description,
    openGraph: {
      title,
      description,
      images,
      type: 'website',
      siteName: 'Nova',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: data.i ? [data.i] : undefined,
    },
  };
}

export default async function EventSharePage({ searchParams }: { params: PP; searchParams: SP }) {
  const sp = await searchParams;
  const data = decodeSharePayload(firstStr(sp.d));

  if (!data) {
    return (
      <main style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>This event link looks incomplete</h1>
        <a href="/" style={{ padding: '12px 22px', borderRadius: 14, background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', color: '#fff', fontWeight: 700, textDecoration: 'none' }}>
          Open Nova
        </a>
      </main>
    );
  }

  return (
    <main style={{ minHeight: '100vh', background: '#0a0a0f', color: '#fff', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 18px' }}>
          <span style={{ fontSize: 20, fontWeight: 900, background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Nova</span>
          <span style={{ fontSize: 12, color: '#666677' }}>local discovery</span>
        </div>

        {/* Image */}
        {data.i && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.i} alt={data.t} style={{ width: '100%', aspectRatio: '4/5', objectFit: 'cover', background: '#13131a' }} />
        )}

        {/* Body */}
        <div style={{ padding: '18px' }}>
          {data.g && (
            <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'capitalize', color: '#a78bfa', background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: 999, padding: '4px 10px' }}>
              {data.g}
            </span>
          )}
          <h1 style={{ fontSize: 22, fontWeight: 800, marginTop: 12, lineHeight: 1.25 }}>{data.t}</h1>

          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, color: '#c8c8e0' }}>
            {data.d && <div>📅 {data.d}</div>}
            {data.v && <div>📍 {data.v}</div>}
            {data.p && <div>🎟️ {data.p}</div>}
          </div>

          {data.u && (
            <a href={data.u} target="_blank" rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '13px', borderRadius: 14, background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', color: '#fff', fontWeight: 800, textDecoration: 'none', marginTop: 20 }}>
              Get tickets &amp; info →
            </a>
          )}

          <a href="/"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '13px', borderRadius: 14, background: '#1a1a24', border: '1px solid #2a2a38', color: '#fff', fontWeight: 700, textDecoration: 'none', marginTop: 10 }}>
            ✨ Discover more near you on Nova
          </a>
        </div>
      </div>
    </main>
  );
}
