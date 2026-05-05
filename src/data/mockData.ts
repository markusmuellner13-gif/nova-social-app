import { Post, Story, User, Notification } from '@/types';

export const MOCK_USERS: User[] = [
  { id: 'u1', name: 'Alex Rivera', username: 'alex.travel', avatar: 'https://i.pravatar.cc/150?img=11', bio: '✈️ 47 countries & counting | Storyteller', followers: 128500, following: 892, posts: 342, verified: true },
  { id: 'u2', name: 'Mia Chen', username: 'mia.eats', avatar: 'https://i.pravatar.cc/150?img=5', bio: '🍜 Chef & food photographer | NYC', followers: 89200, following: 1100, posts: 215 },
  { id: 'u3', name: 'Jake Storm', username: 'jakestorm', avatar: 'https://i.pravatar.cc/150?img=12', bio: '⚽ Pro footballer | Living the dream', followers: 320000, following: 450, posts: 180, verified: true },
  { id: 'u4', name: 'Luna Art', username: 'luna.creates', avatar: 'https://i.pravatar.cc/150?img=9', bio: '🎨 Digital artist | Colour is my language', followers: 55000, following: 780, posts: 423 },
  { id: 'u5', name: 'Sam Techie', username: 'sam.dev', avatar: 'https://i.pravatar.cc/150?img=15', bio: '💻 Builder of things | Open source fanatic', followers: 41000, following: 600, posts: 97 },
  { id: 'u6', name: 'Rina Fit', username: 'rina.fit', avatar: 'https://i.pravatar.cc/150?img=47', bio: '💪 Fitness coach | Mind & body balance', followers: 74000, following: 320, posts: 289 },
  { id: 'u7', name: 'Oscar Beats', username: 'oscar.beats', avatar: 'https://i.pravatar.cc/150?img=52', bio: '🎵 Producer | Music is the soul of life', followers: 198000, following: 550, posts: 156, verified: true },
  { id: 'u8', name: 'Zoe Style', username: 'zoe.fashion', avatar: 'https://i.pravatar.cc/150?img=44', bio: '👗 Fashion editor | Trend-setter', followers: 245000, following: 900, posts: 501, verified: true },
  { id: 'u9', name: 'Leo & Coco', username: 'leo.and.coco', avatar: 'https://i.pravatar.cc/150?img=58', bio: '🐾 Two dogs, one life | Rescue advocate', followers: 162000, following: 430, posts: 612 },
  { id: 'u10', name: 'Nina Life', username: 'nina.lifestyle', avatar: 'https://i.pravatar.cc/150?img=25', bio: '🌟 Mindful living | Slow mornings, good coffee', followers: 93000, following: 720, posts: 334 },
];

const now = Date.now();
const h = (hours: number) => now - hours * 60 * 60 * 1000;

