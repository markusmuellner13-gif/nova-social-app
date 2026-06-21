'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Post, LocationState } from '@/types';

// Cache settings — localStorage so reopening the app shows content instantly
const EVENTS_TTL_MS    = 5  * 60 * 1000; // 5 min for events (change often)
const SIGHTSEEING_TTL  = 30 * 60 * 1000; // 30 min for sightseeing (stable)
const CACHE_PREFIX     = 'nova_feed_v5_';

// Radius tiers (km) — expand when current radius is exhausted; after the last
// tier, widen the date window instead (next 60 days → next 180 days)
const RADIUS_TIERS = [25, 50, 100, 200];
const DAYS_TIERS   = [60, 180];

// Blend mode (discover, no chip selected): the feed rotates through EVERY
// category as the user scrolls, so the stream never runs out and always mixes
// events, food, music, places, sightseeing, etc. — the endless doom-scroll.
const BLEND_CATEGORIES = [
  'events', 'music', 'restaurants', 'art', 'food', 'sports', 'venues',
  'lifestyle', 'community', 'sightseeing', 'hotels', 'fitness', 'rentals',
  'shops', 'tech', 'fashion', 'travel', 'pets',
];
// How many pages deep to go through every category before stopping (≈ endless).
const BLEND_MAX_ROUNDS = 6;

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
    const raw = localStorage.getItem(cacheKey(city, category));
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    if (Date.now() - entry.timestamp > ttl(category)) return null;
    return entry;
  } catch { return null; }
}

