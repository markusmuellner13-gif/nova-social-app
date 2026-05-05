'use client';

import { useState } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
  ZoomableGroup,
} from 'react-simple-maps';
import { motion, AnimatePresence } from 'framer-motion';
import { Post } from '@/types';
import { formatCount } from '@/data/mockData';
import { Heart, X } from 'lucide-react';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

interface Props {
  posts: Post[];
}

export default function WorldMap({ posts }: Props) {
  const [selected, setSelected] = useState<Post | null>(null);
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([10, 20]);

  return (
    <div className="relative w-full" style={{ height: 340, background: '#08080f', borderRadius: 20, overflow: 'hidden' }}>
      {/* Map */}
      <ComposableMap
        projection="geoOrthographic"
        projectionConfig={{ scale: 180, center }}
        style={{ width: '100%', height: '100%' }}
      >
        <ZoomableGroup
          zoom={zoom}
          center={center}
          onMoveEnd={({ zoom: z, coordinates }) => {
            setZoom(z);
            setCenter(coordinates as [number, number]);
          }}
          minZoom={0.6}
          maxZoom={4}
        >
          {/* Ocean */}
          <circle cx={0} cy={0} r={180} fill="#0d1a2d" />

          <Geographies geography={GEO_URL}>
            {({ geographies }) =>
              geographies.map((geo) => (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill="#1a1f35"
                  stroke="#0d1220"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: 'none' },
                    hover: { fill: '#232a45', outline: 'none' },
                    pressed: { outline: 'none' },
                  }}
                />
              ))
            }
          </Geographies>

          {/* Post markers */}
          {posts.map((post) => (
            <Marker
              key={post.id}
              coordinates={[post.location.lng, post.location.lat]}
            >
              <motion.g
                onClick={() => setSelected(post)}
                style={{ cursor: 'pointer' }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                {/* Pulse ring */}
                <circle
                  r={9}
                  fill="rgba(139,92,246,0.2)"
                  className="pulse-dot"
                />
                {/* Dot */}
                <circle
                  r={5}
                  fill="url(#markerGrad)"
                  stroke="rgba(255,255,255,0.8)"
                  strokeWidth={1.5}
                />
                {/* Thumb preview */}
                <image
                  href={post.image}
                  x={-12}
                  y={-28}
                  width={24}
                  height={24}
                  clipPath="url(#thumbClip)"
                  style={{ display: selected?.id === post.id ? 'none' : 'block' }}
                />
              </motion.g>
            </Marker>
          ))}

          <defs>
            <linearGradient id="markerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#ec4899" />
            </linearGradient>
            <clipPath id="thumbClip">
              <circle cx={0} cy={-16} r={12} />
            </clipPath>
          </defs>
        </ZoomableGroup>
      </ComposableMap>

      {/* Zoom controls */}
      <div
        className="absolute top-3 right-3 flex flex-col gap-1"
      >
        {[{ label: '+', action: () => setZoom((z) => Math.min(z + 0.5, 4)) },
          { label: '−', action: () => setZoom((z) => Math.max(z - 0.5, 0.6)) }].map(({ label, action }) => (
          <button
            key={label}
            onClick={action}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-lg"
            style={{ background: 'rgba(26,26,36,0.85)', border: '1px solid #2a2a38' }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Overlay label */}
      <div
        className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-xs font-semibold"
        style={{ background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.3)' }}
      >
        🌍 {posts.length} posts worldwide
      </div>

      {/* Post preview popup */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ duration: 0.25 }}
            className="absolute bottom-4 left-4 right-4 rounded-2xl overflow-hidden flex gap-3 p-3"
            style={{ background: 'rgba(20,20,30,0.95)', border: '1px solid #2a2a38', backdropFilter: 'blur(20px)' }}
          >
            <img
              src={selected.image}
              alt=""
              className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">@{selected.user.username}</p>
              <p className="text-xs mt-0.5 line-clamp-2" style={{ color: '#888899' }}>{selected.caption}</p>
              <div className="flex items-center gap-1 mt-1">
                <Heart size={11} style={{ color: '#ec4899' }} fill="#ec4899" />
                <span className="text-xs" style={{ color: '#888899' }}>{formatCount(selected.likes)}</span>
                <span className="text-xs ml-2" style={{ color: '#555566' }}>📍 {selected.location.name}</span>
              </div>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="flex-shrink-0 self-start p-0.5"
              style={{ color: '#555566' }}
            >
              <X size={16} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
