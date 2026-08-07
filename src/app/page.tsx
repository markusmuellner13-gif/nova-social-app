'use client';

import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import SplashScreen from '@/components/SplashScreen';
import BottomNav, { Tab } from '@/components/BottomNav';
import FeedTab from '@/components/FeedTab';
import SearchTab from '@/components/SearchTab';
import NotificationsTab from '@/components/NotificationsTab';
import ProfileTab from '@/components/ProfileTab';
import GroupsTab from '@/components/GroupsTab';
import AuthModal from '@/components/AuthModal';
import CityExplorer from '@/components/CityExplorer';
import ToastContainer from '@/components/ToastContainer';
import ChatTab from '@/components/ChatTab';
import LocationPermissionPrompt from '@/components/LocationPermissionPrompt';
import { useApp, setSupabaseUser } from '@/context/AppContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { LanguageProvider, useLanguage } from '@/context/LanguageContext';
import { getUserInteractions } from '@/lib/supabase';
import { setFriendsGoingUser } from '@/lib/friendsGoing';
import ErrorBoundary from '@/components/ErrorBoundary';
import Onboarding from '@/components/Onboarding';
import { useLocation } from '@/hooks/useLocation';
import { initNotifications, subscribeToPush, setAppBadge, clearAppBadge, dismissActiveNotifications } from '@/lib/notifications';
import { getTopCategories } from '@/lib/aiEngine';
import { LocationState, Post } from '@/types';

