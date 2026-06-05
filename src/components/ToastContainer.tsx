'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useApp } from '@/context/AppContext';

export default function ToastContainer() {
  const { toasts, removeToast } = useApp();

  return (
    <div className="fixed bottom-24 left-0 right-0 z-50 flex flex-col items-center gap-2 pointer-events-none px-4">
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
