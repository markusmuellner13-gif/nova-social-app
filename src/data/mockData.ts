import { Post, Story, User, NovaNotification } from '@/types';

// Build a properly-cropped Unsplash photo URL (no API key required for CDN delivery)
function U(id: string, w = 600, h = 750): string {
  return `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&h=${h}&q=80`;
}

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

export const RAW_MOCK_POSTS: Post[] = [
  // ── Travel ──────────────────────────────────────────────────────────────
  {
    id: 'p1', user: MOCK_USERS[0],
    image: U('1570077188670-e3a8d69ac5ff'),
    caption: 'Santorini sunsets — 5 breathtaking viewpoints you have to see in person 🌅 Oia, Fira, Imerovigli, Akrotiri lighthouse, and the caldera edge at Amoudi Bay.',
    likes: 142800, comments: 1234, category: 'travel',
    hashtags: ['#santorini', '#greece', '#travel', '#sunset', '#wanderlust'],
    timestamp: h(2), location: { name: 'Santorini, Greece', lat: 36.3932, lng: 25.4615 },
    saved: false, liked: false, organizer: 'Lonely Planet',
  },
  {
    id: 'p11', user: MOCK_USERS[0],
    image: U('1528360983277-13d401cdc186'),
    caption: 'Kyoto cherry blossom season 2026 — forecast just released. Peak bloom: March 25–April 5. These are the 8 spots you need to visit 🌸',
    likes: 229400, comments: 4980, category: 'travel',
    hashtags: ['#kyoto', '#japan', '#cherryblossom', '#sakura', '#travel'],
    timestamp: h(56), location: { name: 'Kyoto, Japan', lat: 35.0116, lng: 135.7681 },
    saved: false, liked: false, organizer: 'Lonely Planet',
  },
  {
    id: 'p33', user: MOCK_USERS[11],
    image: U('1580060839134-75a5edca2e99'),
    caption: 'Cape Town just ranked #1 city in Africa for experiences in 2026. Table Mountain, the V&A Waterfront, and Camps Bay — here\'s the complete guide 🏔️🌊',
    likes: 189000, comments: 3870, category: 'travel',
    hashtags: ['#capetown', '#southafrica', '#tablemountain', '#africa', '#travel'],
    timestamp: h(18), location: { name: 'Cape Town, South Africa', lat: -33.9249, lng: 18.4241 },
    saved: false, liked: false, organizer: 'National Geographic',
  },
  // ── Food ────────────────────────────────────────────────────────────────
  {
    id: 'p2', user: MOCK_USERS[1],
    image: U('1569050467447-ce54b3bbc37d'),
    caption: 'The 12 best ramen shops in New York City right now — ranked by our food critics. From $8 bowls to $45 omakase tonkotsu. Full guide in bio 🍜',
    likes: 89200, comments: 1780, category: 'food',
    hashtags: ['#ramen', '#foodie', '#nyc', '#japanesefood', '#bestinnyc'],
    timestamp: h(5), location: { name: 'New York, USA', lat: 40.7128, lng: -74.0060 },
    saved: false, liked: true, organizer: 'Time Out',
  },
  {
    id: 'p35', user: MOCK_USERS[1],
    image: U('1555396273-367ea4eb4db5'),
    caption: 'Rome\'s best trattorias in 2026 — we ate at 40 restaurants so you don\'t have to. These 9 are worth flying for 🍝🇮🇹',
    likes: 97000, comments: 2230, category: 'food',
    hashtags: ['#rome', '#italian', '#trattoria', '#foodguide', '#foodphotography'],
    timestamp: h(32), location: { name: 'Rome, Italy', lat: 41.9028, lng: 12.4964 },
    saved: false, liked: false, organizer: 'Time Out',
  },
  // ── Fashion ─────────────────────────────────────────────────────────────
  {
    id: 'p3', user: MOCK_USERS[7],
    image: U('1558618666-fcd25c85cd64'),
    caption: 'Spring/Summer 2026 — The trends that will define the season. Soft tailoring, fluid silhouettes, and a return to elevated minimalism 🌸 Full SS26 report on vogue.com.',
    likes: 312000, comments: 8920, category: 'fashion',
    hashtags: ['#fashion', '#spring2026', '#ootd', '#style', '#ss26'],
    timestamp: h(8), location: { name: 'Paris, France', lat: 48.8566, lng: 2.3522 },
    saved: true, liked: false, organizer: 'Vogue',
  },
  {
    id: 'p13', user: MOCK_USERS[7],
    image: U('1469334031218-e382a71b716b'),
    caption: 'Milan Fashion Week SS27 — the 7 moments that had the entire industry talking. Full runway reviews at vogue.com 👗✨',
    likes: 456000, comments: 12300, category: 'fashion',
    hashtags: ['#milanfashionweek', '#fashion', '#runway', '#mfw', '#style'],
    timestamp: h(68), location: { name: 'Milan, Italy', lat: 45.4654, lng: 9.1859 },
    saved: false, liked: true, organizer: 'Vogue',
  },
  // ── Sports ──────────────────────────────────────────────────────────────
  {
    id: 'p4', user: MOCK_USERS[2],
    image: U('1574629810360-7efbbe195018'),
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
    image: U('1547826039-bfc35e0f1ea8'),
    caption: 'Introducing 14 breakthrough artists at Art Basel Miami Beach 2026. These are the names you\'ll be hearing for the next decade 🎨',
    likes: 67800, comments: 3120, category: 'art',
    hashtags: ['#artbasel', '#contemporaryart', '#art', '#artist', '#miami'],
    timestamp: h(18), location: { name: 'Miami, USA', lat: 25.7825, lng: -80.1300 },
    saved: true, liked: false, organizer: 'Saatchi Art',
  },
  // ── Tech ────────────────────────────────────────────────────────────────
  {
    id: 'p6', user: MOCK_USERS[4],
    image: U('1559136555-9303baea8ebd'),
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
    image: U('1571019613454-1cb2f99b2d8b'),
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
    image: U('1571266028753-f35b5fb2beff'),
    caption: 'The 50 best clubs in the world for 2026 — RA\'s definitive annual ranking is here. #1 might surprise you 🎵',
    likes: 421000, comments: 18900, category: 'music',
    hashtags: ['#music', '#techno', '#clubculture', '#ra', '#electronicmusic'],
    timestamp: h(36), location: { name: 'Berlin, Germany', lat: 52.5200, lng: 13.4050 },
    saved: true, liked: false, organizer: 'Resident Advisor',
  },
  {
    id: 'p18', user: MOCK_USERS[6],
    image: U('1514525253161-7a46d19cd819'),
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
    image: U('1587300003388-59208cc962cb'),
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
    image: U('1512470876302-972faa2aa9a4'),
    caption: 'The 20 most unique Airbnb Experiences in Amsterdam — from canal boat breakfast to a private Rembrandt studio tour. Book via airbnb.com/experiences ☕',
    likes: 187500, comments: 5620, category: 'lifestyle',
    hashtags: ['#airbnb', '#amsterdam', '#experiences', '#travel', '#lifestyle'],
    timestamp: h(48), location: { name: 'Amsterdam, Netherlands', lat: 52.3676, lng: 4.9041 },
    saved: false, liked: true, organizer: 'Airbnb Experiences',
  },
  // ── Events ──────────────────────────────────────────────────────────────
  {
    id: 'ev1', user: MOCK_USERS[10],
    image: U('1540039155733-5bb30b53aa14'),
    caption: 'COACHELLA 2026 — Lineup just announced and it\'s the most anticipated in festival history. Weekend 1 & 2 at Empire Polo Club, Indio CA. Tickets on sale Friday via coachella.com 🎪',
    likes: 2840000, comments: 184000, category: 'events',
    hashtags: ['#coachella', '#coachella2026', '#music', '#festival', '#california'],
    timestamp: h(3), location: { name: 'Coachella Valley, USA', lat: 33.6800, lng: -116.2381 },
    saved: false, liked: false, isEvent: true, eventDate: 'Apr 11–20, 2026', eventVenue: 'Empire Polo Club, Indio CA',
    eventUrl: 'https://www.coachella.com', organizer: 'Goldenvoice', price: 'From $429',
  },
  {
    id: 'ev3', user: MOCK_USERS[4],
    image: U('1611532736597-de2d4265fba3'),
    caption: 'WWDC 2026 — Apple just sent invites. This year\'s keynote will reveal the next generation of AI across all Apple platforms. Free developer streaming at apple.com/wwdc 🍎',
    likes: 1560000, comments: 98000, category: 'events',
    hashtags: ['#wwdc', '#apple', '#tech', '#ios', '#developer'],
    timestamp: h(6), location: { name: 'Cupertino, USA', lat: 37.3387, lng: -121.8853 },
    saved: false, liked: false, isEvent: true, eventDate: 'Jun 9–13, 2026', eventVenue: 'Apple Park, Cupertino',
    eventUrl: 'https://developer.apple.com/wwdc26/', organizer: 'Apple', price: 'Free (streaming)',
  },
  {
    id: 'ev4', user: MOCK_USERS[7],
    image: U('1483985988355-763728e1935b'),
    caption: 'Paris Fashion Week SS27 is officially open. Vogue editors are front row. 10 days, 100 shows, one city. Live coverage at vogue.com 👗✨',
    likes: 1980000, comments: 76000, category: 'events',
    hashtags: ['#pfw', '#parisfashionweek', '#fashion', '#paris', '#ss27'],
    timestamp: h(4), location: { name: 'Paris, France', lat: 48.8566, lng: 2.3522 },
    saved: false, liked: false, isEvent: true, eventDate: 'Sep 30 – Oct 8, 2026', eventVenue: 'Various venues, Paris',
    eventUrl: 'https://www.modeaparis.com', organizer: 'Fédération de la Haute Couture', price: 'Industry only',
  },
  {
    id: 'ev5', user: MOCK_USERS[1],
    image: U('1557872943-16a5ac26437e'),
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
    image: U('1531366936337-7c912a4589a7'),
    caption: 'Northern Lights forecast for Iceland — the next 72 hours look exceptional. KP index reaching 5-6. Here\'s exactly where to go and when to watch 🌌',
    likes: 892000, comments: 34000, category: 'travel',
    hashtags: ['#northernlights', '#auroraborealis', '#iceland', '#natgeo', '#bucketlist'],
    timestamp: h(28), location: { name: 'Reykjavik, Iceland', lat: 64.1355, lng: -21.8954 },
    saved: false, liked: false, organizer: 'National Geographic',
  },
  {
    id: 'p43', user: MOCK_USERS[5],
    image: U('1571008887538-b36bb32f4571'),
    caption: 'Boston Marathon 2026 — registration opens Monday. 30,000 runners, one historic course. Everything you need to qualify and register at nike.com/boston 🏅',
    likes: 321000, comments: 12400, category: 'fitness',
    hashtags: ['#bostonmarathon', '#running', '#marathon', '#nike', '#runnersworld'],
    timestamp: h(48), location: { name: 'Boston, USA', lat: 42.3601, lng: -71.0589 },
    saved: false, liked: false, isEvent: true, eventDate: 'Apr 20, 2026', eventVenue: 'Hopkinton to Boston',
    eventUrl: 'https://www.baa.org/races/boston-marathon', organizer: 'Boston Athletic Association', price: '$250 registration',
  },
  {
    id: 'p49', user: MOCK_USERS[9],
    image: U('1513622470522-26c3c8a854bc'),
    caption: 'Copenhagen ranked the world\'s most liveable city for 2026. These 12 Airbnb Experiences show you exactly why locals love it here 🇩🇰🌟',
    likes: 523000, comments: 19200, category: 'lifestyle',
    hashtags: ['#copenhagen', '#denmark', '#hygge', '#airbnb', '#travel'],
    timestamp: h(34), location: { name: 'Copenhagen, Denmark', lat: 55.6761, lng: 12.5683 },
    saved: false, liked: false, organizer: 'Airbnb Experiences',
  },
  {
    id: 'p50', user: MOCK_USERS[2],
    image: U('1501854140801-50d01698950b'),
    caption: 'World Surf League Championship Tour Gold Coast 2026 — the world\'s best surfers, Snapper Rocks, free entry on the beach. Livestream at worldsurfleague.com 🏄',
    likes: 671000, comments: 24400, category: 'sports',
    hashtags: ['#wsl', '#surf', '#goldcoast', '#championship', '#waves'],
    timestamp: h(20), location: { name: 'Gold Coast, Australia', lat: -28.0167, lng: 153.4000 },
    saved: false, liked: false, isEvent: true, eventDate: 'Mar 1–12, 2026', eventVenue: 'Snapper Rocks, Gold Coast',
    eventUrl: 'https://www.worldsurfleague.com', organizer: 'World Surf League', price: 'Free beach entry',
  },
  // ── Extended global-interest content (location-neutral inspiration) ──────────
  {
    id: 'p60', user: MOCK_USERS[1],
    image: U('1504674900247-0877df9cc836'),
    caption: 'The 25 best rooftop bars in the world for summer 2026 — from Bangkok to Mexico City. Ranked by our global editors, with opening hours and booking links 🍹🌅',
    likes: 134000, comments: 5600, category: 'lifestyle',
    hashtags: ['#rooftopbar', '#travel', '#summer2026', '#cocktails', '#timeout'],
    timestamp: h(10),
    saved: false, liked: false, organizer: 'Time Out',
  },
  {
    id: 'p62', user: MOCK_USERS[4],
    image: U('1485827404703-89b55fcc595e'),
    caption: '10 global tech conferences you need to attend in 2026 — CES, SXSW, Web Summit, VivaTech and more. Career-changing rooms, world-changing ideas 🚀💡',
    likes: 28000, comments: 1200, category: 'tech',
    hashtags: ['#tech', '#startups', '#conference', '#innovation', '#techlife'],
    timestamp: h(6),
    saved: false, liked: false, organizer: 'TechCrunch',
  },
  {
    id: 'p63', user: MOCK_USERS[6],
    image: U('1533174072545-7a4f46a87ba4'),
    caption: 'The 20 best music festivals in the world in 2026 — ranked. Glastonbury, Coachella, Primavera Sound, Tomorrowland, Ultra. Which one makes your bucket list? 🎧⚡',
    likes: 1240000, comments: 62000, category: 'music',
    hashtags: ['#festivals', '#music', '#edm', '#glastonbury', '#coachella'],
    timestamp: h(14),
    saved: false, liked: false, organizer: 'Resident Advisor',
  },
  {
    id: 'p64', user: MOCK_USERS[3],
    image: U('1578662996442-48f60103fc96'),
    caption: 'The world\'s most unmissable art events of 2026 — Venice Biennale, Art Basel, Frieze London, Documenta. A connoisseur\'s guide to the global art calendar 🎭🖼️',
    likes: 112000, comments: 4800, category: 'art',
    hashtags: ['#art', '#biennale', '#artbasel', '#contemporaryart', '#culture'],
    timestamp: h(38),
    saved: false, liked: false, organizer: 'Saatchi Art',
  },
  {
    id: 'p65', user: MOCK_USERS[5],
    image: U('1540497077202-41b8d6fd3a85'),
    caption: 'World Marathon Majors 2026 — Tokyo, Boston, London, Berlin, Chicago, New York. Training plans, qualifying times, and what each race actually feels like 🏃‍♂️🏅',
    likes: 89000, comments: 3200, category: 'fitness',
    hashtags: ['#marathon', '#running', '#worldmajors', '#fitness', '#runnersworld'],
    timestamp: h(26),
    saved: false, liked: false, organizer: 'Nike Training Club',
  },
  {
    id: 'p66', user: MOCK_USERS[7],
    image: U('1490481651871-ab68de25d43d'),
    caption: 'The most influential street-style cities of 2026 — Tokyo, Seoul, Lagos, Copenhagen, Buenos Aires. What each city\'s fashion week street looks are saying right now 👗✨',
    likes: 76000, comments: 2900, category: 'fashion',
    hashtags: ['#streetstyle', '#fashion', '#ootd', '#fashionweek', '#style'],
    timestamp: h(16),
    saved: false, liked: false, organizer: 'Vogue',
  },
  {
    id: 'p67', user: MOCK_USERS[9],
    image: U('1504280390367-361c6d9f38f4'),
    caption: 'Wild camping across 5 continents — the ultimate guide to permit-free overnight spots in Patagonia, the Scottish Highlands, Kyrgyzstan, New Zealand and Namibia 🏔️⛺',
    likes: 203000, comments: 7400, category: 'outdoors',
    hashtags: ['#wildcamping', '#hiking', '#outdoors', '#nature', '#adventure'],
    timestamp: h(44),
    saved: false, liked: false, organizer: 'Airbnb Experiences',
  },
  {
    id: 'p68', user: MOCK_USERS[10],
    image: U('1492684223066-81342ee5ff30'),
    caption: 'The 15 best open-air music festivals of 2026 — Glastonbury, Lollapalooza, Fuji Rock, Primavera, Exit Festival. Full lineups, ticket links, camping tips 🎤🎪',
    likes: 892000, comments: 38000, category: 'events',
    hashtags: ['#festival', '#openair', '#music', '#livemusic', '#summer'],
    timestamp: h(9),
    saved: false, liked: false, organizer: 'Eventbrite',
  },
  {
    id: 'p69', user: MOCK_USERS[11],
    image: U('1506905925346-21bda4d32df4'),
    caption: 'The 20 most underrated cities in the world for 2026 — Tbilisi, Medellín, Porto, Chiang Mai, Tallinn. The places worth visiting before everyone else discovers them 🗺️',
    likes: 341000, comments: 14200, category: 'travel',
    hashtags: ['#travel', '#hiddengems', '#wanderlust', '#natgeo', '#explore'],
    timestamp: h(52),
    saved: false, liked: false, organizer: 'National Geographic',
  },
  {
    id: 'p70', user: MOCK_USERS[1],
    image: U('1555396273-367ea4eb4db5'),
    caption: 'The world\'s 50 best restaurants 2026 — the full ranked list. Disfrutar, Alchemist, Mirazur, Noma 3.0 and the newcomers that shook up the global fine dining scene 🍽️🍷',
    likes: 98000, comments: 4100, category: 'food',
    hashtags: ['#food', '#restaurants', '#finedining', '#worlds50best', '#foodie'],
    timestamp: h(31),
    saved: false, liked: false, organizer: 'Time Out',
  },
  {
    id: 'p71', user: MOCK_USERS[8],
    image: U('1587300003388-59208cc962cb'),
    caption: 'The most dog-friendly cities in the world — Amsterdam, Zurich, San Francisco, Melbourne, Stockholm. Off-leash parks, pet cafés, and vet access ranked 🐾🐕',
    likes: 54000, comments: 1900, category: 'pets',
    hashtags: ['#dogs', '#dogfriendly', '#pettravel', '#dogsofinstagram', '#petlife'],
    timestamp: h(19),
    saved: false, liked: false, organizer: 'Battersea Dogs & Cats',
  },
  {
    id: 'p72', user: MOCK_USERS[2],
    image: U('1574629810360-7efbbe195018'),
    caption: 'UEFA Euro 2028 host cities confirmed — London, Rome, Madrid, Paris, Amsterdam, Warsaw. Stadium capacities, travel guides and what each city offers fans ⚽🔥',
    likes: 620000, comments: 28000, category: 'sports',
    hashtags: ['#euro2028', '#football', '#uefa', '#sport', '#soccer'],
    timestamp: h(8),
    saved: false, liked: false, organizer: 'UEFA Champions League',
  },
  {
    id: 'p73', user: MOCK_USERS[9],
    image: U('1551504734-5ee1c4a1479b'),
    caption: 'The world\'s most beautiful historic swimming pools — from Budapest\'s Széchenyi to Melbourne\'s Fitzroy Pool. Architecture, history and how to visit 🏊✨',
    likes: 187000, comments: 6800, category: 'lifestyle',
    hashtags: ['#swimming', '#wellness', '#historicplaces', '#travel', '#architecture'],
    timestamp: h(13),
    saved: false, liked: false, organizer: 'Airbnb Experiences',
  },
  {
    id: 'p74', user: MOCK_USERS[0],
    image: U('1524231757912-21f4fe3a7200'),
    caption: 'The world\'s most photographed places — and how to see them without the crowds. Machu Picchu, Santorini, Kyoto\'s bamboo grove, Hallstatt. Timing is everything 🏘️💎',
    likes: 445000, comments: 21000, category: 'sightseeing',
    hashtags: ['#sightseeing', '#travel', '#photography', '#wanderlust', '#lonelyplanet'],
    timestamp: h(40),
    saved: false, liked: false, organizer: 'Lonely Planet',
  },
  {
    id: 'p75', user: MOCK_USERS[10],
    image: U('1496337589254-7e19d01cfe44'),
    caption: 'The biggest free music festivals on Earth — Donauinselfest, Summerstage NYC, Hyde Park Concerts, Wireless. Millions of people, zero ticket cost. How they pull it off 🎉🎶',
    likes: 1100000, comments: 52000, category: 'events',
    hashtags: ['#freefestival', '#music', '#openair', '#freeentry', '#livemusic'],
    timestamp: h(5),
    saved: false, liked: false, organizer: 'Eventbrite',
  },
  {
    id: 'p76', user: MOCK_USERS[4],
    image: U('1504868584851-f357d7f5a4bd'),
    caption: 'The 10 best cities in the world for digital nomads in 2026 — Lisbon, Chiang Mai, Medellín, Tallinn, Bali, Tbilisi. Costs, wifi, co-working, visa rules compared 💻☕',
    likes: 167000, comments: 8900, category: 'tech',
    hashtags: ['#remotework', '#digitalnomad', '#coworking', '#travel', '#workfromanywhere'],
    timestamp: h(35),
    saved: false, liked: false, organizer: 'TechCrunch',
  },
];

