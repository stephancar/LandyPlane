import { C172, WORLD } from '../physics/params';
import type { WindConfig } from '../physics/wind';
import { CALM } from '../physics/wind';
import type { AircraftState } from '../physics/aircraft';

export interface Runway {
  /** threshold position, m */
  startX: number;
  /** m */
  length: number;
  /** preferred touchdown zone measured from the threshold, m */
  touchdownZone: number;
}

export interface Level {
  id: string;
  name: string;
  brief: string;
  runway: Runway;
  wind: WindConfig;
  /** null = start parked on the runway (free flight / takeoff) */
  start: AircraftState | null;
  /** elevator trim, rad — makes the start attitude hands-off stable */
  deTrim: number;
  /** engine available? */
  engine: boolean;
  /** crash when touching down off the runway? */
  strictRunway: boolean;
}

/** Angle of attack that carries the weight at the given speed (sea level). */
function trimAlpha(speed: number): number {
  const qbarS = 0.5 * WORLD.rho0 * speed * speed * C172.S;
  const clNeeded = (C172.m * WORLD.g) / qbarS;
  return (clNeeded - C172.CL0) / C172.CLalpha;
}

/** Elevator deflection that zeroes the pitching moment at the given alpha. */
export function trimElevator(alpha: number): number {
  return -(C172.Cm0 + C172.Cmalpha * alpha) / C172.Cmde;
}

function approachStart(opts: {
  distance: number; // m before the threshold
  altitude: number; // m AGL
  speed: number; // m/s
  gearHeight: number;
  throttle?: number;
}): { state: AircraftState; deTrim: number } {
  // Start on a straight glidepath to the threshold, trimmed: lift carries the
  // weight and the pitching moment is zero, so the plane is hands-off stable.
  const glide = Math.atan2(opts.altitude, opts.distance);
  const alpha = trimAlpha(opts.speed);
  return {
    state: {
      x: -opts.distance,
      y: opts.altitude + opts.gearHeight,
      vx: opts.speed * Math.cos(glide),
      vy: -opts.speed * Math.sin(glide),
      theta: alpha - glide,
      q: 0,
      throttle: opts.throttle ?? 0.35,
      onGround: false,
    },
    deTrim: trimElevator(alpha),
  };
}

const GEAR = 1.35; // keep in sync with C172.gearHeight

const trainerStart = approachStart({ distance: 1200, altitude: 80, speed: 33, gearHeight: GEAR });
const shortStart = approachStart({ distance: 1200, altitude: 80, speed: 31, gearHeight: GEAR });
const gustyStart = approachStart({ distance: 1200, altitude: 90, speed: 34, gearHeight: GEAR });
const engineOutStart = approachStart({ distance: 1900, altitude: 155, speed: 34, gearHeight: GEAR, throttle: 0 });
const tailwindStart = approachStart({ distance: 1300, altitude: 85, speed: 30, gearHeight: GEAR });

export const LEVELS: Level[] = [
  {
    id: 'trainer',
    name: 'Trainer',
    brief: 'Long runway, calm air. Ease it down: low sink rate, nose slightly up, then hold the brakes.',
    runway: { startX: 0, length: 900, touchdownZone: 300 },
    wind: CALM,
    start: trainerStart.state,
    deTrim: trainerStart.deTrim,
    engine: true,
    strictRunway: true,
  },
  {
    id: 'shortfield',
    name: 'Short field',
    brief: 'Half the pavement. Touch down close to the threshold, on speed, and brake hard.',
    runway: { startX: 0, length: 450, touchdownZone: 150 },
    wind: CALM,
    start: shortStart.state,
    deTrim: shortStart.deTrim,
    engine: true,
    strictRunway: true,
  },
  {
    id: 'gusty',
    name: 'Headwind & gusts',
    brief: 'A 8 kt headwind with gusts. Carry a little extra speed and expect the floor to move.',
    runway: { startX: 0, length: 700, touchdownZone: 250 },
    wind: { steady: -4, gustAmplitude: 3, seed: 20260713 },
    start: gustyStart.state,
    deTrim: gustyStart.deTrim,
    engine: true,
    strictRunway: true,
  },
  {
    id: 'engineout',
    name: 'Engine out',
    brief: 'The prop is dead. Trade altitude for speed, stretch the glide — you get one shot.',
    runway: { startX: 0, length: 700, touchdownZone: 300 },
    wind: CALM,
    start: engineOutStart.state,
    deTrim: engineOutStart.deTrim,
    engine: false,
    strictRunway: true,
  },
  {
    id: 'tailwind',
    name: 'Tailwind trap',
    brief: 'A 7 kt tailwind shoves you down the runway. Get it down early or go around... oh wait, there is no go-around.',
    runway: { startX: 0, length: 800, touchdownZone: 250 },
    wind: { steady: 3.5, gustAmplitude: 1.5, seed: 42 },
    start: tailwindStart.state,
    deTrim: tailwindStart.deTrim,
    engine: true,
    strictRunway: true,
  },
];

export const FREE_FLIGHT: Level = {
  id: 'free',
  name: 'Free flight',
  brief: 'Start on the runway. Throttle up, rotate around 55 kt, fly, and land wherever you like.',
  runway: { startX: 0, length: 900, touchdownZone: 300 },
  wind: CALM,
  start: null,
  // Trimmed for a climb-out around 70 kt so takeoff isn't a wrestling match.
  deTrim: trimElevator(trimAlpha(36)),
  engine: true,
  strictRunway: false,
};

export function levelById(id: string): Level | undefined {
  if (id === FREE_FLIGHT.id) return FREE_FLIGHT;
  return LEVELS.find((l) => l.id === id);
}
