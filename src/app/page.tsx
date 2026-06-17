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
import AIChatBar from '@/components/AIChatBar';
import LocationPermissionPrompt from '@/components/LocationPermissionPrompt';
import { useApp, setSupabaseUser } from '@/context/AppContext';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { LanguageProvider } from '@/context/LanguageContext';
import { getUserInteractions } from '@/lib/supabase';
import ErrorBoundary from '@/components/ErrorBoundary';
import { useLocation, persistManualLocation } from '@/hooks/useLocation';
import { initNotifications, subscribeToPush } from '@/lib/notifications';
import { LocationState, Post } from '@/types';

function AppShell() {
  const { state, setLocation, markSeenLocationPrompt, syncInteractions } = useApp();
  const { user } = useAuth();
  const [splashDone,         setSplashDone]         = useState(false);
  const [activeTab,          setActiveTab]           = useState<Tab>('feed');
  const [showAuth,           setShowAuth]            = useState(false);
  const [showCityExplorer,   setShowCityExplorer]    = useState(false);
  const [showLocationPrompt, setShowLocationPrompt]  = useState(false);

  const { location, permission, requestLocation } = useLocation();
  const handleSplashComplete = useCallback(() => setSplashDone(true), []);

  // Register the service worker once and (if a push backend is configured)
  // subscribe to web push. Safe no-op when unsupported/unconfigured.
  useEffect(() => {
    void initNotifications().then(() => { void subscribeToPush(); });
  }, []);

  // Sync Supabase user ID and load remote interactions when auth state changes
  useEffect(() => {
    setSupabaseUser(user?.id ?? null);
    if (user) {
      getUserInteractions(user.id).then(data => {
        if (data) syncInteractions({ ...data, posts: data.posts as unknown as Post[] });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Sync geolocation into context
  useEffect(() => {
    if (location && location.enabled) setLocation(location);
  }, [location, setLocation]);

  // Show location prompt once after onboarding
  useEffect(() => {
    if (splashDone && state.hasOnboarded && !state.hasSeenLocationPrompt && permission === 'prompt') {
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
    setLocation(loc);
    // Sticky: the chosen city survives reloads and isn't overridden by GPS
    // until the user explicitly re-enables device location
    persistManualLocation(loc);
  }

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
  }, []);

  if (!splashDone) return <SplashScreen onComplete={handleSplashComplete} />;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0f', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: 'easeInOut' }}
            style={{ position: 'absolute', inset: 0 }}>
            <ErrorBoundary>
              {activeTab === 'feed'          && <FeedTab onOpenLocationPrompt={() => setShowLocationPrompt(true)} onOpenCityExplorer={() => setShowCityExplorer(true)} />}
              {activeTab === 'explore'       && <SearchTab />}
              {activeTab === 'groups'        && <GroupsTab onOpenAuth={() => setShowAuth(true)} />}
              {activeTab === 'notifications' && <NotificationsTab />}
              {activeTab === 'profile'       && <ProfileTab onOpenAuth={() => setShowAuth(true)} />}
            </ErrorBoundary>
          </motion.div>
        </AnimatePresence>
      </div>

      <BottomNav active={activeTab} onChange={handleTabChange} />
      <ToastContainer />
      <AIChatBar location={state.location} />

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
