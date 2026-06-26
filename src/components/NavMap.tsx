'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { X, Layers, Navigation, Volume2, VolumeX, LocateFixed, Car, Footprints, Flag, Palette } from 'lucide-react';
import { Post, Category } from '@/types';

// ── Navigation themes ─────────────────────────────────────────────────────────
interface NavTheme {
  id: string;
  label: string;
  emoji: string;
  accent: string;
  gradient: string;
  route: string;
  routeGlow: string;
  routeWidth: number;
  square: boolean;
  user: string;
  mapFilter: string;
  pixelated: boolean;
}

const NAV_THEMES: NavTheme[] = [
  { id: 'nova',      label: 'Nova',      emoji: '🟣', accent: '#8b5cf6', gradient: 'linear-gradient(135deg,#8b5cf6,#ec4899)', route: '#8b5cf6', routeGlow: '#c4b5fd', routeWidth: 6, square: false, user: '#3b82f6', mapFilter: 'brightness(0.85) contrast(1.1)', pixelated: false },
  { id: 'minecraft', label: 'Minecraft', emoji: '🟩', accent: '#5ab552', gradient: 'linear-gradient(135deg,#5ab552,#3b7a36)', route: '#7ed957', routeGlow: '#b6f09c', routeWidth: 8, square: true,  user: '#8b5a2b', mapFilter: 'contrast(1.15) saturate(1.35) brightness(0.88)', pixelated: true },
  { id: 'neon',      label: 'Cyberpunk', emoji: '🟦', accent: '#22d3ee', gradient: 'linear-gradient(135deg,#22d3ee,#d946ef)', route: '#22d3ee', routeGlow: '#f0abfc', routeWidth: 6, square: false, user: '#f0abfc', mapFilter: 'hue-rotate(150deg) saturate(1.7) contrast(1.1) brightness(0.75)', pixelated: false },
  { id: 'candy',     label: 'Candy',     emoji: '🍬', accent: '#fb7185', gradient: 'linear-gradient(135deg,#fb7185,#f472b6)', route: '#fb7185', routeGlow: '#fbcfe8', routeWidth: 7, square: false, user: '#f472b6', mapFilter: 'saturate(1.3) brightness(0.9) hue-rotate(-12deg)', pixelated: false },
];
const DEFAULT_THEME = NAV_THEMES[0];

const CATEGORY_COLOR: Record<Category, string> = {
  travel: '#3b82f6', food: '#f97316', fashion: '#ec4899', sports: '#22c55e', art: '#a855f7',
  tech: '#06b6d4', fitness: '#ef4444', music: '#8b5cf6', pets: '#f59e0b', lifestyle: '#10b981',
  events: '#f43f5e', sightseeing: '#14b8a6', shops: '#d946ef', venues: '#f43f5e',
  community: '#14b8a6', restaurants: '#fb923c', hotels: '#60a5fa', rentals: '#34d399',
  outdoors: '#16a34a',
};
const CATEGORY_EMOJI: Record<Category, string> = {
  travel: '✈️', food: '🍕', fashion: '👗', sports: '⚽', art: '🎨', tech: '💻', fitness: '💪',
  music: '🎵', pets: '🐾', lifestyle: '🌟', events: '🎉', sightseeing: '🏛️', shops: '🛍️',
  venues: '🎭', community: '🤝', restaurants: '🍽️', hotels: '🏨', rentals: '🚲',
  outdoors: '🏞️',
};

// OpenFreeMap provides free vector tiles with full street labels — no API key.
// The liberty style is a clean, well-labelled street map.
const OFMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

// Esri satellite imagery overlaid on top of vector labels (satellite mode).
const SATELLITE_TILES = ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'];

interface RouteStep {
  instruction: string;
  location: [number, number]; // [lng, lat]
  distance: number;
  announced?: boolean;
}

interface Props {
  posts: Post[];
  userLocation: { lat: number; lng: number } | null;
  initialTarget?: Post | null;
  onClose: () => void;
}

