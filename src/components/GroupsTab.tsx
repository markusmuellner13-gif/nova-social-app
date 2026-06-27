'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Plus, Hash, X, Copy, Calendar, MapPin, ExternalLink, Loader2, LogIn, CheckCircle2, MessageCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useApp } from '@/context/AppContext';
import {
  SupabaseGroup, SupabaseGroupEvent, FriendGoing,
  createGroup, joinGroup, getUserGroups, getGroupEvents, removeEventFromGroup, getGroupGoing,
  getGroupEventCommentCounts,
} from '@/lib/supabase';
import { Post } from '@/types';
import { timeAgo } from '@/data/mockData';
import Avatar from './Avatar';
import GroupEventChat from './GroupEventChat';
import GroupChat from './GroupChat';

interface Props {
  onOpenAuth: () => void;
}

type Screen = 'list' | 'create' | 'join' | 'detail';

export default function GroupsTab({ onOpenAuth }: Props) {
  const { user, profile, isSupabaseEnabled } = useAuth();
  const { isGoing, goPost } = useApp();

  const [screen, setScreen]       = useState<Screen>('list');
  const [groups, setGroups]       = useState<SupabaseGroup[]>([]);
  const [activeGroup, setActiveGroup] = useState<SupabaseGroup | null>(null);
  const [groupEvents, setGroupEvents] = useState<SupabaseGroupEvent[]>([]);
  const [groupGoing, setGroupGoing] = useState<Record<string, FriendGoing[]>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [chatEvent, setChatEvent] = useState<SupabaseGroupEvent | null>(null);
  const [detailTab, setDetailTab] = useState<'events' | 'chat'>('events');
  const [loading, setLoading]     = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [joinCode, setJoinCode]   = useState('');
  const [error, setError]         = useState('');
  const [copied, setCopied]       = useState(false);

  const loadGroups = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const data = await getUserGroups(user.id);
    setGroups(data);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) loadGroups();
  }, [user, loadGroups]);

  const loadGroupGoing = useCallback(async (groupId: string, events: SupabaseGroupEvent[]) => {
    const ids = events.map(e => e.post_id);
    if (ids.length === 0) { setGroupGoing({}); setCommentCounts({}); return; }
    const [going, counts] = await Promise.all([
      getGroupGoing(groupId, ids),
      getGroupEventCommentCounts(groupId, ids),
    ]);
    setGroupGoing(going);
    setCommentCounts(counts);
  }, []);

  async function loadGroupEvents(group: SupabaseGroup) {
    setActiveGroup(group);
    setScreen('detail');
    setDetailTab('events');
    const events = await getGroupEvents(group.id);
    setGroupEvents(events);
    void loadGroupGoing(group.id, events);
  }

  // Toggle the current user's RSVP for a group event, then refresh who's going so
  // the whole group sees the update.
  async function handleGroupGoing(ge: SupabaseGroupEvent) {
    const post = { ...(ge.post_data as unknown as Post), id: ge.post_id };
    goPost(post);
    if (activeGroup) {
      // Optimistic: re-pull shortly after the write lands.
      setTimeout(() => { if (activeGroup) void loadGroupGoing(activeGroup.id, groupEvents); }, 400);
    }
  }

  async function handleCreateGroup() {
    if (!user || !newGroupName.trim()) return;
    setLoading(true); setError('');
    const group = await createGroup(newGroupName.trim(), newGroupDesc.trim(), user.id);
    if (group) {
      setGroups(prev => [...prev, group]);
      setNewGroupName(''); setNewGroupDesc('');
      await loadGroupEvents(group);
    } else {
      setError('Failed to create group. Please try again.');
    }
    setLoading(false);
  }

  async function handleJoinGroup() {
    if (!user || !joinCode.trim()) return;
    setLoading(true); setError('');
    const group = await joinGroup(joinCode.trim(), user.id);
    if (group) {
      setGroups(prev => prev.some(g => g.id === group.id) ? prev : [...prev, group]);
      setJoinCode('');
      await loadGroupEvents(group);
    } else {
      setError('Group not found. Check the invite code and try again.');
    }
    setLoading(false);
  }

  async function handleRemoveEvent(groupId: string, postId: string) {
    await removeEventFromGroup(groupId, postId);
    setGroupEvents(prev => prev.filter(e => e.post_id !== postId));
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  // Not logged in state
  if (!user) {
    const PREVIEW_GROUPS = [
      { name: '🎵 Music Crew', members: 6, events: 3, desc: 'Concerts & festivals' },
      { name: '🍕 Food Gang', members: 4, events: 5, desc: 'Restaurants & markets' },
      { name: '🎨 Art Lovers', members: 8, events: 2, desc: 'Galleries & exhibitions' },
    ];
    return (
      <div className="flex flex-col h-full">
        <div className="glass flex items-center gap-2 px-4 flex-shrink-0" style={{ height: 52, borderBottom: '1px solid #1e1e2a' }}>
          <Users size={20} style={{ color: '#8b5cf6' }} />
          <h2 className="text-base font-bold text-white">Groups</h2>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pt-5 pb-10">
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-3" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
              <Users size={28} color="white" />
            </div>
            <p className="text-lg font-bold text-white mb-1">Plan events with friends</p>
            <p className="text-sm leading-relaxed" style={{ color: '#888899' }}>
              Create a group, invite with a code, and build a shared wishlist of events to attend together.
            </p>
          </div>

          {/* Preview group cards */}
          <div className="flex flex-col gap-3 mb-6 relative">
            <div className="absolute inset-0 z-10 rounded-2xl flex flex-col items-center justify-center gap-2" style={{ backdropFilter: 'blur(3px)', background: 'rgba(10,10,15,0.5)' }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.2)', border: '1px solid rgba(139,92,246,0.4)' }}>
                <LogIn size={18} style={{ color: '#a78bfa' }} />
              </div>
              <p className="text-sm font-bold text-white">Sign in to see your groups</p>
              <p className="text-xs" style={{ color: '#888899' }}>Create and join groups with friends</p>
            </div>
            {PREVIEW_GROUPS.map(g => (
              <div key={g.name} className="flex items-center gap-3 p-4 rounded-2xl" style={{ background: '#13131a', border: '1px solid #2a2a38' }}>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: 'rgba(139,92,246,0.15)' }}>
                  {g.name.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{g.name}</p>
                  <p className="text-xs" style={{ color: '#666677' }}>{g.desc} · {g.events} events saved</p>
                </div>
                <div className="flex items-center gap-1 px-2 py-1 rounded-full" style={{ background: 'rgba(139,92,246,0.12)' }}>
                  <Users size={11} style={{ color: '#a78bfa' }} />
                  <span className="text-xs font-semibold" style={{ color: '#a78bfa' }}>{g.members}</span>
                </div>
              </div>
            ))}
          </div>

          {isSupabaseEnabled ? (
            <motion.button whileTap={{ scale: 0.95 }} onClick={onOpenAuth}
              className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', boxShadow: '0 4px 20px rgba(139,92,246,0.4)' }}>
              <LogIn size={16} /> Sign in to create your group
            </motion.button>
          ) : (
            <motion.button whileTap={{ scale: 0.95 }} onClick={onOpenAuth}
              className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl text-sm font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', boxShadow: '0 4px 20px rgba(139,92,246,0.4)' }}>
              <LogIn size={16} /> Sign in to create your group
            </motion.button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glass flex items-center justify-between px-4 flex-shrink-0" style={{ height: 52, borderBottom: '1px solid #1e1e2a' }}>
        {screen === 'detail' && activeGroup ? (
          <>
            <button onClick={() => setScreen('list')}><X size={20} style={{ color: '#888899' }} /></button>
            <p className="text-sm font-bold text-white truncate mx-3">{activeGroup.name}</p>
            <button onClick={() => copyCode(activeGroup.code)} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold"
              style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
              <Hash size={11} /> {activeGroup.code}
              <Copy size={10} />
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Users size={18} style={{ color: '#8b5cf6' }} />
              <h2 className="text-base font-bold text-white">Groups</h2>
            </div>
            <div className="flex gap-2">
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setScreen('join'); setError(''); }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: '#1a1a24', border: '1px solid #2a2a38', color: '#888899' }}>
                <Hash size={12} /> Join
              </motion.button>
              <motion.button whileTap={{ scale: 0.9 }} onClick={() => { setScreen('create'); setError(''); }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', color: 'white' }}>
                <Plus size={12} /> New
              </motion.button>
            </div>
          </>
        )}
      </div>

      {/* Detail sub-tabs: shared events list vs. live group chat */}
      {screen === 'detail' && activeGroup && (
        <div className="flex flex-shrink-0" style={{ borderBottom: '1px solid #1e1e2a' }}>
          {(['events', 'chat'] as const).map(tab => (
            <button key={tab} onClick={() => setDetailTab(tab)}
              className="flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5"
              style={{ color: detailTab === tab ? '#a78bfa' : '#666677', borderBottom: detailTab === tab ? '2px solid #8b5cf6' : '2px solid transparent' }}>
              {tab === 'events' ? <Calendar size={14} /> : <MessageCircle size={14} />}
              {tab === 'events' ? 'Events' : 'Chat'}
            </button>
          ))}
        </div>
      )}

      {screen === 'detail' && detailTab === 'chat' && activeGroup && user ? (
        <GroupChat
          groupId={activeGroup.id}
          userId={user.id}
          authorName={profile?.display_name ?? profile?.username ?? 'You'}
          authorAvatar={profile?.avatar_url ?? ''}
        />
      ) : (
      <div className="flex-1 overflow-y-auto">

        {/* Group list */}
        {screen === 'list' && (
          <div className="p-4">
            {loading && groups.length === 0 ? (
              <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin" style={{ color: '#8b5cf6' }} /></div>
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-4">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(139,92,246,0.1)' }}>
                  <Users size={28} style={{ color: '#8b5cf6' }} />
                </div>
                <p className="text-sm font-semibold text-white">No groups yet</p>
                <p className="text-xs text-center" style={{ color: '#555566' }}>Create a group or join one with an invite code</p>
                <div className="flex gap-2">
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => setScreen('join')}
                    className="px-4 py-2.5 rounded-xl text-sm font-semibold" style={{ background: '#1a1a24', border: '1px solid #2a2a38', color: '#888899' }}>
                    Join a group
                  </motion.button>
                  <motion.button whileTap={{ scale: 0.95 }} onClick={() => setScreen('create')}
                    className="px-4 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}>
                    Create group
                  </motion.button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {groups.map(group => (
                  <motion.button key={group.id} whileTap={{ scale: 0.97 }} onClick={() => loadGroupEvents(group)}
                    className="w-full text-left p-4 rounded-2xl" style={{ background: '#13131a', border: '1px solid #2a2a38' }}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-bold text-white">{group.name}</p>
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
                        style={{ background: 'rgba(139,92,246,0.1)', color: '#a78bfa' }}>
                        <Hash size={10} /> {group.code}
                      </div>
                    </div>
                    {group.description && <p className="text-xs" style={{ color: '#666677' }}>{group.description}</p>}
                    <p className="text-xs mt-2" style={{ color: '#444455' }}>Tap to view events</p>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Create group */}
        {screen === 'create' && (
          <div className="p-4">
            <button onClick={() => setScreen('list')} className="flex items-center gap-1 mb-4 text-sm" style={{ color: '#888899' }}>
              ← Back
            </button>
            <h3 className="text-base font-bold text-white mb-4">New Group</h3>
            <div className="flex flex-col gap-3">
              <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                placeholder="Group name (e.g. Vienna Weekend Squad)"
                className="w-full px-4 py-3.5 rounded-2xl text-sm text-white outline-none"
                style={{ background: '#13131a', border: '1px solid #2a2a38' }} />
              <textarea value={newGroupDesc} onChange={e => setNewGroupDesc(e.target.value)}
                placeholder="Description (optional)"
                rows={3}
                className="w-full px-4 py-3.5 rounded-2xl text-sm text-white outline-none resize-none"
                style={{ background: '#13131a', border: '1px solid #2a2a38' }} />
              {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleCreateGroup} disabled={loading || !newGroupName.trim()}
                className="w-full py-3.5 rounded-2xl text-sm font-bold text-white"
                style={{ background: loading ? '#2a2a38' : 'linear-gradient(135deg, #8b5cf6, #ec4899)', opacity: (!newGroupName.trim() || loading) ? 0.6 : 1 }}>
                {loading ? 'Creating…' : 'Create Group'}
              </motion.button>
            </div>
          </div>
        )}

        {/* Join group */}
        {screen === 'join' && (
          <div className="p-4">
            <button onClick={() => setScreen('list')} className="flex items-center gap-1 mb-4 text-sm" style={{ color: '#888899' }}>
              ← Back
            </button>
            <h3 className="text-base font-bold text-white mb-2">Join a Group</h3>
            <p className="text-xs mb-4" style={{ color: '#666677' }}>Enter the 6-character invite code from your friend</p>
            <div className="flex flex-col gap-3">
              <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Invite code (e.g. AB12CD)"
                maxLength={6}
                className="w-full px-4 py-3.5 rounded-2xl text-sm text-white outline-none tracking-widest text-center uppercase font-bold"
                style={{ background: '#13131a', border: '1px solid #2a2a38', fontSize: 20 }} />
              {error && <p className="text-xs" style={{ color: '#f87171' }}>{error}</p>}
              <motion.button whileTap={{ scale: 0.97 }} onClick={handleJoinGroup} disabled={loading || joinCode.length < 6}
                className="w-full py-3.5 rounded-2xl text-sm font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', opacity: (joinCode.length < 6 || loading) ? 0.6 : 1 }}>
                {loading ? 'Joining…' : 'Join Group'}
              </motion.button>
            </div>
          </div>
        )}

        {/* Group detail */}
        {screen === 'detail' && activeGroup && (
          <div>
            {/* Invite banner */}
            <div className="mx-4 mt-4 p-4 rounded-2xl" style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: '#a78bfa' }}>Invite friends to this group</p>
              <p className="text-xs mb-3" style={{ color: '#666677' }}>Share the code below — they can join from the Groups tab</p>
              <button onClick={() => copyCode(activeGroup.code)}
                className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold"
                style={{ background: '#1a1a24', border: '1px solid rgba(139,92,246,0.3)', color: copied ? '#22c55e' : '#a78bfa' }}>
                <Hash size={14} />
                {activeGroup.code}
                {copied ? ' — Copied!' : ' — Tap to copy'}
              </button>
            </div>

            {/* Events */}
            <div className="px-4 pt-4 pb-2">
              <p className="text-xs font-bold mb-3" style={{ color: '#666677' }}>
                {groupEvents.length === 0 ? 'No events added yet' : `${groupEvents.length} event${groupEvents.length === 1 ? '' : 's'}`}
              </p>
            </div>

            {groupEvents.length === 0 ? (
              <div className="flex flex-col items-center py-12 px-8 gap-3">
                <Calendar size={32} style={{ color: '#2a2a38' }} />
                <p className="text-sm font-semibold text-white">No events yet</p>
                <p className="text-xs text-center" style={{ color: '#555566' }}>
                  Browse the Events tab and tap the share button to add events to this group
                </p>
              </div>
            ) : (
              <div className="px-4 flex flex-col gap-3 pb-8">
                {groupEvents.map(ge => {
                  const post = ge.post_data as Partial<Post>;
                  return (
                    <div key={ge.id} className="rounded-2xl overflow-hidden" style={{ background: '#13131a', border: '1px solid #2a2a38' }}>
                      {post.image && (
                        <div className="w-full" style={{ height: 160 }}>
                          <img src={post.image as string} alt="" className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="p-3">
                        <p className="text-sm font-bold text-white mb-1">
                          {((post.caption as string) ?? '').split('\n')[0].slice(0, 60)}
                        </p>
                        {post.eventDate && (
                          <div className="flex items-center gap-1 mb-1">
                            <Calendar size={11} style={{ color: '#8b5cf6' }} />
                            <span className="text-xs" style={{ color: '#a78bfa' }}>{post.eventDate as string}</span>
                          </div>
                        )}
                        {post.eventVenue && (
                          <div className="flex items-center gap-1 mb-2">
                            <MapPin size={11} style={{ color: '#888899' }} />
                            <span className="text-xs" style={{ color: '#888899' }}>{post.eventVenue as string}</span>
                          </div>
                        )}
                        {/* Group RSVP — who's in, and a toggle to join them */}
                        {(() => {
                          const going = groupGoing[ge.post_id] ?? [];
                          const meGoing = isGoing(ge.post_id);
                          return (
                            <div className="flex items-center justify-between mb-2 mt-1">
                              <div className="flex items-center gap-2 min-w-0">
                                {going.length > 0 && (
                                  <div className="flex -space-x-2 flex-shrink-0">
                                    {going.slice(0, 4).map(m => (
                                      <div key={m.id} className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0" style={{ border: '2px solid #13131a' }}>
                                        <Avatar src={m.avatar} name={m.name} size={24} className="w-full h-full rounded-full" />
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <span className="text-xs font-semibold truncate" style={{ color: going.length ? '#22c55e' : '#555566' }}>
                                  {going.length === 0 ? 'Be the first to RSVP' : `${going.length} going`}
                                </span>
                              </div>
                              <motion.button whileTap={{ scale: 0.92 }} onClick={() => handleGroupGoing(ge)}
                                className="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold flex-shrink-0"
                                style={{ background: meGoing ? 'rgba(34,197,94,0.15)' : '#1a1a24',
                                  border: `1px solid ${meGoing ? 'rgba(34,197,94,0.4)' : '#2a2a38'}`,
                                  color: meGoing ? '#22c55e' : '#a78bfa' }}>
                                <CheckCircle2 size={12} fill={meGoing ? '#22c55e' : 'none'} />
                                {meGoing ? "I'm in" : "I'm going"}
                              </motion.button>
                            </div>
                          );
                        })()}

                        {/* Discussion — plan the night together, not just RSVP */}
                        <motion.button whileTap={{ scale: 0.97 }} onClick={() => setChatEvent(ge)}
                          className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-bold mb-2"
                          style={{ background: '#1a1a24', border: '1px solid #2a2a38', color: '#a78bfa' }}>
                          <MessageCircle size={13} />
                          {commentCounts[ge.post_id]
                            ? `Discussion · ${commentCounts[ge.post_id]} message${commentCounts[ge.post_id] === 1 ? '' : 's'}`
                            : 'Start a discussion'}
                        </motion.button>

                        <div className="flex items-center justify-between">
                          <span className="text-xs" style={{ color: '#444455' }}>{timeAgo(new Date(ge.created_at).getTime())}</span>
                          <div className="flex gap-2">
                            {post.eventUrl && (
                              <a href={post.eventUrl as string} target="_blank" rel="noopener noreferrer"
                                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                                style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                                <ExternalLink size={10} /> Tickets
                              </a>
                            )}
                            {user && ge.added_by === user.id && (
                              <button onClick={() => handleRemoveEvent(activeGroup.id, ge.post_id)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                                style={{ background: 'rgba(244,63,94,0.1)', color: '#f87171' }}>
                                Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div style={{ height: 100 }} />
      </div>
      )}

      {/* Group event discussion sheet */}
      <AnimatePresence>
        {chatEvent && activeGroup && user && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={() => setChatEvent(null)} />
            <GroupEventChat
              groupId={activeGroup.id}
              postId={chatEvent.post_id}
              eventTitle={(((chatEvent.post_data as Partial<Post>).caption as string) ?? 'Event').split('\n')[0].slice(0, 60)}
              eventImage={(chatEvent.post_data as Partial<Post>).image as string | undefined}
              userId={user.id}
              authorName={profile?.display_name ?? profile?.username ?? 'You'}
              authorAvatar={profile?.avatar_url ?? ''}
              onClose={() => setChatEvent(null)}
              onPosted={() => setCommentCounts(prev => ({ ...prev, [chatEvent.post_id]: (prev[chatEvent.post_id] ?? 0) + 1 }))}
            />
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
