'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import PostImage from './PostImage';

interface Props {
  images: string[];
  alt: string;
  /** Fires once the FIRST photo has painted (the card fades it in). */
  onFirstLoaded: () => void;
  /** The first photo's aspect ratio, which the card frame adopts. */
  onAspect: (aspect: number) => void;
  onDoubleClick: () => void;
  visible: boolean;
}

// A post's real photos as a slideshow.
//
//   Phone:    swipe (native scroll-snap — momentum and rubber-banding come from
//             the browser, so it feels like every other app on the phone).
//   Computer: arrow buttons on hover, ← / → while the pointer is over it or it
//             has focus, and the dots are clickable.
//
// Only real photos of the post's own subject ever arrive here (see
// sources/realImage.ts) — this component never adds a picture, it only shows
// the ones the post already has.
export default function PostGallery({ images, alt, onFirstLoaded, onAspect, onDoubleClick, visible }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const [hovered, setHovered] = useState(false);
  const count = images.length;

  const goTo = useCallback((i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const target = Math.max(0, Math.min(count - 1, i));
    el.scrollTo({ left: target * el.clientWidth, behavior: 'smooth' });
  }, [count]);

  // Follow the scroll position, once per frame at most.
  const frame = useRef(0);
  const onScroll = useCallback(() => {
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = trackRef.current;
      if (el && el.clientWidth > 0) setSlide(Math.round(el.scrollLeft / el.clientWidth));
    });
  }, []);
  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  const step = useCallback((dir: -1 | 1) => goTo(slide + dir), [goTo, slide]);

  // ← / → while the pointer rests on the slideshow (focus is handled by the
  // track's own onKeyDown). Typing in a field is never hijacked.
  useEffect(() => {
    if (!hovered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (trackRef.current?.contains(t)) return; // the track handles its own
      e.preventDefault();
      step(e.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hovered, step]);

  return (
    <div
      className="post-gallery relative w-full h-full"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        ref={trackRef}
        role="group"
        aria-roledescription="carousel"
        aria-label={`Photos, ${slide + 1} of ${count}`}
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
          if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
        }}
        onDoubleClick={onDoubleClick}
        className="flex w-full h-full overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-none"
        style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.3s', overscrollBehaviorX: 'contain' }}
      >
        {images.map((src, i) => (
          <PostImage
            key={`${i}:${src}`}
            src={src}
            alt={i === 0 ? alt : `${alt} — photo ${i + 1}`}
            priority={i === 0}
            onLoaded={i === 0 ? onFirstLoaded : undefined}
            onAspect={i === 0 ? onAspect : undefined}
            className="flex-shrink-0 snap-center"
            style={{ minWidth: '100%' }}
          />
        ))}
      </div>

      {/* Arrows — pointer devices only (hidden on touch by .post-gallery CSS). */}
      {slide > 0 && (
        <button type="button" aria-label="Previous photo" onClick={() => step(-1)}
          className="gallery-arrow absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nova-violet"
          style={{ background: 'rgba(15,13,20,0.72)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <ChevronLeft size={20} className="text-white" />
        </button>
      )}
      {slide < count - 1 && (
        <button type="button" aria-label="Next photo" onClick={() => step(1)}
          className="gallery-arrow absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nova-violet"
          style={{ background: 'rgba(15,13,20,0.72)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.12)' }}>
          <ChevronRight size={20} className="text-white" />
        </button>
      )}

      <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full text-xs font-semibold pointer-events-none"
        style={{ background: 'rgba(0,0,0,0.6)', color: 'white', backdropFilter: 'blur(6px)' }}>
        {slide + 1}/{count}
      </div>

      {/* Dots — a tap/click target each, sized larger than the dot it draws. */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center">
        {images.map((_, i) => (
          <button key={i} type="button" onClick={() => goTo(i)}
            aria-label={`Photo ${i + 1} of ${count}`} aria-current={i === slide ? 'true' : undefined}
            className="p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nova-violet rounded-full">
            <span className="block rounded-full transition-all"
              style={{
                width: i === slide ? 7 : 5, height: i === slide ? 7 : 5,
                background: i === slide ? '#fff' : 'rgba(255,255,255,0.55)',
                boxShadow: '0 0 4px rgba(0,0,0,0.5)',
              }} />
          </button>
        ))}
      </div>
    </div>
  );
}