const toRad = (d: number) => (d * Math.PI) / 180;
function metresBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function maneuverText(type: string, modifier: string, road: string): string {
  const onto = road ? ` onto ${road}` : '';
  switch (type) {
    case 'depart':       return `Head out${road ? ` on ${road}` : ''}`;
    case 'arrive':       return 'You have arrived at your destination';
    case 'turn':         return `Turn ${modifier || 'ahead'}${onto}`;
    case 'roundabout':
    case 'rotary':       return `Take the roundabout${onto}`;
    case 'merge':        return `Merge${onto}`;
    case 'fork':         return `Keep ${modifier || 'ahead'}${onto}`;
    case 'end of road':  return `Turn ${modifier || 'ahead'}${onto}`;
    case 'continue':     return `Continue${road ? ` on ${road}` : ' straight'}`;
    case 'new name':     return `Continue${road ? ` on ${road}` : ''}`;
    default:             return `${modifier ? `${modifier} ` : ''}${road ? `onto ${road}` : 'continue'}`.trim();
  }
}

// Request a fresh, high-accuracy GPS fix. Resolves null on failure/denial.
function getGPSPosition(timeoutMs = 10000): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 0, timeout: timeoutMs },
    );
  });
}

export default function NavMap({ posts, userLocation, initialTarget, onClose }: Props) {
  const mapRef = useRef<maplibregl.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const userMarkerRef = useRef<maplibregl.Marker | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const stepsRef = useRef<RouteStep[]>([]);
  const lastSpokenRef = useRef<string>('');
  const ttsVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const satelliteLayerAddedRef = useRef(false);

  const [satellite, setSatellite] = useState(false);
  const [theme, setTheme] = useState<NavTheme>(DEFAULT_THEME);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [profile, setProfile] = useState<'driving' | 'foot'>('driving');
  const [target, setTarget] = useState<Post | null>(initialTarget ?? null);
  const [routeInfo, setRouteInfo] = useState<{ km: number; min: number } | null>(null);
  const [steps, setSteps] = useState<RouteStep[]>([]);
  const [navigating, setNavigating] = useState(false);
  const [nextStep, setNextStep] = useState<string>('');
  const [routing, setRouting] = useState(false);
  const [routeError, setRouteError] = useState(false);

  // Restore saved theme
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem('nova_nav_theme');
    const found = NAV_THEMES.find(t => t.id === saved);
    if (found) setTheme(found);
  }, []);

  // Pre-select English TTS voice
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;
      ttsVoiceRef.current =
        voices.find(v => v.lang === 'en-US' && v.localService) ??
        voices.find(v => v.lang === 'en-US') ??
        voices.find(v => v.lang.startsWith('en-GB')) ??
        voices.find(v => v.lang.startsWith('en')) ??
        voices[0];
    };
    pickVoice();
    window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', pickVoice);
  }, []);

  const pickTheme = useCallback((t: NavTheme) => {
    setTheme(t);
    setThemePickerOpen(false);
    try { window.localStorage.setItem('nova_nav_theme', t.id); } catch { /* private mode */ }
  }, []);

  const speak = useCallback((text: string) => {
    if (!voiceOn || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (text === lastSpokenRef.current) return;
    lastSpokenRef.current = text;
    try {
      // Strip road names from spoken text — local street names trigger language switching in TTS
      const spoken = text.replace(/ onto\s+\S.*$/i, '').replace(/ on\s+[A-ZÄÖÜÉÀÂ]\S.*$/i, '').trim() || text;
      const u = new SpeechSynthesisUtterance(spoken);
      u.rate = 1.05; u.pitch = 1; u.lang = 'en-US';
      if (ttsVoiceRef.current) u.voice = ttsVoiceRef.current;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch { /* TTS unavailable */ }
  }, [voiceOn]);

  // Place / update the blue user-location dot
  const setUserMarker = useCallback((lat: number, lng: number) => {
    const map = mapRef.current;
    if (!map) return;
    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.style.cssText = `width:18px;height:18px;border-radius:${theme.square ? '3px' : '50%'};background:${theme.user};border:3px solid #fff;box-shadow:0 0 0 6px ${theme.user}40;`;
      userMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    } else {
      userMarkerRef.current.setLngLat([lng, lat]);
    }
  }, [theme]);

  // ── Init map ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center: [number, number] = userLocation
      ? [userLocation.lng, userLocation.lat]
      : (posts[0]?.location ? [posts[0].location!.lng, posts[0].location!.lat] : [16.37, 48.21]);

    const map = new maplibregl.Map({
      container: containerRef.current,
      // OpenFreeMap liberty: full vector style with street names, POIs, buildings
      style: OFMAP_STYLE,
      center,
      zoom: 13,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
    mapRef.current = map;

    map.on('load', () => {
      // Add event-pin markers near the user/target
      const anchor = userLocation ?? (initialTarget?.location ?? posts[0]?.location);
      const valid = posts.filter(p => p.location && Number.isFinite(p.location.lat) && Number.isFinite(p.location.lng));
      const nearbyPosts = (!anchor || valid.length <= 80)
        ? valid
        : valid
            .map(p => ({ p, d: metresBetween(anchor.lat, anchor.lng, p.location!.lat, p.location!.lng) }))
            .sort((a, b) => a.d - b.d)
            .slice(0, 80)
            .map(x => x.p);

      for (const p of nearbyPosts) {
        if (!p.location) continue;
        const el = document.createElement('button');
        const color = CATEGORY_COLOR[p.category] ?? '#8b5cf6';
        el.style.cssText = `width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.5);cursor:pointer;display:flex;align-items:center;justify-content:center;`;
        const inner = document.createElement('span');
        inner.textContent = CATEGORY_EMOJI[p.category] ?? '📍';
        inner.style.cssText = 'transform:rotate(45deg);font-size:13px;line-height:1;';
        el.appendChild(inner);
        el.onclick = (e) => { e.stopPropagation(); setTarget(p); };
        markersRef.current.push(
          new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([p.location!.lng, p.location!.lat]).addTo(map)
        );
      }
      if (initialTarget) setTarget(initialTarget);
    });

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation?.clearWatch(watchIdRef.current);
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
      satelliteLayerAddedRef.current = false;
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply theme filter to map canvas
  useEffect(() => {
    const canvas = containerRef.current?.querySelector('canvas');
    if (canvas) {
      canvas.style.filter = theme.mapFilter;
      canvas.style.imageRendering = theme.pixelated ? 'pixelated' : 'auto';
      canvas.style.transition = 'filter 0.3s ease';
    }
    const map = mapRef.current;
    if (map?.isStyleLoaded()) {
      if (map.getLayer('route-line')) {
        map.setPaintProperty('route-line', 'line-color', theme.route);
        map.setPaintProperty('route-line', 'line-width', theme.routeWidth);
        map.setPaintProperty('route-glow', 'line-color', theme.routeGlow);
        map.setLayoutProperty('route-line', 'line-cap', theme.square ? 'square' : 'round');
        map.setLayoutProperty('route-line', 'line-join', theme.square ? 'miter' : 'round');
      }
    }
    if (userMarkerRef.current) {
      const el = userMarkerRef.current.getElement();
      el.style.background = theme.user;
      el.style.boxShadow = `0 0 0 6px ${theme.user}40`;
      el.style.borderRadius = theme.square ? '3px' : '50%';
    }
  }, [theme]);

  // Satellite toggle — overlay Esri imagery below vector labels
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (satellite) {
        if (!satelliteLayerAddedRef.current) {
          if (!map.getSource('satellite')) {
            map.addSource('satellite', { type: 'raster', tiles: SATELLITE_TILES, tileSize: 256 });
          }
          // Insert below the first symbol (label) layer so street names stay visible
          const firstSymbol = map.getStyle().layers?.find(l => l.type === 'symbol')?.id;
          map.addLayer({ id: 'satellite-layer', type: 'raster', source: 'satellite', paint: { 'raster-opacity': 0.85 } }, firstSymbol);
          satelliteLayerAddedRef.current = true;
        } else {
          map.setLayoutProperty('satellite-layer', 'visibility', 'visible');
        }
      } else if (satelliteLayerAddedRef.current && map.getLayer('satellite-layer')) {
        map.setLayoutProperty('satellite-layer', 'visibility', 'none');
      }
    };
    if (map.isStyleLoaded()) apply(); else map.once('load', apply);
  }, [satellite]);

  // Show userLocation dot on initial render
  useEffect(() => {
    if (userLocation) setUserMarker(userLocation.lat, userLocation.lng);
  }, [userLocation, setUserMarker]);

  // Draw the route line on the map and populate step list
  const drawRoute = useCallback(async (origin: { lat: number; lng: number }, dest: Post): Promise<boolean> => {
    const map = mapRef.current;
    if (!map || !dest.location) return false;
    if (!map.isStyleLoaded()) await new Promise<void>(resolve => map.once('idle', resolve));

    const routeUrl = (base: string) =>
      `${base}/route/v1/${profile}/${origin.lng},${origin.lat};${dest.location!.lng},${dest.location!.lat}?overview=full&geometries=geojson&steps=true`;

    let data: {
      routes?: {
        distance: number; duration: number; geometry: GeoJSON.LineString;
        legs: { steps: { maneuver: { location: [number, number]; type: string; modifier?: string }; name?: string; distance: number }[] }[];
      }[];
    } | null = null;

    const OSRM_BASES = [
      'https://router.project-osrm.org',
      'https://routing.openstreetmap.de/routed-car',
      'https://routing.openstreetmap.de/routed-foot',
    ];
    // Use foot endpoint for walking profile
    const bases = profile === 'foot'
      ? ['https://routing.openstreetmap.de/routed-foot', 'https://router.project-osrm.org']
      : ['https://router.project-osrm.org', 'https://routing.openstreetmap.de/routed-car'];

    for (const base of bases) {
      try {
        const res = await fetch(routeUrl(base), { signal: AbortSignal.timeout(12000) });
        if (res.ok) { data = await res.json(); break; }
      } catch { /* try next */ }
    }
    // Suppress unused variable lint error
    void OSRM_BASES;

    const route = data?.routes?.[0];
    if (!route) return false;

    const geo: GeoJSON.Feature = { type: 'Feature', properties: {}, geometry: route.geometry };
    try {
      const src = map.getSource('route') as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData(geo);
        if (map.getLayer('route-line')) {
          map.setPaintProperty('route-line', 'line-color', theme.route);
          map.setPaintProperty('route-line', 'line-width', theme.routeWidth);
        }
        if (map.getLayer('route-glow')) {
          map.setPaintProperty('route-glow', 'line-color', theme.routeGlow);
        }
      } else {
        map.addSource('route', { type: 'geojson', data: geo });
        map.addLayer({
          id: 'route-glow', type: 'line', source: 'route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': theme.routeGlow, 'line-width': theme.routeWidth * 2.5, 'line-opacity': 0.35 },
        });
        map.addLayer({
          id: 'route-line', type: 'line', source: 'route',
          layout: { 'line-join': theme.square ? 'miter' : 'round', 'line-cap': theme.square ? 'square' : 'round' },
          paint: { 'line-color': theme.route, 'line-width': theme.routeWidth, 'line-opacity': 0.95 },
        });
      }
    } catch (err) {
      console.error('[NavMap/drawRoute]', err);
      return false;
    }

    const allSteps: RouteStep[] = route.legs.flatMap(leg =>
      leg.steps.map(s => ({
        instruction: maneuverText(s.maneuver.type, s.maneuver.modifier ?? '', s.name ?? ''),
        location: s.maneuver.location,
        distance: s.distance,
      }))
    );
    stepsRef.current = allSteps;
    setSteps(allSteps);
    setRouteInfo({ km: Math.round(route.distance / 100) / 10, min: Math.round(route.duration / 60) });

    const coords = route.geometry.coordinates as [number, number][];
    const bounds = coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
    map.fitBounds(bounds, { padding: { top: 80, bottom: 230, left: 40, right: 40 }, maxZoom: 16, duration: 800 });
    return true;
  }, [profile, theme]);

  // Build a route — ALWAYS get fresh GPS first so directions are from where you actually are
  const buildRoute = useCallback(async (dest: Post) => {
    setRouteError(false);
    setRouteInfo(null);
    setSteps([]);
    stepsRef.current = [];
    setRouting(true);
    setNextStep('Getting your location…');

    // Fresh GPS first — no cached position (maximumAge: 0). This is what makes
    // directions differ correctly between Baden, Bad Vöslau, Vienna, etc.
    const gps = await getGPSPosition(10000);
    const origin = gps ?? userLocation;

    if (!origin) {
      setRouting(false);
      setNextStep('Enable device location to get directions.');
      setRouteError(true);
      return;
    }

    setUserMarker(origin.lat, origin.lng);
    setNextStep('Finding best route…');

    const ok = await drawRoute(origin, dest);
    setRouting(false);
    if (!ok) {
      setNextStep('Route unavailable — tap retry.');
      setRouteError(true);
    } else {
      setNextStep('');
    }
  }, [userLocation, setUserMarker, drawRoute]);

  // Route whenever target or transport profile changes
  useEffect(() => {
    if (target) void buildRoute(target);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, profile]);

  // ── Live turn-by-turn guidance ────────────────────────────────────────────────
  const startGuidance = useCallback(() => {
    if (!navigator.geolocation || !target) return;
    setNavigating(true);
    speak(`Starting navigation to ${target.caption.split('\n')[0].slice(0, 40)}. ${stepsRef.current[0]?.instruction ?? ''}`);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserMarker(lat, lng);
        const map = mapRef.current;
        if (map) map.easeTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 16), duration: 800 });

        const list = stepsRef.current;
        for (let i = 0; i < list.length; i++) {
          const st = list[i];
          if (st.announced) continue;
          const d = metresBetween(lat, lng, st.location[1], st.location[0]);
          setNextStep(`${st.instruction} · ${Math.round(d)} m`);
          if (d < 70) {
            speak(d < 25 ? st.instruction : `In ${Math.round(d / 10) * 10} meters, ${st.instruction.charAt(0).toLowerCase()}${st.instruction.slice(1)}`);
            st.announced = true;
          }
          break;
        }
        const dest = target.location;
        if (dest && metresBetween(lat, lng, dest.lat, dest.lng) < 30) {
          speak('You have arrived at your destination.');
          stopGuidance();
        }
      },
      () => { setNextStep('Location unavailable.'); },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 12000 },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, speak, setUserMarker]);

  const stopGuidance = useCallback(() => {
    setNavigating(false);
    if (watchIdRef.current !== null) { navigator.geolocation?.clearWatch(watchIdRef.current); watchIdRef.current = null; }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const recenter = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(p => {
        setUserMarker(p.coords.latitude, p.coords.longitude);
        map.easeTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 15 });
      }, undefined, { enableHighAccuracy: true, maximumAge: 5000 });
    }
  }, [setUserMarker]);

  return (
    <div className="fixed inset-0 z-50" style={{ background: '#0a0a0f' }}>
      <div ref={containerRef} className="absolute inset-0" />

      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-12 pb-3 pointer-events-none">
        <button onClick={onClose}
          className="pointer-events-auto w-10 h-10 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(13,18,28,0.92)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}>
          <X size={18} />
        </button>
        <div className="flex gap-2 pointer-events-auto">
          <button onClick={() => setSatellite(s => !s)}
            className="px-3 h-10 rounded-full flex items-center gap-1.5 text-xs font-bold"
            style={{ background: satellite ? theme.gradient : 'rgba(13,18,28,0.92)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)' }}>
            <Layers size={14} /> {satellite ? 'Satellite' : 'Map'}
          </button>
          <button onClick={() => setThemePickerOpen(o => !o)}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: themePickerOpen ? theme.gradient : 'rgba(13,18,28,0.92)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}>
            <Palette size={16} />
          </button>
          <button onClick={recenter}
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(13,18,28,0.92)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff' }}>
            <LocateFixed size={16} />
          </button>
        </div>
      </div>

      {/* Theme picker */}
      {themePickerOpen && (
        <div className="absolute right-3 z-10 pointer-events-auto rounded-2xl p-2 flex flex-col gap-1"
          style={{ top: 96, background: 'rgba(13,18,28,0.97)', border: '1px solid #2a2a38', backdropFilter: 'blur(20px)', minWidth: 170 }}>
          <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest" style={{ color: '#888899' }}>Navigation theme</p>
          {NAV_THEMES.map(t => (
            <button key={t.id} onClick={() => pickTheme(t)}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-sm font-semibold text-left"
              style={{ background: t.id === theme.id ? t.gradient : 'transparent', color: '#fff' }}>
              <span className="text-base">{t.emoji}</span>
              <span className="flex-1">{t.label}</span>
              {t.id === theme.id && <span className="text-xs">✓</span>}
            </button>
          ))}
        </div>
      )}

      {/* Live guidance banner */}
      {navigating && nextStep && (
        <div className="absolute left-3 right-3 rounded-2xl px-4 py-3 flex items-center gap-3"
          style={{ top: 70, background: theme.gradient, boxShadow: `0 8px 24px ${theme.accent}66` }}>
          <Navigation size={20} color="#fff" />
          <span className="text-sm font-bold text-white flex-1">{nextStep}</span>
        </div>
      )}

      {/* Routing status when not yet navigating */}
      {!navigating && nextStep && (
        <div className="absolute left-3 right-3 rounded-2xl px-4 py-2.5 flex items-center gap-2"
          style={{ top: 70, background: 'rgba(13,18,28,0.92)', border: '1px solid #2a2a38' }}>
          {routing && <span className="inline-block w-3 h-3 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0" style={{ borderColor: `${theme.accent} transparent ${theme.accent} ${theme.accent}` }} />}
          <span className="text-xs font-semibold" style={{ color: routing ? '#a78bfa' : '#f87171' }}>{nextStep}</span>
        </div>
      )}

      {/* Bottom route card */}
      {target && (
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <div className="rounded-2xl p-4" style={{ background: 'rgba(13,18,28,0.97)', border: '1px solid #2a2a38', backdropFilter: 'blur(20px)' }}>
            <div className="flex items-start gap-3 mb-3">
              <img src={target.image} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{target.caption.split('\n')[0]}</p>
                {target.location?.name && (
                  <p className="text-xs truncate mt-0.5" style={{ color: '#9aa0b5' }}>📍 {target.location.name}</p>
                )}
                {routeInfo && (
                  <p className="text-xs font-semibold mt-0.5" style={{ color: theme.accent }}>
                    {routeInfo.km} km · ~{routeInfo.min} min {profile === 'driving' ? '🚗' : '🚶'}
                  </p>
                )}
                {!routeInfo && routing && (
                  <p className="text-xs font-semibold mt-0.5 flex items-center gap-1.5" style={{ color: '#9aa0b5' }}>
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: `${theme.accent} transparent ${theme.accent} ${theme.accent}` }} />
                    Finding route…
                  </p>
                )}
                {!routeInfo && !routing && routeError && (
                  <p className="text-xs font-semibold mt-0.5" style={{ color: '#f87171' }}>Route unavailable — tap retry</p>
                )}
              </div>
              <button onClick={() => { stopGuidance(); setTarget(null); setRouteInfo(null); setSteps([]); stepsRef.current = []; }}
                style={{ color: '#555566' }}><X size={18} /></button>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={() => setProfile('driving')} className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: profile === 'driving' ? theme.accent : '#1a1a24', color: '#fff', border: '1px solid #2a2a38' }}>
                <Car size={16} />
              </button>
              <button onClick={() => setProfile('foot')} className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: profile === 'foot' ? theme.accent : '#1a1a24', color: '#fff', border: '1px solid #2a2a38' }}>
                <Footprints size={16} />
              </button>
              <button onClick={() => setVoiceOn(v => !v)} className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: voiceOn ? theme.accent : '#1a1a24', color: '#fff', border: '1px solid #2a2a38' }}>
                {voiceOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
              {!navigating ? (
                routeError && !routeInfo ? (
                  <button onClick={() => target && void buildRoute(target)}
                    className="flex-1 h-10 rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-white"
                    style={{ background: theme.gradient }}>
                    <Navigation size={16} /> Retry
                  </button>
                ) : (
                  <button onClick={startGuidance} disabled={!routeInfo}
                    className="flex-1 h-10 rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-white"
                    style={{ background: routeInfo ? theme.gradient : '#2a2a38', opacity: routeInfo ? 1 : 0.6 }}>
                    <Navigation size={16} /> {routing ? 'Calculating…' : 'Start'}
                  </button>
                )
              ) : (
                <button onClick={stopGuidance}
                  className="flex-1 h-10 rounded-xl flex items-center justify-center gap-2 text-sm font-bold text-white"
                  style={{ background: '#ef4444' }}>
                  <Flag size={16} /> End
                </button>
              )}
            </div>

            {/* Step list preview */}
            {steps.length > 0 && !navigating && (
              <div className="mt-3 max-h-28 overflow-y-auto flex flex-col gap-1.5">
                {steps.slice(0, 6).map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs" style={{ color: '#aab' }}>
                    <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: '#1a1a24', color: '#a78bfa', fontSize: 10 }}>{i + 1}</span>
                    {s.instruction}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {!target && (
        <div className="absolute left-3 right-3 bottom-6 rounded-2xl px-4 py-3 text-center"
          style={{ background: 'rgba(13,18,28,0.92)', border: '1px solid #2a2a38' }}>
          <p className="text-sm font-semibold text-white">Tap any pin to get directions 🧭</p>
          <p className="text-xs mt-0.5" style={{ color: '#888899' }}>Turn-by-turn with voice · satellite view available</p>
        </div>
      )}
    </div>
  );
}
