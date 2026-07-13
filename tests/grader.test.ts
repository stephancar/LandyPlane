import { describe, expect, it } from 'vitest';
import { gradeLanding, gradeTouchdownInstant, refSpeed } from '../src/game/grader';
import type { RolloutResult } from '../src/game/grader';
import type { TouchdownEvent } from '../src/physics/aircraft';
import type { Runway } from '../src/game/levels';
import { DEG } from '../src/physics/params';

const RUNWAY: Runway = { startX: 0, length: 900, touchdownZone: 300 };
const VS = 26.9; // m/s, matches C172 stall speed
const VREF = refSpeed(VS);

function td(overrides: Partial<TouchdownEvent> = {}): TouchdownEvent {
  return {
    sinkRate: 0.5, // ~100 fpm
    speed: VREF,
    airspeed: VREF,
    pitch: 5 * DEG,
    x: 150,
    ...overrides,
  };
}

function stopped(x = 500): RolloutResult {
  return { stopX: x, speedAtEnd: 0 };
}

describe('instant crash rules', () => {
  it('accepts a normal touchdown', () => {
    expect(gradeTouchdownInstant(td(), RUNWAY, true).crashed).toBe(false);
  });

  it('crashes on hard impact (>700 fpm)', () => {
    const r = gradeTouchdownInstant(td({ sinkRate: 3.7 }), RUNWAY, true); // ~728 fpm
    expect(r.crashed).toBe(true);
    expect(r.reason).toBe('hard-impact');
  });

  it('crashes on prop strike (nose-down touchdown)', () => {
    const r = gradeTouchdownInstant(td({ pitch: -3 * DEG }), RUNWAY, true);
    expect(r.crashed).toBe(true);
    expect(r.reason).toBe('prop-strike');
  });

  it('crashes on extreme attitude', () => {
    const r = gradeTouchdownInstant(td({ pitch: 32 * DEG }), RUNWAY, true);
    expect(r.crashed).toBe(true);
    expect(r.reason).toBe('extreme-attitude');
  });

  it('crashes off-runway only in strict mode', () => {
    const short = td({ x: -40 });
    expect(gradeTouchdownInstant(short, RUNWAY, true).crashed).toBe(true);
    expect(gradeTouchdownInstant(short, RUNWAY, true).reason).toBe('off-runway');
    expect(gradeTouchdownInstant(short, RUNWAY, false).crashed).toBe(false);
  });
});

describe('landing score', () => {
  it('butters a perfect landing', () => {
    const r = gradeLanding(td(), stopped(), RUNWAY, VS, true);
    expect(r.crashed).toBe(false);
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.tier).toBe('Buttered');
  });

  it('penalizes a firm arrival', () => {
    const r = gradeLanding(td({ sinkRate: 2.3 }), stopped(), RUNWAY, VS, true); // ~450 fpm
    expect(r.crashed).toBe(false);
    const sinkPart = r.parts.find((p) => p.label === 'Sink rate')!;
    expect(sinkPart.points).toBeLessThan(15);
  });

  it('penalizes landing long', () => {
    const inZone = gradeLanding(td({ x: 200 }), stopped(), RUNWAY, VS, true);
    const long = gradeLanding(td({ x: 650 }), stopped(800), RUNWAY, VS, true);
    const zonePts = (r: typeof inZone) => r.parts.find((p) => p.label === 'Touchdown point')!.points;
    expect(zonePts(inZone)).toBe(20);
    expect(zonePts(long)).toBeLessThan(10);
  });

  it('penalizes excess speed', () => {
    const fast = gradeLanding(td({ airspeed: VREF * 1.3 }), stopped(), RUNWAY, VS, true);
    const speedPart = fast.parts.find((p) => p.label === 'Speed control')!;
    expect(speedPart.points).toBeLessThan(5);
  });

  it('turns a rollout off the far end at speed into an overrun crash', () => {
    const r = gradeLanding(td(), { stopX: 950, speedAtEnd: 8 }, RUNWAY, VS, true);
    expect(r.crashed).toBe(true);
    expect(r.crashReason).toBe('overrun');
  });

  it('slow roll past the end is not a crash, just loses points', () => {
    const r = gradeLanding(td(), { stopX: 920, speedAtEnd: 2 }, RUNWAY, VS, true);
    expect(r.crashed).toBe(false);
    const stopPart = r.parts.find((p) => p.label === 'Stopped on runway')!;
    expect(stopPart.points).toBe(0);
  });

  it('tier boundaries hold', () => {
    // Construct mid landings and check tier mapping stays monotonic.
    const good = gradeLanding(td({ sinkRate: 1.2 }), stopped(), RUNWAY, VS, true);
    expect(['Buttered', 'Good']).toContain(good.tier);
    const ugly = gradeLanding(
      td({ sinkRate: 3.0, airspeed: VREF * 1.32, x: 700, pitch: 0.5 * DEG }),
      { stopX: 950, speedAtEnd: 2 },
      RUNWAY,
      VS,
      true,
    );
    expect(ugly.crashed).toBe(false);
    expect(ugly.score).toBeLessThan(50);
    expect(ugly.tier).toBe('Ugly but alive');
  });
});
