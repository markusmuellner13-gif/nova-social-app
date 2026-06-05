'use client';

import { useState, useCallback, useRef } from 'react';
import { Post } from '@/types';
import { LocationState } from '@/types';

interface UseAIFeedReturn {
  posts: Post[];
  loading: boolean;
  hasMore: boolean;
  fetchMore: (category?: string) => Promise<void>;
  reset: () => void;
}

export function useAIFeed(location: LocationState | null): UseAIFeedReturn {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const inFlightRef = useRef(false);

  const fetchMore = useCallback(
    async (category?: string) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setLoading(true);

      try {
        const city    = location?.city    ?? 'Vienna';
        const country = location?.country ?? 'Austria';
        const lat     = location?.lat     ?? 48.2082;
        const lng     = location?.lng     ?? 16.3738;

        const params = new URLSearchParams({
          city,
          country,
          lat: lat.toString(),
          lng: lng.toString(),
          offset: offsetRef.current.toString(),
          count: '8',
          ...(category ? { category } : {}),
        });

        const res = await fetch(`/api/events?${params.toString()}`);
        if (!res.ok) throw new Error(`API ${res.status}`);

        const data = await res.json();
        const newPosts: Post[] = data.posts ?? [];

        if (newPosts.length === 0) {
          setHasMore(false);
        } else {
          // Deduplicate by id before appending
          setPosts((prev) => {
            const existing = new Set(prev.map((p) => p.id));
            const fresh = newPosts.filter((p) => !existing.has(p.id));
            return [...prev, ...fresh];
          });
          offsetRef.current += newPosts.length;
        }
      } catch (err) {
        console.error('[useAIFeed] fetch error:', err);
        // Don't set hasMore=false on network error — let user retry
      } finally {
        setLoading(false);
        inFlightRef.current = false;
      }
    },
    [location]
  );

  const reset = useCallback(() => {
    setPosts([]);
    offsetRef.current = 0;
    setHasMore(true);
    inFlightRef.current = false;
  }, []);

  return { posts, loading, hasMore, fetchMore, reset };
}
