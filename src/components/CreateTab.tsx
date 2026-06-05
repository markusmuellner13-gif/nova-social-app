'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, MapPin, Check, Camera } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { GALLERY_IMAGES, CURRENT_USER } from '@/data/mockData';
import { Category, Post } from '@/types';

interface Props {
  onClose: () => void;
  onPosted?: () => void;
}

const CATEGORIES: { id: Category; emoji: string; label: string }[] = [
  { id: 'travel', emoji: '✈️', label: 'Travel' },
  { id: 'food', emoji: '🍕', label: 'Food' },
  { id: 'fashion', emoji: '👗', label: 'Fashion' },
  { id: 'sports', emoji: '⚽', label: 'Sports' },
  { id: 'art', emoji: '🎨', label: 'Art' },
  { id: 'tech', emoji: '💻', label: 'Tech' },
  { id: 'fitness', emoji: '💪', label: 'Fitness' },
  { id: 'music', emoji: '🎵', label: 'Music' },
  { id: 'pets', emoji: '🐾', label: 'Pets' },
  { id: 'lifestyle', emoji: '🌟', label: 'Lifestyle' },
  { id: 'events', emoji: '🎉', label: 'Events' },
];

const SUGGESTED_LOCATIONS = ['New York, USA', 'Paris, France', 'Tokyo, Japan', 'London, UK', 'Sydney, Australia', 'Barcelona, Spain', 'Your Location'];

