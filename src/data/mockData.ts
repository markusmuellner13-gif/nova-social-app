import { Post, Story, User, NovaNotification, Comment, Category } from '@/types';

// Nova AI system user — used for all AI-generated notifications
export const NOVA_AI_USER: User = {
  id: 'nova_ai',
  name: 'Nova AI',
  username: 'nova.discover',
  avatar: 'https://logo.clearbit.com/anthropic.com',
  bio: '🤖 AI-powered local event discovery',
  followers: 0, following: 0, posts: 0,
  verified: true,
};

// ── Company / Organisation accounts ─────────────────────────────────────────
export const MOCK_USERS: User[] = [
  { id: 'u1', name: 'Lonely Planet', username: 'lonelyplanet', avatar: 'https://logo.clearbit.com/lonelyplanet.com', bio: '✈️ Travel guides, destination inspiration & unforgettable experiences', followers: 8900000, following: 0, posts: 78000, verified: true },
  { id: 'u2', name: 'Time Out', username: 'timeout', avatar: 'https://logo.clearbit.com/timeout.com', bio: '🌍 Inspiring people to experience their city to the fullest', followers: 3400000, following: 0, posts: 124000, verified: true },
  { id: 'u3', name: 'UEFA Champions League', username: 'championsleague', avatar: 'https://logo.clearbit.com/uefa.com', bio: '⚽ The pinnacle of European club football', followers: 28000000, following: 0, posts: 6500, verified: true },
  { id: 'u4', name: 'Saatchi Art', username: 'saatchiart', avatar: 'https://logo.clearbit.com/saatchiart.com', bio: '🎨 The world\'s leading online art gallery — discover emerging artists', followers: 890000, following: 0, posts: 28000, verified: true },
  { id: 'u5', name: 'TechCrunch', username: 'techcrunch', avatar: 'https://logo.clearbit.com/techcrunch.com', bio: '💻 Technology news, startup events & innovation culture', followers: 6200000, following: 0, posts: 89000, verified: true },
  { id: 'u6', name: 'Nike Training Club', username: 'niketraining', avatar: 'https://logo.clearbit.com/nike.com', bio: '💪 Move your body. Change your life. Official Nike fitness events.', followers: 12000000, following: 0, posts: 4500, verified: true },
  { id: 'u7', name: 'Resident Advisor', username: 'residentadvisor', avatar: 'https://logo.clearbit.com/ra.co', bio: '🎵 The world\'s definitive guide to electronic music & club culture', followers: 2400000, following: 0, posts: 120000, verified: true },
  { id: 'u8', name: 'Vogue', username: 'vogue', avatar: 'https://logo.clearbit.com/vogue.com', bio: '👗 Fashion, culture, style. The world\'s most influential fashion brand.', followers: 24000000, following: 0, posts: 67000, verified: true },
  { id: 'u9', name: 'Battersea Dogs & Cats', username: 'battersea', avatar: 'https://logo.clearbit.com/battersea.org.uk', bio: '🐾 Giving every animal the chance for a better life since 1860', followers: 780000, following: 0, posts: 3400, verified: true },
  { id: 'u10', name: 'Airbnb Experiences', username: 'airbnbexp', avatar: 'https://logo.clearbit.com/airbnb.com', bio: '🌟 Unique local experiences hosted by passionate people worldwide', followers: 5600000, following: 0, posts: 34000, verified: true },
  { id: 'u11', name: 'Eventbrite', username: 'eventbrite', avatar: 'https://logo.clearbit.com/eventbrite.com', bio: '🎉 Experience more of the world\'s events. Discover what\'s on near you.', followers: 1200000, following: 0, posts: 230000, verified: true },
  { id: 'u12', name: 'National Geographic', username: 'natgeo', avatar: 'https://logo.clearbit.com/nationalgeographic.com', bio: '🌏 Inspiring people to care about the planet since 1888', followers: 42000000, following: 0, posts: 95000, verified: true },
];

const now = Date.now();
const h = (hours: number) => now - hours * 60 * 60 * 1000;