// No fabricated engagement: demo posts start with zero likes/comments and no
// pre-seeded liked/saved flags — counts only ever reflect this user's actions
export const MOCK_POSTS: Post[] = RAW_MOCK_POSTS.map(p => ({
  ...p, likes: 0, comments: 0, liked: false, saved: false,
}));

export const MOCK_STORIES: Story[] = [
  { id: 's1', user: MOCK_USERS[0],  seen: false, image: U('1506905925346-21bda4d32df4', 800, 1400) }, // Lonely Planet — mountain travel
  { id: 's2', user: MOCK_USERS[1],  seen: false, image: U('1480714378408-67cf0d13bc1b', 800, 1400) }, // Time Out — city nightlife
  { id: 's3', user: MOCK_USERS[7],  seen: true,  image: U('1558618666-fcd25c85cd64', 800, 1400) },   // Vogue — fashion
  { id: 's4', user: MOCK_USERS[2],  seen: false, image: U('1574629810360-7efbbe195018', 800, 1400) }, // UEFA — stadium
  { id: 's5', user: MOCK_USERS[5],  seen: true,  image: U('1571019613454-1cb2f99b2d8b', 800, 1400) }, // Nike — running
  { id: 's6', user: MOCK_USERS[6],  seen: false, image: U('1514525253161-7a46d19cd819', 800, 1400) }, // RA — festival crowd
  { id: 's7', user: MOCK_USERS[3],  seen: false, image: U('1547826039-bfc35e0f1ea8', 800, 1400) },   // Saatchi Art — gallery
  { id: 's8', user: MOCK_USERS[8],  seen: true,  image: U('1587300003388-59208cc962cb', 800, 1400) }, // Battersea — dogs
  { id: 's9', user: MOCK_USERS[9],  seen: false, image: U('1512470876302-972faa2aa9a4', 800, 1400) }, // Airbnb — Amsterdam
  { id: 's10', user: MOCK_USERS[11], seen: false, image: U('1531366936337-7c912a4589a7', 800, 1400) }, // NatGeo — aurora
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
  { id: 'n1', user: NOVA_AI_USER, type: 'ai_suggestion', postImage: U('1514525253161-7a46d19cd819', 80, 80), text: 'New concerts dropping in your area tonight 🎵', timestamp: h(0.3), read: false },
  { id: 'n2', user: NOVA_AI_USER, type: 'event', postImage: U('1514525253161-7a46d19cd819', 80, 80), text: 'Glastonbury 2026 lineup just confirmed — check it out 🎸', timestamp: h(0.8), read: false },
  { id: 'n3', user: NOVA_AI_USER, type: 'ai_suggestion', postImage: U('1547826039-bfc35e0f1ea8', 80, 80), text: 'New art exhibitions near you this weekend 🎨', timestamp: h(1.5), read: false },
  { id: 'n4', user: NOVA_AI_USER, type: 'event', postImage: U('1569050467447-ce54b3bbc37d', 80, 80), text: 'Food festival starts in 2 days — save your spot 🍕', timestamp: h(3), read: true },
  { id: 'n5', user: NOVA_AI_USER, type: 'ai_suggestion', postImage: U('1559136555-9303baea8ebd', 80, 80), text: 'Tech meetup tonight — 47 people attending 💻', timestamp: h(6), read: true },
  { id: 'n6', user: NOVA_AI_USER, type: 'event', postImage: U('1540039155733-5bb30b53aa14', 80, 80), text: 'Coachella 2026 tickets on sale Friday 🎪', timestamp: h(12), read: true },
  { id: 'n7', user: NOVA_AI_USER, type: 'ai_suggestion', postImage: U('1571019613454-1cb2f99b2d8b', 80, 80), text: 'Fitness events trending in your city this week 💪', timestamp: h(24), read: true },
  { id: 'n8', user: NOVA_AI_USER, type: 'event', postImage: U('1558618666-fcd25c85cd64', 80, 80), text: 'Vintage market this Sunday — free entry 👗', timestamp: h(36), read: true },
];

