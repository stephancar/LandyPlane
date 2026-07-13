/**
 * Wind model: steady horizontal component plus smooth pseudo-random gusts.
 * Deterministic for a given seed so simulations are reproducible.
 */

export interface WindConfig {
  /** steady horizontal wind, m/s (+x is a tailwind for a plane flying +x) */
  steady: number;
  /** peak gust amplitude, m/s */
  gustAmplitude: number;
  seed: number;
}

export const CALM: WindConfig = { steady: 0, gustAmplitude: 0, seed: 1 };

/** mulberry32 PRNG — small, seedable, deterministic. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Wind {
  private cfg: WindConfig;
  // Sum-of-sines gust field with randomized phases/frequencies.
  private components: { freq: number; phase: number; amp: number }[] = [];

  constructor(cfg: WindConfig) {
    this.cfg = cfg;
    const rnd = mulberry32(cfg.seed);
    for (let i = 0; i < 4; i++) {
      this.components.push({
        freq: 0.05 + rnd() * 0.35, // Hz
        phase: rnd() * Math.PI * 2,
        amp: (0.5 + rnd() * 0.5) / 4, // 4 components, sum of amps never exceeds 1
      });
    }
  }

  /** Horizontal wind (m/s) and a small vertical gust component at time t (s). */
  at(t: number): { wx: number; wy: number } {
    let g = 0;
    for (const c of this.components) {
      g += c.amp * Math.sin(2 * Math.PI * c.freq * t + c.phase);
    }
    const wx = this.cfg.steady + g * this.cfg.gustAmplitude;
    // Vertical gusts: weaker, faster, reuse the field shifted.
    let gv = 0;
    for (const c of this.components) {
      gv += c.amp * Math.sin(2 * Math.PI * c.freq * 1.7 * t + c.phase * 2);
    }
    const wy = gv * this.cfg.gustAmplitude * 0.25;
    return { wx, wy };
  }
}
