'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  Sphere,
  Graticule,
} from 'react-simple-maps';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Plus, Minus, Locate, Navigation, Play, Pause } from 'lucide-react';
import { Post, Category } from '@/types';
import { angularDistance } from '@/lib/geo';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

const CATEGORY_EMOJI: Record<Category, string> = {
  travel:    '✈️',
  food:      '🍕',
  fashion:   '👗',
  sports:    '⚽',
  art:       '🎨',
  tech:      '💻',
  fitness:   '💪',
  music:     '🎵',
  pets:      '🐾',
  lifestyle: '🌟',
  events:      '🎉',
  sightseeing: '🏛️',
  shops:       '🛍️',
  venues:      '🎭',
  community:   '🤝',
  restaurants: '🍽️',
  hotels:      '🏨',
  rentals:     '🚲',
  outdoors:    '🏞️',
};

const CATEGORY_COLOR: Record<Category, string> = {
  travel:      '#3b82f6',
  food:        '#f97316',
  fashion:     '#ec4899',
  sports:      '#22c55e',
  art:         '#a855f7',
  tech:        '#06b6d4',
  fitness:     '#ef4444',
  music:       '#8b5cf6',
  pets:        '#f59e0b',
  lifestyle:   '#10b981',
  events:      '#f43f5e',
  sightseeing: '#14b8a6',
  shops:       '#d946ef',
  venues:      '#f43f5e',
  community:   '#14b8a6',
  restaurants: '#fb923c',
  hotels:      '#60a5fa',
  rentals:     '#34d399',
  outdoors:    '#16a34a',
};

interface Props {
  posts: Post[];
  onPostOpen?: (post: Post) => void;
  /** Optional point to spin the globe to on mount (e.g. the user's city). */
  focus?: { lat: number; lng: number } | null;
  /** When provided, the popup's Directions button opens the in-app map/nav. */
  onNavigate?: (post: Post) => void;
  /** Load state of the worldwide feed, so an empty globe can explain itself. */
  state?: 'loading' | 'ready' | 'unavailable';
}

const BASE_SCALE = 220;       // orthographic radius at zoom = 1
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const HEIGHT = 420;
// Hard cap on how many pins are ever drawn at once. SVG markers with glow/pulse
// are the single biggest cost on this globe — past ~120 the frame rate tanks and
// zooming in "bugs out". We always keep the most relevant ones (closest to the
// centre of the visible hemisphere, then most popular), so the cap is invisible.
const MAX_PINS = 120;

