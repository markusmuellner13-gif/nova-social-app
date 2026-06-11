'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Post, LocationState } from '@/types';

// Cache settings
const EVENTS_TTL_MS    = 5  * 60 * 1000; // 5 min for events (change often)
const SIGHTSEEING_TTL  = 30 * 60 * 1000; // 30 min for sightseeing (stable)
const CACHE_PREFIX     = 'nova_feed_v4_';

// Radius tiers (km) — expand when current radius is exhausted
const RADIUS_TIERS = [25, 50, 100, 200];

interface CacheEntry { posts: Post[]; timestamp: number; page: number; radiusTier: number }

function cacheKey(city: string, category: string): string {
  return `${CACHE_PREFIX}${city.toLowerCase().replace(/\s+/g, '_')}_${category}`;
}

function ttl(category: string): number {
  return category === 'sightseeing' ? SIGHTSEEING_TTL : EVENTS_TTL_MS;
}

function readCache(city: string, category: string): CacheEntry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(city, category));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > ttl(category)) return null;
    return entry;
  } catch { return null; }
}

function writeCache(city: string, category: string, posts: Post[], page: number, radiusTier: number): void {
  if (typeof window === 'undefined') return;
  try {
    const entry: CacheEntry = { posts, timestamp: Date.now(), page, radiusTier };
    sessionStorage.setItem(cacheKey(city, category), JSON.stringify(entry));
  } catch { /* storage full */ }
}

// Remove events whose date has already passed
function filterExpired(posts: Post[]): Post[] {
  const today = new Date().toISOString().split('T')[0];
  return posts.filter(p => {
    if (!p.eventDateRaw) return true;    // sightseeing / no date → keep
    return p.eventDateRaw >= today;
  });
}

// ─────────────────────────────────────────────────────────────────────────────

interface UseAIFeedReturn {
  posts: Post[];
  loading: boolean;
  hasMore: boolean;
  fetchMore: (category?: string) => Promise<void>;
  reset: () => void;
}

