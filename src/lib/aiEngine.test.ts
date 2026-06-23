import { describe, it, expect } from 'vitest';
import { timeRelevance, learnFromBrowse } from './aiEngine';
import { AIProfile } from '@/types';

describe('timeRelevance', () => {
  it('boosts nightlife in the evening', () => {
    expect(timeRelevance('music', 20)).toBeGreaterThan(1);
    expect(timeRelevance('venues', 21)).toBeGreaterThan(1);
  });

  it('boosts food/active in the morning', () => {
    expect(timeRelevance('food', 8)).toBeGreaterThan(1);
    expect(timeRelevance('fitness', 8)).toBeGreaterThan(1);
  });

  it('does not boost nightlife at breakfast time', () => {
    expect(timeRelevance('music', 8)).toBeLessThan(1);
  });
});

describe('learnFromBrowse', () => {
  const base: AIProfile = { categoryEngagement: {}, totalInteractions: 0, lastActive: 0, sessionCount: 1 };

  it('nudges a browsed category up gently', () => {
    const next = learnFromBrowse(base, 'art');
    expect(next.categoryEngagement.art).toBeCloseTo(50.8, 5);
  });

  it('caps browse-only learning at 80', () => {
    const high: AIProfile = { ...base, categoryEngagement: { art: 80 } };
    expect(learnFromBrowse(high, 'art').categoryEngagement.art).toBe(80);
  });
});
