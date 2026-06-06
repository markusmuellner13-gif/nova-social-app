import { Post, Category, UserPreferences, AIProfile, NovaNotification, User } from '@/types';

export function scorePost(
  post: Post,
  preferences: UserPreferences,
  aiProfile: AIProfile
): number {
  const explicitPref = (preferences[post.category as keyof UserPreferences] ?? 50) / 100;
  const implicitPref = ((aiProfile.categoryEngagement[post.category] ?? (preferences[post.category as keyof UserPreferences] ?? 50)) / 100);
  const combinedPref = explicitPref * 0.55 + implicitPref * 0.45;

  const engagementScore = Math.min(Math.log10(post.likes + 1) / 6, 1);
  const hoursOld = (Date.now() - post.timestamp) / (1000 * 60 * 60);
  const recencyScore = Math.exp(-hoursOld / 72);
  const eventBoost = post.isEvent ? 0.18 : 0;

  return combinedPref * 0.40 + engagementScore * 0.22 + recencyScore * 0.20 + eventBoost + Math.random() * 0.02;
}

export function sortFeed(
  posts: Post[],
  preferences: UserPreferences,
  aiProfile: AIProfile
): Post[] {
  return [...posts].sort((a, b) => scorePost(b, preferences, aiProfile) - scorePost(a, preferences, aiProfile));
}

export function getTopCategories(
  preferences: UserPreferences,
  aiProfile: AIProfile,
  n = 3
): Category[] {
  const cats = Object.keys(preferences) as Category[];
  return cats
    .sort((a, b) => {
      const aScore = (preferences[a as keyof UserPreferences] ?? 50) * 0.6 + ((aiProfile.categoryEngagement[a] ?? 50)) * 0.4;
      const bScore = (preferences[b as keyof UserPreferences] ?? 50) * 0.6 + ((aiProfile.categoryEngagement[b] ?? 50)) * 0.4;
      return bScore - aScore;
    })
    .slice(0, n);
}

const AI_NOTIFICATION_MESSAGES: Record<string, string[]> = {
  travel: ['✈️ New destination dropping — you\'ll want to see this', 'A must-see travel post just landed in your zone'],
  food: ['🍕 Your next favourite restaurant just posted', 'New food post that matches your taste perfectly'],
  fashion: ['👗 Fresh fit just dropped — curated for you', 'New style post you\'re going to love'],
  sports: ['⚽ Big play alert — new sports post for you', 'Your kind of match is going viral right now'],
  art: ['🎨 New artwork that fits your palette perfectly', 'Fresh creative piece curated just for you'],
  tech: ['💻 New tech post trending in your interest zone', 'Hot developer content just dropped for you'],
  fitness: ['💪 New workout that matches your fitness vibe', 'Fresh fitness content pushing right now'],
  music: ['🎵 New track just dropped — made for your ears', 'Fresh music content is trending for you'],
  pets: ['🐾 You\'re going to love this new pet post', 'The cutest animal post just dropped for you'],
  lifestyle: ['🌟 New lifestyle content curated for your vibe', 'Fresh slow-living post just dropped for you'],
  events: ['🎉 Hot event near you — don\'t miss out', 'New event just announced matching your interests'],
  sightseeing: ['🏛️ Unmissable landmark experience near you', 'New sightseeing post that fits your travel taste'],
};

export function generateAINotification(
  post: Post,
  _preferences: UserPreferences,
  notifUser: User
): Omit<NovaNotification, 'id'> {
  const messages = AI_NOTIFICATION_MESSAGES[post.category] ?? ['Nova AI found new content for you'];
  const text = messages[Math.floor(Math.random() * messages.length)];
  return {
    user: notifUser,
    type: post.isEvent ? 'event' : 'ai_suggestion',
    postImage: post.image,
    text,
    timestamp: Date.now(),
    read: false,
    postId: post.id,
  };
}

export function learnFromInteraction(
  profile: AIProfile,
  category: Category,
  strength: 'weak' | 'medium' | 'strong'
): AIProfile {
  const delta = strength === 'strong' ? 6 : strength === 'medium' ? 3 : 1.5;
  const current = profile.categoryEngagement[category] ?? 50;
  const updated = Math.min(100, Math.max(0, current + delta));
  return {
    ...profile,
    categoryEngagement: { ...profile.categoryEngagement, [category]: updated },
    totalInteractions: profile.totalInteractions + 1,
    lastActive: Date.now(),
  };
}