export function useAIFeed(location: LocationState | null): UseAIFeedReturn {
  const [posts, setPosts]     = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const pageRef       = useRef(0);
  const radiusTierRef = useRef(0);
  const inFlightRef   = useRef(false);
  const prevCityRef   = useRef<string | null>(null);
  const categoryRef   = useRef<string>('events');
  const refreshTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const tourismFetchedRef = useRef<Set<string>>(new Set());

  // ── Expired-event cleanup interval (runs every 10 min) ────────────────────
  useEffect(() => {
    const timer = setInterval(() => {
      setPosts(prev => {
        const fresh = filterExpired(prev);
        return fresh.length !== prev.length ? fresh : prev;
      });
    }, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  // ── On location change: load cache or prepare for fresh fetch ─────────────
  useEffect(() => {
    const city = location?.city ?? null;
    if (!city || city === prevCityRef.current) return;
    prevCityRef.current = city;

    const cat    = categoryRef.current;
    const cached = readCache(city, cat);

    if (cached && cached.posts.length > 0) {
      const fresh = filterExpired(cached.posts);
      setPosts(fresh);
      pageRef.current       = cached.page;
      radiusTierRef.current = cached.radiusTier;
      setHasMore(true);
      // Stale-while-revalidate: silently refresh in background
      void silentRefresh(city, location, cat);
    } else {
      setPosts([]);
      pageRef.current       = 0;
      radiusTierRef.current = 0;
      setHasMore(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.city]);

  // ── Background refresh every 5 minutes for fresh events ───────────────────
  useEffect(() => {
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(() => {
      const city = location?.city;
      if (!city || inFlightRef.current) return;
      void silentRefresh(city, location, categoryRef.current);
    }, 5 * 60 * 1000);
    return () => { if (refreshTimer.current) clearInterval(refreshTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.city]);

  // ── Silent background refresh: fetch page 0, prepend truly new posts ──────
  async function silentRefresh(city: string, loc: LocationState | null, category: string) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const params = buildParams(loc, category, 0, RADIUS_TIERS[0]);
      const res = await fetch(`/api/events?${params}`);
      if (!res.ok) return;
      const data = await res.json() as { posts?: Post[] };
      const fresh = filterExpired(data.posts ?? []);
      if (!fresh.length) return;
      setPosts(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const newOnes = fresh.filter(p => !existingIds.has(p.id));
        if (!newOnes.length) return prev;
        const merged = filterExpired([...newOnes, ...prev]);
        writeCache(city, category, merged, pageRef.current, radiusTierRef.current);
        return merged;
      });
    } catch { /* silent */ } finally {
      inFlightRef.current = false;
    }
  }

  // ── Tourism blend: events promoted on the city's official tourism websites ─
  // Fires once per city alongside the first event fetch; results merge in as
  // they arrive so festivals/markets from tourism boards appear in the feed.
  const TOURISM_CATS = new Set(['events', 'music', 'sports', 'art', 'food', 'lifestyle', 'community', 'discover']);

  function fetchTourismEvents(city: string, loc: LocationState | null, category: string) {
    if (!TOURISM_CATS.has(category) || tourismFetchedRef.current.has(city)) return;
    tourismFetchedRef.current.add(city);

    const params = `${buildParams(loc, 'events', 0, RADIUS_TIERS[0])}&source=tourism&count=6`;
    fetch(`/api/events?${params}`)
      .then(res => (res.ok ? res.json() : null))
      .then((data: { posts?: Post[] } | null) => {
        const tourismPosts = filterExpired(data?.posts ?? []);
        if (!tourismPosts.length) return;
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const fresh = tourismPosts.filter(p => !existingIds.has(p.id));
          if (!fresh.length) return prev;
          const merged = [...prev, ...fresh];
          writeCache(city, categoryRef.current, merged, pageRef.current, radiusTierRef.current);
          return merged;
        });
      })
      .catch(() => { tourismFetchedRef.current.delete(city); });
  }

  function buildParams(loc: LocationState | null, category: string, page: number, radius: number): string {
    return new URLSearchParams({
      city:     loc?.city    ?? 'Vienna',
      country:  loc?.country ?? 'Austria',
      lat:      (loc?.lat  ?? 48.2082).toString(),
      lng:      (loc?.lng  ?? 16.3738).toString(),
      page:     page.toString(),
      radius:   radius.toString(),
      count:    '8',
      category,
    }).toString();
  }

  // ── fetchMore: paginate events, expand radius when page exhausted ─────────
  const fetchMore = useCallback(async (category?: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);

    const cat = category ?? 'events';
    categoryRef.current = cat;

    const city   = location?.city    ?? 'Vienna';
    const radius = RADIUS_TIERS[radiusTierRef.current] ?? RADIUS_TIERS[RADIUS_TIERS.length - 1];

    // First page for this city → also pull tourism-board events in parallel
    if (pageRef.current === 0) fetchTourismEvents(city, location, cat);

    try {
      const params = buildParams(location, cat, pageRef.current, radius);
      const res = await fetch(`/api/events?${params}`);
      if (!res.ok) throw new Error(`API ${res.status}`);

      const data = await res.json() as { posts?: Post[]; hasMore?: boolean };
      const newPosts = filterExpired(data.posts ?? []);
      const apiHasMore = data.hasMore !== false;

      if (newPosts.length === 0 || !apiHasMore) {
        // Try expanding radius before giving up
        const nextTier = radiusTierRef.current + 1;
        if (nextTier < RADIUS_TIERS.length) {
          radiusTierRef.current = nextTier;
          pageRef.current = 0;
          setHasMore(true);
          // Immediately fetch with larger radius
          const expandedParams = buildParams(location, cat, 0, RADIUS_TIERS[nextTier]);
          const expandedRes = await fetch(`/api/events?${expandedParams}`);
          if (expandedRes.ok) {
            const expandedData = await expandedRes.json() as { posts?: Post[] };
            const expandedPosts = filterExpired(expandedData.posts ?? []);
            if (expandedPosts.length > 0) {
              setPosts(prev => {
                const existingIds = new Set(prev.map(p => p.id));
                const fresh = expandedPosts.filter(p => !existingIds.has(p.id));
                const merged = [...prev, ...fresh];
                writeCache(city, cat, merged, pageRef.current, radiusTierRef.current);
                return merged;
              });
              pageRef.current = 1;
              setHasMore(true);
            } else {
              setHasMore(false);
            }
          } else {
            setHasMore(false);
          }
        } else {
          setHasMore(false);
        }
      } else {
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const fresh = newPosts.filter(p => !existingIds.has(p.id));
          const merged = [...prev, ...fresh];
          writeCache(city, cat, merged, pageRef.current + 1, radiusTierRef.current);
          return merged;
        });
        pageRef.current += 1;
        setHasMore(true);
      }
    } catch (err) {
      console.error('[useAIFeed]', err);
    } finally {
      setLoading(false);
      inFlightRef.current = false;
    }
  }, [location]);

  // ── reset: clear everything for a tab/location switch ────────────────────
  const reset = useCallback(() => {
    setPosts([]);
    pageRef.current       = 0;
    radiusTierRef.current = 0;
    setHasMore(true);
    inFlightRef.current   = false;
    prevCityRef.current   = null;
    tourismFetchedRef.current.clear();
  }, []);

  return { posts, loading, hasMore, fetchMore, reset };
}
