'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Post, LocationState } from '@/types';

const CACHE_TTL_MS   = 10 * 60 * 1000; // 10 minutes
const CACHE_PREFIX   = 'nova_feed_v2_';

interface CacheEntry { posts: Post[]; timestamp: number; offset: number }

function cacheKey(city: string): string {
  return CACHE_PREFIX + city.toLowerCase().replace(/\s+/g, '_');
}

function readCache(city: string): CacheEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(city));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) return null;
    return entry;
  } catch {
    return null;
  }
}

function writeCache(city: string, posts: Post[], offset: number): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(cacheKey(city), JSON.stringify({ posts, timestamp: Date.now(), offset }));
  } catch { /* storage full */ }
}

interface UseAIFeedReturn {
  posts: Post[];
  loading: boolean;
  hasMore: boolean;
  fetchMore: (category?: string) => Promise<void>;
  reset: () => void;
}

export function useAIFeed(location: LocationState | null): UseAIFeedReturn {
  const [posts, setPosts]   = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef    = useRef(0);
  const inFlightRef  = useRef(false);
  const prevCityRef  = useRef<string | null>(null);

  // On location change: load cache immediately, then refresh in background
  useEffect(() => {
    const city = location?.city ?? null;
    if (!city || city === prevCityRef.current) return;
    prevCityRef.current = city;

    const cached = readCache(city);
    if (cached && cached.posts.length > 0) {
      setPosts(cached.posts);
      offsetRef.current = cached.offset;
      setHasMore(true);
      // Stale-while-revalidate: refresh silently in background
      void fetchInBackground(city, location);
    } else {
      // No cache — do a visible fetch
      setPosts([]);
      offsetRef.current = 0;
      setHasMore(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.city]);

  async function fetchInBackground(city: string, loc: LocationState | null) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const params = new URLSearchParams({
        city,
        country: loc?.country ?? '',
        lat: (loc?.lat ?? 0).toString(),
        lng: (loc?.lng ?? 0).toString(),
        offset: '0',
        count: '8',
      });
      const res = await fetch(`/api/events?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      const fresh: Post[] = data.posts ?? [];
      if (fresh.length > 0) {
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newOnes = fresh.filter(p => !existingIds.has(p.id));
          const merged = [...newOnes, ...prev];
          writeCache(city, merged, merged.length);
          return merged;
        });
        offsetRef.current = Math.max(offsetRef.current, fresh.length);
      }
    } catch { /* silent */ } finally {
      inFlightRef.current = false;
    }
  }

  const fetchMore = useCallback(async (category?: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);

    const city    = location?.city    ?? 'Vienna';
    const country = location?.country ?? 'Austria';
    const lat     = location?.lat     ?? 48.2082;
    const lng     = location?.lng     ?? 16.3738;

    try {
      const params = new URLSearchParams({
        city,
        country,
        lat: lat.toString(),
        lng: lng.toString(),
        offset: offsetRef.current.toString(),
        count: '8',
        ...(category ? { category } : {}),
      });

      const res = await fetch(`/api/events?${params}`);
      if (!res.ok) throw new Error(`API ${res.status}`);

      const data = await res.json();
      const newPosts: Post[] = data.posts ?? [];

      if (newPosts.length === 0) {
        setHasMore(false);
      } else {
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const fresh = newPosts.filter(p => !existingIds.has(p.id));
          const merged = [...prev, ...fresh];
          writeCache(city, merged, merged.length);
          return merged;
        });
        offsetRef.current += newPosts.length;
      }
    } catch (err) {
      console.error('[useAIFeed]', err);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [location]);

  const reset = useCallback(() => {
    setPosts([]);
    offsetRef.current = 0;
    setHasMore(true);
    inFlightRef.current = false;
    prevCityRef.current = null;
  }, []);

  return { posts, loading, hasMore, fetchMore, reset };
}
