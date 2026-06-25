'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Send, Loader2, MessageCircle, Trash2 } from 'lucide-react';
import {
  GroupEventComment, getGroupEventComments, addGroupEventComment, deleteGroupEventComment,
} from '@/lib/supabase';
import { useApp } from '@/context/AppContext';
import { timeAgo } from '@/data/mockData';
import Avatar from './Avatar';

interface Props {
  groupId: string;
  postId: string;
  eventTitle: string;
  eventImage?: string;
  userId: string;
  authorName: string;
  authorAvatar: string;
  onClose: () => void;
  onPosted?: () => void; // bump the parent's comment count
}

// A bottom-sheet discussion thread for a single group event — so a group can
// plan the night together (where to meet, who's driving) right on the event,
// not just RSVP. Reads/writes the group_event_comments table (members-only via
// RLS); degrades to a friendly empty state when Supabase isn't configured.
export default function GroupEventChat({
  groupId, postId, eventTitle, eventImage, userId, authorName, authorAvatar, onClose, onPosted,
}: Props) {
  const { addToast } = useApp();
  const [comments, setComments] = useState<GroupEventComment[]>([]);
  const [loading, setLoading]   = useState(true);
  const [text, setText]         = useState('');
  const [sending, setSending]   = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getGroupEventComments(groupId, postId)
      .then(rows => { if (!cancelled) { setComments(rows); scrollToBottom(); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [groupId, postId, scrollToBottom]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    setText('');
    const row = await addGroupEventComment(groupId, postId, userId, body, authorName, authorAvatar);
    if (row) {
      setComments(prev => [...prev, row]);
      onPosted?.();
      scrollToBottom();
    } else {
      setText(body); // restore so the message isn't lost
      addToast('Could not send — sign in and try again', 'error', '⚠️');
    }
    setSending(false);
  }

  async function remove(c: GroupEventComment) {
    setComments(prev => prev.filter(x => x.id !== c.id));
    await deleteGroupEventComment(c.id);
  }

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 35 }}
      className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-3xl overflow-hidden"
      style={{ height: '82dvh', background: '#0d0d16', borderTop: '1px solid #2a2a38' }}
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
        <div className="w-10 h-1 rounded-full" style={{ background: '#2a2a38' }} />
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2.5 flex-shrink-0" style={{ borderBottom: '1px solid #1e1e2a' }}>
        {eventImage && <img src={eventImage} alt="" className="w-10 h-10 rounded-xl object-cover flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <MessageCircle size={13} style={{ color: '#a78bfa' }} />
            <p className="text-xs font-bold" style={{ color: '#a78bfa' }}>Group discussion</p>
          </div>
          <p className="text-sm font-semibold text-white truncate">{eventTitle}</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#1a1a24' }}>
          <X size={16} style={{ color: '#888899' }} />
        </button>
      </div>

      {/* Thread */}
      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin" style={{ color: '#8b5cf6' }} /></div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
            <MessageCircle size={32} style={{ color: '#2a2a38' }} />
            <p className="text-sm font-semibold text-white">No messages yet</p>
            <p className="text-xs" style={{ color: '#666677' }}>Start the conversation — agree on a time, a meeting point, or who&apos;s in.</p>
          </div>
        ) : (
          comments.map(c => {
            const mine = c.user_id === userId;
            return (
              <div key={c.id} className={`flex items-end gap-2 mb-3 ${mine ? 'flex-row-reverse' : ''}`}>
                <Avatar src={c.author_avatar ?? ''} name={c.author_name ?? 'Member'} size={28} className="w-7 h-7 rounded-full flex-shrink-0" />
                <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`} style={{ maxWidth: '75%' }}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold" style={{ color: '#9aa0b5' }}>{mine ? 'You' : (c.author_name ?? 'Member')}</span>
                    <span className="text-xs" style={{ color: '#444455' }}>{timeAgo(new Date(c.created_at).getTime())}</span>
                  </div>
                  <div className="px-3 py-2 rounded-2xl text-sm leading-snug"
                    style={{ background: mine ? 'linear-gradient(135deg,#8b5cf6,#ec4899)' : '#1a1a24', color: '#fff', border: mine ? 'none' : '1px solid #2a2a38', borderBottomRightRadius: mine ? 4 : 16, borderBottomLeftRadius: mine ? 16 : 4 }}>
                    {c.body}
                  </div>
                  {mine && (
                    <button onClick={() => remove(c)} className="flex items-center gap-1 mt-1 text-xs" style={{ color: '#555566' }}>
                      <Trash2 size={11} /> Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ borderTop: '1px solid #1e1e2a', background: '#0d0d16' }}>
        <div className="flex-1 flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}>
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            maxLength={1000}
            placeholder="Message the group…"
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#444455]"
          />
          {text.trim() && (
            <motion.button initial={{ scale: 0 }} animate={{ scale: 1 }} whileTap={{ scale: 0.85 }} onClick={send} disabled={sending}>
              {sending ? <Loader2 size={16} className="animate-spin" style={{ color: '#a78bfa' }} /> : <Send size={16} style={{ color: '#a78bfa' }} />}
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
