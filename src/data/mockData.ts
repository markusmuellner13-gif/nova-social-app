import { Post, Story, User, NovaNotification, Comment, Category } from '@/types';

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
  { id: 'u11', name: 'Marco Vibe', username: 'marco.vibe', avatar: 'https://i.pravatar.cc/150?img=67', bio: '🎸 Live music | Event curator', followers: 44000, following: 380, posts: 88 },
  { id: 'u12', name: 'Priya Wanders', username: 'priya.wanders', avatar: 'https://i.pravatar.cc/150?img=31', bio: '🌏 Solo traveller | Budget explorer | 30 countries', followers: 67000, following: 510, posts: 201 },
];

const now = Date.now();
const h = (hours: number) => now - hours * 60 * 60 * 1000;
const future = (days: number) => now + days * 24 * 60 * 60 * 1000;

export const MOCK_POSTS: Post[] = [
  // ── Travel ──────────────────────────────────────────────────────────────
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
    id: 'p11', user: MOCK_USERS[0],
    image: 'https://picsum.photos/seed/kyoto88/600/750',
    caption: 'Kyoto in cherry blossom season is a dream you never want to wake from 🌸',
    likes: 22340, comments: 498, category: 'travel',
    hashtags: ['#kyoto', '#japan', '#cherryblossom', '#sakura', '#travel'],
    timestamp: h(56), location: { name: 'Kyoto, Japan', lat: 35.0116, lng: 135.7681 },
    saved: false, liked: false,
  },
  {
    id: 'p21', user: MOCK_USERS[0],
    image: 'https://picsum.photos/seed/machu33/600/750',
    caption: 'Machu Picchu at sunrise — 4am hike, zero regrets 🏔️ Some things are worth the effort.',
    likes: 31800, comments: 621, category: 'travel',
    hashtags: ['#machupicchu', '#peru', '#hiking', '#travel', '#andes'],
    timestamp: h(140), location: { name: 'Machu Picchu, Peru', lat: -13.1631, lng: -72.5450 },
    saved: false, liked: false,
  },
  {
    id: 'p33', user: MOCK_USERS[11],
    image: 'https://picsum.photos/seed/capetown55/600/750',
    caption: 'Cape Town from Table Mountain — the whole world looks different from up here 🏔️🌊',
    likes: 18900, comments: 387, category: 'travel',
    hashtags: ['#capetown', '#southafrica', '#tablemountain', '#africa', '#travel'],
    timestamp: h(18), location: { name: 'Cape Town, South Africa', lat: -33.9249, lng: 18.4241 },
    saved: false, liked: false,
  },
  {
    id: 'p34', user: MOCK_USERS[11],
    image: 'https://picsum.photos/seed/maldives77/600/750',
    caption: 'The Maldives is exactly as perfect as everyone says. Worth every penny 💎🌊',
    likes: 45600, comments: 892, category: 'travel',
    hashtags: ['#maldives', '#overwater', '#paradise', '#travel', '#luxury'],
    timestamp: h(76), location: { name: 'Maldives', lat: 3.2028, lng: 73.2207 },
    saved: false, liked: false,
  },
  // ── Food ────────────────────────────────────────────────────────────────
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
    id: 'p12', user: MOCK_USERS[1],
    image: 'https://picsum.photos/seed/tacos99/600/750',
    caption: 'Street tacos in Mexico City 🌮 Simple ingredients, maximum flavour.',
    likes: 11200, comments: 289, category: 'food',
    hashtags: ['#tacos', '#mexicanfood', '#streetfood', '#foodie', '#travel'],
    timestamp: h(60), location: { name: 'Mexico City, Mexico', lat: 19.4326, lng: -99.1332 },
    saved: false, liked: false,
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
  {
    id: 'p35', user: MOCK_USERS[1],
    image: 'https://picsum.photos/seed/pasta44/600/750',
    caption: 'Hand-rolled pasta, Nonna\'s recipe, Sunday afternoon. Nothing beats this 🍝❤️',
    likes: 9700, comments: 223, category: 'food',
    hashtags: ['#pasta', '#italian', '#homemade', '#sundaycooking', '#foodphotography'],
    timestamp: h(32), location: { name: 'Rome, Italy', lat: 41.9028, lng: 12.4964 },
    saved: false, liked: false,
  },
  // ── Fashion ─────────────────────────────────────────────────────────────
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
    id: 'p13', user: MOCK_USERS[7],
    image: 'https://picsum.photos/seed/runway55/600/750',
    caption: 'Behind the scenes at Milan Fashion Week 👗✨ Energy is electric here.',
    likes: 45600, comments: 1230, category: 'fashion',
    hashtags: ['#milanfashionweek', '#fashion', '#runway', '#mfw', '#style'],
    timestamp: h(68), location: { name: 'Milan, Italy', lat: 45.4654, lng: 9.1859 },
    saved: false, liked: true,
  },
  {
    id: 'p36', user: MOCK_USERS[7],
    image: 'https://picsum.photos/seed/streetstyle66/600/750',
    caption: 'Street style in Tokyo hits different 🇯🇵 The layering, the colours — iconic.',
    likes: 28400, comments: 671, category: 'fashion',
    hashtags: ['#tokyofashion', '#streetstyle', '#harajuku', '#fashion', '#japan'],
    timestamp: h(44), location: { name: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503 },
    saved: false, liked: false,
  },
  // ── Sports ──────────────────────────────────────────────────────────────
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
    id: 'p14', user: MOCK_USERS[2],
    image: 'https://picsum.photos/seed/training66/600/750',
    caption: 'Pre-season training starts now 🏋️ The real work happens when nobody is watching.',
    likes: 76800, comments: 3200, category: 'sports',
    hashtags: ['#training', '#football', '#preseason', '#discipline', '#athlete'],
    timestamp: h(72), location: { name: 'Madrid, Spain', lat: 40.4168, lng: -3.7038 },
    saved: false, liked: false,
  },
  // ── Art ─────────────────────────────────────────────────────────────────
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
    id: 'p15', user: MOCK_USERS[3],
    image: 'https://picsum.photos/seed/watercolor44/600/750',
    caption: 'Experimenting with watercolour and glitch effects 🎨 When analogue meets digital.',
    likes: 9140, comments: 267, category: 'art',
    hashtags: ['#art', '#watercolour', '#glitch', '#mixedmedia', '#creative'],
    timestamp: h(80), location: { name: 'Barcelona, Spain', lat: 41.3851, lng: 2.1734 },
    saved: true, liked: true,
  },
  {
    id: 'p37', user: MOCK_USERS[3],
    image: 'https://picsum.photos/seed/sculpture22/600/750',
    caption: 'Three years sculpting this piece. Finally unveiled 🗿 Art takes time.',
    likes: 14300, comments: 521, category: 'art',
    hashtags: ['#sculpture', '#fineart', '#artist', '#gallery', '#contemporary'],
    timestamp: h(96), location: { name: 'Florence, Italy', lat: 43.7696, lng: 11.2558 },
    saved: false, liked: false,
  },
  // ── Tech ────────────────────────────────────────────────────────────────
  {
    id: 'p6', user: MOCK_USERS[4],
    image: 'https://picsum.photos/seed/coding33/600/750',
    caption: 'Just shipped a new open-source project 🚀 CLI tool for lightning-fast deployments.',
    likes: 4230, comments: 189, category: 'tech',
    hashtags: ['#tech', '#coding', '#opensource', '#developer', '#startup'],
    timestamp: h(24), location: { name: 'San Francisco, USA', lat: 37.7749, lng: -122.4194 },
    saved: false, liked: false,
  },
  {
    id: 'p16', user: MOCK_USERS[4],
    image: 'https://picsum.photos/seed/ai22/600/750',
    caption: 'The AI model finally converged after 72h of training 🤖 The results are wild. Thread 👇',
    likes: 5670, comments: 432, category: 'tech',
    hashtags: ['#ai', '#machinelearning', '#tech', '#developer', '#research'],
    timestamp: h(90), location: { name: 'Seattle, USA', lat: 47.6062, lng: -122.3321 },
    saved: false, liked: false,
  },
  // ── Fitness ─────────────────────────────────────────────────────────────
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
    id: 'p17', user: MOCK_USERS[5],
    image: 'https://picsum.photos/seed/yoga33/600/750',
    caption: 'Yoga at sunset — body, mind, and horizon aligned 🧘‍♀️🌅 Find your centre.',
    likes: 21300, comments: 610, category: 'fitness',
    hashtags: ['#yoga', '#fitness', '#sunset', '#mindfulness', '#wellness'],
    timestamp: h(96), location: { name: 'Bali, Indonesia', lat: -8.4095, lng: 115.1889 },
    saved: false, liked: true,
  },
  {
    id: 'p38', user: MOCK_USERS[5],
    image: 'https://picsum.photos/seed/marathon11/600/750',
    caption: 'First marathon done. 26.2 miles, 4:12 finish. I cried at the line. Best day. 🏅',
    likes: 32100, comments: 1240, category: 'fitness',
    hashtags: ['#marathon', '#running', '#firstmarathon', '#fitness', '#runnersworld'],
    timestamp: h(48), location: { name: 'Boston, USA', lat: 42.3601, lng: -71.0589 },
    saved: false, liked: false,
  },
  // ── Music ───────────────────────────────────────────────────────────────
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
    id: 'p18', user: MOCK_USERS[6],
    image: 'https://picsum.photos/seed/concert11/600/750',
    caption: 'SOLD OUT world tour 🎤🌍 Thank you to every single person who shows up.',
    likes: 189000, comments: 8920, category: 'music',
    hashtags: ['#concert', '#music', '#worldtour', '#livemusic', '#artist'],
    timestamp: h(108), location: { name: 'Rio de Janeiro, Brazil', lat: -22.9068, lng: -43.1729 },
    saved: true, liked: false,
  },
  // ── Pets ────────────────────────────────────────────────────────────────
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
    id: 'p19', user: MOCK_USERS[8],
    image: 'https://picsum.photos/seed/cat44/600/750',
    caption: 'Coco decided this is her throne now 👑🐱 The audacity of cats.',
    likes: 34200, comments: 912, category: 'pets',
    hashtags: ['#cats', '#catsofinstagram', '#catlife', '#pets', '#cute'],
    timestamp: h(120), location: { name: 'Vienna, Austria', lat: 48.2082, lng: 16.3738 },
    saved: false, liked: true,
  },
  {
    id: 'p39', user: MOCK_USERS[8],
    image: 'https://picsum.photos/seed/puppy55/600/750',
    caption: 'Day 1 at our home. He was terrified. Now look at him 🐕‍🦺 Adoption is everything.',
    likes: 61200, comments: 2100, category: 'pets',
    hashtags: ['#rescue', '#dogsofinstagram', '#adoption', '#puppylove', '#pets'],
    timestamp: h(84), location: { name: 'Amsterdam, Netherlands', lat: 52.3676, lng: 4.9041 },
    saved: false, liked: false,
  },
  // ── Lifestyle ───────────────────────────────────────────────────────────
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
    id: 'p20', user: MOCK_USERS[9],
    image: 'https://picsum.photos/seed/cabin22/600/750',
    caption: 'Cabin in the woods, no wifi, no problems 🌲🔥 Disconnecting to reconnect.',
    likes: 27600, comments: 734, category: 'lifestyle',
    hashtags: ['#cabin', '#offgrid', '#nature', '#lifestyle', '#peace'],
    timestamp: h(132), location: { name: 'Stockholm, Sweden', lat: 59.3293, lng: 18.0686 },
    saved: false, liked: false,
  },
  {
    id: 'p40', user: MOCK_USERS[9],
    image: 'https://picsum.photos/seed/morningroutine88/600/750',
    caption: '6am, journal, matcha, no phone for the first hour. Life is different when you protect your morning 🌿',
    likes: 34500, comments: 1280, category: 'lifestyle',
    hashtags: ['#morningroutine', '#slowliving', '#mindfulness', '#lifestyle', '#wellness'],
    timestamp: h(22), location: { name: 'Copenhagen, Denmark', lat: 55.6761, lng: 12.5683 },
    saved: false, liked: false,
  },
  // ── EVENTS ──────────────────────────────────────────────────────────────
  {
    id: 'ev1', user: MOCK_USERS[10],
    image: 'https://picsum.photos/seed/coachella2026/600/750',
    caption: '🎪 COACHELLA 2026 — Lineup just dropped and it is absolutely INSANE. Tickets sell out in 12 hours. Who\'s going?',
    likes: 284000, comments: 18400, category: 'events',
    hashtags: ['#coachella', '#coachella2026', '#music', '#festival', '#california'],
    timestamp: h(3), location: { name: 'Coachella Valley, USA', lat: 33.6800, lng: -116.2381 },
    saved: false, liked: false,
    isEvent: true, eventDate: 'Apr 11–20, 2026', eventVenue: 'Empire Polo Club, Indio CA',
  },
  {
    id: 'ev2', user: MOCK_USERS[2],
    image: 'https://picsum.photos/seed/championsleague2026/600/750',
    caption: '⚽ UEFA Champions League Final is HERE. Wembley Stadium, 90,000 fans, the biggest match in world football. Let\'s go.',
    likes: 512000, comments: 32100, category: 'events',
    hashtags: ['#championsleague', '#uefafinal', '#football', '#wembley', '#soccer'],
    timestamp: h(1), location: { name: 'London, UK', lat: 51.5560, lng: -0.2796 },
    saved: false, liked: false,
    isEvent: true, eventDate: 'Jun 14, 2026', eventVenue: 'Wembley Stadium, London',
  },
  {
    id: 'ev3', user: MOCK_USERS[4],
    image: 'https://picsum.photos/seed/wwdc2026/600/750',
    caption: '🍎 WWDC 2026 — Apple just announced something that will change everything. You need to see this keynote live.',
    likes: 156000, comments: 9800, category: 'events',
    hashtags: ['#wwdc', '#apple', '#tech', '#ios', '#developer'],
    timestamp: h(6), location: { name: 'San Jose, USA', lat: 37.3387, lng: -121.8853 },
    saved: false, liked: false,
    isEvent: true, eventDate: 'Jun 9–13, 2026', eventVenue: 'Apple Park, Cupertino CA',
  },
  {
    id: 'ev4', user: MOCK_USERS[7],
    image: 'https://picsum.photos/seed/pfw2026/600/750',
    caption: '👗 Paris Fashion Week SS27 is officially open. Front row access for the next 10 days — expect daily posts.',
    likes: 198000, comments: 7600, category: 'events',
    hashtags: ['#pfw', '#parisfashionweek', '#fashion', '#paris', '#ss27'],
    timestamp: h(4), location: { name: 'Paris, France', lat: 48.8566, lng: 2.3522 },
    saved: false, liked: false,
    isEvent: true, eventDate: 'Sep 30 – Oct 8, 2026', eventVenue: 'Various venues, Paris',
  },
  {
    id: 'ev5', user: MOCK_USERS[1],
    image: 'https://picsum.photos/seed/ramenfest2026/600/750',
    caption: '🍜 Tokyo Ramen Festival 2026 kicks off this weekend — 60 stalls, 200 varieties, one weekend. This is the one.',
    likes: 44800, comments: 3200, category: 'events',
    hashtags: ['#tokyoramen', '#ramenfestival', '#tokyo', '#food', '#japan'],
    timestamp: h(8), location: { name: 'Tokyo, Japan', lat: 35.6762, lng: 139.6503 },
    saved: false, liked: false,
    isEvent: true, eventDate: 'Oct 17–19, 2026', eventVenue: 'Hibiya Park, Tokyo',
  },
  {
    id: 'ev6', user: MOCK_USERS[9],
    image: 'https://picsum.photos/seed/burningman2026/600/750',
    caption: '🔥 Burning Man 2026 — Black Rock City rises again. One week of art, community, and transformation. See you in the dust.',
    likes: 87400, comments: 4100, category: 'events',
    hashtags: ['#burningman', '#blackrockcity', '#art', '#festival', '#burner'],
    timestamp: h(16), location: { name: 'Black Rock Desert, USA', lat: 40.7864, lng: -119.2065 },
    saved: false, liked: false,
    isEvent: true, eventDate: 'Aug 30 – Sep 7, 2026', eventVenue: 'Black Rock Desert, Nevada',
  },
  {
    id: 'ev7', user: MOCK_USERS[5],
    image: 'https://picsum.photos/seed/crossfitgames2026/600/750',
    caption: '🏋️ CrossFit Games 2026 — The fittest on Earth compete this weekend. The intensity is something else.',
    likes: 38200, comments: 1980, category: 'events',
    hashtags: ['#crossfitgames', '#crossfit', '#fitness', '#athlete', '#sport'],
    timestamp: h(10), location: { name: 'Fort Worth, USA', lat: 32.7555, lng: -97.3308 },
    saved: false, liked: false,
    isEvent: true, eventDate: 'Jul 22–27, 2026', eventVenue: 'Dickies Arena, Fort Worth TX',
  },
  {
    id: 'ev8', user: MOCK_USERS[3],
    image: 'https://picsum.photos/seed/artbasel2026/600/750',
    caption: '🖼️ Art Basel Miami Beach 2026 — 4,000 artists, 290 galleries, one week of pure creative energy. The art world converges.',
    likes: 52100, comments: 2870, category: 'events',
    hashtags: ['#artbasel', '#artbaselmiamibeach', '#art', '#contemporaryart', '#miami'],
    timestamp: h(20), location: { name: 'Miami Beach, USA', lat: 25.7825, lng: -80.1300 },
    saved: false, liked: false,
    isEvent: true, eventDate: 'Dec 4–8, 2026', eventVenue: 'Miami Beach Convention Center',
  },
  {
    id: 'ev9', user: MOCK_USERS[8],
    image: 'https://picsum.photos/seed/dogshow2026/600/750',
    caption: '🐕 World Dog Show Helsinki 2026 — 30,000 dogs from 100 countries competing. The largest dog show on the planet.',
    likes: 76400, comments: 5200, category: 'events',
    hashtags: ['#worlddogshow', '#dogs', '#pets', '#helsinki', '#dogshow'],
    timestamp: h(14), location: { name: 'Helsinki, Finland', lat: 60.1699, lng: 24.9384 },
    saved: false, liked: false,
    isEvent: true, eventDate: 'Jun 25–28, 2026', eventVenue: 'Helsinki Expo & Convention Centre',
  },
  {
    id: 'ev10', user: MOCK_USERS[6],
    image: 'https://picsum.photos/seed/glastonbury2026/600/750',
    caption: '🎸 Glastonbury 2026 — 200,000 people, 100 stages, 5 days. The greatest music festival ever created. Get your wellies.',
    likes: 421000, comments: 28700, category: 'events',
    hashtags: ['#glastonbury', '#glastonbury2026', '#music', '#festival', '#uk'],
    timestamp: h(7), location: { name: 'Somerset, UK', lat: 51.1444, lng: -2.5900 },
    saved: false, liked: false,
    isEvent: true, eventDate: 'Jun 24–28, 2026', eventVenue: 'Worthy Farm, Pilton, Somerset',
  },
  // ── Additional content pool ─────────────────────────────────────────────
  {
    id: 'p41', user: MOCK_USERS[11],
    image: 'https://picsum.photos/seed/auroraborealis/600/750',
    caption: 'Northern Lights in Iceland — I\'ve been chasing this for 3 years. Last night it happened 🌌 I wept.',
    likes: 89200, comments: 3400, category: 'travel',
    hashtags: ['#northernlights', '#auroraborealis', '#iceland', '#travel', '#bucketlist'],
    timestamp: h(28), location: { name: 'Reykjavik, Iceland', lat: 64.1355, lng: -21.8954 },
    saved: false, liked: false,
  },
  {
    id: 'p42', user: MOCK_USERS[6],
    image: 'https://picsum.photos/seed/recorddrop22/600/750',
    caption: 'Album drops TONIGHT at midnight 🚨🎵 3 years of work. Stream link in bio. This one is everything.',
    likes: 234000, comments: 14200, category: 'music',
    hashtags: ['#newmusic', '#albumdrop', '#music', '#hiphop', '#oscarbeats'],
    timestamp: h(1), location: { name: 'Los Angeles, USA', lat: 34.0522, lng: -118.2437 },
    saved: false, liked: false,
  },
  {
    id: 'p43', user: MOCK_USERS[5],
    image: 'https://picsum.photos/seed/coldplunge44/600/750',
    caption: 'Cold plunge at 4°C every morning for 30 days 🧊 The mental clarity is unreal. Day 30 today.',
    likes: 44100, comments: 1870, category: 'fitness',
    hashtags: ['#coldplunge', '#icebath', '#fitness', '#wimhof', '#wellness'],
    timestamp: h(6), location: { name: 'Oslo, Norway', lat: 59.9139, lng: 10.7522 },
    saved: false, liked: false,
  },
  {
    id: 'p44', user: MOCK_USERS[4],
    image: 'https://picsum.photos/seed/visionpro22/600/750',
    caption: 'One week with Apple Vision Pro — changed how I think about computing forever. Long review dropping tomorrow 👀',
    likes: 18700, comments: 1240, category: 'tech',
    hashtags: ['#applevisionpro', '#spatial', '#tech', '#review', '#future'],
    timestamp: h(14), location: { name: 'Palo Alto, USA', lat: 37.4419, lng: -122.1430 },
    saved: false, liked: false,
  },
  {
    id: 'p45', user: MOCK_USERS[3],
    image: 'https://picsum.photos/seed/muralpaint/600/750',
    caption: 'Six days, twelve metres wide, and now it lives forever on this wall 🎨 Street art is the democracy of expression.',
    likes: 21400, comments: 834, category: 'art',
    hashtags: ['#streetart', '#mural', '#art', '#graffiti', '#urban'],
    timestamp: h(38), location: { name: 'São Paulo, Brazil', lat: -23.5505, lng: -46.6333 },
    saved: false, liked: false,
  },
  {
    id: 'p46', user: MOCK_USERS[7],
    image: 'https://picsum.photos/seed/vintage88/600/750',
    caption: 'Thrift store haul that cost €23 and looks like a million 💰 Sustainable fashion is the future.',
    likes: 67800, comments: 2890, category: 'fashion',
    hashtags: ['#thrift', '#vintagefashion', '#sustainable', '#ootd', '#fashion'],
    timestamp: h(54), location: { name: 'Vienna, Austria', lat: 48.2082, lng: 16.3738 },
    saved: false, liked: false,
  },
  {
    id: 'p47', user: MOCK_USERS[8],
    image: 'https://picsum.photos/seed/catcafe22/600/750',
    caption: 'Spent an afternoon at a cat café in Seoul and I am a completely different person now 🐱🍵',
    likes: 48900, comments: 2340, category: 'pets',
    hashtags: ['#catcafe', '#seoul', '#cats', '#korea', '#pets'],
    timestamp: h(62), location: { name: 'Seoul, South Korea', lat: 37.5665, lng: 126.9780 },
    saved: false, liked: false,
  },
  {
    id: 'p48', user: MOCK_USERS[1],
    image: 'https://picsum.photos/seed/ethiopiancoffee/600/750',
    caption: 'Ethiopian coffee ceremony — three rounds, two hours, one conversation that changed my life ☕🌍',
    likes: 12800, comments: 467, category: 'food',
    hashtags: ['#ethiopia', '#coffeecoffee', '#coffeeceremony', '#foodculture', '#travel'],
    timestamp: h(86), location: { name: 'Addis Ababa, Ethiopia', lat: 9.0320, lng: 38.7469 },
    saved: false, liked: false,
  },
  {
    id: 'p49', user: MOCK_USERS[9],
    image: 'https://picsum.photos/seed/hygge55/600/750',
    caption: 'It\'s the little things — fresh bread, warm blanket, good company 🫶 This is what it\'s all about.',
    likes: 52300, comments: 1920, category: 'lifestyle',
    hashtags: ['#hygge', '#cozy', '#simplepleasures', '#lifestyle', '#danish'],
    timestamp: h(34), location: { name: 'Copenhagen, Denmark', lat: 55.6761, lng: 12.5683 },
    saved: false, liked: false,
  },
  {
    id: 'p50', user: MOCK_USERS[2],
    image: 'https://picsum.photos/seed/surfsession/600/750',
    caption: 'Dawn patrol 🏄 The ocean was mine for two hours. Nothing else matters when you\'re in the water.',
    likes: 67100, comments: 2440, category: 'sports',
    hashtags: ['#surf', '#surfing', '#dawnpatrol', '#ocean', '#waves'],
    timestamp: h(20), location: { name: 'Gold Coast, Australia', lat: -28.0167, lng: 153.4000 },
    saved: false, liked: false,
  },
];

