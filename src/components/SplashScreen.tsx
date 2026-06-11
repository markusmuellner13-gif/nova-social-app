'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const GENERIC_PHRASES = [
  'Your city. Rediscovered.',
  'Tonight\'s plans, sorted.',
  'Something\'s happening near you.',
  'Hidden gems, found for you.',
  'Let AI plan your evening.',
  'Never miss what matters.',
  'Find your next favourite place.',
  'AI that knows your taste.',
  'Your neighbourhood, unlocked.',
  'What\'s on tonight?',
  'Your evening starts here.',
  'Smarter discovery, every time.',
  'Live more. Discover more.',
  'Every city has a secret.',
  'The best night out, planned.',
  'From concerts to hidden cafés.',
  'Concerts, art, food — for you.',
  'Explore. Save. Go.',
  'Your personal city guide.',
  'Set reminders. Be there.',
  'Experiences worth sharing.',
  'Discover the unexpected.',
  'Something new is always near.',
  'Local gems, right on your feed.',
  'The city never sleeps.',
  'Always something new to find.',
  'Your feed knows you well.',
  'Events tailored to your taste.',
  'Never a boring evening again.',
  'The world is your playground.',
  'Great nights start with Nova.',
  'Curated just for you, always.',
  'Find friends. Find events.',
  'Save it. Then go.',
  'Your AI-powered night out.',
];

