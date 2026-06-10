'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PHRASES = [
  'Your city. Rediscovered.',
  'Tonight\'s plans, sorted.',
  'Something\'s happening near you.',
  'Hidden gems, found for you.',
  'Let AI plan your evening.',
  'Never miss what matters.',
  'Find your next favourite place.',
  'AI that knows your taste.',
  'Your neighbourhood, unlocked.',
  'What\'s on tonight?',
  'Your evening starts here.',
  'Smarter discovery, every time.',
  'Live more. Discover more.',
  'Every city has a secret.',
  'The best night out, planned.',
  'From concerts to hidden cafés.',
  'Concerts, art, food — for you.',
  'Explore. Save. Go.',
  'Your personal city guide.',
  'Set reminders. Be there.',
  'Experiences worth sharing.',
  'Discover the unexpected.',
  'Something new is always near.',
  'Local gems, right on your feed.',
  'The city never sleeps.',
  'Always something new to find.',
  'Your feed knows you well.',
  'Events tailored to your taste.',
  'Never a boring evening again.',
  'The world is your playground.',
  'Great nights start with Nova.',
  'Curated just for you, always.',
  'Find friends. Find events.',
  'Save it. Then go.',
  'Your AI-powered night out.',
];

interface Props {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: Props) {
  const [phase, setPhase] = useState<'logo' | 'tagline' | 'exit'>('logo');
  // Pick once on mount — function initialiser runs only on first render
  const [phrase] = useState(() => PHRASES[Math.floor(Math.random() * PHRASES.length)]);

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
            <img
              src="/icon-512.png"
              alt="Nova"
              className="w-24 h-24 rounded-3xl mb-5 shadow-2xl"
              style={{ objectFit: 'cover' }}
            />

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

            {/* Random phrase — fades in after logo settles */}
            <AnimatePresence>
              {phase === 'tagline' && (
                <motion.p
                  key={phrase}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="text-sm font-medium mt-2 text-center px-8"
                  style={{ color: 'rgba(200,190,220,0.75)' }}
                >
                  {phrase}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>

          {/* by Leone Nero */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            transition={{ delay: 1.2, duration: 0.6 }}
            className="absolute bottom-12 text-xs font-medium"
            style={{ color: 'rgba(200,190,220,0.5)' }}
          >
            by Leone Nero
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
