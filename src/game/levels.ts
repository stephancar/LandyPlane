import type { WindConfig } from '../physics/wind';
import { CALM } from '../physics/wind';

export interface Runway {
  /** threshold position, m */
  startX: number;
  /** m */
  length: number;
  /** preferred touchdown zone measured from the threshold, m */
  touchdownZone: number;
}

/**
 * How a level starts. Baseline distances/altitudes are for the C172 and get
 * scaled by the selected aircraft's distanceScale / runwayScale in Game.
 */
export type ApproachSpec =
  | { kind: 'approach'; distance: number; altitude: number; speedFactor: number; throttle?: number }
  | { kind: 'glide'; altitude: number } // distance derived from the aircraft's best glide
  | { kind: 'ground' }; // parked on the runway

export interface Level {
  id: string;
  name: string;
  brief: string;
  /** baseline runway (C172 scale) */
  runway: Runway;
  wind: WindConfig;
  start: ApproachSpec;
  /** engine available? */
  engine: boolean;
  /** crash when touching down off the runway? */
  strictRunway: boolean;
}

export const LEVELS: Level[] = [
  {
    id: 'trainer',
    name: 'Trainer',
    brief: 'Long runway, calm air. Ease it down: low sink rate, nose slightly up, then hold the brakes.',
    runway: { startX: 0, length: 900, touchdownZone: 300 },
    wind: CALM,
    start: { kind: 'approach', distance: 1200, altitude: 80, speedFactor: 1.0 },
    engine: true,
    strictRunway: true,
  },
  {
    id: 'shortfield',
    name: 'Short field',
    brief: 'Half the pavement. Touch down close to the threshold, on speed, and brake hard.',
    runway: { startX: 0, length: 450, touchdownZone: 150 },
    wind: CALM,
    start: { kind: 'approach', distance: 1200, altitude: 80, speedFactor: 0.95 },
    engine: true,
    strictRunway: true,
  },
  {
    id: 'gusty',
    name: 'Headwind & gusts',
    brief: 'A 8 kt headwind with gusts. Carry a little extra speed and expect the floor to move.',
    runway: { startX: 0, length: 700, touchdownZone: 250 },
    wind: { steady: -4, gustAmplitude: 3, seed: 20260713 },
    start: { kind: 'approach', distance: 1200, altitude: 90, speedFactor: 1.05 },
    engine: true,
    strictRunway: true,
  },
  {
    id: 'engineout',
    name: 'Engine out',
    brief: 'The prop is dead. Trade altitude for speed, stretch the glide — you get one shot.',
    runway: { startX: 0, length: 700, touchdownZone: 300 },
    wind: CALM,
    start: { kind: 'glide', altitude: 155 },
    engine: false,
    strictRunway: true,
  },
  {
    id: 'tailwind',
    name: 'Tailwind trap',
    brief: 'A 7 kt tailwind shoves you down the runway. Get it down early or go around... oh wait, there is no go-around.',
    runway: { startX: 0, length: 800, touchdownZone: 250 },
    wind: { steady: 3.5, gustAmplitude: 1.5, seed: 42 },
    start: { kind: 'approach', distance: 1300, altitude: 85, speedFactor: 0.92 },
    engine: true,
    strictRunway: true,
  },
];

export const FREE_FLIGHT: Level = {
  id: 'free',
  name: 'Free flight',
  brief: 'Start on the runway. Throttle up, rotate, fly, and land wherever you like.',
  runway: { startX: 0, length: 900, touchdownZone: 300 },
  wind: CALM,
  start: { kind: 'ground' },
  engine: true,
  strictRunway: false,
};

export function levelById(id: string): Level | undefined {
  if (id === FREE_FLIGHT.id) return FREE_FLIGHT;
  return LEVELS.find((l) => l.id === id);
}