export const MOCK_POSTS: Post[] = [
  // ── Travel ──────────────────────────────────────────────────────────────
  {
    id: 'p1', user: MOCK_USERS[0],
    image: 'https://picsum.photos/seed/santorini22/600/750',
    caption: 'Santorini sunsets — 5 breathtaking viewpoints you have to see in person 🌅 Oia, Fira, Imerovigli, Akrotiri lighthouse, and the caldera edge at Amoudi Bay.',
    likes: 142800, comments: 1234, category: 'travel',
    hashtags: ['#santorini', '#greece', '#travel', '#sunset', '#wanderlust'],
    timestamp: h(2), location: { name: 'Santorini, Greece', lat: 36.3932, lng: 25.4615 },
    saved: false, liked: false, organizer: 'Lonely Planet',
  },
  {
    id: 'p11', user: MOCK_USERS[0],
    image: 'https://picsum.photos/seed/kyoto88/600/750',
    caption: 'Kyoto cherry blossom season 2026 — forecast just released. Peak bloom: March 25–April 5. These are the 8 spots you need to visit 🌸',
    likes: 229400, comments: 4980, category: 'travel',
    hashtags: ['#kyoto', '#japan', '#cherryblossom', '#sakura', '#travel'],
    timestamp: h(56), location: { name: 'Kyoto, Japan', lat: 35.0116, lng: 135.7681 },
    saved: false, liked: false, organizer: 'Lonely Planet',
  },
  {
    id: 'p33', user: MOCK_USERS[11],
    image: 'https://picsum.photos/seed/capetown55/600/750',
    caption: 'Cape Town just ranked #1 city in Africa for experiences in 2026. Table Mountain, the V&A Waterfront, and Camps Bay — here\'s the complete guide 🏔️🌊',
    likes: 189000, comments: 3870, category: 'travel',
    hashtags: ['#capetown', '#southafrica', '#tablemountain', '#africa', '#travel'],
    timestamp: h(18), location: { name: 'Cape Town, South Africa', lat: -33.9249, lng: 18.4241 },
    saved: false, liked: false, organizer: 'National Geographic',
  },
  // ── Food ────────────────────────────────────────────────────────────────
  {
    id: 'p2', user: MOCK_USERS[1],
    image: 'https://picsum.photos/seed/ramen88/600/750',
    caption: 'The 12 best ramen shops in New York City right now — ranked by our food critics. From $8 bowls to $45 omakase tonkotsu. Full guide in bio 🍜',
    likes: 89200, comments: 1780, category: 'food',
    hashtags: ['#ramen', '#foodie', '#nyc', '#japanesefood', '#bestinnyc'],
    timestamp: h(5), location: { name: 'New York, USA', lat: 40.7128, lng: -74.0060 },
    saved: false, liked: true, organizer: 'Time Out',
  },
  {
    id: 'p35', user: MOCK_USERS[1],
    image: 'https://picsum.photos/seed/pasta44/600/750',
    caption: 'Rome\'s best trattorias in 2026 — we ate at 40 restaurants so you don\'t have to. These 9 are worth flying for 🍝🇮🇹',
    likes: 97000, comments: 2230, category: 'food',
    hashtags: ['#rome', '#italian', '#trattoria', '#foodguide', '#foodphotography'],
    timestamp: h(32), location: { name: 'Rome, Italy', lat: 41.9028, lng: 12.4964 },
    saved: false, liked: false, organizer: 'Time Out',
  },
  // ── Fashion ─────────────────────────────────────────────────────────────
  {
    id: 'p3', user: MOCK_USERS[7],
    image: 'https://picsum.photos/seed/fashion77/600/750',
    caption: 'Spring/Summer 2026 — The trends that will define the season. Soft tailoring, fluid silhouettes, and a return to elevated minimalism 🌸 Full SS26 report on vogue.com.',
    likes: 312000, comments: 8920, category: 'fashion',
    hashtags: ['#fashion', '#spring2026', '#ootd', '#style', '#ss26'],
    timestamp: h(8), location: { name: 'Paris, France', lat: 48.8566, lng: 2.3522 },
    saved: true, liked: false, organizer: 'Vogue',
  },
  {
    id: 'p13', user: MOCK_USERS[7],
    image: 'https://picsum.photos/seed/runway55/600/750',
    caption: 'Milan Fashion Week SS27 — the 7 moments that had the entire industry talking. Full runway reviews at vogue.com 👗✨',
    likes: 456000, comments: 12300, category: 'fashion',
    hashtags: ['#milanfashionweek', '#fashion', '#runway', '#mfw', '#style'],
    timestamp: h(68), location: { name: 'Milan, Italy', lat: 45.4654, lng: 9.1859 },
    saved: false, liked: true, organizer: 'Vogue',
  },
  // ── Sports ──────────────────────────────────────────────────────────────
  {
    id: 'p4', user: MOCK_USERS[2],
    image: 'https://picsum.photos/seed/soccer44/600/750',
    caption: 'UEFA Champions League Final 2026 — Wembley, 90,000 fans, the biggest night in European football. Tickets still available via UEFA.com ⚽🏆',
    likes: 984000, comments: 41200, category: 'sports',
    hashtags: ['#championsleague', '#uefafinal', '#football', '#wembley', '#ucl'],
    timestamp: h(12), location: { name: 'London, UK', lat: 51.5074, lng: -0.1278 },
    saved: false, liked: true, isEvent: true, eventDate: 'Jun 14, 2026', eventVenue: 'Wembley Stadium',
    eventUrl: 'https://www.uefa.com/uefachampionsleague/final/', organizer: 'UEFA', price: 'From €85',
  },
  // ── Art ─────────────────────────────────────────────────────────────────
  {
    id: 'p5', user: MOCK_USERS[3],
    image: 'https://picsum.photos/seed/digitalart55/600/750',
    caption: 'Introducing 14 breakthrough artists at Art Basel Miami Beach 2026. These are the names you\'ll be hearing for the next decade 🎨',
    likes: 67800, comments: 3120, category: 'art',
    hashtags: ['#artbasel', '#contemporaryart', '#art', '#artist', '#miami'],
    timestamp: h(18), location: { name: 'Miami, USA', lat: 25.7825, lng: -80.1300 },
    saved: true, liked: false, organizer: 'Saatchi Art',
  },
  // ── Tech ────────────────────────────────────────────────────────────────
  {
    id: 'p6', user: MOCK_USERS[4],
    image: 'https://picsum.photos/seed/coding33/600/750',
    caption: 'TechCrunch Disrupt 2026 — 12,000 founders, 500 investors, 3 days. Early bird tickets now open. The startup event of the year is back 🚀',
    likes: 42300, comments: 1890, category: 'tech',
    hashtags: ['#techcrunch', '#disrupt', '#startups', '#tech', '#sanfrancisco'],
    timestamp: h(24), location: { name: 'San Francisco, USA', lat: 37.7749, lng: -122.4194 },
    saved: false, liked: false, isEvent: true, eventDate: 'Oct 21–23, 2026', eventVenue: 'Moscone Center',
    eventUrl: 'https://techcrunch.com/events/tc-disrupt-2026/', organizer: 'TechCrunch', price: 'From $499',
  },
  // ── Fitness ─────────────────────────────────────────────────────────────
  {
    id: 'p7', user: MOCK_USERS[5],
    image: 'https://picsum.photos/seed/fitness99/600/750',
    caption: 'Nike\'s free community run returns to Sydney this Sunday — 5K and 10K routes, all paces welcome. Register free at nike.com/run 🌄💪',
    likes: 145600, comments: 4210, category: 'fitness',
    hashtags: ['#nike', '#run', '#sydney', '#fitness', '#community'],
    timestamp: h(30), location: { name: 'Sydney, Australia', lat: -33.8688, lng: 151.2093 },
    saved: false, liked: true, isEvent: true, eventDate: 'Every Sunday', eventVenue: 'Bondi Beach',
    eventUrl: 'https://www.nike.com/activities', organizer: 'Nike Training Club', price: 'Free',
  },
  // ── Music ───────────────────────────────────────────────────────────────
  {
    id: 'p8', user: MOCK_USERS[6],
    image: 'https://picsum.photos/seed/studio77/600/750',
    caption: 'The 50 best clubs in the world for 2026 — RA\'s definitive annual ranking is here. #1 might surprise you 🎵',
    likes: 421000, comments: 18900, category: 'music',
    hashtags: ['#music', '#techno', '#clubculture', '#ra', '#electronicmusic'],
    timestamp: h(36), location: { name: 'Berlin, Germany', lat: 52.5200, lng: 13.4050 },
    saved: true, liked: false, organizer: 'Resident Advisor',
  },
  {
    id: 'p18', user: MOCK_USERS[6],
    image: 'https://picsum.photos/seed/concert11/600/750',
    caption: 'Glastonbury 2026 lineup CONFIRMED. Headliners: three names that have never played the Pyramid Stage before. Tickets via glastonbury.com 🎸🌍',
    likes: 1890000, comments: 89200, category: 'music',
    hashtags: ['#glastonbury', '#glastonbury2026', '#music', '#festival', '#uk'],
    timestamp: h(108), location: { name: 'Somerset, UK', lat: 51.1444, lng: -2.5900 },
    saved: true, liked: false, isEvent: true, eventDate: 'Jun 24–28, 2026', eventVenue: 'Worthy Farm, Pilton',
    eventUrl: 'https://www.glastonbury.com', organizer: 'Glastonbury Festival', price: 'From £375',
  },
  // ── Pets ────────────────────────────────────────────────────────────────
  {
    id: 'p9', user: MOCK_USERS[8],
    image: 'https://picsum.photos/seed/dogs22/600/750',
    caption: 'World Dog Show Helsinki 2026 — 30,000 dogs from 100+ countries. Register your dog or buy spectator tickets now. The largest dog show on the planet 🐾',
    likes: 289000, comments: 7430, category: 'pets',
    hashtags: ['#worlddogshow', '#dogs', '#helsinki', '#pets', '#dogshow'],
    timestamp: h(42), location: { name: 'Helsinki, Finland', lat: 60.1699, lng: 24.9384 },
    saved: false, liked: false, isEvent: true, eventDate: 'Jun 25–28, 2026', eventVenue: 'Helsinki Expo Centre',
    eventUrl: 'https://www.worlddogshow.fi', organizer: 'Battersea Dogs & Cats', price: 'From €18',
  },
  // ── Lifestyle ───────────────────────────────────────────────────────────
  {
    id: 'p10', user: MOCK_USERS[9],
    image: 'https://picsum.photos/seed/lifestyle11/600/750',
    caption: 'The 20 most unique Airbnb Experiences in Amsterdam — from canal boat breakfast to a private Rembrandt studio tour. Book via airbnb.com/experiences ☕',
    likes: 187500, comments: 5620, category: 'lifestyle',
    hashtags: ['#airbnb', '#amsterdam', '#experiences', '#travel', '#lifestyle'],
    timestamp: h(48), location: { name: 'Amsterdam, Netherlands', lat: 52.3676, lng: 4.9041 },
    saved: false, liked: true, organizer: 'Airbnb Experiences',
  },
  // ── Events ──────────────────────────────────────────────────────────────
  {
    id: 'ev1', user: MOCK_USERS[10],
    image: 'https://picsum.photos/seed/coachella2026/600/750',
    caption: 'COACHELLA 2026 — Lineup just announced and it\'s the most anticipated in festival history. Weekend 1 & 2 at Empire Polo Club, Indio CA. Tickets on sale Friday via coachella.com 🎪',
    likes: 2840000, comments: 184000, category: 'events',
    hashtags: ['#coachella', '#coachella2026', '#music', '#festival', '#california'],
    timestamp: h(3), location: { name: 'Coachella Valley, USA', lat: 33.6800, lng: -116.2381 },
    saved: false, liked: false, isEvent: true, eventDate: 'Apr 11–20, 2026', eventVenue: 'Empire Polo Club, Indio CA',
    eventUrl: 'https://www.coachella.com', organizer: 'Goldenvoice', price: 'From $429',
  },
  {
    id: 'ev3', user: MOCK_USERS[4],
    image: 'https://picsum.photos/seed/wwdc2026/600/750',
    caption: 'WWDC 2026 — Apple just sent invites. This year\'s keynote will reveal the next generation of AI across all Apple platforms. Free developer streaming at apple.com/wwdc 🍎',
    likes: 1560000, comments: 98000, category: 'events',
    hashtags: ['#wwdc', '#apple', '#tech', '#ios', '#developer'],
    timestamp: h(6), location: { name: 'Cupertino, USA', lat: 37.3387, lng: -121.8853 },
    saved: false, liked: false, isEvent: true, eventDate: 'Jun 9–13, 2026', eventVenue: 'Apple Park, Cupertino',
    eventUrl: 'https://developer.apple.com/wwdc26/', organizer: 'Apple', price: 'Free (streaming)',
  },
  {
    id: 'ev4', user: MOCK_USERS[7],
    image: 'https://picsum.photos/seed/pfw2026/600/750',
    caption: 'Paris Fashion Week SS27 is officially open. Vogue editors are front row. 10 days, 100 shows, one city. Live coverage at vogue.com 👗✨',
    likes: 1980000, comments: 76000, category: 'events',
    hashtags: ['#pfw', '#parisfashionweek', '#fashion', '#paris', '#ss27'],
    timestamp: h(4), location: { name: 'Paris, France', lat: 48.8566, lng: 2.3522 },
    saved: false, liked: false, isEvent: true, eventDate: 'Sep 30 – Oct 8, 2026', eventVenue: 'Various venues, Paris',
    eventUrl: 'https://www.modeaparis.com', organizer: 'Fédération de la Haute Couture', price: 'Industry only',
  },
  {
    id: 'ev5', user: MOCK_USERS[1],
    image: 'https://picsum.photos/seed/ramenfest2026/600/750',
    caption: 'Tokyo Ramen Festival 2026 — 60 stalls, 200 varieties, 200,000 visitors over one weekend. Hibiya Park, free entry. Full guide at timeout.com/tokyo 🍜',
    likes: 448000, comments: 32000, category: 'events',
    hashtags: ['#tokyoramen', '#ramenfestival', '#tokyo', '#food', '#japan'],
    timestamp: h(8), location: { name: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503 },
    saved: false, liked: false, isEvent: true, eventDate: 'Oct 17–19, 2026', eventVenue: 'Hibiya Park, Tokyo',
    eventUrl: 'https://www.timeout.com/tokyo/food-drink/tokyo-ramen-festival', organizer: 'Tokyo Ramen Festival', price: 'Free entry',
  },
  // ── More content ─────────────────────────────────────────────────────────
  {
    id: 'p41', user: MOCK_USERS[11],
    image: 'https://picsum.photos/seed/auroraborealis/600/750',
    caption: 'Northern Lights forecast for Iceland — the next 72 hours look exceptional. KP index reaching 5-6. Here\'s exactly where to go and when to watch 🌌',
    likes: 892000, comments: 34000, category: 'travel',
    hashtags: ['#northernlights', '#auroraborealis', '#iceland', '#natgeo', '#bucketlist'],
    timestamp: h(28), location: { name: 'Reykjavik, Iceland', lat: 64.1355, lng: -21.8954 },
    saved: false, liked: false, organizer: 'National Geographic',
  },
  {
    id: 'p43', user: MOCK_USERS[5],
    image: 'https://picsum.photos/seed/marathon11/600/750',
    caption: 'Boston Marathon 2026 — registration opens Monday. 30,000 runners, one historic course. Everything you need to qualify and register at nike.com/boston 🏅',
    likes: 321000, comments: 12400, category: 'fitness',
    hashtags: ['#bostonmarathon', '#running', '#marathon', '#nike', '#runnersworld'],
    timestamp: h(48), location: { name: 'Boston, USA', lat: 42.3601, lng: -71.0589 },
    saved: false, liked: false, isEvent: true, eventDate: 'Apr 20, 2026', eventVenue: 'Hopkinton to Boston',
    eventUrl: 'https://www.baa.org/races/boston-marathon', organizer: 'Boston Athletic Association', price: '$250 registration',
  },
  {
    id: 'p49', user: MOCK_USERS[9],
    image: 'https://picsum.photos/seed/hygge55/600/750',
    caption: 'Copenhagen ranked the world\'s most liveable city for 2026. These 12 Airbnb Experiences show you exactly why locals love it here 🇩🇰🌟',
    likes: 523000, comments: 19200, category: 'lifestyle',
    hashtags: ['#copenhagen', '#denmark', '#hygge', '#airbnb', '#travel'],
    timestamp: h(34), location: { name: 'Copenhagen, Denmark', lat: 55.6761, lng: 12.5683 },
    saved: false, liked: false, organizer: 'Airbnb Experiences',
  },
  {
    id: 'p50', user: MOCK_USERS[2],
    image: 'https://picsum.photos/seed/surfsession/600/750',
    caption: 'World Surf League Championship Tour Gold Coast 2026 — the world\'s best surfers, Snapper Rocks, free entry on the beach. Livestream at worldsurfleague.com 🏄',
    likes: 671000, comments: 24400, category: 'sports',
    hashtags: ['#wsl', '#surf', '#goldcoast', '#championship', '#waves'],
    timestamp: h(20), location: { name: 'Gold Coast, Australia', lat: -28.0167, lng: 153.4000 },
    saved: false, liked: false, isEvent: true, eventDate: 'Mar 1–12, 2026', eventVenue: 'Snapper Rocks, Gold Coast',
    eventUrl: 'https://www.worldsurfleague.com', organizer: 'World Surf League', price: 'Free beach entry',
  },
];