function writeCache(city: string, category: string, posts: Post[], page: number, radiusTier: number): void {
  if (typeof window === 'undefined') return;
  try {
    // Cap stored posts so localStorage never fills up with an endless feed
    const entry: CacheEntry = { posts: posts.slice(0, 60), timestamp: Date.now(), page, radiusTier };
    localStorage.setItem(cacheKey(city, category), JSON.stringify(entry));
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

interface FeedResponse { posts?: Post[]; hasMore?: boolean; city?: string }

interface UseAIFeedReturn {
  posts: Post[];
  loading: boolean;
  hasMore: boolean;
  fetchMore: (category?: string) => Promise<void>;
  reset: () => void;
  // Index into `posts` where results from BEYOND the user's city (expanded
  // radius — nearby towns) begin. null while everything shown is still local.
  nearbyStartIndex: number | null;
}

export function useAIFeed(location: LocationState | null): UseAIFeedReturn {
  const [posts, setPosts]     = useState<Post[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nearbyStartIndex, setNearbyStartIndex] = useState<number | null>(null);
  const nearbyStartRef = useRef<number | null>(null);

  const pageRef       = useRef(0);
  const radiusTierRef = useRef(0);
  const daysTierRef   = useRef(0);
  const inFlightRef   = useRef(false);
  const prevCityRef   = useRef<string | null>(null);
  const categoryRef   = useRef<string>('events');
  const refreshTimer  = useRef<ReturnType<typeof setInterval> | null>(null);
  const tourismFetchedRef = useRef<Set<string>>(new Set());
  const sponsoredFetchedRef = useRef<Set<string>>(new Set());
  const blendStepRef  = useRef(0); // rotation counter for discover blend mode
  // Next-page prefetch buffer: params-string → parsed response promise
  const prefetchRef   = useRef<Map<string, Promise<FeedResponse | null>>>(new Map());

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
      daysTierRef.current   = 0;
      nearbyStartRef.current = null;
      setNearbyStartIndex(null);
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
      const params = buildParams(loc, category, 0, RADIUS_TIERS[0], DAYS_TIERS[0]);
      const res = await fetch(`/api/feed?${params}`);
      if (!res.ok) return;
      const data = await res.json() as FeedResponse;
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

    const params = `${buildParams(loc, 'events', 0, RADIUS_TIERS[0], DAYS_TIERS[0])}&source=tourism&count=6`;
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

  // ── Paid sponsored posts: geo-targeted partners for THIS city ──────────────
  // Fetched once per city; injected a couple of slots into the feed so locals
  // see the businesses paying to reach them.
  function fetchSponsored(city: string) {
    if (!city || sponsoredFetchedRef.current.has(city)) return;
    sponsoredFetchedRef.current.add(city);
    fetch(`/api/sponsored?city=${encodeURIComponent(city)}`)
      .then(res => (res.ok ? res.json() : null))
      .then((data: { posts?: Post[] } | null) => {
        const sp = data?.posts ?? [];
        if (!sp.length) return;
        setPosts(prev => {
          const ids = new Set(prev.map(p => p.id));
          const fresh = sp.filter(p => !ids.has(p.id));
          if (!fresh.length) return prev;
          const merged = [...prev];
          merged.splice(Math.min(2, merged.length), 0, ...fresh);
          return merged;
        });
      })
      .catch(() => { sponsoredFetchedRef.current.delete(city); });
  }

  // Coordinates rounded to ~100m so nearby users share the same edge-cache
  // entry. With no location at all, params are omitted entirely — the server
  // falls back to IP geolocation (free Vercel headers).
  function buildParams(loc: LocationState | null, category: string, page: number, radius: number, days: number): string {
    const p = new URLSearchParams({
      page:     page.toString(),
      radius:   radius.toString(),
      days:     days.toString(),
      count:    '8',
      category,
    });
    if (loc) {
      p.set('city',    loc.city);
      p.set('country', loc.country);
      p.set('lat',     loc.lat.toFixed(3));
      p.set('lng',     loc.lng.toFixed(3));
    }
    return p.toString();
  }

  // Fetch a feed page, preferring the prefetch buffer; always warms the next page
  function fetchFeedPage(loc: LocationState | null, category: string, page: number, radius: number, days: number): Promise<FeedResponse | null> {
    const params = buildParams(loc, category, page, radius, days);
    const buffered = prefetchRef.current.get(params);
    if (buffered) {
      prefetchRef.current.delete(params);
      return buffered;
    }
    return fetch(`/api/feed?${params}`)
      .then(res => (res.ok ? (res.json() as Promise<FeedResponse>) : null))
      .catch(() => null);
  }

  function prefetchNextPage(loc: LocationState | null, category: string, page: number, radius: number, days: number) {
    const params = buildParams(loc, category, page, radius, days);
    if (prefetchRef.current.has(params)) return;
    if (prefetchRef.current.size > 6) prefetchRef.current.clear();
    prefetchRef.current.set(
      params,
      fetch(`/api/feed?${params}`)
        .then(res => (res.ok ? (res.json() as Promise<FeedResponse>) : null))
        .catch(() => null)
    );
  }

  // ── fetchMore: paginate; expand radius, then date window, when exhausted ──
  const fetchMore = useCallback(async (category?: string) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setLoading(true);

    const cat = category ?? 'events';
    categoryRef.current = cat;

    const city   = location?.city ?? 'nearby';
    const radius = RADIUS_TIERS[radiusTierRef.current] ?? RADIUS_TIERS[RADIUS_TIERS.length - 1];
    const days   = DAYS_TIERS[daysTierRef.current] ?? DAYS_TIERS[DAYS_TIERS.length - 1];

    // ── Discover BLEND: rotate through every category for an endless mixed feed ─
    if (cat === 'discover') {
      const step  = blendStepRef.current;
      const bcat  = BLEND_CATEGORIES[step % BLEND_CATEGORIES.length];
      const bpage = Math.floor(step / BLEND_CATEGORIES.length);
      if (step === 0 && location?.city) {
        fetchTourismEvents(location.city, location, 'events');
        fetchSponsored(location.city);
      }
      try {
        const data = await fetchFeedPage(location, bcat, bpage, RADIUS_TIERS[0], DAYS_TIERS[daysTierRef.current] ?? DAYS_TIERS[0]);
        const newPosts = filterExpired(data?.posts ?? []);
        if (newPosts.length > 0) {
          setPosts(prev => {
            const existingIds = new Set(prev.map(p => p.id));
            const fresh = newPosts.filter(p => !existingIds.has(p.id));
            const merged = [...prev, ...fresh];
            writeCache(city, 'discover', merged, 0, 0);
            return merged;
          });
        }
        blendStepRef.current = step + 1;
        setHasMore(blendStepRef.current < BLEND_CATEGORIES.length * BLEND_MAX_ROUNDS);
        // Warm the next category's page so scrolling never shows a spinner
        const next = blendStepRef.current;
        prefetchNextPage(location, BLEND_CATEGORIES[next % BLEND_CATEGORIES.length],
          Math.floor(next / BLEND_CATEGORIES.length), RADIUS_TIERS[0], DAYS_TIERS[daysTierRef.current] ?? DAYS_TIERS[0]);
      } catch (err) {
        console.error('[useAIFeed/blend]', err);
      } finally {
        setLoading(false);
        inFlightRef.current = false;
      }
      return;
    }

    // First page for this city → also pull tourism-board events in parallel
    if (pageRef.current === 0 && location?.city) fetchTourismEvents(location.city, location, cat);

    const merge = (newPosts: Post[], nextPage: number) => {
      setPosts(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const fresh = newPosts.filter(p => !existingIds.has(p.id));
        // First time we append results from an EXPANDED radius (beyond the
        // city), remember where the "nearby towns" section begins.
        if (radiusTierRef.current > 0 && nearbyStartRef.current === null && prev.length > 0 && fresh.length > 0) {
          nearbyStartRef.current = prev.length;
          setNearbyStartIndex(prev.length);
        }
        const merged = [...prev, ...fresh];
        writeCache(city, cat, merged, nextPage, radiusTierRef.current);
        return merged;
      });
    };

    try {
      const data = await fetchFeedPage(location, cat, pageRef.current, radius, days);
      const newPosts = filterExpired(data?.posts ?? []);
      const apiHasMore = data?.hasMore !== false;

      if (newPosts.length > 0) {
        merge(newPosts, pageRef.current + 1);
        pageRef.current += 1;
        setHasMore(true);
        // Warm the next page so the user never sees a spinner
        prefetchNextPage(location, cat, pageRef.current, radius, days);
        if (!apiHasMore) {
          // This source chain is ending — line up the next expansion tier
          if (radiusTierRef.current < RADIUS_TIERS.length - 1) {
            radiusTierRef.current += 1;
            pageRef.current = 0;
          } else if (daysTierRef.current < DAYS_TIERS.length - 1) {
            daysTierRef.current += 1;
            pageRef.current = 0;
          }
        }
        return;
      }

      // Page came back empty → expand radius, then the date window
      if (radiusTierRef.current < RADIUS_TIERS.length - 1) {
        radiusTierRef.current += 1;
        pageRef.current = 0;
      } else if (daysTierRef.current < DAYS_TIERS.length - 1) {
        daysTierRef.current += 1;
        pageRef.current = 0;
      } else {
        setHasMore(false);
        return;
      }

      const expanded = await fetchFeedPage(
        location, cat, 0,
        RADIUS_TIERS[radiusTierRef.current], DAYS_TIERS[daysTierRef.current]
      );
      const expandedPosts = filterExpired(expanded?.posts ?? []);
      if (expandedPosts.length > 0) {
        merge(expandedPosts, 1);
        pageRef.current = 1;
        setHasMore(true);
      } else {
        setHasMore(false);
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
    daysTierRef.current   = 0;
    setHasMore(true);
    inFlightRef.current   = false;
    prevCityRef.current   = null;
    blendStepRef.current  = 0;
    nearbyStartRef.current = null;
    setNearbyStartIndex(null);
    prefetchRef.current.clear();
    tourismFetchedRef.current.clear();
    sponsoredFetchedRef.current.clear();
  }, []);

  return { posts, loading, hasMore, fetchMore, reset, nearbyStartIndex };
}
