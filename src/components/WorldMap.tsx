'use client';

import { useState, useCallback } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from 'react-simple-maps';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink, Plus, Minus, Locate } from 'lucide-react';
import { Post, Category } from '@/types';
import { formatCount } from '@/data/mockData';

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
};

interface Props {
  posts: Post[];
  onPostOpen?: (post: Post) => void;
}

export default function WorldMap({ posts, onPostOpen }: Props) {
  const [selected, setSelected] = useState<Post | null>(null);
  const [zoom, setZoom] = useState(1.2);
  const [center, setCenter] = useState<[number, number]>([10, 25]);

  const handleMoveEnd = useCallback(({ zoom: z, coordinates }: { zoom: number; coordinates: [number, number] }) => {
    setZoom(z);
    setCenter(coordinates);
  }, []);

  const zoomIn  = useCallback(() => setZoom(z => Math.min(z * 1.5, 12)), []);
  const zoomOut = useCallback(() => setZoom(z => Math.max(z / 1.5, 0.8)), []);
  const reset   = useCallback(() => { setZoom(1.2); setCenter([10, 25]); }, []);

  // Scale marker size with zoom (bigger markers when zoomed in)
  const markerR    = Math.max(3, Math.min(7, 6 / Math.sqrt(zoom)));
  const pulseR     = markerR * 2.2;
  const showEmoji  = zoom > 2.5;
  const showAvatar = zoom > 5;

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden"
      style={{ height: 340, background: '#06111f' }}
    >
      {/* Ocean background */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 60%, #0d1e33 0%, #060e18 100%)' }} />

      <ComposableMap
        projection="geoMercator"
        projectionConfig={{ scale: 130, center: [0, 20] }}
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomableGroup
          zoom={zoom}
          center={center}
          onMoveEnd={handleMoveEnd}
          minZoom={0.8}
          maxZoom={12}
        >
          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#1c2a42"
                  stroke="#0d1828"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: 'none' },
                    hover:   { fill: '#263550', outline: 'none' },
                    pressed: { outline: 'none' },
                  }}
                />
              ))
            }
          </Geographies>

          {/* Post markers */}
          {posts.map((post) => {
            const color = CATEGORY_COLOR[post.category] ?? '#8b5cf6';
            const emoji = CATEGORY_EMOJI[post.category] ?? '📍';
            const isSelected = selected?.id === post.id;

            return (
              <Marker
                key={post.id}
                coordinates={[post.location.lng, post.location.lat]}
              >
                <motion.g
                  onClick={() => setSelected(isSelected ? null : post)}
                  style={{ cursor: 'pointer' }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20, delay: Math.random() * 0.3 }}
                  whileHover={{ scale: 1.3 }}
                  whileTap={{ scale: 0.9 }}
                >
                  {/* Outer pulse ring */}
                  {!isSelected && (
                    <circle
                      r={pulseR}
                      fill={`${color}30`}
                      className="pulse-dot"
                    />
                  )}

                  {/* Selection ring */}
                  {isSelected && (
                    <circle
                      r={pulseR * 1.4}
                      fill="none"
                      stroke={color}
                      strokeWidth={1.5}
                      opacity={0.8}
                    />
                  )}

                  {/* Main dot */}
                  <circle
                    r={markerR}
                    fill={color}
                    stroke="white"
                    strokeWidth={1.2}
                    style={{ filter: `drop-shadow(0 0 ${markerR}px ${color}88)` }}
                  />

                  {/* Category emoji (shows when zoomed in) */}
                  {showEmoji && !showAvatar && (
                    <text
                      y={-(markerR + 4)}
                      textAnchor="middle"
                      style={{
                        fontSize: Math.min(12, markerR * 2.2),
                        pointerEvents: 'none',
                        userSelect: 'none',
                      }}
                    >
                      {emoji}
                    </text>
                  )}

                  {/* Tiny avatar image (shows when very zoomed in) */}
                  {showAvatar && (
                    <image
                      href={post.user.avatar}
                      x={-markerR * 2}
                      y={-(markerR * 2 + markerR * 4 + 2)}
                      width={markerR * 4}
                      height={markerR * 4}
                      clipPath={`url(#avatarClip_${post.id})`}
                    />
                  )}

                  <defs>
                    <clipPath id={`avatarClip_${post.id}`}>
                      <circle cx={0} cy={-(markerR * 4)} r={markerR * 2} />
                    </clipPath>
                  </defs>
                </motion.g>
              </Marker>
            );
          })}

          {/* Gradient def for fallback dots */}
          <defs>
            <radialGradient id="oceanGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0d2244" />
              <stop offset="100%" stopColor="#060e18" />
            </radialGradient>
          </defs>
        </ZoomableGroup>
      </ComposableMap>

      {/* Map controls */}
      <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
        <button
          onClick={zoomIn}
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(13,20,30,0.9)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
        >
          <Plus size={14} />
        </button>
        <button
          onClick={zoomOut}
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(13,20,30,0.9)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
        >
          <Minus size={14} />
        </button>
        <button
          onClick={reset}
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(13,20,30,0.9)', border: '1px solid rgba(255,255,255,0.1)', color: 'white' }}
        >
          <Locate size={13} />
        </button>
      </div>

      {/* Header label */}
      <div
        className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-semibold"
        style={{ background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.3)' }}
      >
        🌍 {posts.length} events worldwide
      </div>

      {/* Zoom hint */}
      <div
        className="absolute bottom-3 left-3 text-xs font-medium"
        style={{ color: 'rgba(255,255,255,0.3)' }}
      >
        Pinch or scroll to zoom · Drag to pan
      </div>

      {/* Post preview popup */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.94 }}
            transition={{ duration: 0.22 }}
            className="absolute bottom-4 left-3 right-3 rounded-2xl overflow-hidden flex gap-3 p-3 z-20"
            style={{ background: 'rgba(13,18,28,0.97)', border: `1px solid ${CATEGORY_COLOR[selected.category]}44`, backdropFilter: 'blur(20px)' }}
          >
            {/* Category color stripe */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
              style={{ background: CATEGORY_COLOR[selected.category] }}
            />

            <img
              src={selected.image}
              alt=""
              className="w-14 h-14 rounded-xl object-cover flex-shrink-0 ml-1"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <img
                  src={selected.user.avatar}
                  alt=""
                  className="w-4 h-4 rounded-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <span className="text-xs font-semibold text-white truncate">{selected.user.name}</span>
              </div>
              <p className="text-xs line-clamp-2 leading-snug" style={{ color: '#888899' }}>
                {selected.caption.split('\n')[0]}
              </p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs" style={{ color: CATEGORY_COLOR[selected.category] }}>
                  {CATEGORY_EMOJI[selected.category]} {selected.category}
                </span>
                <span className="text-xs" style={{ color: '#444455' }}>
                  ⭐ {formatCount(selected.likes)}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1 flex-shrink-0">
              {onPostOpen && (
                <button
                  onClick={() => { onPostOpen(selected); setSelected(null); }}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${CATEGORY_COLOR[selected.category]}, #8b5cf6)` }}
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
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={10} /> Info
                </a>
              )}
              <button onClick={() => setSelected(null)} className="p-1 flex items-center justify-center" style={{ color: '#444455' }}>
                <X size={14} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