export const MOCK_STORIES: Story[] = [
  { id: 's1', user: MOCK_USERS[0], seen: false, image: 'https://picsum.photos/seed/story_lp/800/1400' },
  { id: 's2', user: MOCK_USERS[1], seen: false, image: 'https://picsum.photos/seed/story_to/800/1400' },
  { id: 's3', user: MOCK_USERS[7], seen: true,  image: 'https://picsum.photos/seed/story_vg/800/1400' },
  { id: 's4', user: MOCK_USERS[2], seen: false, image: 'https://picsum.photos/seed/story_ue/800/1400' },
  { id: 's5', user: MOCK_USERS[5], seen: true,  image: 'https://picsum.photos/seed/story_nk/800/1400' },
  { id: 's6', user: MOCK_USERS[6], seen: false, image: 'https://picsum.photos/seed/story_ra/800/1400' },
  { id: 's7', user: MOCK_USERS[3], seen: false, image: 'https://picsum.photos/seed/story_sa/800/1400' },
  { id: 's8', user: MOCK_USERS[8], seen: true,  image: 'https://picsum.photos/seed/story_bt/800/1400' },
  { id: 's9', user: MOCK_USERS[9], seen: false, image: 'https://picsum.photos/seed/story_ab/800/1400' },
  { id: 's10', user: MOCK_USERS[11], seen: false, image: 'https://picsum.photos/seed/story_ng/800/1400' },
];

