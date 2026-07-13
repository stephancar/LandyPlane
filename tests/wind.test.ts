import { describe, expect, it } from 'vitest';
import { Wind, mulberry32 } from '../src/physics/wind';

describe('wind model', () => {
  it('is deterministic for a given seed', () => {
    const a = new Wind({ steady: -4, gustAmplitude: 3, seed: 123 });
    const b = new Wind({ steady: -4, gustAmplitude: 3, seed: 123 });
    for (let t = 0; t < 30; t += 0.37) {
      expect(a.at(t)).toEqual(b.at(t));
    }
  });

  it('differs across seeds', () => {
    const a = new Wind({ steady: 0, gustAmplitude: 3, seed: 1 });
    const b = new Wind({ steady: 0, gustAmplitude: 3, seed: 2 });
    let differs = false;
    for (let t = 0; t < 10; t += 0.5) {
      if (Math.abs(a.at(t).wx - b.at(t).wx) > 1e-6) differs = true;
    }
    expect(differs).toBe(true);
  });

  it('calm config produces zero wind', () => {
    const w = new Wind({ steady: 0, gustAmplitude: 0, seed: 7 });
    for (let t = 0; t < 10; t += 1) {
      expect(Math.abs(w.at(t).wx)).toBe(0);
      expect(Math.abs(w.at(t).wy)).toBe(0);
    }
  });

  it('gusts stay bounded around the steady wind', () => {
    const w = new Wind({ steady: -4, gustAmplitude: 3, seed: 99 });
    for (let t = 0; t < 60; t += 0.1) {
      const { wx } = w.at(t);
      expect(Math.abs(wx - -4)).toBeLessThanOrEqual(3.2);
    }
  });

  it('mulberry32 is stable', () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(r1()).toBe(r2());
  });
});