export default function CreateTab({ onClose, onPosted }: Props) {
  const { addCreatedPost, addToast } = useApp();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [category, setCategory] = useState<Category>('lifestyle');
  const [location, setLocation] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [done, setDone] = useState(false);

  function handlePublish() {
    if (!selectedImage || !caption.trim()) return;
    setPublishing(true);
    setTimeout(() => {
      const newPost: Post = {
        id: `created_${Date.now()}`,
        user: CURRENT_USER,
        image: selectedImage,
        caption: caption.trim(),
        likes: 0,
        comments: 0,
        category,
        hashtags: [],
        timestamp: Date.now(),
        location: { name: location || 'Unknown location', lat: 0, lng: 0 },
        saved: false,
        liked: false,
      };
      addCreatedPost(newPost);
      setPublishing(false);
      setDone(true);
      addToast('Post published! ✨', 'success', '🚀');
      setTimeout(() => {
        onPosted?.();
        onClose();
      }, 1400);
    }, 1200);
  }

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 280, damping: 32 }}
      className="fixed inset-0 z-40 flex flex-col"
      style={{ background: '#0a0a0f' }}
    >
      {/* Header */}
      <div className="glass flex items-center justify-between px-4 flex-shrink-0" style={{ height: 56, borderBottom: '1px solid #1e1e2a' }}>
        <button onClick={step > 0 ? () => setStep((s) => (s - 1) as 0 | 1 | 2) : onClose} className="w-9 h-9 flex items-center justify-center rounded-full" style={{ background: '#1a1a24' }}>
          {step > 0 ? <ChevronLeft size={18} style={{ color: '#888899' }} /> : <X size={18} style={{ color: '#888899' }} />}
        </button>
        <h2 className="text-base font-bold text-white">
          {step === 0 ? 'New Post' : step === 1 ? 'Edit Details' : 'Preview'}
        </h2>
        {step < 2 ? (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              if (step === 0 && selectedImage) setStep(1);
              else if (step === 1 && caption.trim()) setStep(2);
            }}
            disabled={(step === 0 && !selectedImage) || (step === 1 && !caption.trim())}
            className="px-4 py-1.5 rounded-xl text-sm font-bold"
            style={{
              background: (step === 0 && selectedImage) || (step === 1 && caption.trim()) ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : '#1a1a24',
              color: (step === 0 && selectedImage) || (step === 1 && caption.trim()) ? 'white' : '#555566',
            }}
          >
            Next
          </motion.button>
        ) : (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handlePublish}
            disabled={publishing}
            className="px-4 py-1.5 rounded-xl text-sm font-bold text-white"
            style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
          >
            {publishing ? '...' : 'Post'}
          </motion.button>
        )}
      </div>

      <AnimatePresence mode="wait">

        {/* Step 0: Photo picker */}
        {step === 0 && !done && (
          <motion.div
            key="step0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto"
          >
            {/* Camera button */}
            <div className="px-4 pt-4 pb-3">
              <button
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl text-sm font-semibold"
                style={{ background: '#13131a', border: '2px dashed #2a2a38', color: '#888899' }}
              >
                <Camera size={18} />
                Take a photo
              </button>
            </div>

            <p className="px-4 text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: '#555566' }}>
              Gallery
            </p>
            <div className="grid grid-cols-3 gap-0.5">
              {GALLERY_IMAGES.map((img) => (
                <motion.button
                  key={img.id}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedImage(img.url)}
                  className="relative overflow-hidden"
                  style={{ aspectRatio: '1', background: '#13131a' }}
                >
                  <img src={img.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  {selectedImage === img.url && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ background: 'rgba(139,92,246,0.5)' }}
                    >
                      <Check size={28} color="white" strokeWidth={3} />
                    </motion.div>
                  )}
                </motion.button>
              ))}
            </div>
            <div style={{ height: 80 }} />
          </motion.div>
        )}

        {/* Step 1: Caption + metadata */}
        {step === 1 && !done && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 overflow-y-auto px-4 pt-4"
          >
            {selectedImage && (
              <img src={selectedImage} alt="" className="w-full rounded-2xl object-cover mb-4" style={{ maxHeight: 220 }} />
            )}

            <div className="rounded-2xl p-3 mb-4" style={{ background: '#13131a', border: '1px solid #2a2a38' }}>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Write a caption…"
                rows={3}
                className="w-full bg-transparent text-sm text-white outline-none resize-none placeholder:text-[#444455]"
                maxLength={280}
              />
              <div className="flex justify-end">
                <span className="text-xs" style={{ color: '#444455' }}>{caption.length}/280</span>
              </div>
            </div>

            {/* Category */}
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#555566' }}>Category</p>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
              {CATEGORIES.map(c => (
                <motion.button
                  key={c.id}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setCategory(c.id)}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{
                    background: category === c.id ? 'linear-gradient(135deg, #8b5cf6, #ec4899)' : '#1a1a24',
                    color: category === c.id ? 'white' : '#888899',
                    border: category === c.id ? 'none' : '1px solid #2a2a38',
                  }}
                >
                  {c.emoji} {c.label}
                </motion.button>
              ))}
            </div>

            {/* Location */}
            <p className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: '#555566' }}>Location</p>
            <div className="flex gap-2 flex-wrap mb-4">
              {SUGGESTED_LOCATIONS.map(loc => (
                <motion.button
                  key={loc}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setLocation(loc)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium"
                  style={{
                    background: location === loc ? 'rgba(139,92,246,0.2)' : '#1a1a24',
                    color: location === loc ? '#a78bfa' : '#888899',
                    border: location === loc ? '1px solid rgba(139,92,246,0.4)' : '1px solid #2a2a38',
                  }}
                >
                  <MapPin size={10} />
                  {loc}
                </motion.button>
              ))}
            </div>
            <div style={{ height: 80 }} />
          </motion.div>
        )}

        {/* Step 2: Preview */}
        {step === 2 && !done && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 overflow-y-auto"
          >
            <div className="p-4">
              <div className="rounded-2xl overflow-hidden" style={{ background: '#13131a', border: '1px solid #2a2a38' }}>
                <div className="flex items-center gap-3 p-3">
                  <img src={CURRENT_USER.avatar} alt="" className="w-9 h-9 rounded-xl object-cover" />
                  <div>
                    <p className="text-sm font-semibold text-white">{CURRENT_USER.name}</p>
                    {location && (
                      <div className="flex items-center gap-0.5">
                        <MapPin size={10} style={{ color: '#8b5cf6' }} />
                        <span className="text-xs" style={{ color: '#a78bfa' }}>{location}</span>
                      </div>
                    )}
                  </div>
                </div>
                {selectedImage && (
                  <img src={selectedImage} alt="" className="w-full object-cover" style={{ aspectRatio: '4/5' }} />
                )}
                <div className="p-3">
                  <p className="text-sm" style={{ color: '#d0d0e8' }}>{caption}</p>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full mt-2 inline-block capitalize" style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>{category}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Done state */}
        {done && (
          <motion.div
            key="done"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex-1 flex flex-col items-center justify-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 15 }}
              className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
              style={{ background: 'linear-gradient(135deg, #8b5cf6, #ec4899)' }}
            >
              <Check size={36} color="white" strokeWidth={3} />
            </motion.div>
            <h3 className="text-xl font-bold text-white">Posted! 🚀</h3>
            <p className="text-sm mt-1" style={{ color: '#888899' }}>Your post is live in the feed</p>
          </motion.div>
        )}

      </AnimatePresence>
    </motion.div>
  );
}
