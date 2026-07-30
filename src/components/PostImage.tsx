'use client';

import React, { useCallback, useState } from 'react';
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

/** Last-resort photo when both the proxy and the origin are unreachable. */
function fallbackFor(src: string): string {
  let h = 2166136261;
  for (let i = 0; i < src.length; i++) { h ^= src.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `https://picsum.photos/seed/nova${(h >>> 0).toString(36)}/1440/1800`;
}

export default function PostImage({
  src, alt, priority = false, onLoaded, onAspect, onDoubleClick, className = '', style,
}: Props) {
  const [fit, setFit] = useState<'cover' | 'contain'>('cover');
  // 0 = proxied, 1 = raw source, 2 = deterministic stand-in
  const [stage, setStage] = useState(0);

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
    // 2. Source is gone too → a deterministic photo rather than a blank frame.
    if (stage <= 1) {
      setStage(2);
      img.src = fallbackFor(src);
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
