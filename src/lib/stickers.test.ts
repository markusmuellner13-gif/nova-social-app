import { describe, it, expect } from 'vitest';
import {
  STICKER_PACKS, STICKER_PREFIX, isStickerBody, stickerGlyph,
} from './stickers';

describe('stickers', () => {
  it('every pack has stickers with unique ids', () => {
    const ids = STICKER_PACKS.flatMap(p => p.stickers.map(s => s.id));
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('detects sticker bodies by prefix', () => {
    expect(isStickerBody(`${STICKER_PREFIX}react_fire`)).toBe(true);
    expect(isStickerBody('just text')).toBe(false);
  });

  it('resolves a known sticker id to its glyph', () => {
    const first = STICKER_PACKS[0].stickers[0];
    expect(stickerGlyph(`${STICKER_PREFIX}${first.id}`)).toBe(first.glyph);
  });

  it('falls back gracefully for unknown sticker ids', () => {
    expect(stickerGlyph(`${STICKER_PREFIX}does_not_exist`)).toBe('🟣');
  });

  it('returns plain text unchanged', () => {
    expect(stickerGlyph('hello world')).toBe('hello world');
  });
});
