'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, MapPin, Loader2, CornerDownLeft } from 'lucide-react';
import { LocationState } from '@/types';

interface Props {
  currentCity: string;
  onSelectCity: (location: LocationState) => void;
  onClose: () => void;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address: {
    city?: string;
    town?: string;
    village?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

const POPULAR_CITIES: { name: string; country: string; lat: number; lng: number; emoji: string }[] = [
  { name: 'Vienna',       country: 'Austria',     lat: 48.2082, lng: 16.3738,  emoji: '🇦🇹' },
  { name: 'London',       country: 'UK',          lat: 51.5074, lng: -0.1278,  emoji: '🇬🇧' },
  { name: 'Berlin',       country: 'Germany',     lat: 52.5200, lng: 13.4050,  emoji: '🇩🇪' },
  { name: 'Paris',        country: 'France',      lat: 48.8566, lng: 2.3522,   emoji: '🇫🇷' },
  { name: 'Barcelona',    country: 'Spain',       lat: 41.3851, lng: 2.1734,   emoji: '🇪🇸' },
  { name: 'Amsterdam',    country: 'Netherlands', lat: 52.3676, lng: 4.9041,   emoji: '🇳🇱' },
  { name: 'New York',     country: 'USA',         lat: 40.7128, lng: -74.0060, emoji: '🇺🇸' },
  { name: 'Los Angeles',  country: 'USA',         lat: 34.0522, lng: -118.2437,emoji: '🇺🇸' },
  { name: 'Tokyo',        country: 'Japan',       lat: 35.6762, lng: 139.6503, emoji: '🇯🇵' },
  { name: 'Sydney',       country: 'Australia',   lat: -33.8688, lng: 151.2093,emoji: '🇦🇺' },
  { name: 'Dubai',        country: 'UAE',         lat: 25.2048, lng: 55.2708,  emoji: '🇦🇪' },
  { name: 'Rome',         country: 'Italy',       lat: 41.9028, lng: 12.4964,  emoji: '🇮🇹' },
];

export default function CityExplorer({ currentCity, onSelectCity, onClose }: Props) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  // Run the actual geocoder search. No `featuretype=city` filter — that returns
  // almost nothing for smaller towns; instead we ask for any place and keep the
  // city/town/village/municipality results so even small towns show up.
  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (trimmed.length < 2) { setResults([]); setSearching(false); return; }
    const myReq = ++reqIdRef.current;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}` +
        `&format=json&addressdetails=1&limit=8&accept-language=en`,
        { headers: { 'Accept-Language': 'en' } }
      );
      const data = await res.json() as NominatimResult[];
      if (myReq !== reqIdRef.current) return; // a newer keystroke superseded this
      // Keep only populated places (city/town/village/etc), dedupe by city name
      const seen = new Set<string>();
      const filtered = data.filter(r => {
        const name = r.address?.city || r.address?.town || r.address?.village
          || r.address?.county || r.address?.state || r.display_name.split(',')[0];
        if (!name) return false;
        const key = `${name}|${r.address?.country ?? ''}`.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setResults(filtered);
    } catch { setResults([]); } finally {
      if (myReq === reqIdRef.current) setSearching(false);
    }
  }, []);

  // Debounce keystrokes (Nominatim asks for ≤1 req/sec); 350ms feels instant.
  function handleSearch(q: string) {
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(() => { void runSearch(q); }, 350);
  }

  // Enter → search immediately and, if there's already a top match, pick it.
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (results.length > 0) { selectNominatim(results[0]); return; }
    void runSearch(query);
  }

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, []);

  function selectNominatim(r: NominatimResult) {
    // Fall back to the result's own display name — never 'Unknown'
    const city = r.address.city || r.address.town || r.address.village || r.address.county
      || r.address.state || r.display_name.split(',')[0].trim();
    const loc: LocationState = {
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      city,
      country: r.address.country ?? '',
      countryCode: (r.address.country_code ?? '').toUpperCase(),
      enabled: true,
    };
    onSelectCity(loc);
    onClose();
  }

  function selectPopular(c: (typeof POPULAR_CITIES)[0]) {
    onSelectCity({ lat: c.lat, lng: c.lng, city: c.name, country: c.country, countryCode: '', enabled: true });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#0a0a0f' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-14 pb-4" style={{ borderBottom: '1px solid #1e1e2a' }}>
        <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-2xl" style={{ background: '#13131a', border: '1px solid #2a2a38' }}>
          <Search size={16} style={{ color: '#666677', flexShrink: 0 }} />
          <input
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type any city or town…"
            className="flex-1 bg-transparent text-sm text-white outline-none min-w-0"
            autoFocus
          />
          {searching
            ? <Loader2 size={14} className="animate-spin" style={{ color: '#8b5cf6', flexShrink: 0 }} />
            : query.trim().length >= 2 && (
                <button onClick={() => { if (results.length) selectNominatim(results[0]); else void runSearch(query); }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg,#8b5cf6,#ec4899)' }}>
                  <CornerDownLeft size={12} style={{ color: '#fff' }} />
                  <span className="text-xs font-bold text-white">Go</span>
                </button>
              )}
        </div>
        <button onClick={onClose}><X size={22} style={{ color: '#888899' }} /></button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4">
        {/* Search results */}
        <AnimatePresence>
          {results.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-6">
              <p className="text-xs font-bold mb-3" style={{ color: '#666677' }}>SEARCH RESULTS</p>
              <div className="flex flex-col gap-2">
                {results.map((r, i) => {
                  const city = r.address.city || r.address.town || r.address.village || r.address.state || 'City';
                  return (
                    <motion.button key={i} whileTap={{ scale: 0.97 }} onClick={() => selectNominatim(r)}
                      className="flex items-center gap-3 p-3.5 rounded-2xl text-left"
                      style={{ background: '#13131a', border: '1px solid #2a2a38' }}>
                      <MapPin size={18} style={{ color: '#8b5cf6', flexShrink: 0 }} />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{city}</p>
                        <p className="text-xs truncate" style={{ color: '#666677' }}>{r.address.country}</p>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Current city */}
        {currentCity && (
          <div className="mb-4 p-3.5 rounded-2xl flex items-center gap-3" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <MapPin size={16} style={{ color: '#8b5cf6' }} />
            <div>
              <p className="text-xs font-bold" style={{ color: '#a78bfa' }}>Currently showing</p>
              <p className="text-sm font-semibold text-white">{currentCity}</p>
            </div>
          </div>
        )}

        {/* Popular cities */}
        <p className="text-xs font-bold mb-3" style={{ color: '#666677' }}>POPULAR CITIES</p>
        <div className="grid grid-cols-2 gap-2 pb-8">
          {POPULAR_CITIES.map(c => (
            <motion.button key={c.name} whileTap={{ scale: 0.95 }} onClick={() => selectPopular(c)}
              className="flex items-center gap-2.5 p-3.5 rounded-2xl text-left"
              style={{ background: '#13131a', border: '1px solid #2a2a38' }}>
              <span style={{ fontSize: 22 }}>{c.emoji}</span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{c.name}</p>
                <p className="text-xs truncate" style={{ color: '#666677' }}>{c.country}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