const CITY_PHRASES: Record<string, string[]> = {
  // ── Italian cities ──────────────────────────────────────────────────────
  'milano': ['Milano non si ferma mai.', 'La notte milanese è tua.', 'The pulse of Italy, right in your hand.'],
  'milan':  ['Milano non si ferma mai.', 'La notte milanese è tua.', 'The pulse of Italy, right in your hand.'],
  'roma':   ['Roma ti aspetta.', 'La città eterna, sempre nuova.', 'Every corner of Rome has a story.'],
  'rome':   ['Roma ti aspetta.', 'La città eterna, sempre nuova.', 'Every corner of Rome has a story.'],
  'napoli': ['Napoli è vita.', 'La pizza più buona del mondo — e non solo.', 'Feel the soul of the South.'],
  'naples': ['Napoli è vita.', 'La pizza più buona del mondo — e non solo.', 'Feel the soul of the South.'],
  'firenze': ['Firenze ti incanta.', 'La culla del Rinascimento ti aspetta.', 'Art, food, and magic — in every alley.'],
  'florence': ['Firenze ti incanta.', 'La culla del Rinascimento ti aspetta.', 'Art, food, and magic — in every alley.'],
  'venezia': ['Venezia, unica nel suo genere.', 'Ogni canale racconta una storia.', 'Get lost — that\'s the point.'],
  'venice':  ['Venezia, unica nel suo genere.', 'Ogni canale racconta una storia.', 'Get lost — that\'s the point.'],
  'torino': ['Torino, elegante e autentica.', 'Tra luci e cioccolato — benvenuto a Torino.', 'The city that never runs out of surprises.'],
  'turin':  ['Torino, elegante e autentica.', 'Tra luci e cioccolato — benvenuto a Torino.', 'The city that never runs out of surprises.'],
  'bologna': ['Bologna la grassa, la rossa, la dotta.', 'Portici, pasta e cultura — tutto a portata di mano.', 'The best food city in Italy — and the world.'],
  'palermo': ['Palermo, dove il mondo si incontra.', 'Street food, history, and soul.', 'La Sicilia in un respiro.'],
  'genova':  ['Genova, la Superba.', 'Il mare inizia qui.', 'Hidden alleys, sea breeze, real flavours.'],
  'genoa':   ['Genova, la Superba.', 'Il mare inizia qui.', 'Hidden alleys, sea breeze, real flavours.'],
  'bari':    ['Bari, cuore del Sud.', 'Aperitivo sul lungomare — inizia così.', 'Southern charm, northern pace.'],
  'catania': ['Catania ai piedi dell\'Etna.', 'Lava, sea, and unforgettable nights.', 'Una città che brucia di energia.'],
  'verona':  ['Verona — la città dell\'amore.', 'Arena, vino e romanticismo.', 'Shakespeare had the right idea.'],
  'trieste': ['Trieste, dove l\'Europa si incontra.', 'Venti di mare, caffè e letteratura.', 'Coffee culture at its finest.'],
  'bergamo': ['Bergamo, alta e bassa — tutta da scoprire.', 'A city of two worlds.', 'Tra le mura e le valli — c\'è sempre qualcosa.'],
  'brescia': ['Brescia, la Leonessa.', 'Tra laghi e colline — il cuore della Lombardia.', 'History and energy in every piazza.'],
  'como':    ['Como, dove il lago incontra la montagna.', 'La bellezza che toglie il fiato.', 'Lake life, elevated.'],
  'rimini':  ['Rimini — mare, divertimento, storia.', 'Estate e inverno — Rimini non si ferma.', 'Beach culture meets Roman heritage.'],
  'modena':  ['Modena — motori, musica e sapori.', 'Ferrari, Pavarotti, and the best balsamic.', 'Una città che vive ad alto regime.'],
  'pisa':    ['Pisa — oltre la torre.', 'Lungarni, storia e vita studentesca.', 'There\'s more to discover than the postcard.'],
  'siena':   ['Siena, ferma nel tempo.', 'Il Palio è solo l\'inizio.', 'Medieval magic, every single day.'],
  'perugia': ['Perugia, tra arte e cioccolato.', 'Hill towns and hidden culture.', 'L\'Umbria ti sorprende.'],
  'lecce':   ['Lecce — il barocco del Sud.', 'La Firenze del Sud ti aspetta.', 'Stone, sun, and aperitivo.'],
  'padova':  ['Padova, tra storia e vita.', 'Giotto, Galileo e ottima cucina.', 'A student city full of secrets.'],
  'padua':   ['Padova, tra storia e vita.', 'Giotto, Galileo e ottima cucina.', 'A student city full of secrets.'],
  'lucca':   ['Lucca, dentro le mura.', 'The walled city with a big soul.', 'Passeggiate e musica nell\'aria.'],
  'amalfi':  ['Amalfi — la costa più bella del mondo.', 'Cliffs, sea, and limoncello.', 'Il Sud Italia nel suo massimo splendore.'],
  'positano':['Positano — stacked, colourful, perfect.', 'Where the mountain meets the sea.', 'La bellezza Amalfitana è tua.'],
  'ravenna': ['Ravenna, oro e mosaici.', 'Byzantine art at every turn.', 'La città dei mosaici ti aspetta.'],

  // ── Global major cities ─────────────────────────────────────────────────
  'london':       ['London never stops surprising.', 'From Soho to Shoreditch — it\'s all here.', 'The world\'s best city is waiting.'],
  'paris':        ['Paris is always a good idea.', 'The city of light, in your pocket.', 'From Montmartre to Marais — discover more.'],
  'barcelona':    ['Barcelona — where the night never ends.', 'La vida es buena en Barcelona.', 'From Gaudí to the beach in one app.'],
  'madrid':       ['Madrid, siempre viva.', 'Tapas, art, and nights that last forever.', 'The Spanish capital is calling.'],
  'berlin':       ['Berlin never sleeps — and neither should you.', 'From galleries to clubs — find it all.', 'The most creative city on earth.'],
  'amsterdam':    ['Amsterdam — art, bikes, and hidden gems.', 'Every canal leads somewhere beautiful.', 'The city that rewards the curious.'],
  'vienna':       ['Vienna — imperial grandeur, modern soul.', 'Coffee houses, concerts, and culture.', 'The most liveable city, rediscovered.'],
  'zurich':       ['Zurich — where quality meets discovery.', 'Alps, art, and amazing food.', 'The Swiss city that always delivers.'],
  'munich':       ['Munich — beyond the beer gardens.', 'Bavaria\'s finest, right at your fingertips.', 'Culture, sport, and alpine vibes.'],
  'münchen':      ['Munich — beyond the beer gardens.', 'Bavaria\'s finest, right at your fingertips.', 'Culture, sport, and alpine vibes.'],
  'hamburg':      ['Hamburg — port city, big heart.', 'From the harbour to the clubs — explore it all.', 'Northern Germany\'s coolest city.'],
  'prague':       ['Prague — a fairy tale, lived daily.', 'Gothic spires and great coffee.', 'The most beautiful city you\'ll ever discover.'],
  'budapest':     ['Budapest — two cities, one magic.', 'Thermal baths and rooftop bars.', 'Danube vibes, every night.'],
  'lisbon':       ['Lisbon — sun, soul, and the sea.', 'Fado, food, and the best sunsets.', 'Europe\'s most charming capital.'],
  'lisboa':       ['Lisbon — sun, soul, and the sea.', 'Fado, food, and the best sunsets.', 'Europe\'s most charming capital.'],
  'porto':        ['Porto — wine, tiles, and the Douro.', 'Small city, enormous charm.', 'Portugal\'s most beautiful secret.'],
  'athens':       ['Athens — where history meets the now.', 'Ancient by day, electric by night.', 'The cradle of civilisation, rediscovered.'],
  'istanbul':     ['Istanbul — where East meets West.', 'Two continents, one incredible city.', 'The Bosphorus is calling.'],
  'dubai':        ['Dubai — ambition made visible.', 'The future, right in front of you.', 'Luxury, culture, and endless discovery.'],
  'tokyo':        ['Tokyo — infinite layers, infinite nights.', 'Ramen, robots, and rooftop bars.', 'The city that always has more to offer.'],
  'osaka':        ['Osaka — eat, laugh, explore.', 'Japan\'s kitchen and nightlife capital.', 'Street food paradise, right here.'],
  'kyoto':        ['Kyoto — where tradition lives on.', 'Temples, geishas, and quiet gardens.', 'Ancient Japan, waiting for you.'],
  'new york':     ['New York — the city that never sleeps.', 'Eight million stories — find yours.', 'From Brooklyn to the Bronx — it\'s all here.'],
  'new york city':['New York — the city that never sleeps.', 'Eight million stories — find yours.', 'From Brooklyn to the Bronx — it\'s all here.'],
  'los angeles':  ['LA — sunshine, culture, and endless energy.', 'Hollywood to Silver Lake — explore it all.', 'The city of angels has something for you.'],
  'miami':        ['Miami — sun, music, and electric nights.', 'From Art Basel to the beach.', 'Neon and ocean — the perfect mix.'],
  'chicago':      ['Chicago — deep dish, deep culture.', 'The Windy City never runs out of things to do.', 'Architecture, music, and world-class dining.'],
  'san francisco':['San Francisco — fog and brilliance.', 'The city by the bay, always inspiring.', 'From the Mission to the Bay.'],
  'sydney':       ['Sydney — where the harbour meets the world.', 'Opera House to Bondi — it\'s all here.', 'Australia\'s most vibrant city.'],
  'melbourne':    ['Melbourne — the culture capital of the South.', 'Coffee, art, and hidden laneways.', 'Where creativity is a way of life.'],
  'singapore':    ['Singapore — clean, green, and electric.', 'Asia\'s most exciting crossroads.', 'A garden city with world-class everything.'],
  'bangkok':      ['Bangkok — the city that never stops.', 'Street food, temples, and rooftop bars.', 'Chaotic, beautiful, unforgettable.'],
  'seoul':        ['Seoul — K-culture meets ancient history.', 'The city where tomorrow is today.', 'From Gangnam to Insadong — discover it all.'],
  'shanghai':     ['Shanghai — East and West in perfect harmony.', 'The Bund, the future, and everything in between.', 'China\'s most cosmopolitan city.'],
  'beijing':      ['Beijing — power and poetry.', 'From the Great Wall to the hutongs.', 'Ancient and modern — all in one city.'],
  'hong kong':    ['Hong Kong — lights, energy, and soul.', 'Dim sum at dawn, skyline at dusk.', 'Asia\'s most thrilling city.'],
  'toronto':      ['Toronto — the world in one city.', 'Every neighbourhood, a new adventure.', 'Canada\'s most electric city.'],
  'montreal':     ['Montréal — bilingual, bold, beautiful.', 'Festival city of North America.', 'Joie de vivre, all year round.'],
  'mexico city':  ['Ciudad de México — colossal and colourful.', 'The world\'s greatest street food scene.', 'Culture, chaos, and endless discovery.'],
  'rio de janeiro':['Rio — where the mountains meet the sea.', 'Carnival spirit, 365 days a year.', 'A cidade maravilhosa is waiting.'],
  'são paulo':    ['São Paulo — never stops, never sleeps.', 'The cultural powerhouse of South America.', 'Art, food, and energy without limits.'],
  'sao paulo':    ['São Paulo — never stops, never sleeps.', 'The cultural powerhouse of South America.', 'Art, food, and energy without limits.'],
  'buenos aires': ['Buenos Aires — the Paris of South America.', 'Tango, steak, and endless nights.', 'La Reina del Plata te espera.'],
  'cape town':    ['Cape Town — mountain, ocean, and magic.', 'The most beautiful city on Earth.', 'Where adventure begins at every turn.'],
  'nairobi':      ['Nairobi — Africa\'s most vibrant capital.', 'Wildlife by day, nightlife after dark.', 'The Silicon Savannah is alive.'],
  'marrakech':    ['Marrakech — colours, spices, and wonder.', 'Lose yourself in the medina.', 'The Red City never disappoints.'],
  'copenhagen':   ['Copenhagen — hygge meets world-class design.', 'The happiest city on Earth — find out why.', 'Nordic cool, at your fingertips.'],
  'stockholm':    ['Stockholm — beauty built into the landscape.', 'Archipelago, culture, and great coffee.', 'Scandinavia at its most liveable.'],
  'oslo':         ['Oslo — fjords, forests, and the future.', 'Where nature and city life collide.', 'Norway\'s most exciting capital.'],
  'helsinki':     ['Helsinki — Nordic design and sauna culture.', 'The most liveable city in Europe.', 'Art, architecture, and Arctic light.'],
  'brussels':     ['Brussels — the capital of Europe.', 'Waffles, beer, and world-class art.', 'A small city with a global heartbeat.'],
  'zurich':       ['Zurich — where quality meets discovery.', 'Alps, art, and amazing food.', 'The Swiss city that always delivers.'],
  'warsaw':       ['Warsaw — resilient, vibrant, alive.', 'A city reborn — and thriving.', 'Eastern Europe\'s best-kept secret.'],
  'krakow':       ['Kraków — medieval beauty, modern energy.', 'Old town charm with a youthful soul.', 'Poland\'s most magical city.'],
  'edinburgh':    ['Edinburgh — castles, culture, and character.', 'The world\'s greatest festival city.', 'Scotland\'s capital never disappoints.'],
  'dublin':       ['Dublin — craic, culture, and great nights.', 'The friendliest capital in Europe.', 'Pubs, poetry, and endless charm.'],
};