export const CURRENT_USER = {
  id: 'current',
  name: 'You',
  username: 'your.nova',
  avatar: 'https://i.pravatar.cc/150?img=33',
  bio: '✨ Discovering the world with Nova',
  followers: 1247,
  following: 389,
  posts: 28,
};

// AI/event-only notifications — no likes, follows, or mentions
export const MOCK_NOTIFICATIONS: NovaNotification[] = [
  { id: 'n1', user: NOVA_AI_USER, type: 'ai_suggestion', postImage: 'https://picsum.photos/seed/notif_ev1/80/80', text: 'New concerts dropping in your area tonight 🎵', timestamp: h(0.3), read: false },
  { id: 'n2', user: NOVA_AI_USER, type: 'event', postImage: 'https://picsum.photos/seed/notif_ev2/80/80', text: 'Glastonbury 2026 lineup just confirmed — check it out 🎸', timestamp: h(0.8), read: false },
  { id: 'n3', user: NOVA_AI_USER, type: 'ai_suggestion', postImage: 'https://picsum.photos/seed/notif_ev3/80/80', text: 'New art exhibitions near you this weekend 🎨', timestamp: h(1.5), read: false },
  { id: 'n4', user: NOVA_AI_USER, type: 'event', postImage: 'https://picsum.photos/seed/notif_ev4/80/80', text: 'Food festival starts in 2 days — save your spot 🍕', timestamp: h(3), read: true },
  { id: 'n5', user: NOVA_AI_USER, type: 'ai_suggestion', postImage: 'https://picsum.photos/seed/notif_ev5/80/80', text: 'Tech meetup tonight — 47 people attending 💻', timestamp: h(6), read: true },
  { id: 'n6', user: NOVA_AI_USER, type: 'event', postImage: 'https://picsum.photos/seed/notif_ev6/80/80', text: 'Coachella 2026 tickets on sale Friday 🎪', timestamp: h(12), read: true },
  { id: 'n7', user: NOVA_AI_USER, type: 'ai_suggestion', postImage: 'https://picsum.photos/seed/notif_ev7/80/80', text: 'Fitness events trending in your city this week 💪', timestamp: h(24), read: true },
  { id: 'n8', user: NOVA_AI_USER, type: 'event', postImage: 'https://picsum.photos/seed/notif_ev8/80/80', text: 'Vintage market this Sunday — free entry 👗', timestamp: h(36), read: true },
];

