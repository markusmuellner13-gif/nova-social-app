'use client';

import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import SplashScreen from '@/components/SplashScreen';
import BottomNav, { Tab } from '@/components/BottomNav';
import FeedTab from '@/components/FeedTab';
import SearchTab from '@/components/SearchTab';
import NotificationsTab from '@/components/NotificationsTab';
import ProfileTab from '@/components/ProfileTab';
import Onboarding from '@/components/Onboarding';
import CreateTab from '@/components/CreateTab';
import ToastContainer from '@/components/ToastContainer';
import AIChatBar from '@/components/AIChatBar';
import LocationPermissionPrompt from '@/components/LocationPermissionPrompt';
import { useApp } from '@/context/AppContext';
import { useLocation } from '@/hooks/useLocation';

function AppShell() {
  const { state, setLocation, markSeenLocationPrompt } = useApp();
  const [splashDone, setSplashDone] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [showCreate, setShowCreate] = useState(false);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);

  const { location, permission, requestLocation } = useLocation();

  const handleSplashComplete = useCallback(() => setSplashDone(true), []);

  // Sync geolocation into context
  useEffect(() => {
    if (location && location.enabled) {
      setLocation(location);
    }
  }, [location, setLocation]);

  // Show location prompt once after onboarding if not yet seen
  useEffect(() => {
    if (
      splashDone &&
      state.hasOnboarded &&
      !state.hasSeenLocationPrompt &&
      permission === 'prompt'
    ) {
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

  const handleTabChange = useCallback((tab: Tab) => {
    if (tab === 'create') { setShowCreate(true); return; }
    setActiveTab(tab);
  }, []);

  if (!splashDone) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  if (!state.hasOnboarded) {
    return <Onboarding />;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0a0a0f',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Tab content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            style={{ position: 'absolute', inset: 0 }}
          >
            {activeTab === 'feed'          && <FeedTab onOpenLocationPrompt={() => setShowLocationPrompt(true)} />}
            {activeTab === 'explore'       && <SearchTab />}
            {activeTab === 'notifications' && <NotificationsTab />}
            {activeTab === 'profile'       && <ProfileTab />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom navigation */}
      <BottomNav active={activeTab} onChange={handleTabChange} />

      {/* Toasts */}
      <ToastContainer />

      {/* AI Chat (visible when not in create flow) */}
      {!showCreate && (
        <AIChatBar location={state.location} />
      )}

      {/* Create sheet */}
      <AnimatePresence>
        {showCreate && (
          <CreateTab
            onClose={() => setShowCreate(false)}
            onPosted={() => { setShowCreate(false); setActiveTab('feed'); }}
          />
        )}
      </AnimatePresence>

      {/* Location permission prompt */}
      <AnimatePresence>
        {showLocationPrompt && (
          <LocationPermissionPrompt
            onEnable={handleEnableLocation}
            onDismiss={handleDismissLocation}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Page() {
  return <AppShell />;
}
