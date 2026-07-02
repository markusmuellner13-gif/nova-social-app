'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Heart, Send, Star, Loader2, LogIn, Trash2 } from 'lucide-react';
import { Post } from '@/types';
import { timeAgo } from '@/data/appDefaults';
import { useApp } from '@/context/AppContext';
import { useAuth } from '@/context/AuthContext';
import { getPostComments, addPostComment, deletePostComment, PostComment } from '@/lib/supabase';
import AuthModal from './AuthModal';
import Avatar from './Avatar';

interface Props {
  post: Post;
  onClose: () => void;
}

// Real comments only: loaded from and written to the backend, signed with the
// commenter's real profile. Nothing generated, nothing session-local.
export default function CommentsSheet({ post, onClose }: Props) {
  const { isLiked, likePost, isSaved, savePost, addToast } = useApp();
  const { user, profile, isSupabaseEnabled } = useAuth();
  const [comments, setComments] = useState<PostComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const liked = isLiked(post.id);
  const saved = isSaved(post.id);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getPostComments(post.id)
      .then(rows => { if (active) setComments(rows); })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [post.id]);

  async function submitComment() {
    const text = commentText.trim();
    if (!text || sending) return;
    if (!user) { setShowAuth(true); return; }
    setSending(true);
    const authorName = profile?.display_name ?? profile?.username ?? user.email?.split('@')[0] ?? 'Nova user';
    const inserted = await addPostComment(post.id, user.id, text, authorName, profile?.avatar_url ?? undefined);
    setSending(false);
    if (inserted) {
      setComments(prev => [...prev, inserted]);
      setCommentText('');
      addToast('Comment posted', 'success', '💬');
    } else {
      addToast('Could not post comment — try again', 'error');
    }
  }

  async function removeComment(id: string) {
    setComments(prev => prev.filter(c => c.id !== id));
    await deletePostComment(id);
    addToast('Comment deleted', 'info');
  }

  return (
    <>
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 300, damping: 35 }}
      className="fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-3xl overflow-hidden"
      style={{ height: '85dvh', background: '#0d0d16', borderTop: '1px solid #2a2a38' }}
    >
      {/* Drag handle */}
      <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
        <div className="w-10 h-1 rounded-full" style={{ background: '#2a2a38' }} />
      </div>

      {/* Header with close */}
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0" style={{ borderBottom: '1px solid #1e1e2a' }}>
        <h3 className="text-base font-bold text-white">
          Comments{comments.length > 0 ? ` · ${comments.length}` : ''}
        </h3>
        <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: '#1a1a24' }}>
          <X size={16} style={{ color: '#888899' }} />
        </button>
      </div>

      {/* Post mini-header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0" style={{ borderBottom: '1px solid #1a1a24' }}>
        <img src={post.image} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white truncate">@{post.user.username}</p>
          <p className="text-xs mt-0.5 line-clamp-2 leading-snug" style={{ color: '#888899' }}>{post.caption}</p>
        </div>
        {/* Quick actions */}
        <div className="flex gap-3 flex-shrink-0">
          <button
            onClick={() => { likePost(post); }}
            className="flex flex-col items-center gap-0.5"
          >
            <Star
              size={22}
              fill={liked ? '#f59e0b' : 'none'}
              style={{ color: liked ? '#f59e0b' : '#888899' }}
              className={liked ? 'heart-pop' : ''}
            />
            <span className="text-xs" style={{ color: liked ? '#f59e0b' : '#555566' }}>{liked ? 'Loved' : 'Like'}</span>
          </button>
          <button
            onClick={() => {
              savePost(post);
              if (!saved) addToast('Saved to collection', 'success', '🔖');
            }}
            className="flex flex-col items-center gap-0.5"
          >
            <Heart
              size={22}
              fill={saved ? '#8b5cf6' : 'none'}
              style={{ color: saved ? '#8b5cf6' : '#888899' }}
            />
            <span className="text-xs" style={{ color: saved ? '#8b5cf6' : '#555566' }}>{saved ? 'Saved' : 'Save'}</span>
          </button>
        </div>
      </div>

      {/* Comments list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-8">
            <Loader2 size={16} className="animate-spin" style={{ color: '#8b5cf6' }} />
            <span className="text-xs" style={{ color: '#555566' }}>Loading comments…</span>
          </div>
        )}
        {!loading && comments.length === 0 && (
          <p className="text-center text-sm py-8" style={{ color: '#555566' }}>
            No comments yet. Be first!
          </p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0">
              <Avatar src={c.author_avatar ?? ''} name={c.author_name ?? '?'} size={36} className="w-full h-full rounded-full" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">{c.author_name ?? 'Nova user'}</span>
                <span className="text-xs" style={{ color: '#444455' }}>{timeAgo(new Date(c.created_at).getTime())}</span>
              </div>
              <p className="text-sm mt-0.5 leading-snug" style={{ color: '#c0c0d8' }}>{c.body}</p>
            </div>
            {user?.id === c.user_id && (
              <button onClick={() => removeComment(c.id)} className="flex-shrink-0 p-1" aria-label="Delete comment">
                <Trash2 size={14} style={{ color: '#444455' }} />
              </button>
            )}
          </div>
        ))}
        <div style={{ height: 16 }} />
      </div>

      {/* Comment input — signed-in users only, so every comment is a real person */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderTop: '1px solid #1e1e2a', background: '#0d0d16' }}
      >
        {!isSupabaseEnabled ? (
          <p className="flex-1 text-xs text-center py-1" style={{ color: '#555566' }}>
            Comments are temporarily unavailable.
          </p>
        ) : user ? (
          <>
            <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
              <Avatar
                src={profile?.avatar_url ?? ''}
                name={profile?.display_name ?? profile?.username ?? user.email ?? '?'}
                size={32}
                className="w-full h-full rounded-full"
              />
            </div>
            <div
              className="flex-1 flex items-center gap-2 rounded-2xl px-3 py-2"
              style={{ background: '#1a1a24', border: '1px solid #2a2a38' }}
            >
              <input
                ref={inputRef}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submitComment(); }}
                placeholder="Add a comment…"
                maxLength={1000}
                className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#444455]"
              />
              {commentText.trim() && (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileTap={{ scale: 0.85 }}
                  onClick={submitComment}
                  disabled={sending}
                >
                  {sending
                    ? <Loader2 size={16} className="animate-spin" style={{ color: '#a78bfa' }} />
                    : <Send size={16} style={{ color: '#a78bfa' }} />}
                </motion.button>
              )}
            </div>
          </>
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowAuth(true)}
            className="flex-1 py-2.5 rounded-2xl text-sm font-bold text-white flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
          >
            <LogIn size={14} /> Sign in to join the conversation
          </motion.button>
        )}
      </div>
    </motion.div>

    {/* Sign-in modal for commenting */}
    <AnimatePresence>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </AnimatePresence>
    </>
  );
}