export const MOCK_POSTS: Post[] = [
  {
    id: 'p1', user: MOCK_USERS[0],
    image: 'https://picsum.photos/seed/santorini22/600/750',
    caption: 'Santorini sunsets never get old 🌅 Every evening feels like a painting come to life.',
    likes: 12480, comments: 234, category: 'travel',
    hashtags: ['#santorini', '#greece', '#travel', '#sunset', '#wanderlust'],
    timestamp: h(2), location: { name: 'Santorini, Greece', lat: 36.3932, lng: 25.4615 },
    saved: false, liked: false,
  },
  {
    id: 'p2', user: MOCK_USERS[1],
    image: 'https://picsum.photos/seed/ramen88/600/750',
    caption: 'Homemade tonkotsu ramen after 18 hours of broth prep 🍜 Worth every second.',
    likes: 8920, comments: 178, category: 'food',
    hashtags: ['#ramen', '#foodie', '#homemade', '#nyc', '#japanesefood'],
    timestamp: h(5), location: { name: 'New York, USA', lat: 40.7128, lng: -74.0060 },
    saved: false, liked: true,
  },
  {
    id: 'p3', user: MOCK_USERS[7],
    image: 'https://picsum.photos/seed/fashion77/600/750',
    caption: 'Spring collection 2026 — softness meets structure 🌸 Drop link in bio.',
    likes: 31200, comments: 892, category: 'fashion',
    hashtags: ['#fashion', '#spring2026', '#ootd', '#style', '#designer'],
    timestamp: h(8), location: { name: 'Paris, France', lat: 48.8566, lng: 2.3522 },
    saved: true, liked: false,
  },
  {
    id: 'p4', user: MOCK_USERS[2],
    image: 'https://picsum.photos/seed/soccer44/600/750',
    caption: 'Match day energy ⚡️ Nothing compares to the roar of 80,000 fans.',
    likes: 98400, comments: 4120, category: 'sports',
    hashtags: ['#football', '#matchday', '#soccer', '#athlete', '#goals'],
    timestamp: h(12), location: { name: 'London, UK', lat: 51.5074, lng: -0.1278 },
    saved: false, liked: true,
  },
  {
    id: 'p5', user: MOCK_USERS[3],
    image: 'https://picsum.photos/seed/digitalart55/600/750',
    caption: 'New piece: "Into the Void" 🎨 A journey through solitude and colour.',
    likes: 6780, comments: 312, category: 'art',
    hashtags: ['#digitalart', '#art', '#abstract', '#artist', '#creative'],
    timestamp: h(18), location: { name: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503 },
    saved: true, liked: false,
  },
  {
    id: 'p6', user: MOCK_USERS[4],
    image: 'https://picsum.photos/seed/coding33/600/750',
    caption: 'Just shipped a new open-source project 🚀 CLI tool for lightning-fast deployments. Star it on GitHub!',
    likes: 4230, comments: 189, category: 'tech',
    hashtags: ['#tech', '#coding', '#opensource', '#developer', '#startup'],
    timestamp: h(24), location: { name: 'San Francisco, USA', lat: 37.7749, lng: -122.4194 },
    saved: false, liked: false,
  },
  {
    id: 'p7', user: MOCK_USERS[5],
    image: 'https://picsum.photos/seed/fitness99/600/750',
    caption: '5AM workout hits different when the sun rises with you 🌄💪 No excuses.',
    likes: 14560, comments: 421, category: 'fitness',
    hashtags: ['#fitness', '#workout', '#morninggrind', '#fitlife', '#gym'],
    timestamp: h(30), location: { name: 'Sydney, Australia', lat: -33.8688, lng: 151.2093 },
    saved: false, liked: true,
  },
  {
    id: 'p8', user: MOCK_USERS[6],
    image: 'https://picsum.photos/seed/studio77/600/750',
    caption: 'Late nights in the studio 🎵 New album is almost ready. Can you feel it?',
    likes: 42100, comments: 1890, category: 'music',
    hashtags: ['#music', '#studio', '#producer', '#newalbum', '#hiphop'],
    timestamp: h(36), location: { name: 'Los Angeles, USA', lat: 34.0522, lng: -118.2437 },
    saved: true, liked: false,
  },
  {
    id: 'p9', user: MOCK_USERS[8],
    image: 'https://picsum.photos/seed/dogs22/600/750',
    caption: 'Leo found a new best friend at the park today 🐾❤️ Rescue dogs are pure love.',
    likes: 28900, comments: 743, category: 'pets',
    hashtags: ['#dogs', '#rescue', '#dogsofinstagram', '#pets', '#love'],
    timestamp: h(42), location: { name: 'Berlin, Germany', lat: 52.5200, lng: 13.4050 },
    saved: false, liked: false,
  },
  {
    id: 'p10', user: MOCK_USERS[9],
    image: 'https://picsum.photos/seed/lifestyle11/600/750',
    caption: 'Sunday ritual: slow coffee, good book, zero notifications ☕📖 Protect your peace.',
    likes: 18750, comments: 562, category: 'lifestyle',
    hashtags: ['#lifestyle', '#sundayvibes', '#mindfulness', '#slowliving', '#coffee'],
    timestamp: h(48), location: { name: 'Amsterdam, Netherlands', lat: 52.3676, lng: 4.9041 },
    saved: false, liked: true,
  },
  {
    id: 'p11', user: MOCK_USERS[0],
    image: 'https://picsum.photos/seed/kyoto88/600/750',
    caption: 'Kyoto in cherry blossom season is a dream you never want to wake from 🌸',
    likes: 22340, comments: 498, category: 'travel',
    hashtags: ['#kyoto', '#japan', '#cherryblossom', '#sakura', '#travel'],
    timestamp: h(56), location: { name: 'Kyoto, Japan', lat: 35.0116, lng: 135.7681 },
    saved: false, liked: false,
  },
  {
    id: 'p12', user: MOCK_USERS[1],
    image: 'https://picsum.photos/seed/tacos99/600/750',
    caption: 'Street tacos in Mexico City 🌮 Simple ingredients, maximum flavour. The best meal of my life.',
    likes: 11200, comments: 289, category: 'food',
    hashtags: ['#tacos', '#mexicanfood', '#streetfood', '#foodie', '#travel'],
    timestamp: h(60), location: { name: 'Mexico City, Mexico', lat: 19.4326, lng: -99.1332 },
    saved: true, liked: false,
  },
  {
    id: 'p13', user: MOCK_USERS[7],
    image: 'https://picsum.photos/seed/runway55/600/750',
    caption: 'Behind the scenes at Milan Fashion Week 👗✨ Energy is electric here.',
    likes: 45600, comments: 1230, category: 'fashion',
    hashtags: ['#milanfashionweek', '#fashion', '#runway', '#mfw', '#style'],
    timestamp: h(68), location: { name: 'Milan, Italy', lat: 45.4654, lng: 9.1859 },
    saved: false, liked: true,
  },
  {
    id: 'p14', user: MOCK_USERS[2],
    image: 'https://picsum.photos/seed/training66/600/750',
    caption: 'Pre-season training starts now 🏋️ The real work happens when nobody is watching.',
    likes: 76800, comments: 3200, category: 'sports',
    hashtags: ['#training', '#football', '#preseason', '#discipline', '#athlete'],
    timestamp: h(72), location: { name: 'Madrid, Spain', lat: 40.4168, lng: -3.7038 },
    saved: false, liked: false,
  },
  {
    id: 'p15', user: MOCK_USERS[3],
    image: 'https://picsum.photos/seed/watercolor44/600/750',
    caption: 'Experimenting with watercolour and glitch effects 🎨 When analogue meets digital.',
    likes: 9140, comments: 267, category: 'art',
    hashtags: ['#art', '#watercolour', '#glitch', '#mixedmedia', '#creative'],
    timestamp: h(80), location: { name: 'Barcelona, Spain', lat: 41.3851, lng: 2.1734 },
    saved: true, liked: true,
  },
  {
    id: 'p16', user: MOCK_USERS[4],
    image: 'https://picsum.photos/seed/ai22/600/750',
    caption: 'The AI model finally converged after 72h of training 🤖 The results are wild. Thread below 👇',
    likes: 5670, comments: 432, category: 'tech',
    hashtags: ['#ai', '#machinelearning', '#tech', '#developer', '#research'],
    timestamp: h(90), location: { name: 'Seattle, USA', lat: 47.6062, lng: -122.3321 },
    saved: false, liked: false,
  },
  {
    id: 'p17', user: MOCK_USERS[5],
    image: 'https://picsum.photos/seed/yoga33/600/750',
    caption: 'Yoga at sunset — body, mind, and horizon aligned 🧘‍♀️🌅 Find your centre.',
    likes: 21300, comments: 610, category: 'fitness',
    hashtags: ['#yoga', '#fitness', '#sunset', '#mindfulness', '#wellness'],
    timestamp: h(96), location: { name: 'Bali, Indonesia', lat: -8.4095, lng: 115.1889 },
    saved: false, liked: true,
  },
  {
    id: 'p18', user: MOCK_USERS[6],
    image: 'https://picsum.photos/seed/concert11/600/750',
    caption: 'SOLD OUT world tour 🎤🌍 Thank you to every single person who shows up.',
    likes: 189000, comments: 8920, category: 'music',
    hashtags: ['#concert', '#music', '#worldtour', '#livemusic', '#artist'],
    timestamp: h(108), location: { name: 'Rio de Janeiro, Brazil', lat: -22.9068, lng: -43.1729 },
    saved: true, liked: false,
  },
  {
    id: 'p19', user: MOCK_USERS[8],
    image: 'https://picsum.photos/seed/cat44/600/750',
    caption: 'Coco decided this is her throne now 👑🐱 The audacity of cats.',
    likes: 34200, comments: 912, category: 'pets',
    hashtags: ['#cats', '#catsofinstagram', '#catlife', '#pets', '#cute'],
    timestamp: h(120), location: { name: 'Vienna, Austria', lat: 48.2082, lng: 16.3738 },
    saved: false, liked: true,
  },
  {
    id: 'p20', user: MOCK_USERS[9],
    image: 'https://picsum.photos/seed/cabin22/600/750',
    caption: 'Cabin in the woods, no wifi, no problems 🌲🔥 Disconnecting to reconnect.',
    likes: 27600, comments: 734, category: 'lifestyle',
    hashtags: ['#cabin', '#offgrid', '#nature', '#lifestyle', '#peace'],
    timestamp: h(132), location: { name: 'Stockholm, Sweden', lat: 59.3293, lng: 18.0686 },
    saved: false, liked: false,
  },
  {
    id: 'p21', user: MOCK_USERS[0],
    image: 'https://picsum.photos/seed/machu33/600/750',
    caption: 'Machu Picchu at sunrise — 4am hike, zero regrets 🏔️ Some things are worth the effort.',
    likes: 31800, comments: 621, category: 'travel',
    hashtags: ['#machupicchu', '#peru', '#hiking', '#travel', '#andes'],
    timestamp: h(140), location: { name: 'Machu Picchu, Peru', lat: -13.1631, lng: -72.5450 },
    saved: true, liked: false,
  },
  {
    id: 'p22', user: MOCK_USERS[1],
    image: 'https://picsum.photos/seed/sushi77/600/750',
    caption: 'Omakase at its finest 🍣 18 courses of pure artistry. Japan never disappoints.',
    likes: 13900, comments: 345, category: 'food',
    hashtags: ['#sushi', '#omakase', '#japan', '#foodie', '#finedining'],
    timestamp: h(150), location: { name: 'Osaka, Japan', lat: 34.6937, lng: 135.5023 },
    saved: false, liked: false,
  },
];

