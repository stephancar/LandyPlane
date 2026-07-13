import type { AircraftParams, WorldParams } from './params';

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function wrapPi(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

export function airDensity(alt: number, world: WorldParams): number {
  return world.rho0 * Math.exp(-Math.max(0, alt) / world.Hscale);
}

/** Lift coefficient vs angle of attack: linear region, then post-stall drop-off. */
export function computeCL(alpha: number, p: AircraftParams): number {
  const CLlin = p.CL0 + p.CLalpha * alpha;
  const a = Math.abs(alpha);
  if (a <= p.alphaStall) return clamp(CLlin, -p.CLmax, p.CLmax);

  // Blend from CLmax down to postStallLiftDrop * CLmax over 25° past the stall.
  const t = clamp((a - p.alphaStall) / (25 * (Math.PI / 180)), 0, 1);
  const sign = CLlin < 0 ? -1 : 1;
  return sign * lerp(p.CLmax, p.postStallLiftDrop * p.CLmax, t);
}

export function isStalled(alpha: number, p: AircraftParams): boolean {
  return Math.abs(alpha) > p.alphaStall;
}

export function computeCD(CL: number, stalled: boolean, p: AircraftParams): number {
  const CD = p.CD0 + p.k * CL * CL;
  return stalled ? CD * p.postStallDragBoost : CD;
}

/** Stall speed in level flight at the given density, m/s. */
export function stallSpeed(p: AircraftParams, world: WorldParams, rho = world.rho0): number {
  return Math.sqrt((2 * p.m * world.g) / (rho * p.S * p.CLmax));
}
