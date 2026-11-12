'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '@/context/AppContext';
import { NAV_CLEARANCE } from './BottomNav';

export default function ToastContainer() {
  const { toasts, removeToast } = useApp();

  return (
    // Floats a fixed distance above the bottom nav on every device, rather than
    // a guessed 96px that sat on top of the bar where the bar is taller.
    <div className="fixed left-0 right-0 z-[60] flex flex-col items-center gap-2 pointer-events-none px-4"
      style={{ bottom: `calc(${NAV_CLEARANCE} + 16px)` }}>
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={() => removeToast(toast.id)}
            className="pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold shadow-xl cursor-pointer"
            style={{
              background: toast.type === 'error' ? '#ef4444' : toast.type === 'info' ? 'rgba(30,30,45,0.96)' : 'rgba(20,20,30,0.97)',
              border: '1px solid rgba(139,92,246,0.3)',
              color: 'white',
              backdropFilter: 'blur(20px)',
              maxWidth: 320,
            }}
          >
            {toast.icon && <span style={{ fontSize: 16 }}>{toast.icon}</span>}
            <span>{toast.message}</span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