export const MOCK_STORIES: Story[] = [
  { id: 's1', user: MOCK_USERS[0], seen: false },
  { id: 's2', user: MOCK_USERS[1], seen: false },
  { id: 's3', user: MOCK_USERS[7], seen: true },
  { id: 's4', user: MOCK_USERS[2], seen: false },
  { id: 's5', user: MOCK_USERS[5], seen: true },
  { id: 's6', user: MOCK_USERS[6], seen: false },
  { id: 's7', user: MOCK_USERS[3], seen: false },
  { id: 's8', user: MOCK_USERS[8], seen: true },
];

export const CURRENT_USER: User = {
  id: 'current',
  name: 'You',
  username: 'your.nova',
  avatar: 'https://i.pravatar.cc/150?img=33',
  bio: '✨ Living the moment | Nova user since 2026',
  followers: 1247,
  following: 389,
  posts: 28,
};

export const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 'n1', user: MOCK_USERS[2], type: 'like', postImage: 'https://picsum.photos/seed/notif1/80/80', text: 'liked your photo', timestamp: h(0.5), read: false },
  { id: 'n2', user: MOCK_USERS[0], type: 'follow', text: 'started following you', timestamp: h(1), read: false },
  { id: 'n3', user: MOCK_USERS[7], type: 'comment', postImage: 'https://picsum.photos/seed/notif2/80/80', text: 'commented: "Absolutely stunning! 😍"', timestamp: h(2), read: false },
  { id: 'n4', user: MOCK_USERS[5], type: 'like', postImage: 'https://picsum.photos/seed/notif3/80/80', text: 'liked your photo', timestamp: h(4), read: true },
  { id: 'n5', user: MOCK_USERS[1], type: 'mention', postImage: 'https://picsum.photos/seed/notif4/80/80', text: 'mentioned you in a comment', timestamp: h(8), read: true },
  { id: 'n6', user: MOCK_USERS[3], type: 'follow', text: 'started following you', timestamp: h(12), read: true },
  { id: 'n7', user: MOCK_USERS[6], type: 'like', postImage: 'https://picsum.photos/seed/notif5/80/80', text: 'and 847 others liked your photo', timestamp: h(24), read: true },
  { id: 'n8', user: MOCK_USERS[9], type: 'comment', postImage: 'https://picsum.photos/seed/notif6/80/80', text: 'commented: "Goals! 🔥"', timestamp: h(36), read: true },
];

export const DEFAULT_PREFERENCES = {
  travel: 80,
  food: 60,
  fashion: 40,
  sports: 50,
  art: 70,
  tech: 65,
  fitness: 55,
  music: 75,
  pets: 85,
  lifestyle: 60,
};

export function calculatePostScore(post: Post, prefs: Record<string, number>): number {
  const prefScore = (prefs[post.category] ?? 50) / 100;
  const engagementScore = Math.min(Math.log10(post.likes + 1) / 6, 1);
  const hoursOld = (Date.now() - post.timestamp) / (1000 * 60 * 60);
  const recencyScore = Math.exp(-hoursOld / 48);
  return prefScore * 0.55 + engagementScore * 0.25 + recencyScore * 0.20;
}

export function getSortedFeed(posts: Post[], prefs: Record<string, number>): Post[] {
  return [...posts].sort((a, b) => calculatePostScore(b, prefs) - calculatePostScore(a, prefs));
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
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