function AppShell() {
  const { state, unreadCount, setLocation, markSeenLocationPrompt, syncInteractions } = useApp();
  const { user } = useAuth();
  const { locale } = useLanguage();
  const [splashDone,         setSplashDone]         = useState(false);
  const [activeTab,          setActiveTab]           = useState<Tab>('feed');
  const [showAuth,           setShowAuth]            = useState(false);
  const [showCityExplorer,   setShowCityExplorer]    = useState(false);
  const [showLocationPrompt, setShowLocationPrompt]  = useState(false);
  const [showNotifications,  setShowNotifications]   = useState(false);

  const { location, permission, requestLocation, setManualLocation } = useLocation();
  const handleSplashComplete = useCallback(() => setSplashDone(true), []);

  // Register the service worker once. Safe no-op when unsupported.
  useEffect(() => {
    void initNotifications();
  }, []);

  // Clear any lingering OS notification banners whenever the app is opened or
  // brought to the foreground — not just when the user taps a notification
  // directly. Without this, reading a post from inside the app leaves the
  // banner sitting in the notification tray/lock-screen indefinitely.
  useEffect(() => {
    function handleForeground() {
      if (document.visibilityState === 'visible') {
        void dismissActiveNotifications();
      }
    }
    handleForeground();
    document.addEventListener('visibilitychange', handleForeground);
    window.addEventListener('focus', handleForeground);
    return () => {
      document.removeEventListener('visibilitychange', handleForeground);
      window.removeEventListener('focus', handleForeground);
    };
  }, []);

  // Subscribe to web push with the user's city so the daily digest can send
  // "events near you". Re-runs when the city changes. Gated: no-ops without a
  // VAPID key. Depends only on the city so it doesn't re-fire on every render.
  useEffect(() => {
    const loc = state.location;
    if (!loc?.city) return;
    // Send the user's learned top interests too, so the daily push can be
    // personalised ("for the music lovers near you") instead of generic.
    const categories = getTopCategories(state.preferences, state.aiProfile, 3);
    // `locale` rides along so the server can write the whole notification in the
    // user's own language. Re-fires when they change it in Settings.
    void subscribeToPush({ city: loc.city, lat: loc.lat, lng: loc.lng, categories, userId: user?.id, locale });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.location?.city, user?.id, locale]);

  // Keep the app-icon badge in sync with unread notifications — like any other
  // app. While the notifications panel is open the user is actively reading them,
  // so we clear the icon badge immediately (the in-app unread dots stay until a
  // notification is actually read). No-op on platforms without the Badging API.
  useEffect(() => {
    if (showNotifications) clearAppBadge();
    else setAppBadge(unreadCount);
  }, [unreadCount, showNotifications]);

  // Sync Supabase user ID and load remote interactions when auth state changes
  useEffect(() => {
    setSupabaseUser(user?.id ?? null);
    setFriendsGoingUser(user?.id ?? null);
    if (user) {
      getUserInteractions(user.id).then(data => {
        if (data) syncInteractions({ ...data, posts: data.posts as unknown as Post[] });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Mirror the useLocation state (device GPS *and* hand-picked cities) into the
  // global context. Depends ONLY on `location` — not on `setLocation`, whose
  // identity changes every render and would otherwise re-fire this effect and
  // re-push a stale GPS city over a city the user just picked by hand.
  useEffect(() => {
    if (location && location.enabled) setLocation(location);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.city, location?.lat, location?.lng]);

  // Show location prompt once after onboarding
  useEffect(() => {
    if (splashDone && state.hasOnboarded && !state.hasSeenLocationPrompt && !state.location?.city && permission === 'prompt') {
      const t = setTimeout(() => setShowLocationPrompt(true), 1500);
      return () => clearTimeout(t);
    }
  }, [splashDone, state.hasOnboarded, state.hasSeenLocationPrompt, permission]);

  async function handleEnableLocation() {
    setShowLocationPrompt(false);
    markSeenLocationPrompt();
    await requestLocation();
  }

  function handleDismissLocation() {
    setShowLocationPrompt(false);
    markSeenLocationPrompt();
  }

  function handleManualCity(loc: LocationState) {
    // Push straight into context so the feed reloads instantly for the new city…
    setLocation({ ...loc, enabled: true });
    // …and into the useLocation hook's own state so the sync effect above stays
    // consistent (otherwise the next GPS tick would clobber the choice). This
    // also persists it as a sticky manual pick that survives reloads.
    setManualLocation(loc);
  }

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
  }, []);

  if (!splashDone) return <SplashScreen onComplete={handleSplashComplete} />;
  if (!state.hasOnboarded) return <Onboarding onRequestLocation={requestLocation} locationGranted={permission === 'granted'} />;

  return (
    <div className="app-frame" style={{
      position: 'fixed', inset: 0, background: '#0a0a0f',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
      // Sit the app just below the status bar / notch using only the device's
      // own safe-area inset, so the top bar rides high without being jammed
      // against the edge. The bottom nav handles its own inset.
      paddingTop: 'env(safe-area-inset-top, 0px)',
    }}>
      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: 'easeInOut' }}
            style={{ position: 'absolute', inset: 0 }}>
            <ErrorBoundary>
              {activeTab === 'feed'    && <FeedTab onOpenLocationPrompt={() => setShowLocationPrompt(true)} onOpenCityExplorer={() => setShowCityExplorer(true)} onOpenNotifications={() => setShowNotifications(true)} locationLoading={permission === 'loading'} />}
              {activeTab === 'explore' && <SearchTab />}
              {activeTab === 'groups'  && <GroupsTab onOpenAuth={() => setShowAuth(true)} />}
              {activeTab === 'chat'    && <ChatTab location={state.location} />}
              {activeTab === 'profile' && <ProfileTab onOpenAuth={() => setShowAuth(true)} />}
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </div>

      <BottomNav active={activeTab} onChange={handleTabChange} />
      <ToastContainer />

      {/* Notifications — opened from the header bell (Instagram-style) */}
      <AnimatePresence>
        {showNotifications && (
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-40"
            style={{ background: '#0a0a0f', paddingTop: 'env(safe-area-inset-top, 0px)' }}
          >
            <NotificationsTab onClose={() => setShowNotifications(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Auth modal */}
      <AnimatePresence>
        {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      </AnimatePresence>

      {/* City explorer */}
      <AnimatePresence>
        {showCityExplorer && (
          <CityExplorer
            currentCity={state.location?.city ?? ''}
            onSelectCity={handleManualCity}
            onClose={() => setShowCityExplorer(false)}
          />
        )}
      </AnimatePresence>

      {/* Location permission prompt */}
      <AnimatePresence>
        {showLocationPrompt && (
          <LocationPermissionPrompt onEnable={handleEnableLocation} onDismiss={handleDismissLocation} />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Page() {
  return (
    <LanguageProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </LanguageProvider>
  );
}
