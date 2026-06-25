export interface User {
  id: string;
  name: string;
  username: string;
  avatar: string;
  bio: string;
  followers: number;
  following: number;
  posts: number;
  verified?: boolean;
}

export type Category =
  | 'travel'
  | 'food'
  | 'fashion'
  | 'sports'
  | 'art'
  | 'tech'
  | 'fitness'
  | 'music'
  | 'pets'
  | 'lifestyle'
  | 'events'
  | 'sightseeing'
  | 'shops'
  | 'venues'
  | 'community'
  | 'restaurants'
  | 'hotels'
  | 'rentals'
  | 'outdoors';

export interface PostLocation {
  name: string;
  lat: number;
  lng: number;
}

export interface Post {
  id: string;
  user: User;
  image: string;
  // Optional extra photos for a swipeable gallery (e.g. several real Wikimedia
  // photos of a landmark). When absent or length<=1, the post shows just `image`.
  images?: string[];
  caption: string;
  likes: number;
  comments: number;
  category: Category;
  hashtags: string[];
  timestamp: number;
  location: PostLocation;
  saved: boolean;
  liked: boolean;
  isEvent?: boolean;
  isAIGenerated?: boolean;
  isSponsored?: boolean;
  eventDate?: string;
  eventDateRaw?: string;
  eventVenue?: string;
  eventUrl?: string;
  organizer?: string;
  price?: string;
  sponsoredCta?: string;
  distanceKm?: number;
}

export interface Comment {
  id: string;
  user: User;
  text: string;
  timestamp: number;
  likes: number;
}

export interface Story {
  id: string;
  user: User;
  seen: boolean;
  image: string;
}

export interface UserPreferences {
  travel: number;
  food: number;
  fashion: number;
  sports: number;
  art: number;
  tech: number;
  fitness: number;
  music: number;
  pets: number;
  lifestyle: number;
  events: number;
  sightseeing: number;
  shops: number;
  venues: number;
  community: number;
  restaurants: number;
  hotels: number;
  rentals: number;
  outdoors: number;
}

export interface NovaNotification {
  id: string;
  user: User;
  type: 'like' | 'comment' | 'follow' | 'mention' | 'ai_suggestion' | 'event';
  postImage?: string;
  text: string;
  timestamp: number;
  read: boolean;
  postId?: string;
}

export interface AIProfile {
  categoryEngagement: Partial<Record<Category, number>>;
  totalInteractions: number;
  lastActive: number;
  sessionCount: number;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'info' | 'error';
  icon?: string;
}

export interface LocationState {
  lat: number;
  lng: number;
  city: string;
  country: string;
  countryCode: string;
  enabled: boolean;
  // Administrative district the city belongs to (county / Bezirk / Landkreis /
  // département / provincia …). Used to frame the feed by area rather than a raw
  // radius, so e.g. Baden surfaces its whole district (Pfaffstätten, Bad Vöslau,
  // Traiskirchen…) but not the separate big city next door (Vienna).
  district?: string;
  // How far (km) counts as "local" for this place — adapts to whether the
  // resolved place is a metropolis or a small town/district. Worldwide-safe.
  localKm?: number;
}

export interface Reminder {
  postId: string;
  title: string;
  venue: string;
  eventDateRaw: string;
  minutesBefore: number; // 1440 = 1 day before, 60 = 1 hour before
}

export interface AppPersistedState {
  preferences: UserPreferences;
  likedPosts: string[];
  savedPosts: string[];
  // Full snapshots of every post the user liked/saved/marked going — feed
  // posts are ephemeral (live API data), so the profile tab needs its own
  // copies to show them after the app is reopened
  interactionPosts: Post[];
  followedUsers: string[];
  seenStories: string[];
  goingPosts: string[];
  reminders: Reminder[];
  hasOnboarded: boolean;
  aiProfile: AIProfile;
  notifications: NovaNotification[];
  location: LocationState | null;
  locationEnabled: boolean;
  hasSeenLocationPrompt: boolean;
}