function pickPhrase(): string {
  const city = typeof window !== 'undefined' ? (localStorage.getItem('nova_last_city') ?? '') : '';
  const key = city.toLowerCase().trim();
  const pool = CITY_PHRASES[key] ?? GENERIC_PHRASES;
  return pool[Math.floor(Math.random() * pool.length)];
}

interface Props {
  onComplete: () => void;
}

export default function SplashScreen({ onComplete }: Props) {
  const [phase, setPhase] = useState<'logo' | 'tagline' | 'exit'>('logo');
  // Picks once on mount — reads nova_last_city from localStorage for city-specific phrases
  const [phrase] = useState(() => pickPhrase());

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('tagline'), 900);
    const t2 = setTimeout(() => setPhase('exit'), 2200);
    const t3 = setTimeout(() => onComplete(), 2800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {phase !== 'exit' ? (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.05 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{
            background: 'linear-gradient(160deg, #0d0618 0%, #120824 30%, #0a0a0f 60%, #06060e 100%)',
          }}
        >
          {/* Background glow orbs */}
          <div
            className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl pointer-events-none"
            style={{ width: 280, height: 280, background: 'rgba(139,92,246,0.18)' }}
          />
          <div
            className="absolute top-1/2 left-1/3 rounded-full blur-3xl pointer-events-none"
            style={{ width: 200, height: 200, background: 'rgba(236,72,153,0.12)' }}
          />

          {/* Logo mark */}
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center"
          >
            {/* Icon */}
            <img
              src="/icon-512.png"
              alt="Nova"
              className="w-24 h-24 rounded-3xl mb-5 shadow-2xl"
              style={{ objectFit: 'cover' }}
            />

            {/* App name */}
            <motion.h1
              className="text-5xl font-bold tracking-tight"
              style={{
                background: 'linear-gradient(135deg, #c4b5fd, #f0abfc, #fbcfe8)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              Nova
            </motion.h1>

            {/* City-aware phrase — fades in after logo settles */}
            <AnimatePresence>
              {phase === 'tagline' && (
                <motion.p
                  key={phrase}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="text-sm font-medium mt-2 text-center px-8"
                  style={{ color: 'rgba(200,190,220,0.75)' }}
                >
                  {phrase}
                </motion.p>
              )}
            </AnimatePresence>
          </motion.div>

          {/* by Leone Nero */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            transition={{ delay: 1.2, duration: 0.6 }}
            className="absolute bottom-12 text-xs font-medium"
            style={{ color: 'rgba(200,190,220,0.5)' }}
          >
            by Leone Nero
          </motion.p>

          {/* Loading bar */}
          <motion.div
            className="absolute bottom-8 left-1/2 -translate-x-1/2 h-0.5 rounded-full overflow-hidden"
            style={{ width: 80, background: 'rgba(255,255,255,0.1)' }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #8b5cf6, #ec4899)' }}
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 2, ease: 'easeInOut' }}
            />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
