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
  | 'lifestyle';

export interface PostLocation {
  name: string;
  lat: number;
  lng: number;
}

export interface Post {
  id: string;
  user: User;
  image: string;
  caption: string;
  likes: number;
  comments: number;
  category: Category;
  hashtags: string[];
  timestamp: number;
  location: PostLocation;
  saved: boolean;
  liked: boolean;
}

export interface Story {
  id: string;
  user: User;
  seen: boolean;
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
}

export interface Notification {
  id: string;
  user: User;
  type: 'like' | 'comment' | 'follow' | 'mention';
  postImage?: string;
  text: string;
  timestamp: number;
  read: boolean;
}
