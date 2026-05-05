'use client';

import { useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import SplashScreen from '@/components/SplashScreen';
import BottomNav, { Tab } from '@/components/BottomNav';
import FeedTab from '@/components/FeedTab';
import SearchTab from '@/components/SearchTab';
import NotificationsTab from '@/components/NotificationsTab';
import ProfileTab from '@/components/ProfileTab';
import { UserPreferences } from '@/types';
import { DEFAULT_PREFERENCES, MOCK_NOTIFICATIONS } from '@/data/mockData';

// Create tab — show a modal/sheet
function CreateSheet({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="w-full rounded-t-3xl overflow-hidden pb-10"
        style={{ background: '#13131a', border: '1px solid #2a2a38' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full mx-auto mt-3 mb-5" style={{ background: '#2a2a38' }} />
        <p className="text-center text-base font-bold text-white mb-6">Create</p>
        {[
          { emoji: '📸', label: 'Post', sub: 'Share a photo or video' },
          { emoji: '🎬', label: 'Reel', sub: 'Create a short video' },
          { emoji: '🌐', label: 'Story', sub: 'Share a moment for 24h' },
          { emoji: '🔴', label: 'Go Live', sub: 'Broadcast to your followers' },
        ].map(({ emoji, label, sub }) => (
          <button
            key={label}
            className="w-full flex items-center gap-4 px-6 py-4"
            style={{ borderBottom: '1px solid #1a1a24' }}
            onClick={onClose}
          >
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl flex-shrink-0"
              style={{ background: '#1a1a24' }}
            >
              {emoji}
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">{label}</p>
              <p className="text-xs mt-0.5" style={{ color: '#888899' }}>{sub}</p>
            </div>
          </button>
        ))}
      </motion.div>
    </motion.div>
  );
}

const TAB_ORDER: Tab[] = ['feed', 'search', 'create', 'notifications', 'profile'];

export default function Page() {
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('feed');
  const [showCreate, setShowCreate] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES as UserPreferences);

  const unreadCount = MOCK_NOTIFICATIONS.filter((n) => !n.read).length;

  const handleTabChange = useCallback((tab: Tab) => {
    if (tab === 'create') {
      setShowCreate(true);
    } else {
      setActiveTab(tab);
    }
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
            {activeTab === 'notifications' && <NotificationsTab />}
            {activeTab === 'profile' && (
              <ProfileTab
                preferences={preferences}
                onPreferencesChange={setPreferences}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom navigation */}
      <BottomNav
        active={activeTab}
        onChange={handleTabChange}
        notifCount={unreadCount}
      />

      {/* Create sheet */}
      <AnimatePresence>
        {showCreate && <CreateSheet onClose={() => setShowCreate(false)} />}
      </AnimatePresence>
    </div>
  );
}
