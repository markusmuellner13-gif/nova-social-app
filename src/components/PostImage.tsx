'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { postImageUrl, postImageSrcSet } from '@/lib/imageUrl';

interface Props {
  src: string;
  alt: string;
  /** First image of the post — loaded eagerly and given layout priority. */
  priority?: boolean;
  onLoaded?: () => void;
  /** Reports the photo's own aspect so the card can size itself to it. */
  onAspect?: (aspect: number) => void;
  onDoubleClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

// Feed sources hand us wildly different shapes: Eventbrite posters are 2:1 web
// banners, venue photos 3:2, Wikipedia shots tall portraits. Forcing all of them
// into one fixed 4:5 frame means `object-cover` throws away 55% of a 16:9 poster
// — which is how a card ends up showing half a headline.
//
// So the card sizes itself to the photo, within the range a feed can carry
// (the same bounds Instagram uses). Anything inside the range is shown whole at
// its own shape; only the extremes — panoramas, very tall posters — are
// letterboxed over a blurred copy of themselves so nothing is ever cut off.
export const MIN_ASPECT = 0.8;   // 4:5 portrait — the tallest a card may get
export const MAX_ASPECT = 1.91;  // 1.91:1 landscape — the widest a card may get

export function clampAspect(a: number): number {
  if (!Number.isFinite(a) || a <= 0) return MIN_ASPECT;
  return Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, a));
}

// Card width on a phone is the viewport; on desktop the app sits in a ~460px
// frame. Telling the browser this lets it pick the right srcset entry instead of
// always downloading the largest.
const SIZES = '(min-width: 900px) 460px, 100vw';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// The cover a post gets when there is no photograph OF IT to show — because the
// venue publishes none, or the listing carried no artwork.
//
// It used to be a random Lorem Picsum photo, which read as "this is what the
// place looks like" and was never true; the same handful even turned up on
// unrelated cards. This is unmistakably a graphic, not a photograph, so it can't
// mislead — while still being a designed, on-brand card rather than a grey box.
// Colour is derived from the title, so a given post always looks the same and
// two posts next to each other don't.
const COVER_HUES = [265, 322, 212, 178, 26, 348];

/**
 * The no-photo cover's background, on its own — so the grid thumbnails in
 * Profile and Search (which are too small for a caption) get the same treatment
 * as a full card instead of their own filler photo.
 */
export function coverBackground(label: string): string {
  const h = hash(label);
  const n = COVER_HUES.length;
  // `>>>`, not `>>`: the hash is unsigned 32-bit, so a signed shift goes negative
  // for anything at or above 2^31 — about half of all titles. That yielded a
  // negative index, `undefined` for the hue, and an `hsl(undefined …)` that
  // invalidated the whole `background` shorthand, leaving the card flat black.
  const ai = h % n;
  // Offset the second hue so the two blobs are always a pair, never the same.
  const bi = (ai + 2 + ((h >>> 8) % (n - 3))) % n;
  const a = COVER_HUES[ai];
  const b = COVER_HUES[bi];
  return (
    `radial-gradient(85% 60% at 22% 12%, hsl(${a} 78% 52%) 0%, hsl(${a} 70% 30% / 0.35) 45%, transparent 75%),` +
    `radial-gradient(80% 58% at 82% 88%, hsl(${b} 76% 46%) 0%, hsl(${b} 66% 26% / 0.30) 48%, transparent 76%),` +
    `linear-gradient(155deg, hsl(${a} 34% 16%) 0%, #101018 62%)`
  );
}

function NoPhotoCover({ label }: { label: string }) {
  const title = (label.split('\n')[0] ?? '').trim().slice(0, 80);

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-7 text-center select-none"
      style={{ background: coverBackground(label) }}
    >
      {/* A soft mesh so the panel has depth without pretending to be a picture. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '46px 46px',
        }}
      />
      {/* Scrim — the gradient is bright enough to be a real surface, so the
          type needs its own contrast rather than relying on the backdrop. */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(70% 50% at 50% 50%, rgba(8,8,12,0.72) 0%, rgba(8,8,12,0.30) 60%, transparent 100%)' }}
      />
      {title && (
        <span
          className="relative text-[22px] leading-[1.25] font-bold text-white"
          style={{
            display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            textWrap: 'balance', textShadow: '0 2px 18px rgba(0,0,0,0.55)',
          }}
        >
          {title}
        </span>
      )}
      <span
        className="relative flex items-center gap-1.5 text-[10px] font-bold tracking-[0.18em] uppercase text-white/55"
      >
        <span aria-hidden className="inline-block w-1 h-1 rounded-full bg-white/45" />
        No photo published
        <span aria-hidden className="inline-block w-1 h-1 rounded-full bg-white/45" />
      </span>
    </div>
  );
}

export default function PostImage({
  src, alt, priority = false, onLoaded, onAspect, onDoubleClick, className = '', style,
}: Props) {
  const [fit, setFit] = useState<'cover' | 'contain'>('cover');
  // 0 = proxied, 1 = raw source, 2 = the source is gone → designed cover
  const [stage, setStage] = useState(0);
  const hasPhoto = Boolean(src) && stage < 2;

  // The cover fills the frame instantly, so tell the card it can stop shimmering
  // and size itself the way a photoless post should — a 4:5 portrait panel.
  useEffect(() => {
    if (hasPhoto) return;
    onAspect?.(MIN_ASPECT);
    onLoaded?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPhoto]);

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth && img.naturalHeight) {
      const a = img.naturalWidth / img.naturalHeight;
      onAspect?.(a);
      // Within the card's range the frame matches the photo, so `cover` is an
      // exact fit and crops nothing. Outside it, letterbox rather than cut.
      setFit(a > MAX_ASPECT * 1.02 || a < MIN_ASPECT * 0.98 ? 'contain' : 'cover');
    }
    onLoaded?.();
  }, [onLoaded, onAspect]);

  const handleError = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    img.srcset = '';
    // 1. Proxy failed (dead host, unsupported codec) → try the raw source, which
    //    still works for any host that allows hotlinking.
    if (stage === 0 && /^https?:\/\//i.test(src) && img.src !== src) {
      setStage(1);
      img.src = src;
      return;
    }
    // 2. Source is gone too → the designed cover. Substituting some other
    //    photograph here is what put unrelated pictures on posts in the first
    //    place, so a dead image now falls back to an honest one.
    if (stage <= 1) {
      setStage(2);
      return;
    }
    onLoaded?.();
  }, [stage, src, onLoaded]);

  const common = {
    alt,
    onLoad: handleLoad,
    onError: handleError,
    onDoubleClick,
    decoding: 'async' as const,
    loading: (priority ? 'eager' : 'lazy') as 'eager' | 'lazy',
    ...(priority ? { fetchPriority: 'high' as const } : {}),
  };

  if (!hasPhoto) {
    return (
      <div
        className={`relative w-full h-full overflow-hidden ${className}`}
        style={style}
        onDoubleClick={onDoubleClick}
      >
        <NoPhotoCover label={alt} />
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`} style={style}>
      {/* Blurred fill behind a letterboxed photo — reads as designed, not empty. */}
      {fit === 'contain' && (
        <img
          src={postImageUrl(src, 480)}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ filter: 'blur(28px) saturate(1.3)', transform: 'scale(1.15)', opacity: 0.55 }}
        />
      )}
      <img
        {...common}
        src={postImageUrl(src, 1080)}
        srcSet={postImageSrcSet(src)}
        sizes={SIZES}
        className="relative w-full h-full"
        style={{ objectFit: fit }}
      />
    </div>
  );
}