export const DEFAULT_PREFERENCES = {
  travel: 80, food: 60, fashion: 40, sports: 50, art: 70,
  tech: 65, fitness: 55, music: 75, pets: 85, lifestyle: 60,
  events: 90, sightseeing: 65, shops: 50, venues: 60, community: 55,
  restaurants: 70, hotels: 50, rentals: 45, outdoors: 70,
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

const RAW_SPONSORED_POSTS: Post[] = [
  {
    id: 'sp1',
    user: sponsorUser('La Maison Restaurant', 'lamaisonrestaurant.com', '🍽️ Award-winning European cuisine · Private dining available'),
    image: U('1414235077428-338989a2e8c0'),
    caption: 'An unforgettable dining experience in the heart of the city. Chef Marco\'s tasting menu takes you on a 7-course journey through seasonal European flavours — paired with our sommelier-curated wine selection. Private events, birthday dinners, and corporate bookings welcome.\n\n📍 City Centre · Reservations recommended\n🕐 Tue–Sun, 12:00–23:00\n💳 From €45 per person',
    likes: 4800, comments: 112, category: 'food',
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
    image: U('1551024601-bec78aea704b'),
    caption: 'Craft cocktails with a view from 30 floors up. SkyBar is the city\'s most Instagrammed rooftop — sunset hour from 18:00–20:00 with 2-for-1 cocktails every Thursday and Friday. Walk-ins welcome, table reservations via our website.\n\n📍 30th Floor, Central Tower · Open daily\n🕐 16:00–01:00 · Happy Hour: 18:00–20:00\n🍸 Cocktails from €12',
    likes: 7200, comments: 234, category: 'venues',
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
    image: U('1449965408869-eaa3f722e40d'),
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
    image: U('1566073771259-6a8506099945'),
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
    image: U('1468413253333-46f4eba27f69'),
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
    image: U('1544161515-4ab6ce6db874'),
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
  {
    id: 'sp7',
    user: sponsorUser('AquaJet Rentals', 'aquajet-rentals.com', '🛥️ Jetski · Speedboat · Paddleboard Rentals'),
    image: U('1530870110042-98b2cb110834'),
    caption: 'Hit the water this weekend. AquaJet rents jetskis, speedboats, and paddleboards — no experience needed, our instructors handle safety briefings. Perfect for solo riders, couples, or groups of up to 8. Hourly and half-day packages available.\n\n📍 Marina Bay · Open daily 08:00–20:00\n🌊 Jetskis from €45/hour · Speedboats from €120/hour\n✅ Safety gear included · No licence required',
    likes: 3800, comments: 104, category: 'sports',
    hashtags: ['#jetski', '#watersports', '#boatrental', '#nova', '#sponsored'],
    timestamp: Date.now() - 25200000,
    location: { name: 'Marina Bay', lat: 0, lng: 0 },
    saved: false, liked: false,
    isSponsored: true,
    eventUrl: 'https://aquajet-rentals.com',
    sponsoredCta: 'Book Now',
    organizer: 'AquaJet Rentals',
  },
  {
    id: 'sp8',
    user: sponsorUser('Happy Paws Pet Hotel', 'happypawshotel.com', '🐾 Dog & cat boarding · Grooming · Daycare'),
    image: U('1548199973-03cce0bbc87b'),
    caption: 'Your pets deserve a holiday too. Happy Paws is a 5-star pet hotel with individual suites, daily playtime, professional grooming, and live-stream cam access so you can check in from anywhere. Vet on call 24/7 — because peace of mind matters.\n\n📍 Quiet location · 10 min from airport\n🐶 Dog daycare from €20/day · Overnight from €35\n🐱 Cat suites from €18/night · Grooming from €30',
    likes: 5200, comments: 186, category: 'pets',
    hashtags: ['#pethotel', '#dogboarding', '#petcare', '#nova', '#sponsored'],
    timestamp: Date.now() - 28800000,
    location: { name: 'Pet District', lat: 0, lng: 0 },
    saved: false, liked: false,
    isSponsored: true,
    eventUrl: 'https://happypawshotel.com',
    sponsoredCta: 'Book a Stay',
    organizer: 'Happy Paws Pet Hotel',
  },
  {
    id: 'sp9',
    user: sponsorUser('The Harbour Kitchen', 'harbourkitchen.com', '🍽️ Fresh seafood & wood-fired meats · Waterfront dining'),
    image: U('1414235077428-338989a2e8c0', 600, 750),
    caption: 'The best seat in the city comes with a harbour view. The Harbour Kitchen serves wood-fired fish, fresh oysters, and locally sourced steaks. Sunday brunch is legendary — book early. Private dining room available for events up to 30 guests.\n\n📍 Harbour Front · Waterfront terrace open May–Sep\n🕐 Daily 12:00–23:00 · Brunch Sat & Sun 10:00–15:00\n🍽️ Mains from €18 · Sunday brunch €32 per person',
    likes: 6100, comments: 221, category: 'food',
    hashtags: ['#seafood', '#harbourdining', '#foodie', '#nova', '#sponsored'],
    timestamp: Date.now() - 32400000,
    location: { name: 'Harbour Front', lat: 0, lng: 0 },
    saved: false, liked: false,
    isSponsored: true,
    eventUrl: 'https://harbourkitchen.com',
    sponsoredCta: 'Reserve a Table',
    organizer: 'The Harbour Kitchen',
  },
  {
    id: 'sp10',
    user: sponsorUser('The Old Quarter Pub', 'oldquarterpub.com', '🍺 Craft beer · Live music · Pub quiz every Thursday'),
    image: U('1436076863939-06870fe779c2'),
    caption: 'Your neighbourhood pub, done properly. The Old Quarter pours 20 rotating craft beers on tap, hosts live music every Friday and Saturday, and runs the city\'s most competitive pub quiz every Thursday at 20:00. Kitchen open until midnight — proper comfort food, nothing fancy.\n\n📍 Old Quarter · 2 min from tram stop\n🍺 Pints from €5 · Kitchen open till midnight\n🎵 Live music Fri & Sat from 21:00 · Quiz Thu 20:00',
    likes: 4400, comments: 167, category: 'venues',
    hashtags: ['#publife', '#craftbeer', '#livemusic', '#pubquiz', '#nova', '#sponsored'],
    timestamp: Date.now() - 36000000,
    location: { name: 'Old Quarter', lat: 0, lng: 0 },
    saved: false, liked: false,
    isSponsored: true,
    eventUrl: 'https://oldquarterpub.com',
    sponsoredCta: 'See This Week\'s Events',
    organizer: 'The Old Quarter Pub',
  },
];

export const SPONSORED_POSTS: Post[] = RAW_SPONSORED_POSTS.map(p => ({
  ...p, likes: 0, comments: 0, liked: false, saved: false,
}));

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

const GALLERY_IDS = [
  '1570077188670-e3a8d69ac5ff', // Santorini
  '1528360983277-13d401cdc186', // Kyoto
  '1580060839134-75a5edca2e99', // Cape Town
  '1569050467447-ce54b3bbc37d', // Ramen
  '1555396273-367ea4eb4db5',    // Italian food
  '1514525253161-7a46d19cd819', // Music festival
  '1540039155733-5bb30b53aa14', // Coachella
  '1531366936337-7c912a4589a7', // Northern lights
  '1512470876302-972faa2aa9a4', // Amsterdam
  '1571019613454-1cb2f99b2d8b', // Running
  '1547826039-bfc35e0f1ea8',    // Art gallery
  '1574629810360-7efbbe195018', // Stadium
];
export const GALLERY_IMAGES = GALLERY_IDS.map((id, i) => ({
  id: `g${i}`, url: U(id),
}));