export const MOCK_STORIES: Story[] = [
  { id: 's1', user: MOCK_USERS[0], seen: false, image: 'https://picsum.photos/seed/story_alex/800/1400' },
  { id: 's2', user: MOCK_USERS[1], seen: false, image: 'https://picsum.photos/seed/story_mia/800/1400' },
  { id: 's3', user: MOCK_USERS[7], seen: true,  image: 'https://picsum.photos/seed/story_zoe/800/1400' },
  { id: 's4', user: MOCK_USERS[2], seen: false, image: 'https://picsum.photos/seed/story_jake/800/1400' },
  { id: 's5', user: MOCK_USERS[5], seen: true,  image: 'https://picsum.photos/seed/story_rina/800/1400' },
  { id: 's6', user: MOCK_USERS[6], seen: false, image: 'https://picsum.photos/seed/story_oscar/800/1400' },
  { id: 's7', user: MOCK_USERS[3], seen: false, image: 'https://picsum.photos/seed/story_luna/800/1400' },
  { id: 's8', user: MOCK_USERS[8], seen: true,  image: 'https://picsum.photos/seed/story_leo/800/1400' },
  { id: 's9', user: MOCK_USERS[9], seen: false, image: 'https://picsum.photos/seed/story_nina/800/1400' },
  { id: 's10', user: MOCK_USERS[11], seen: false, image: 'https://picsum.photos/seed/story_priya/800/1400' },
];

