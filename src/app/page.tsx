'use client';

import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import SplashScreen from '@/components/SplashScreen';
import BottomNav, { Tab } from '@/components/BottomNav';
import FeedTab from '@/components/FeedTab';
import SearchTab from '@/components/SearchTab';
import SavedTab from '@/components/SavedTab';
import PreferencesTab from '@/components/PreferencesTab';
import { UserPreferences } from '@/types';
import { DEFAULT_PREFERENCES } from '@/data/mockData';

export default function Page() {
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES as UserPreferences);

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
  }, []);

  if (!ready) {
    return <SplashScreen onComplete={() => setReady(true)} />;
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
            {activeTab === 'feed' && <FeedTab preferences={preferences} />}
            {activeTab === 'search' && <SearchTab />}
            {activeTab === 'saved' && <SavedTab />}
            {activeTab === 'preferences' && (
              <PreferencesTab
                preferences={preferences}
                onPreferencesChange={setPreferences}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom navigation */}
      <BottomNav active={activeTab} onChange={handleTabChange} />
    </div>
  );
}
