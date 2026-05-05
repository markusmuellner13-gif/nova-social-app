'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: Props) {
  const [phase, setPhase] = useState<'logo' | 'tagline' | 'exit'>('logo');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('tagline'), 900);
    const t2 = setTimeout(() => setPhase('exit'), 2200);
    const t3 = setTimeout(() => onComplete(), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {phase !== 'exit' ? (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{
            background: 'linear-gradient(160deg, #0d0618 0%, #120824 30%, #0a0a0f 60%, #06060e 100%)',
          }}
        >
          {/* Background glow orbs */}
          <div
            className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl pointer-events-none"
            style={{ width: 280, height: 280, background: 'rgba(139,92,246,0.18)' }}
          />
          <div
            className="absolute top-1/2 left-1/3 rounded-full blur-3xl pointer-events-none"
            style={{ width: 200, height: 200, background: 'rgba(236,72,153,0.12)' }}
          />

          {/* Logo mark */}
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center"
          >
            {/* Icon */}
            <div
              className="w-24 h-24 rounded-3xl flex items-center justify-center mb-5 shadow-2xl"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
            >
              <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
                <path
                  d="M26 6 L42 20 L42 42 L10 42 L10 20 Z"
                  fill="none" stroke="white" strokeWidth="3" strokeLinejoin="round"
                />
                <circle cx="26" cy="28" r="6" fill="white" opacity="0.9" />
                <path d="M18 20 Q26 12 34 20" stroke="white" strokeWidth="2.5" fill="none" strokeLinecap="round" />
              </svg>
            </div>

            {/* App name */}
            <motion.h1
              className="text-5xl font-bold tracking-tight"
              style={{
                background: 'linear-gradient(135deg, #c4b5fd, #f0abfc, #fbcfe8)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Nova
            </motion.h1>

            {/* Tagline */}
            <AnimatePresence>
              {phase === 'tagline' && (
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="text-sm font-medium mt-2"
                  style={{ color: 'rgba(200,190,220,0.7)' }}
                >
                  Share your moment with the world
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Bottom from-meta label */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            transition={{ delay: 1.2, duration: 0.6 }}
            className="absolute bottom-12 text-xs font-medium"
            style={{ color: 'rgba(200,190,220,0.5)' }}
          >
            from Nova Labs
          </motion.p>

          {/* Loading bar */}
          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 h-0.5 rounded-full overflow-hidden"
            style={{ width: 80, background: 'rgba(255,255,255,0.1)' }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #8b5cf6, #ec4899)' }}
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 2, ease: 'easeInOut' }}
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
