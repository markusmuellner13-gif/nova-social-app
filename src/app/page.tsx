'use client';

import { useState, useCallback } from 'react';
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
import { useApp } from '@/context/AppContext';

function AppShell() {
  const { state } = useApp();
  const [splashDone, setSplashDone] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [prevTab, setPrevTab] = useState<Tab>('feed');
  const [showCreate, setShowCreate] = useState(false);

  const handleTabChange = useCallback((tab: Tab) => {
    if (tab === 'create') {
      setShowCreate(true);
      return;
    }
    setPrevTab(activeTab);
    setActiveTab(tab);
  }, [activeTab]);

  if (!splashDone) {
    return <SplashScreen onComplete={() => setSplashDone(true)} />;
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
            {activeTab === 'feed'          && <FeedTab />}
            {activeTab === 'explore'       && <SearchTab />}
            {activeTab === 'notifications' && <NotificationsTab />}
            {activeTab === 'profile'       && <ProfileTab />}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom navigation */}
      <BottomNav active={activeTab} onChange={handleTabChange} />

      {/* Toast container */}
      <ToastContainer />

      {/* Create sheet overlay */}
      <AnimatePresence>
        {showCreate && (
          <CreateTab
            onClose={() => setShowCreate(false)}
            onPosted={() => { setShowCreate(false); setActiveTab('feed'); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Page() {
  return <AppShell />;
}
