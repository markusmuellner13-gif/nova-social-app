'use client';

import { motion } from 'framer-motion';
import { Post } from '@/types';
import { postImageUrl } from '@/lib/imageUrl';
import { postTitle } from '@/lib/postTitle';

// A horizontal "Trending near you" strip at the top of the discover feed — the
// hook that makes the app feel alive and gives the doom-scroll a curated lead-in.
// Tapping a card jumps the feed straight to that post (smooth-scroll), so the
// rail is a fast on-ramp into the stream rather than a dead-end carousel.

interface Props {
  posts: Post[];
  onSelect: (postId: string) => void;
}

function railMeta(p: Post): string {
  if (p.eventDate) return p.eventDate;
  if (typeof p.distanceKm === 'number') return p.distanceKm < 1 ? 'Right here' : `${p.distanceKm.toFixed(0)} km away`;
  return p.category;
}

export default function TrendingRail({ posts, onSelect }: Props) {
  if (posts.length < 3) return null;

  return (
    <div className="flex-shrink-0" style={{ borderBottom: '1px solid #14141d', background: 'linear-gradient(180deg, rgba(139,92,246,0.07), transparent)' }}>
      <div className="flex items-center gap-2 px-4 pt-3 pb-2">
        <span style={{ fontSize: 14 }}>🔥</span>
        <span className="text-xs font-bold" style={{ color: '#c4b5fd', letterSpacing: '0.02em' }}>Trending near you</span>
        <span className="text-[10px] font-semibold ml-auto px-2 py-0.5 rounded-full" style={{ color: '#8b5cf6', background: 'rgba(139,92,246,0.12)' }}>Live</span>
      </div>
      <div className="flex gap-3 px-4 pb-3 overflow-x-auto" style={{ scrollSnapType: 'x proximity' }}>
        {posts.map((p, i) => (
          <motion.button
            key={p.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => onSelect(p.id)}
            className="flex-shrink-0 relative rounded-2xl overflow-hidden text-left"
            style={{ width: 132, height: 176, scrollSnapAlign: 'start', border: '1px solid #23232f' }}
          >
            <img src={postImageUrl(p.image, 480)} alt={p.location?.name ?? 'Trending'} loading="lazy"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.05) 40%, rgba(0,0,0,0.82))' }} />
            <div className="absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center text-white font-bold"
              style={{ fontSize: 10, background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>{i + 1}</div>
            <div className="absolute bottom-0 left-0 right-0 p-2">
              <p className="text-white font-bold leading-tight" style={{ fontSize: 11, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {postTitle(p, 'Trending', 60)}
              </p>
              <p className="font-semibold mt-0.5" style={{ fontSize: 9, color: '#c4b5fd' }}>{railMeta(p)}</p>
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
