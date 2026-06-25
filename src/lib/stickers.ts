// Built-in sticker packs for group chat. Stickers are stored in a message as a
// stable id (`sticker:<id>`), and rendered large (emoji glyphs scale crisply on
// every device, need no hosting/CDN, never 404, and carry no licensing risk —
// so chat "just works" offline and forever). Unknown ids fall back to the raw
// value, so the format is forward-compatible if we add image packs later.

export interface Sticker {
  id: string;
  glyph: string;      // what gets rendered (emoji / short combo)
  label: string;      // a11y + search
}

export interface StickerPack {
  id: string;
  name: string;
  emoji: string;      // tab icon
  stickers: Sticker[];
}

const pack = (id: string, name: string, emoji: string, rows: [string, string][]): StickerPack => ({
  id, name, emoji,
  stickers: rows.map(([glyph, label]) => ({ id: `${id}_${label.replace(/\s+/g, '_')}`, glyph, label })),
});

export const STICKER_PACKS: StickerPack[] = [
  pack('react', 'Reactions', '🔥', [
    ['🔥', 'fire'], ['💯', 'hundred'], ['👍', 'thumbs up'], ['👎', 'thumbs down'],
    ['👏', 'clap'], ['🙌', 'raise hands'], ['🤝', 'handshake'], ['💪', 'strong'],
    ['👀', 'eyes'], ['✅', 'yes'], ['❌', 'no'], ['🆗', 'ok'],
  ]),
  pack('party', 'Party', '🎉', [
    ['🎉', 'tada'], ['🥳', 'party face'], ['🍻', 'cheers'], ['🥂', 'toast'],
    ['🎊', 'confetti'], ['🪩', 'disco'], ['🕺', 'dancing man'], ['💃', 'dancing woman'],
    ['🎶', 'music'], ['🎈', 'balloon'], ['🍾', 'champagne'], ['🔊', 'loud'],
  ]),
  pack('mood', 'Mood', '😂', [
    ['😂', 'laughing'], ['🤣', 'rofl'], ['😅', 'sweat smile'], ['😎', 'cool'],
    ['🥹', 'holding back tears'], ['😭', 'sobbing'], ['😡', 'angry'], ['🤯', 'mind blown'],
    ['🥱', 'bored'], ['😴', 'sleepy'], ['🫡', 'salute'], ['🤔', 'thinking'],
  ]),
  pack('love', 'Love', '❤️', [
    ['❤️', 'heart'], ['🧡', 'orange heart'], ['💜', 'purple heart'], ['💖', 'sparkle heart'],
    ['😍', 'heart eyes'], ['🥰', 'smiling hearts'], ['😘', 'kiss'], ['💕', 'two hearts'],
    ['💘', 'cupid'], ['🫶', 'heart hands'], ['💐', 'bouquet'], ['🌹', 'rose'],
  ]),
  pack('memes', 'Memes', '🗿', [
    ['🗿', 'moai'], ['💀', 'skull'], ['🤡', 'clown'], ['🧢', 'cap'],
    ['🐐', 'goat'], ['🚀', 'to the moon'], ['📈', 'stonks'], ['🤓', 'nerd'],
    ['😬', 'awkward'], ['🫠', 'melting'], ['🙃', 'upside down'], ['👁️👄👁️', 'face'],
  ]),
  pack('plans', 'Plans', '📍', [
    ['📍', 'pin'], ['🗓️', 'calendar'], ['⏰', 'time'], ['🚗', 'driving'],
    ['🚆', 'train'], ['🍕', 'food'], ['🎟️', 'tickets'], ['💸', 'money'],
    ['🤙', 'call me'], ['👋', 'wave'], ['🆑', 'count me in'], ['🫵', 'you'],
  ]),
];

const STICKER_BY_ID: Record<string, Sticker> = Object.fromEntries(
  STICKER_PACKS.flatMap(p => p.stickers.map(s => [s.id, s])),
);

export const STICKER_PREFIX = 'sticker:';

export function isStickerBody(body: string): boolean {
  return body.startsWith(STICKER_PREFIX);
}

// Resolve a stored sticker message to its glyph. Falls back to the raw id tail
// (or the whole body) so an unknown/retired sticker still renders something.
export function stickerGlyph(body: string): string {
  if (!isStickerBody(body)) return body;
  const id = body.slice(STICKER_PREFIX.length);
  return STICKER_BY_ID[id]?.glyph ?? '🟣';
}
