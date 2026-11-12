'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { motion, useTransform } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { Post as PostType } from '@/types';
import Post from './Post';
import { useSwipeDismiss } from '@/hooks/useSwipeDismiss';

interface Props {
  /** The collection the post was opened from (Saved, Loved, Going…). */
  posts: PostType[];
  /** Which one was tapped — it is shown first. */
  startId: string;
  title: string;
  onClose: () => void;
}

// Full-screen viewer for a post the user kept — the same card as the feed, with
// every action on it (love, save, going, reminder, tickets, share, comments).
// Opened from the profile grids, which used to be pictures you couldn't tap.
//
// The tapped post leads and the rest of the collection follows it, so the user
// can keep scrolling through what they saved without a scroll-position jump
// (cards render lazily, so scrolling to the Nth one lands imprecisely).
// The list is a snapshot taken when the viewer opened: un-saving a post here
// shows it as un-saved instead of yanking it out from under the finger.
export default function PostViewer({ posts, startId, title, onClose }: Props) {
  const ordered = useMemo(() => {
    const i = posts.findIndex(p => p.id === startId);
    return i <= 0 ? posts : [...posts.slice(i), ...posts.slice(0, i)];
  }, [posts, startId]);

  // The phone's own Back (Android button, iOS edge swipe, browser back) closes
  // the viewer instead of leaving the app: the viewer owns one history entry
  // while it is open. Same pattern as the notifications panel in page.tsx.
  const ownsEntry = useRef(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (ownsEntry.current) return;
    try {
      window.history.pushState({ ...(window.history.state ?? {}), novaPanel: 'post-viewer' }, '');
      ownsEntry.current = true;
    } catch { /* history unavailable — the in-app close paths still work */ }
  }, []);
  useEffect(() => {
    const onPop = () => {
      if (!ownsEntry.current) return;
      ownsEntry.current = false;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  // Closed in-app (button / swipe): hand the history entry back first.
  const close = useCallback(() => {
    if (ownsEntry.current) {
      ownsEntry.current = false;
      try { window.history.back(); } catch { /* ignore */ }
    }
    onCloseRef.current();
  }, []);

  // Swipe right to go back, like the notifications panel.
  const { attach, offset } = useSwipeDismiss({ axis: 'x', onDismiss: close });
  const backdrop = useTransform(offset, v => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 400;
    return Math.max(0, 0.5 * (1 - v / w));
  });

  return (
    <motion.div
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'tween', duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="fixed inset-0 z-50 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <motion.div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: '#000', opacity: backdrop }} />
      <motion.div
        ref={attach}
        className="flex flex-col h-full relative"
        style={{
          x: offset,
          background: '#0f0d14',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          touchAction: 'pan-y',
          boxShadow: '-12px 0 32px rgba(0,0,0,0.45)',
        }}
      >
        <header className="glass flex items-center gap-1 px-1 flex-shrink-0" style={{ height: 52, borderBottom: '1px solid #1e1e2a' }}>
          <button
            onClick={close}
            aria-label="Back"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nova-violet"
          >
            <ChevronLeft size={24} className="text-white" />
          </button>
          <h2 className="text-base font-bold text-white truncate">{title}</h2>
          <span className="text-xs ml-1" style={{ color: '#888899' }}>{posts.length}</span>
        </header>

        <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
          {ordered.map(p => <Post key={p.id} post={p} />)}
          <div style={{ height: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }} />
        </div>
      </motion.div>
    </motion.div>
  );
}
