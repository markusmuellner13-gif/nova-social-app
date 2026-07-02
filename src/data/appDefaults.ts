import { NovaNotification, User } from '@/types';

// Nova AI system user — the app itself, used for event-discovery notifications
export const NOVA_AI_USER: User = {
  id: 'nova_ai',
  name: 'Nova',
  username: 'nova.discover',
  avatar: '/icon-192.png',
  bio: 'Real events & places near you',
  followers: 0, following: 0, posts: 0,
  verified: true,
};

export const DEFAULT_PREFERENCES = {
  travel: 80, food: 60, fashion: 40, sports: 50, art: 70,
  tech: 65, fitness: 55, music: 75, pets: 85, lifestyle: 60,
  events: 90, sightseeing: 65, shops: 50, venues: 60, community: 55,
  restaurants: 70, hotels: 50, rentals: 45, outdoors: 70,
};

// The only pre-seeded notification: an honest onboarding nudge from the app
// itself. Everything else in the notification list comes from real feed events.
export function welcomeNotification(): NovaNotification {
  return {
    id: 'welcome',
    user: NOVA_AI_USER,
    type: 'ai_suggestion',
    text: 'Welcome to Nova 👋 Set your city and we\'ll keep you posted when something\'s happening near you.',
    timestamp: Date.now(),
    read: false,
  };
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

export function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