export const DEFAULT_PREFERENCES = {
  travel: 80, food: 60, fashion: 40, sports: 50, art: 70,
  tech: 65, fitness: 55, music: 75, pets: 85, lifestyle: 60,
  events: 90, sightseeing: 65, shops: 50, venues: 60, community: 55,
};

// ── Partner / Sponsored Posts ────────────────────────────────────────────────
function sponsorUser(name: string, domain: string, bio: string): User {
  return {
    id: `sp_${domain.replace(/\./g, '_')}`,
    name,
    username: domain.split('.')[0].toLowerCase(),
    avatar: `https://logo.clearbit.com/${domain}`,
    bio,
    followers: Math.floor(Math.random() * 50000) + 5000,
    following: 0,
    posts: Math.floor(Math.random() * 500) + 50,
    verified: true,
  };
}

export const SPONSORED_POSTS: Post[] = [
  {
    id: 'sp1',
    user: sponsorUser('La Maison Restaurant', 'lamaisonrestaurant.com', '🍽️ Award-winning European cuisine · Private dining available'),
    image: 'https://picsum.photos/seed/restaurant_fine1/600/750',
    caption: 'An unforgettable dining experience in the heart of the city. Chef Marco\'s tasting menu takes you on a 7-course journey through seasonal European flavours — paired with our sommelier-curated wine selection. Private events, birthday dinners, and corporate bookings welcome.\n\n📍 City Centre · Reservations recommended\n🕐 Tue–Sun, 12:00–23:00\n💳 From €45 per person',
    likes: 4800, comments: 112, category: 'lifestyle',
    hashtags: ['#finedining', '#restaurant', '#nova', '#sponsored', '#foodie'],
    timestamp: Date.now() - 3600000,
    location: { name: 'City Centre', lat: 0, lng: 0 },
    saved: false, liked: false,
    isSponsored: true,
    eventUrl: 'https://lamaisonrestaurant.com',
    sponsoredCta: 'Reserve a Table',
    organizer: 'La Maison Restaurant',
  },
  {
    id: 'sp2',
    user: sponsorUser('SkyBar Rooftop', 'skybarrooftop.com', '🍸 City\'s best rooftop cocktail bar · Sunset views guaranteed'),
    image: 'https://picsum.photos/seed/rooftopbar1/600/750',
    caption: 'Craft cocktails with a view from 30 floors up. SkyBar is the city\'s most Instagrammed rooftop — sunset hour from 18:00–20:00 with 2-for-1 cocktails every Thursday and Friday. Walk-ins welcome, table reservations via our website.\n\n📍 30th Floor, Central Tower · Open daily\n🕐 16:00–01:00 · Happy Hour: 18:00–20:00\n🍸 Cocktails from €12',
    likes: 7200, comments: 234, category: 'lifestyle',
    hashtags: ['#rooftopbar', '#cocktails', '#skybar', '#nova', '#sponsored'],
    timestamp: Date.now() - 7200000,
    location: { name: 'Central Tower', lat: 0, lng: 0 },
    saved: false, liked: false,
    isSponsored: true,
    eventUrl: 'https://skybarrooftop.com',
    sponsoredCta: 'Book a Table',
    organizer: 'SkyBar Rooftop',
  },
  {
    id: 'sp3',
    user: sponsorUser('DriveNow Rental', 'drivenow-rental.com', '🚗 Premium car rental · No hidden fees · Free cancellation'),
    image: 'https://picsum.photos/seed/carrental_premium/600/750',
    caption: 'Explore the region on your own terms. DriveNow offers a fleet of 200+ vehicles — from compact city cars to luxury SUVs and convertibles. Unlimited mileage, full insurance, and 24/7 roadside assistance included. Pick up at the airport or any city location.\n\n📍 Airport + 3 city locations · Open 06:00–23:00\n🚗 From €29/day · No deposit required\n✅ Free cancellation up to 24h before',
    likes: 2900, comments: 87, category: 'travel',
    hashtags: ['#carrental', '#roadtrip', '#travel', '#nova', '#sponsored'],
    timestamp: Date.now() - 10800000,
    location: { name: 'Airport & City', lat: 0, lng: 0 },
    saved: false, liked: false,
    isSponsored: true,
    eventUrl: 'https://drivenow-rental.com',
    sponsoredCta: 'Book Your Car',
    organizer: 'DriveNow Rental',
  },
  {
    id: 'sp4',
    user: sponsorUser('Urban Suites Hotel', 'urbansuites.com', '🏨 Boutique hotel in the city centre · Rooftop pool · Free WiFi'),
    image: 'https://picsum.photos/seed/boutiquehotel1/600/750',
    caption: 'Wake up in the middle of everything. Urban Suites puts you steps from the city\'s best restaurants, galleries, and transport links. Rooftop pool, in-room spa treatments, complimentary breakfast, and a concierge team that knows every hidden gem in the city.\n\n📍 City Centre · 2-min walk from metro\n🏊 Rooftop pool May–Oct · Free cancellation\n🛏️ Rooms from €89/night · Breakfast included',
    likes: 5600, comments: 148, category: 'travel',
    hashtags: ['#hotel', '#boutique', '#citybreak', '#nova', '#sponsored'],
    timestamp: Date.now() - 14400000,
    location: { name: 'City Centre', lat: 0, lng: 0 },
    saved: false, liked: false,
    isSponsored: true,
    eventUrl: 'https://urbansuites.com',
    sponsoredCta: 'Check Availability',
    organizer: 'Urban Suites Hotel',
  },
  {
    id: 'sp5',
    user: sponsorUser('Nova Tours', 'novatours.co', '🗺️ Local guided tours · Small groups · Expert guides'),
    image: 'https://picsum.photos/seed/guidedtour1/600/750',
    caption: 'See the city like a local. Nova Tours runs small-group walking tours (max 12 people) led by passionate local guides who know every story behind every street corner. Morning old-town walks, evening food tours, and private custom experiences available daily.\n\n📍 Meets at Central Square · Daily departures\n🕐 09:00 & 18:00 · Duration 2.5h\n🎟️ From €18/person · Kids under 12 free',
    likes: 3400, comments: 95, category: 'sightseeing',
    hashtags: ['#tour', '#sightseeing', '#localguide', '#nova', '#sponsored'],
    timestamp: Date.now() - 18000000,
    location: { name: 'Central Square', lat: 0, lng: 0 },
    saved: false, liked: false,
    isSponsored: true,
    eventUrl: 'https://novatours.co',
    sponsoredCta: 'Book a Tour',
    organizer: 'Nova Tours',
  },
  {
    id: 'sp6',
    user: sponsorUser('Zen Wellness Spa', 'zenwellness-spa.com', '💆 Urban wellness retreat · Massage · Sauna · Float therapy'),
    image: 'https://picsum.photos/seed/spa_wellness1/600/750',
    caption: 'The city\'s most complete urban wellness escape. Zen Wellness offers traditional Thai massage, hot stone therapy, infrared sauna, and Europe\'s largest urban float tank. Day passes available — no booking required. Gift vouchers perfect for any occasion.\n\n📍 Near City Park · Free parking\n🕐 Mon–Sun 09:00–21:00\n💆 Massages from €55 · Day pass €35',
    likes: 4100, comments: 118, category: 'lifestyle',
    hashtags: ['#spa', '#wellness', '#selfcare', '#nova', '#sponsored'],
    timestamp: Date.now() - 21600000,
    location: { name: 'Near City Park', lat: 0, lng: 0 },
    saved: false, liked: false,
    isSponsored: true,
    eventUrl: 'https://zenwellness-spa.com',
    sponsoredCta: 'Book a Session',
    organizer: 'Zen Wellness Spa',
  },
];

