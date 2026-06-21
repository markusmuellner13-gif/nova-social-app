import { describe, it, expect } from 'vitest';
import { angularDistance, isOnFrontHemisphere } from './geo';

describe('angularDistance', () => {
  it('is 0 for the same point', () => {
    expect(angularDistance(16.37, 48.2, 16.37, 48.2)).toBeCloseTo(0, 5);
  });

  it('is ~90° for points a quarter of the globe apart', () => {
    // Equator: 0°E vs 90°E are 90° apart
    expect(angularDistance(0, 0, 90, 0)).toBeCloseTo(90, 4);
  });

  it('is 180° for antipodes', () => {
    expect(angularDistance(0, 0, 180, 0)).toBeCloseTo(180, 4);
  });

  it('is symmetric', () => {
    const a = angularDistance(16.37, 48.2, -74, 40.7);
    const b = angularDistance(-74, 40.7, 16.37, 48.2);
    expect(a).toBeCloseTo(b, 6);
  });
});

describe('isOnFrontHemisphere', () => {
  it('keeps points near the globe centre', () => {
    // Globe centred on Vienna keeps a nearby Austrian town
    expect(isOnFrontHemisphere(16.37, 48.2, 16.23, 48.0)).toBe(true);
  });

  it('hides points on the far side of the globe', () => {
    // Globe centred on Vienna hides Sydney (far hemisphere)
    expect(isOnFrontHemisphere(16.37, 48.2, 151.2, -33.87)).toBe(false);
  });
});
