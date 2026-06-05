'use client';

import { motion } from 'framer-motion';
import { MapPin, X, Sparkles } from 'lucide-react';

interface Props {
  onEnable: () => void;
  onDismiss: () => void;
}

export default function LocationPermissionPrompt({ onEnable, onDismiss }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center px-4 pb-8"
      style={{ background: 'rgba(0,0,0,0.65)' }}
    >
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className="w-full max-w-sm rounded-3xl p-6"
        style={{ background: '#13131a', border: '1px solid #2a2a38' }}
      >
        {/* Icon */}
        <div className="flex items-center justify-between mb-4">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
            <MapPin size={28} color="white" />
          </div>
          <button onClick={onDismiss} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#1a1a24' }}>
            <X size={16} style={{ color: '#888899' }} />
          </button>
        </div>

        <h2 className="text-xl font-bold text-white mb-2">Enable location</h2>
        <p className="text-sm leading-relaxed mb-5" style={{ color: '#888899' }}>
          Nova AI uses your location to surface the most relevant local events, concerts, markets, and experiences happening right where you are — updated in real time.
        </p>

        {/* Benefits */}
        <div className="flex flex-col gap-2 mb-5">
          {[
            { icon: '🎵', text: 'Concerts & club nights near you' },
            { icon: '🍕', text: 'Food festivals & markets in your city' },
            { icon: '🎨', text: 'Art openings & cultural events nearby' },
            { icon: '📍', text: 'Location only used on your device' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3 px-3 py-2 rounded-xl" style={{ background: 'rgba(139,92,246,0.07)', border: '1px solid rgba(139,92,246,0.12)' }}>
              <span style={{ fontSize: 16 }}>{icon}</span>
              <span className="text-sm font-medium" style={{ color: '#c4b5fd' }}>{text}</span>
            </div>
          ))}
        </div>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onEnable}
          className="w-full py-4 rounded-2xl text-base font-bold text-white flex items-center justify-center gap-2 mb-3"
          style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
        >
          <Sparkles size={18} />
          Enable for the best experience
        </motion.button>

        <button
          onClick={onDismiss}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-center"
          style={{ color: '#555566' }}
        >
          Maybe later
        </button>
      </motion.div>
    </motion.div>
  );
}
