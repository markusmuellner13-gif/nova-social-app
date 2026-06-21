import { describe, it, expect } from 'vitest';
import { parseIntent } from './novaBrain';

describe('parseIntent', () => {
  it('detects music + tonight', () => {
    const i = parseIntent('any live music tonight?');
    expect(i.categories).toContain('music');
    expect(i.window).toBe('tonight');
  });

  it('detects weekend + free', () => {
    const i = parseIntent('free events this weekend');
    expect(i.window).toBe('weekend');
    expect(i.freeOnly).toBe(true);
    expect(i.categories).toContain('events');
  });

  it('detects art exhibitions', () => {
    const i = parseIntent('any art exhibitions next month');
    expect(i.categories).toContain('art');
    expect(i.window).toBe('month');
  });

  it('falls back to a broad category set when nothing matches', () => {
    const i = parseIntent('surprise me');
    expect(i.categories.length).toBeGreaterThan(1);
    expect(i.window).toBe('any');
  });

  it('flags clearly off-topic requests', () => {
    const i = parseIntent('write me some python code');
    expect(i.offTopic).toBe(true);
  });

  it('does not flag off-topic when an event intent is present', () => {
    const i = parseIntent('any coding meetup or tech events?');
    expect(i.offTopic).toBe(false);
    expect(i.categories).toContain('tech');
  });
});
