'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Send, MapPin, Loader2 } from 'lucide-react';
import { LocationState } from '@/types';
import { apiUrl } from '@/lib/apiBase';

interface Message { role: 'user' | 'ai'; text: string }

interface Props { location: LocationState | null }

const QUICK_PROMPTS = [
  "What's on this weekend?",
  'Best live music tonight?',
  'Free events nearby?',
  'Any food markets soon?',
  'Art exhibitions this month?',
  'Things to do today?',
];

// Full-page Nova AI chatbot — answered for free by the on-device-friendly Nova
// Brain (server-side, reads our own events DB). Lives on its own tab.
export default function ChatTab({ location }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (messages.length === 0) {
      setMessages([{
        role: 'ai',
        text: `Hey! 👋 I'm Nova AI.\n\nAsk me what's happening ${location?.city ? `in ${location.city}` : 'near you'} — concerts, markets, exhibitions, clubs, meetups, sports, anything. I read Nova's live local listings to answer you.`,
      }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location?.city]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: msg }]);
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/chat'), {
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
      setMessages(prev => [...prev, { role: 'ai', text: data.reply ?? 'No response — try again.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'ai', text: 'Connection error — please try again in a moment.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glass flex items-center gap-2 px-4 flex-shrink-0" style={{ height: 56, borderBottom: '1px solid #1e1e2a' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
          <Sparkles size={16} color="white" />
        </div>
        <div>
          <p className="text-sm font-bold text-white">Nova AI</p>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />
            {location?.city ? (
              <span className="text-xs" style={{ color: '#888899' }}>
                <MapPin size={9} className="inline mr-0.5" style={{ color: '#8b5cf6' }} />
                {location.city}
              </span>
            ) : (
              <span className="text-xs" style={{ color: '#888899' }}>Events &amp; Activities AI</span>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="tab-content flex-1 overflow-y-auto px-4 py-3">
        <div className="flex flex-col justify-end min-h-full space-y-3">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'ai' && (
              <div className="w-7 h-7 rounded-full flex items-center justify-center mr-2 flex-shrink-0 mt-0.5" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                <Sparkles size={12} color="white" />
              </div>
            )}
            <div
              className="max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
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
                {[0, 1, 2].map(d => (
                  <motion.div key={d} className="w-1.5 h-1.5 rounded-full" style={{ background: '#8b5cf6' }}
                    animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 0.8, delay: d * 0.15 }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
        </div>
      </div>

      {/* Quick prompts */}
      {messages.length <= 1 && (
        <div className="flex gap-2 px-4 pb-2 overflow-x-auto flex-shrink-0">
          {QUICK_PROMPTS.map(p => (
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
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid #1e1e2a', background: '#0d0d16', marginBottom: 'calc(env(safe-area-inset-bottom, 0px) + 52px)' }}>
        <div className="flex-1 flex items-center gap-2 rounded-2xl px-3 py-2.5" style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={`What's on in ${location?.city ?? 'your city'}?`}
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#444455]"
          />
        </div>
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={() => send()}
          disabled={!input.trim() || loading}
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: input.trim() && !loading ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : '#1a1a24', opacity: input.trim() && !loading ? 1 : 0.5 }}
        >
          <Send size={16} color="white" />
        </motion.button>
      </div>
    </div>
  );
}
