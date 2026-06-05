'use client';

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Heart, Send, Star } from 'lucide-react';
import { Post, Comment } from '@/types';
import { getPostComments, formatCount, timeAgo } from '@/data/mockData';
import { useApp } from '@/context/AppContext';

interface Props {
  post: Post;
  onClose: () => void;
}

export default function CommentsSheet({ post, onClose }: Props) {
  const { isLiked, likePost, isSaved, savePost, addToast } = useApp();
  const [comments] = useState<Comment[]>(() => getPostComments(post));
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [commentText, setCommentText] = useState('');
  const [localComments, setLocalComments] = useState<Comment[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const liked = isLiked(post.id);
  const saved = isSaved(post.id);

  function toggleCommentLike(id: string) {
    setLikedComments(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function submitComment() {
    const text = commentText.trim();
    if (!text) return;
    const newComment: Comment = {
      id: `user_${Date.now()}`,
      user: { id: 'current', name: 'You', username: 'your.nova', avatar: 'https://i.pravatar.cc/150?img=33', bio: '', followers: 1247, following: 389, posts: 28 },
      text,
      timestamp: Date.now(),
      likes: 0,
    };
    setLocalComments(prev => [newComment, ...prev]);
    setCommentText('');
    addToast('Comment posted', 'success', '💬');
  }

  const allComments = [...localComments, ...comments];

  return (
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
        <h3 className="text-base font-bold text-white">Comments</h3>
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
            onClick={() => { likePost(post.id, post.category); }}
            className="flex flex-col items-center gap-0.5"
          >
            <Star
              size={22}
              fill={liked ? '#f59e0b' : 'none'}
              style={{ color: liked ? '#f59e0b' : '#888899' }}
              className={liked ? 'heart-pop' : ''}
            />
            <span className="text-xs" style={{ color: liked ? '#f59e0b' : '#555566' }}>{formatCount(post.likes + (liked ? 1 : 0))}</span>
          </button>
          <button
            onClick={() => {
              savePost(post.id, post.category);
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
        {allComments.length === 0 && (
          <p className="text-center text-sm py-8" style={{ color: '#555566' }}>No comments yet. Be first!</p>
        )}
        {allComments.map((c) => (
          <div key={c.id} className="flex items-start gap-3 mb-4">
            <img src={c.user.avatar} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">{c.user.username}</span>
                <span className="text-xs" style={{ color: '#444455' }}>{timeAgo(c.timestamp)}</span>
              </div>
              <p className="text-sm mt-0.5 leading-snug" style={{ color: '#c0c0d8' }}>{c.text}</p>
            </div>
            <button
              onClick={() => toggleCommentLike(c.id)}
              className="flex flex-col items-center gap-0.5 flex-shrink-0"
            >
              <Heart
                size={16}
                fill={likedComments.has(c.id) ? '#ec4899' : 'none'}
                style={{ color: likedComments.has(c.id) ? '#ec4899' : '#444455' }}
              />
              <span className="text-xs" style={{ color: '#444455' }}>
                {formatCount(c.likes + (likedComments.has(c.id) ? 1 : 0))}
              </span>
            </button>
          </div>
        ))}
        <div style={{ height: 16 }} />
      </div>

      {/* Comment input */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderTop: '1px solid #1e1e2a', background: '#0d0d16' }}
      >
        <img src="https://i.pravatar.cc/150?img=33" alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
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
            className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#444455]"
          />
          {commentText.trim() && (
            <motion.button
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              whileTap={{ scale: 0.85 }}
              onClick={submitComment}
            >
              <Send size={16} style={{ color: '#a78bfa' }} />
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