const COMMENT_TEMPLATES: Record<string, string[]> = {
  travel: ['This is on my bucket list!! 😍', 'I went here last year — absolutely breathtaking ❤️', 'The photos don\'t even do it justice', 'Saving this for my next trip 🙏', 'Stunning. The world is wild.', 'How do I get tickets?', 'You\'re living my dream 😭', '🌅🌅🌅 unreal'],
  food: ['I need this in my life RIGHT NOW 😭', 'Booking a table tonight', 'This looks absolutely incredible 🤤', 'The presentation is perfection', 'Already on my way 🏃‍♀️', 'My stomach just growled', 'Free entry AND amazing food?!', 'Adding to my must-visit list'],
  fashion: ['STUNNING 🔥', 'This collection is everything', 'When does it drop?!', 'The styling is chef\'s kiss 💋', 'Fashion forward as always', 'The fit is PERFECT', 'This is the trend of the season', 'Iconic. That\'s it.'],
  sports: ['ABSOLUTE LEGENDS 🐐', 'This gave me chills', 'Can\'t wait for match day', 'LETS GOOO', 'Already got my tickets', 'The greatest sport in the world', 'What an atmosphere that\'ll be', 'Pure passion. Love to see it.'],
  art: ['This is breathtaking 🎨', 'The technique is incredible', 'I need to see this in person', 'You are so talented omg', 'Art Basel is on my bucket list', 'Art is alive because of shows like this', 'The colours are everything', 'This belongs in every museum'],
  tech: ['This is actually wild 🤯', 'Already registered!', 'The future is here', 'Best conference of the year', 'Following for updates', 'This changes everything', 'See you there 🙌', 'DM me — going with a group'],
  fitness: ['You are an absolute beast 💪', 'Already signed up!', 'Goals. Pure goals.', 'What training programme?', 'The dedication is unreal', 'This made me get off my couch', 'No days off 🔥', 'Registering right now'],
  music: ['This is FIRE 🔥🎵', 'Best lineup in years', 'I\'ve had this on repeat all day', 'ALREADY GOT TICKETS', 'The talent is unreal', 'I will be front row', 'My music got me through so much', '10/10 cannot wait'],
  pets: ['I am DECEASED 😭😭 so cute', 'This made my entire day', 'Animals are pure serotonin', 'I\'m buying tickets right now', 'Rescue pets are the best pets ❤️', 'The audacity of this absolute unit', 'Crying actual tears of joy', 'BEST EVENT EVER'],
  lifestyle: ['This is the life I\'m building 🙏', 'So peaceful and beautiful', 'Protect your peace always', 'The vibe is immaculate', 'Slow living is the only living', 'This is what it\'s all about', 'Goals for my whole life honestly', 'You\'re doing it perfectly'],
  events: ['ALREADY GOT MY TICKETS 🎟️', 'This is going to be legendary', 'SEE YOU THERE!!!', 'The lineup is unreal', 'I\'ve been waiting for this', 'This is THE one.', 'Nothing beats being there live', 'Screaming internally 😭'],
  sightseeing: ['On my bucket list! 🗺️', 'I visited last year — absolutely stunning', 'How long did you spend here?', 'The history here is unreal', 'Worth every minute of the journey', 'This should be a UNESCO site if it isn\'t already', 'Photography goals 📸', 'Adding to my itinerary right now'],
  sponsored: ['Just booked! Can\'t wait 🙌', 'Been here twice already — highly recommend', 'The service is outstanding', 'Great value for what you get', 'Already sent this to my travel group', 'This is exactly what I was looking for', 'Booking right now!', 'Is it as good in person? Looks incredible'],
};

export function getPostComments(post: Post): Comment[] {
  const seed = post.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const templates = COMMENT_TEMPLATES[post.category] ?? COMMENT_TEMPLATES.lifestyle;
  const commentUsers = MOCK_USERS.filter(u => u.id !== post.user.id);
  return Array.from({ length: 6 }, (_, i) => ({
    id: `${post.id}_c${i}`,
    user: commentUsers[(seed + i * 3) % commentUsers.length],
    text: templates[(seed + i * 2) % templates.length],
    timestamp: post.timestamp + (i + 1) * 18 * 60 * 1000,
    likes: Math.floor(Math.abs(Math.sin((seed + i) * 0.7)) * 250 + 5),
  }));
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

export const GALLERY_IMAGES = Array.from({ length: 12 }, (_, i) => ({
  id: `g${i}`, url: `https://picsum.photos/seed/gallery${i + 10}/600/750`,
}));