export default function WorldMap({ posts, onPostOpen, focus, onNavigate, state = 'ready' }: Props) {
  const [selected, setSelected] = useState<Post | null>(null);
  const [zoom, setZoom] = useState(1.15);
  // Rotation: the visible centre of the globe sits at lon=-rotate[0], lat=-rotate[1]
  const [rotation, setRotation] = useState<[number, number]>(
    focus ? [-focus.lng, -focus.lat] : [-10, -25]
  );
  const [autoRotate, setAutoRotate] = useState(true);

  const draggingRef = useRef(false);
  const lastPosRef  = useRef<{ x: number; y: number } | null>(null);
  const movedRef    = useRef(false);

  // Spin to a focus point if it arrives after mount
  useEffect(() => {
    if (focus) setRotation([-focus.lng, -focus.lat]);
  }, [focus?.lat, focus?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // Gentle auto-rotation when the user isn't interacting and nothing is open.
  // Throttled to ~30fps: every rotation change reprojects the whole globe, so
  // updating once per frame (60fps) doubles the work for no visible benefit.
  useEffect(() => {
    if (!autoRotate || selected) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (!draggingRef.current && now - last > 33) {
        last = now;
        setRotation(([lng, lat]) => [(lng - 0.22) % 360, lat]);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate, selected]);

  // Drag-to-spin
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    movedRef.current = false;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current || !lastPosRef.current) return;
    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) movedRef.current = true;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    const sensitivity = 0.32 / zoom;
    setRotation(([lng, lat]) => [
      lng + dx * sensitivity,
      Math.max(-90, Math.min(90, lat - dy * sensitivity)),
    ]);
  }, [zoom]);

  const endDrag = useCallback(() => {
    draggingRef.current = false;
    lastPosRef.current = null;
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    setZoom(z => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z * (e.deltaY < 0 ? 1.12 : 0.89))));
  }, []);

  const zoomIn  = useCallback(() => setZoom(z => Math.min(z * 1.4, MAX_ZOOM)), []);
  const zoomOut = useCallback(() => setZoom(z => Math.max(z / 1.4, MIN_ZOOM)), []);
  const reset   = useCallback(() => {
    setZoom(1.15);
    setRotation(focus ? [-focus.lng, -focus.lat] : [-10, -25]);
  }, [focus]);

  // Centre of the visible hemisphere, for back-face culling
  const centerLng = -rotation[0];
  const centerLat = -rotation[1];

  // Bigger pins as you zoom in
  const markerR  = Math.max(5, Math.min(13, 6 * Math.sqrt(zoom)));
  const showEmoji = zoom > 2;

  // Only render pins on the front of the globe (orthographic shows one
  // hemisphere) and DECLUTTER at low zoom: bucket nearby events onto a grid that
  // gets coarser the further out you are, keeping the most popular per bucket so
  // the globe reads cleanly instead of as a blob of overlapping dots. Whatever
  // the zoom, the result is hard-capped at MAX_PINS (closest-to-centre first,
  // then most popular) so the SVG never gets heavy enough to stutter.
  const visiblePosts = useMemo(() => {
    const front: { p: Post; d: number }[] = [];
    for (const p of posts) {
      if (!p.location || !Number.isFinite(p.location.lat) || !Number.isFinite(p.location.lng)) continue;
      const d = angularDistance(centerLng, centerLat, p.location!.lng, p.location!.lat);
      if (d < 89) front.push({ p, d });
    }

    let pool: Post[];
    if (zoom >= 3) {
      pool = front.map(f => f.p); // zoomed in → no grid declutter
    } else {
      const grid = zoom >= 2 ? 1.5 : zoom >= 1.4 ? 3 : 6; // degrees per bucket
      const best = new Map<string, Post>();
      for (const { p } of front) {
        const key = `${Math.round(p.location!.lat / grid)}:${Math.round(p.location!.lng / grid)}`;
        const cur = best.get(key);
        if (!cur || (p.likes ?? 0) > (cur.likes ?? 0)) best.set(key, p);
      }
      pool = Array.from(best.values());
    }

    if (pool.length <= MAX_PINS) return pool;
    // Too many for one frame → keep the closest-to-centre, breaking ties by
    // popularity, so the cap is never noticeable.
    const dist = new Map(front.map(f => [f.p.id, f.d]));
    return pool
      .sort((a, b) => {
        const da = dist.get(a.id) ?? 99, db = dist.get(b.id) ?? 99;
        if (Math.abs(da - db) > 0.5) return da - db;
        return (b.likes ?? 0) - (a.likes ?? 0);
      })
      .slice(0, MAX_PINS);
  }, [posts, centerLng, centerLat, zoom]);

  // Emoji glyphs and animated pulse rings are expensive per-pin — only enable
  // them when the pin count is low enough that they stay smooth.
  const animatePins = visiblePosts.length <= 45;

  function openDirections(p: Post) {
    // Prefer the in-app map + turn-by-turn navigation when available; otherwise
    // fall back to Google Maps directions.
    if (onNavigate) { onNavigate(p); return; }
    const url = `https://www.google.com/maps/dir/?api=1&destination=${p.location!.lat},${p.location!.lng}`;
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden select-none"
      style={{ height: HEIGHT, background: 'radial-gradient(ellipse at 50% 40%, #0c1b30 0%, #05080f 75%)', touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onWheel={onWheel}
    >
      <ComposableMap
        projection="geoOrthographic"
        width={800}
        height={HEIGHT}
        projectionConfig={{ rotate: [rotation[0], rotation[1], 0], scale: BASE_SCALE * zoom }}
        style={{ width: '100%', height: '100%', cursor: draggingRef.current ? 'grabbing' : 'grab' }}
      >
        {/* Ocean sphere with a soft glow rim */}
        <defs>
          <radialGradient id="globeOcean" cx="42%" cy="38%" r="68%">
            <stop offset="0%"  stopColor="#163a5f" />
            <stop offset="70%" stopColor="#0a1d33" />
            <stop offset="100%" stopColor="#06101d" />
          </radialGradient>
          <filter id="globeShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#3b82f6" floodOpacity="0.35" />
          </filter>
        </defs>

        <Sphere id="globe-sphere" fill="url(#globeOcean)" stroke="#2b6cb0" strokeWidth={1.2} style={{ filter: 'url(#globeShadow)' }} />
        <Graticule stroke="#1b3a5c" strokeWidth={0.4} />

        <Geographies geography={GEO_URL}>
          {({ geographies }) =>
            geographies.map((geo) => (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill="#1f3a2e"
                stroke="#0f2a1f"
                strokeWidth={0.4}
                style={{
                  default: { fill: '#22432f', outline: 'none' },
                  hover:   { fill: '#2c5740', outline: 'none' },
                  pressed: { outline: 'none' },
                }}
              />
            ))
          }
        </Geographies>

        {/* Event pins (front hemisphere only) */}
        {visiblePosts.map((post) => {
          const color = CATEGORY_COLOR[post.category] ?? '#8b5cf6';
          const emoji = CATEGORY_EMOJI[post.category] ?? '📍';
          const isSelected = selected?.id === post.id;
          return (
            <Marker key={post.id} coordinates={[post.location!.lng, post.location!.lat]}>
              <g
                onClick={(e) => {
                  e.stopPropagation();
                  if (movedRef.current) return; // ignore clicks that were really drags
                  setSelected(isSelected ? null : post);
                }}
                style={{ cursor: 'pointer' }}
              >
                {/* Soft halo — a cheap static circle instead of an SVG
                    drop-shadow filter (filters are per-pin GPU passes that
                    stutter once there are dozens of pins). Animated pulse only
                    runs when there are few pins on screen. */}
                <circle r={markerR * 1.9} fill={`${color}22`} className={animatePins ? 'pulse-dot' : undefined} />
                {isSelected && (
                  <circle r={markerR * 2.6} fill="none" stroke={color} strokeWidth={2} opacity={0.9} className="pulse-dot" />
                )}
                {/* main pin */}
                <circle
                  r={isSelected ? markerR * 1.35 : markerR}
                  fill={color}
                  stroke="white"
                  strokeWidth={2}
                />
                {showEmoji && animatePins && (
                  <text
                    y={markerR * 0.55}
                    textAnchor="middle"
                    style={{ fontSize: markerR * 1.5, pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {emoji}
                  </text>
                )}
              </g>
            </Marker>
          );
        })}
      </ComposableMap>

      {/* Controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
        {[
          { icon: <Plus size={14} />,  fn: zoomIn,  label: 'Zoom in' },
          { icon: <Minus size={14} />, fn: zoomOut, label: 'Zoom out' },
          { icon: <Locate size={13} />, fn: reset,  label: 'Reset' },
          { icon: autoRotate ? <Pause size={13} /> : <Play size={13} />, fn: () => setAutoRotate(a => !a), label: 'Spin' },
        ].map((b, i) => (
          <button
            key={i}
            onClick={(e) => { e.stopPropagation(); b.fn(); }}
            aria-label={b.label}
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(10,16,28,0.92)', border: '1px solid rgba(255,255,255,0.12)', color: 'white' }}
          >
            {b.icon}
          </button>
        ))}
      </div>

      {/* Header label */}
      <div
        className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-semibold pointer-events-none"
        style={{ background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.3)' }}
      >
        {posts.length > 0
          ? `🌍 ${posts.length.toLocaleString()} live events`
          : state === 'loading'
            ? '🌍 Loading live events…'
            : '🌍 Live map unavailable right now'}
      </div>

      {/* Hint */}
      <div className="absolute bottom-3 left-3 text-xs font-medium pointer-events-none" style={{ color: 'rgba(255,255,255,0.35)' }}>
        Drag to spin · scroll to zoom · tap a pin
      </div>

      {/* Selected event popup */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.94 }}
            transition={{ duration: 0.22 }}
            className="absolute bottom-4 left-3 right-3 rounded-2xl overflow-hidden flex gap-3 p-3 z-20"
            style={{ background: 'rgba(13,18,28,0.97)', border: `1px solid ${CATEGORY_COLOR[selected.category]}55`, backdropFilter: 'blur(20px)' }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: CATEGORY_COLOR[selected.category] }} />

            <img src={selected.image} alt="" className="w-16 h-16 rounded-xl object-cover flex-shrink-0 ml-1" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{selected.caption.split('\n')[0]}</p>
              <p className="text-xs truncate mt-0.5" style={{ color: '#9aa0b5' }}>
                📍 {selected.location?.name}{selected.eventDate ? ` · ${selected.eventDate}` : ''}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs font-semibold" style={{ color: CATEGORY_COLOR[selected.category] }}>
                  {CATEGORY_EMOJI[selected.category]} {selected.category}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 flex-shrink-0">
              <button
                onClick={() => openDirections(selected)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-1"
                style={{ background: `linear-gradient(135deg, ${CATEGORY_COLOR[selected.category]}, #8b5cf6)` }}
              >
                <Navigation size={11} /> Directions
              </button>
              {onPostOpen && (
                <button
                  onClick={() => { onPostOpen(selected); setSelected(null); }}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold"
                  style={{ background: '#1a1a24', color: '#c4b5fd', border: '1px solid #2a2a38' }}
                >
                  Open
                </button>
              )}
              {selected.eventUrl && (
                <a
                  href={selected.eventUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1"
                  style={{ background: '#1a1a24', color: '#a78bfa', border: '1px solid #2a2a38' }}
                >
                  <ExternalLink size={10} /> Info
                </a>
              )}
              <button onClick={() => setSelected(null)} className="p-1 flex items-center justify-center self-center" style={{ color: '#555566' }}>
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
