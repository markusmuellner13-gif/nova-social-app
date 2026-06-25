'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Loader2, Smile, Trash2, MessageCircle } from 'lucide-react';
import {
  GroupMessage, getGroupMessages, sendGroupMessage, deleteGroupMessage, subscribeGroupMessages,
} from '@/lib/supabase';
import { STICKER_PACKS, STICKER_PREFIX, isStickerBody, stickerGlyph } from '@/lib/stickers';
import { useApp } from '@/context/AppContext';
import Avatar from './Avatar';

interface Props {
  groupId: string;
  userId: string;
  authorName: string;
  authorAvatar: string;
}

function clockTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function dayLabel(iso: string): string {
  const d = new Date(iso); const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (sameDay) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

// A live, WhatsApp-style group chat: text + stickers, real-time delivery to every
// member via Supabase Realtime. Fills its parent (a flex column) with a scrolling
// thread and a pinned composer. Degrades to a friendly empty state when Supabase
// isn't configured.
export default function GroupChat({ groupId, userId, authorName, authorAvatar }: Props) {
  const { addToast } = useApp();
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activePack, setActivePack] = useState(STICKER_PACKS[0].id);

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  const scrollToBottom = useCallback((smooth = false) => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    });
  }, []);

  // Track whether the user is pinned to the bottom so incoming messages only
  // auto-scroll when they're already there (don't yank them up mid-scroll).
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  const upsert = useCallback((m: GroupMessage) => {
    setMessages(prev => {
      if (prev.some(x => x.id === m.id)) return prev;
      const next = [...prev, m].sort((a, b) => a.created_at.localeCompare(b.created_at));
      return next;
    });
  }, []);

  // Initial load + live subscription.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getGroupMessages(groupId)
      .then(rows => { if (!cancelled) { setMessages(rows); scrollToBottom(); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    const unsub = subscribeGroupMessages(groupId, m => {
      upsert(m);
      if (atBottomRef.current || m.user_id === userId) scrollToBottom(true);
    });
    return () => { cancelled = true; unsub(); };
  }, [groupId, userId, scrollToBottom, upsert]);

  async function send(kind: 'text' | 'sticker', raw: string) {
    const body = kind === 'sticker' ? raw : raw.trim();
    if (!body || sending) return;
    if (kind === 'text') setText('');
    setSending(true);
    // Optimistic bubble so it feels instant; reconciled by id when the row
    // (and its realtime echo) arrive.
    const tempId = `temp_${Date.now()}`;
    const optimistic: GroupMessage = {
      id: tempId, group_id: groupId, user_id: userId,
      author_name: authorName, author_avatar: authorAvatar,
      kind, body, created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    scrollToBottom(true);

    const row = await sendGroupMessage(groupId, userId, kind, body, authorName, authorAvatar);
    setMessages(prev => {
      const without = prev.filter(m => m.id !== tempId);
      if (!row) return without; // failed — drop the optimistic bubble
      if (without.some(m => m.id === row.id)) return without; // realtime already added it
      return [...without, row];
    });
    if (!row) {
      if (kind === 'text') setText(body);
      addToast('Could not send — check your connection', 'error', '⚠️');
    }
    setSending(false);
  }

  function pickSticker(id: string) {
    setPickerOpen(false);
    void send('sticker', `${STICKER_PREFIX}${id}`);
  }

  async function remove(m: GroupMessage) {
    setMessages(prev => prev.filter(x => x.id !== m.id));
    await deleteGroupMessage(m.id);
  }

  let lastDay = '';

  return (
    <div className="flex flex-col flex-1 min-h-0" style={{ background: '#0a0a0f' }}>
      {/* Thread */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin" style={{ color: '#8b5cf6' }} /></div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)' }}>
              <MessageCircle size={26} style={{ color: '#8b5cf6' }} />
            </div>
            <p className="text-sm font-semibold text-white">Say hi 👋</p>
            <p className="text-xs" style={{ color: '#666677' }}>This is the start of your group chat. Messages are visible to members only.</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const mine = m.user_id === userId;
            const prev = messages[i - 1];
            const grouped = prev && prev.user_id === m.user_id && (new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000);
            const day = dayLabel(m.created_at);
            const showDay = day !== lastDay; if (showDay) lastDay = day;
            const sticker = m.kind === 'sticker' || isStickerBody(m.body);

            return (
              <div key={m.id}>
                {showDay && (
                  <div className="flex justify-center my-3">
                    <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: '#15151f', color: '#888899' }}>{day}</span>
                  </div>
                )}
                <div className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''} ${grouped ? 'mt-0.5' : 'mt-2'}`}>
                  {/* Avatar gutter (others only, once per group) */}
                  {!mine && (
                    <div className="w-7 flex-shrink-0">
                      {!grouped && <Avatar src={m.author_avatar ?? ''} name={m.author_name ?? 'Member'} size={28} className="w-7 h-7 rounded-full" />}
                    </div>
                  )}
                  <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`} style={{ maxWidth: '76%' }}>
                    {!mine && !grouped && (
                      <span className="text-xs font-semibold mb-0.5 ml-1" style={{ color: '#9aa0b5' }}>{m.author_name ?? 'Member'}</span>
                    )}
                    {sticker ? (
                      <div className="group relative px-1">
                        <span style={{ fontSize: 56, lineHeight: 1 }}>{stickerGlyph(m.body)}</span>
                        <span className="block text-[10px] mt-0.5" style={{ color: '#555566', textAlign: mine ? 'right' : 'left' }}>{clockTime(m.created_at)}</span>
                        {mine && !m.id.startsWith('temp_') && (
                          <button onClick={() => remove(m)} className="absolute -top-1 -left-1 opacity-0 group-hover:opacity-100 p-1 rounded-full" style={{ background: '#1a1a24' }}>
                            <Trash2 size={11} style={{ color: '#888899' }} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="group relative px-3 py-2 rounded-2xl text-sm leading-snug break-words"
                        style={{
                          background: mine ? 'linear-gradient(135deg,#8b5cf6,#ec4899)' : '#1a1a24',
                          color: '#fff', border: mine ? 'none' : '1px solid #2a2a38',
                          borderBottomRightRadius: mine ? 5 : 16, borderBottomLeftRadius: mine ? 16 : 5,
                        }}>
                        <span style={{ whiteSpace: 'pre-wrap' }}>{m.body}</span>
                        <span className="block text-[10px] mt-0.5" style={{ color: mine ? 'rgba(255,255,255,0.7)' : '#555566', textAlign: 'right' }}>{clockTime(m.created_at)}</span>
                        {mine && !m.id.startsWith('temp_') && (
                          <button onClick={() => remove(m)} className="absolute -top-2 -left-2 opacity-0 group-hover:opacity-100 p-1 rounded-full" style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}>
                            <Trash2 size={11} style={{ color: '#888899' }} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Sticker picker */}
      <AnimatePresence>
        {pickerOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden flex-shrink-0" style={{ borderTop: '1px solid #1e1e2a', background: '#0d0d16' }}>
            <div className="flex gap-1 px-3 pt-2 overflow-x-auto">
              {STICKER_PACKS.map(p => (
                <button key={p.id} onClick={() => setActivePack(p.id)}
                  className="flex-shrink-0 px-2.5 py-1 rounded-full text-base"
                  style={{ background: activePack === p.id ? 'rgba(139,92,246,0.18)' : 'transparent', border: `1px solid ${activePack === p.id ? 'rgba(139,92,246,0.4)' : 'transparent'}` }}>
                  {p.emoji}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-6 gap-1 px-3 py-2" style={{ maxHeight: 168, overflowY: 'auto' }}>
              {(STICKER_PACKS.find(p => p.id === activePack) ?? STICKER_PACKS[0]).stickers.map(s => (
                <motion.button key={s.id} whileTap={{ scale: 0.85 }} onClick={() => pickSticker(s.id)}
                  aria-label={s.label} className="flex items-center justify-center rounded-xl py-1.5" style={{ fontSize: 30 }}>
                  {s.glyph}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer */}
      <div className="flex items-center gap-2 px-3 py-2.5 flex-shrink-0" style={{ borderTop: '1px solid #1e1e2a', background: '#0d0d16' }}>
        <button onClick={() => setPickerOpen(o => !o)} aria-label="Stickers"
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: pickerOpen ? 'rgba(139,92,246,0.18)' : '#1a1a24', border: '1px solid #2a2a38' }}>
          <Smile size={18} style={{ color: pickerOpen ? '#a78bfa' : '#888899' }} />
        </button>
        <div className="flex-1 flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onFocus={() => setPickerOpen(false)}
            onKeyDown={e => { if (e.key === 'Enter') send('text', text); }}
            maxLength={2000}
            placeholder="Message…"
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#444455]"
          />
        </div>
        <motion.button whileTap={{ scale: 0.85 }} onClick={() => send('text', text)} disabled={!text.trim() || sending}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: text.trim() ? 'linear-gradient(135deg,#8b5cf6,#ec4899)' : '#1a1a24', opacity: text.trim() ? 1 : 0.6 }}>
          {sending ? <Loader2 size={16} className="animate-spin" style={{ color: '#fff' }} /> : <Send size={16} style={{ color: '#fff' }} />}
        </motion.button>
      </div>
    </div>
  );
}
