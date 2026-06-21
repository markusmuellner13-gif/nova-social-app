'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Send, MapPin, Loader2 } from 'lucide-react';
import { LocationState } from '@/types';

interface Message {
  role: 'user' | 'ai';
  text: string;
}

interface Props {
  location: LocationState | null;
}

const QUICK_PROMPTS = [
  'What\'s on this weekend?',
  'Best live music tonight?',
  'Free events nearby?',
  'Any food markets soon?',
];

export default function AIChatBar({ location }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
      if (messages.length === 0) {
        setMessages([{
          role: 'ai',
          text: `Hey! 👋 I'm Nova AI.\n\nAsk me what's happening ${location?.city ? `in ${location.city}` : 'near you'} — concerts, markets, exhibitions, clubs, meetups, anything. I'm here to help you discover your city.`,
        }]);
      }
    }
  }, [open, location, messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: msg }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          city: location?.city,
          country: location?.country,
          lat: location?.lat,
          lng: location?.lng,
        }),
      });
      const data = await res.json();
      setMessages((prev) => [...prev, { role: 'ai', text: data.reply ?? 'No response — try again.' }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', text: 'Connection error — please try again in a moment.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setOpen(true)}
            className="fixed right-4 z-30 flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-xl"
            style={{
              bottom: 100,
              background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
              boxShadow: '0 4px 20px rgba(139,92,246,0.5)',
            }}
          >
            <Sparkles size={16} color="white" />
            <span className="text-sm font-bold text-white">Ask Nova AI</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat sheet */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              style={{ background: 'rgba(0,0,0,0.55)' }}
              onClick={() => setOpen(false)}
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 35 }}
              className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl"
              style={{ height: '70dvh', background: '#0d0d16', borderTop: '1px solid #2a2a38' }}
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 flex-shrink-0">
                <div className="w-10 h-1 rounded-full" style={{ background: '#2a2a38' }} />
              </div>

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #1e1e2a' }}>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                    <Sparkles size={16} color="white" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">Nova AI</p>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />
                      {location?.city ? (
                        <span className="text-xs" style={{ color: '#555566' }}>
                          <MapPin size={9} className="inline mr-0.5" style={{ color: '#8b5cf6' }} />
                          {location.city}
                        </span>
                      ) : (
                        <span className="text-xs" style={{ color: '#555566' }}>Events & Activities AI</span>
                      )}
                    </div>
                  </div>
                </div>
                <motion.button whileTap={{ scale: 0.85 }} onClick={() => setOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#1a1a24' }}>
                  <X size={16} style={{ color: '#888899' }} />
                </motion.button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {m.role === 'ai' && (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center mr-2 flex-shrink-0 mt-0.5" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                        <Sparkles size={12} color="white" />
                      </div>
                    )}
                    <div
                      className="max-w-[80%] px-3 py-2.5 rounded-2xl text-sm leading-relaxed"
                      style={{
                        background: m.role === 'user' ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : '#1a1a24',
                        color: 'white',
                        borderRadius: m.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                        whiteSpace: 'pre-line',
                      }}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                      <Loader2 size={12} color="white" className="animate-spin" />
                    </div>
                    <div className="px-3 py-2 rounded-2xl" style={{ background: '#1a1a24' }}>
                      <div className="flex gap-1">
                        {[0, 1, 2].map((d) => (
                          <motion.div key={d} className="w-1.5 h-1.5 rounded-full" style={{ background: '#8b5cf6' }}
                            animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: d * 0.15 }} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>

              {/* Quick prompts */}
              {messages.length <= 1 && (
                <div className="flex gap-2 px-4 pb-2 overflow-x-auto flex-shrink-0">
                  {QUICK_PROMPTS.map((p) => (
                    <motion.button
                      key={p}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => send(p)}
                      className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold"
                      style={{ background: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.25)' }}
                    >
                      {p}
                    </motion.button>
                  ))}
                </div>
              )}

              {/* Input */}
              <div
                className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
                style={{ borderTop: '1px solid #1e1e2a', background: '#0d0d16' }}
              >
                <div className="flex-1 flex items-center gap-2 rounded-2xl px-3 py-2.5" style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}>
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder={`What's on in ${location?.city ?? 'your city'}?`}
                    className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#444455]"
                  />
                </div>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => send()}
                  disabled={!input.trim() || loading}
                  className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: input.trim() && !loading ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : '#1a1a24',
                    opacity: input.trim() && !loading ? 1 : 0.5,
                  }}
                >
                  <Send size={16} color="white" />
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
