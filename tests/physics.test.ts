import { describe, expect, it } from 'vitest';
import { C172, DEG, MS_TO_KT, PHYSICS_DT, WORLD } from '../src/physics/params';
import { airDensity, computeCL, computeCD, stallSpeed } from '../src/physics/aero';
import { initialState, step } from '../src/physics/aircraft';
import type { AircraftState, Controls } from '../src/physics/aircraft';

const NO_WIND = { wx: 0, wy: 0 };
const IDLE: Controls = { pitch: 0, throttleDelta: 0, brakes: false };

function run(s: AircraftState, controls: Controls, seconds: number) {
  const steps = Math.round(seconds / PHYSICS_DT);
  let d = step(s, controls, NO_WIND, PHYSICS_DT, C172, WORLD);
  for (let i = 1; i < steps; i++) d = step(s, controls, NO_WIND, PHYSICS_DT, C172, WORLD);
  return d;
}

describe('atmosphere', () => {
  it('is sea-level density at 0 m and decreases with altitude', () => {
    expect(airDensity(0, WORLD)).toBeCloseTo(1.225, 3);
    expect(airDensity(2000, WORLD)).toBeLessThan(airDensity(0, WORLD));
    expect(airDensity(2000, WORLD)).toBeGreaterThan(0.9);
  });
});

describe('lift curve', () => {
  it('matches CL0 at zero alpha and rises linearly below stall', () => {
    expect(computeCL(0, C172)).toBeCloseTo(C172.CL0, 5);
    const cl5 = computeCL(5 * DEG, C172);
    expect(cl5).toBeCloseTo(C172.CL0 + C172.CLalpha * 5 * DEG, 3);
  });

  it('never exceeds CLmax and drops after the stall', () => {
    for (let a = -30; a <= 30; a += 0.5) {
      expect(Math.abs(computeCL(a * DEG, C172))).toBeLessThanOrEqual(C172.CLmax + 1e-9);
    }
    const atStall = computeCL(C172.alphaStall, C172);
    const past = computeCL(C172.alphaStall + 10 * DEG, C172);
    expect(past).toBeLessThan(atStall);
    expect(past).toBeGreaterThan(0);
  });

  it('drag grows when stalled', () => {
    const CL = 1.2;
    expect(computeCD(CL, true, C172)).toBeGreaterThan(computeCD(CL, false, C172));
  });
});

describe('stall speed', () => {
  it('is in the C172 ballpark (45-55 kt)', () => {
    const vs = stallSpeed(C172, WORLD) * MS_TO_KT;
    expect(vs).toBeGreaterThan(45);
    expect(vs).toBeLessThan(55);
  });
});

describe('ground handling', () => {
  it('stays parked with no throttle', () => {
    const s = initialState(C172);
    run(s, IDLE, 3);
    expect(s.vx).toBeCloseTo(0, 3);
    expect(s.y).toBeCloseTo(C172.gearHeight, 5);
    expect(s.onGround).toBe(true);
  });

  it('accelerates on full throttle and reaches flying speed on a runway-length roll', () => {
    const s = initialState(C172);
    s.throttle = 1;
    run(s, IDLE, 20);
    expect(s.vx * MS_TO_KT).toBeGreaterThan(55);
    expect(s.x).toBeLessThan(900);
  });

  it('brakes stop the aircraft much faster than rolling friction', () => {
    const roll = initialState(C172);
    roll.vx = 30;
    const braked = initialState(C172);
    braked.vx = 30;

    run(braked, { ...IDLE, brakes: true }, 30);
    run(roll, IDLE, 30);

    expect(braked.vx).toBeCloseTo(0, 2);
    expect(braked.x).toBeLessThan(200);
    expect(roll.x).toBeGreaterThan(braked.x * 2);
  });

  it('cannot pitch the nose through the pavement', () => {
    const s = initialState(C172);
    s.vx = 25; // enough airflow for elevator authority
    const noseDown: Controls = { pitch: -1, throttleDelta: 0, brakes: false };
    for (let i = 0; i < 1200; i++) {
      step(s, noseDown, NO_WIND, PHYSICS_DT, C172, WORLD);
      expect(s.theta).toBeGreaterThanOrEqual(C172.thetaGroundMin - 1e-9);
    }
  });

  it('throttle stays clamped to [0, 1]', () => {
    const s = initialState(C172);
    run(s, { ...IDLE, throttleDelta: 1 }, 10);
    expect(s.throttle).toBe(1);
    run(s, { ...IDLE, throttleDelta: -1 }, 10);
    expect(s.throttle).toBe(0);
  });
});

describe('flight', () => {
  it('roughly sustains level flight when trimmed near cruise', () => {
    // Start at 100 m, 36 m/s, moderate power; over 5 s it should not fall out
    // of the sky nor zoom-climb: pitch dynamics find alpha near trim.
    const s: AircraftState = {
      x: 0, y: 100 + C172.gearHeight, vx: 36, vy: 0,
      theta: 2 * DEG, q: 0, throttle: 0.55, onGround: false,
    };
    run(s, IDLE, 5);
    const alt = s.y - C172.gearHeight;
    expect(alt).toBeGreaterThan(60);
    expect(alt).toBeLessThan(160);
    // The phugoid is lightly damped, so allow a wide band; the point is that
    // the aircraft neither dives away nor zoom-climbs.
    expect(Math.abs(s.vy)).toBeLessThan(12);
  });

  it('stalls and sinks when too slow', () => {
    const s: AircraftState = {
      x: 0, y: 200 + C172.gearHeight, vx: 18, vy: 0,
      theta: 14 * DEG, q: 0, throttle: 0, onGround: false,
    };
    const d = run(s, { pitch: 1, throttleDelta: 0, brakes: false }, 4);
    expect(s.vy).toBeLessThan(-2); // sinking
    expect(d.stalled || Math.abs(d.alpha) > 10 * DEG).toBe(true);
  });

  it('headwind lowers ground speed for the same airspeed', () => {
    const mk = (): AircraftState => ({
      x: 0, y: 150 + C172.gearHeight, vx: 35, vy: 0,
      theta: 2 * DEG, q: 0, throttle: 0.5, onGround: false,
    });
    const calm = mk();
    const wind = mk();
    for (let i = 0; i < 600; i++) {
      step(calm, IDLE, NO_WIND, PHYSICS_DT, C172, WORLD);
      step(wind, IDLE, { wx: -8, wy: 0 }, PHYSICS_DT, C172, WORLD);
    }
    expect(wind.x).toBeLessThan(calm.x);
  });
});
