'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Story } from '@/types';
import { useApp } from '@/context/AppContext';

interface Props {
  stories: Story[];
  initialIndex: number;
  onClose: () => void;
}

const STORY_DURATION = 5000;

export default function StoryViewer({ stories, initialIndex, onClose }: Props) {
  const { markStorySeen } = useApp();
  const [index, setIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const elapsedRef = useRef<number>(0);

  const story = stories[index];

  const advance = useCallback((dir: 1 | -1) => {
    const next = index + dir;
    if (next < 0 || next >= stories.length) { onClose(); return; }
    setIndex(next);
    setProgress(0);
    setImgLoaded(false);
    elapsedRef.current = 0;
  }, [index, stories.length, onClose]);

  // Mark current story as seen
  useEffect(() => {
    markStorySeen(story.id);
  }, [story.id, markStorySeen]);

  // Progress ticker
  useEffect(() => {
    if (paused || !imgLoaded) return;
    startTimeRef.current = Date.now() - elapsedRef.current;

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      elapsedRef.current = elapsed;
      const pct = Math.min((elapsed / STORY_DURATION) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(intervalRef.current!);
        advance(1);
      }
    }, 50);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [index, paused, imgLoaded, advance]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') advance(1);
      if (e.key === 'ArrowLeft') advance(-1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [advance, onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.95)' }}
    >
      {/* Story card */}
      <div className="relative w-full max-w-sm h-full" style={{ maxHeight: '100dvh' }}>
        {/* Progress bars */}
        <div className="absolute top-3 left-3 right-3 z-10 flex gap-1">
          {stories.map((s, i) => (
            <div
              key={s.id}
              className="flex-1 rounded-full overflow-hidden"
              style={{ height: 3, background: 'rgba(255,255,255,0.25)' }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{
                  background: 'white',
                  width: i < index ? '100%' : i === index ? `${progress}%` : '0%',
                  transition: i === index ? 'none' : undefined,
                }}
              />
            </div>
          ))}
        </div>

        {/* Header */}
        <div className="absolute top-8 left-3 right-3 z-10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src={story.user.avatar}
              alt={story.user.username}
              className="w-9 h-9 rounded-full object-cover border-2 border-white"
            />
            <div>
              <p className="text-sm font-bold text-white leading-tight">{story.user.username}</p>
              <p className="text-xs text-white/60">Just now</p>
            </div>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}>
            <X size={18} color="white" />
          </button>
        </div>

        {/* Image */}
        <div className="w-full h-full relative">
          {!imgLoaded && (
            <div className="absolute inset-0 shimmer" />
          )}
          <img
            key={story.id}
            src={story.image}
            alt=""
            className="w-full h-full object-cover"
            onLoad={() => setImgLoaded(true)}
            style={{ display: imgLoaded ? 'block' : 'none' }}
          />
          {/* Gradient overlays */}
          <div className="absolute inset-x-0 top-0 h-24 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)' }} />
          <div className="absolute inset-x-0 bottom-0 h-24 pointer-events-none" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.4), transparent)' }} />
        </div>

        {/* Tap zones */}
        <div className="absolute inset-0 flex">
          <div
            className="flex-1 flex items-center justify-start pl-2"
            onPointerDown={() => setPaused(true)}
            onPointerUp={() => { setPaused(false); }}
            onClick={() => advance(-1)}
          >
            {index > 0 && <ChevronLeft size={28} color="rgba(255,255,255,0.5)" />}
          </div>
          <div
            className="flex-1 flex items-center justify-end pr-2"
            onPointerDown={() => setPaused(true)}
            onPointerUp={() => { setPaused(false); }}
            onClick={() => advance(1)}
          >
            <ChevronRight size={28} color="rgba(255,255,255,0.5)" />
          </div>
        </div>

        {/* Username bottom */}
        <div className="absolute bottom-8 left-0 right-0 text-center pointer-events-none">
          <p className="text-white/70 text-xs font-medium">@{story.user.username}</p>
        </div>
      </div>

      {/* Nav arrows outside card */}
      <AnimatePresence>
        {index > 0 && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => advance(-1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.1)', display: 'none' }} // hidden on mobile, shown on wider screens
          >
            <ChevronLeft size={20} color="white" />
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