export const CURRENT_USER = {
  id: 'current',
  name: 'You',
  username: 'your.nova',
  avatar: 'https://i.pravatar.cc/150?img=33',
  bio: '✨ Living the moment | Nova user since 2026',
  followers: 1247,
  following: 389,
  posts: 28,
};

export const MOCK_NOTIFICATIONS: NovaNotification[] = [
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
  travel: 80, food: 60, fashion: 40, sports: 50, art: 70,
  tech: 65, fitness: 55, music: 75, pets: 85, lifestyle: 60, events: 75,
};

const COMMENT_TEMPLATES: Record<string, string[]> = {
  travel: [
    'This is on my bucket list!! 😍', 'I went here last year — absolutely breathtaking ❤️',
    'The photos don\'t even do it justice', 'Saving this for my 2027 trip 🙏', 'Stunning. Nature is everything.',
    'How long did you stay?', 'You\'re living my dream life fr', '🌅🌅🌅 unreal',
  ],
  food: [
    'I need this in my life RIGHT NOW 😭', 'Recipe please!!', 'This looks absolutely incredible 🤤',
    'The presentation is perfection', 'Going there this weekend 🏃‍♀️', 'My stomach just growled',
    'You had me at tonkotsu', '18 hours of prep and it shows. Gorgeous.',
  ],
  fashion: [
    'STUNNING outfit 🔥', 'Where is this from?! Need it now', 'The styling is chef\'s kiss 💋',
    'Goals honestly', 'You killed this look', 'The fit is PERFECT', 'Head to toe fire 🔥🔥',
    'This is the most beautiful thing I\'ve ever seen',
  ],
  sports: [
    'Absolute legend 🐐', 'This gave me chills', 'The dedication is inspiring', 'LET\'S GOOO',
    'Watching every game this season', 'Elite. That\'s all.', 'The roar of that crowd 🙌',
    'Pure passion. Love to see it.',
  ],
  art: [
    'This is breathtaking 🎨', 'The technique is incredible', 'How long did this take?',
    'You are so talented omg', 'Adding this to my gallery wishlist', 'Art is alive because of you',
    'The colours speak to me', 'This deserves to be in a museum',
  ],
  tech: [
    'This is actually wild 🤯', 'Waiting for the GitHub link!', 'The future is here',
    'You built this solo?!', 'Following for more updates', 'This changes everything',
    'Open source legend 🙏', 'DM me — I want to contribute',
  ],
  fitness: [
    'You are an absolute beast 💪', 'This is so inspiring', 'Goals. Pure goals.',
    'What\'s your training programme?', 'The dedication is unreal', 'You make me want to train harder',
    'No days off 🔥', 'This motivated me to go to the gym right now',
  ],
  music: [
    'This is FIRE 🔥🎵', 'I\'ve had this on repeat all day', 'Album of the year, no debate',
    'The talent is unreal', 'I will be front row at every show', 'Your music got me through so much',
    'This deserves 10x the streams', 'Goosebumps every single time 🙏',
  ],
  pets: [
    'I am DECEASED 😭😭 so cute', 'This made my entire day', 'Animals are pure serotonin',
    'Coco/Leo is the main character', 'I need one immediately', 'Rescue pets are the best pets ❤️',
    'The audacity of this animal lmao', 'Crying actual tears of joy',
  ],
  lifestyle: [
    'This is the life I\'m building towards 🙏', 'So peaceful and beautiful', 'Protect your peace always',
    'The vibe is immaculate', 'Slow living is the only living', 'This is what it\'s all about',
    'Goals for my life honestly', 'You\'re doing it right',
  ],
  events: [
    'ALREADY GOT MY TICKETS 🎟️', 'This is going to be legendary', 'See you there!!!',
    'The lineup is unreal', 'I\'ve been waiting for this for years', 'This is the one.',
    'Nothing compares to being there live', 'Screaming internally 😭',
  ],
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
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function timeUntil(timestamp: number): string {
  const ms = timestamp - Date.now();
  if (ms <= 0) return 'Happening now';
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days > 30) return `In ${Math.floor(days / 30)} months`;
  if (days > 0) return `In ${days} day${days !== 1 ? 's' : ''}`;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  return `In ${hours}h`;
}

// Gallery images for the Create tab
export const GALLERY_IMAGES = Array.from({ length: 12 }, (_, i) => ({
  id: `g${i}`,
  url: `https://picsum.photos/seed/gallery${i + 10}/600/750`,
}));

// Event date parsing helper
export const futureDate = future;
