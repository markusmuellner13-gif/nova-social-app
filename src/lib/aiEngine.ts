import { Post, Category, UserPreferences, AIProfile, NovaNotification, User } from '@/types';

// ── Time-of-day relevance ─────────────────────────────────────────────────────
// The app should feel alive and aware of the moment: surface brunch spots and
// markets in the morning, nightlife and live music in the evening, etc. Returns
// a gentle multiplier (≈0.8–1.25) so it nudges ranking without overpowering the
// user's own learned taste. `hour` is injectable for tests.
export function timeRelevance(category: Category, hour = new Date().getHours()): number {
  const morning   = hour >= 6  && hour < 11;  // breakfast / fresh start
  const midday    = hour >= 11 && hour < 15;  // lunch / daytime out
  const afternoon = hour >= 15 && hour < 18;  // culture / shopping
  const evening   = hour >= 18 && hour < 23;  // going out
  const lateNight = hour >= 23 || hour < 6;   // night owls

  const boosts: Partial<Record<Category, number>> = (() => {
    if (morning)   return { food: 1.20, restaurants: 1.15, fitness: 1.20, sightseeing: 1.10, lifestyle: 1.10 };
    if (midday)    return { food: 1.25, restaurants: 1.20, sightseeing: 1.15, shops: 1.10, fashion: 1.10 };
    if (afternoon) return { sightseeing: 1.20, art: 1.20, shops: 1.15, fashion: 1.15, community: 1.10 };
    if (evening)   return { music: 1.25, events: 1.20, venues: 1.25, restaurants: 1.15, food: 1.10 };
    if (lateNight) return { music: 1.20, venues: 1.20, events: 1.10 };
    return {};
  })();
  return boosts[category] ?? 0.92;
}

export function scorePost(
  post: Post,
  preferences: UserPreferences,
  aiProfile: AIProfile,
  hour?: number
): number {
  const explicitPref = (preferences[post.category as keyof UserPreferences] ?? 50) / 100;
  const implicitPref = ((aiProfile.categoryEngagement[post.category] ?? (preferences[post.category as keyof UserPreferences] ?? 50)) / 100);
  const combinedPref = explicitPref * 0.55 + implicitPref * 0.45;

  const engagementScore = Math.min(Math.log10(post.likes + 1) / 6, 1);
  const hoursOld = (Date.now() - post.timestamp) / (1000 * 60 * 60);
  const recencyScore = Math.exp(-hoursOld / 72);
  const eventBoost = post.isEvent ? 0.18 : 0;
  // Right-thing-right-now nudge — keeps the feed feeling current.
  const timeBoost = (timeRelevance(post.category, hour) - 1) * 0.12;

  return combinedPref * 0.40 + engagementScore * 0.22 + recencyScore * 0.20 + eventBoost + timeBoost + Math.random() * 0.02;
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

// Implicit signal: the user chose to browse a category (tapped its tab/chip).
// A much smaller nudge than a like/save — browsing is frequent — but over many
// sessions it lets the feed quietly learn what a user actually opens, not just
// what they tap a heart on. Capped so it can't run away on its own.
export function learnFromBrowse(profile: AIProfile, category: Category): AIProfile {
  const current = profile.categoryEngagement[category] ?? 50;
  // Browsing tops out at 80 on its own — real likes/saves are what push past it.
  const updated = current >= 80 ? current : Math.min(80, current + 0.8);
  return {
    ...profile,
    categoryEngagement: { ...profile.categoryEngagement, [category]: updated },
    lastActive: Date.now(),
  };
}
