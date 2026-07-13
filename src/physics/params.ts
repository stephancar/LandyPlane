/** Aircraft and world parameters. */

export type AircraftId = 'c172' | 'cub' | 'f16';

export interface AircraftParams {
  id: AircraftId;
  label: string;
  blurb: string;

  /** mass, kg */
  m: number;
  /** wing area, m² */
  S: number;
  /** mean aerodynamic chord, m */
  cbar: number;
  /** pitch moment of inertia, kg·m² */
  Iyy: number;

  /** lift coefficient at zero (geometric) alpha */
  CL0: number;
  /** lift curve slope, per rad */
  CLalpha: number;
  /** maximum lift coefficient */
  CLmax: number;
  /** stall angle of attack, rad */
  alphaStall: number;
  /** fraction of CLmax retained deep in the stall */
  postStallLiftDrop: number;
  /** drag multiplier when stalled */
  postStallDragBoost: number;

  /** parasitic drag coefficient */
  CD0: number;
  /** induced drag factor */
  k: number;

  /** pitch moment coefficients */
  Cm0: number;
  Cmalpha: number;
  Cmq: number;
  Cmde: number;
  /** max elevator deflection, rad */
  deMax: number;

  /** 'prop': power-limited thrust; 'jet': near-constant thrust with density lapse */
  propulsion: 'prop' | 'jet';
  /** prop: max shaft power, W (ignored for jets) */
  Pmax: number;
  propEff: number;
  /** prop: static thrust cap; jet: max thrust, N */
  TmaxStatic: number;
  /** throttle change rate, fraction per second */
  throttleRate: number;

  /** CG height above ground when on wheels, m */
  gearHeight: number;
  /** rolling friction coefficient */
  muRoll: number;
  /** braking friction coefficient (brakes held) */
  muBrake: number;
  /** pitch attitude limits while on the ground, rad */
  thetaGroundMin: number;
  thetaGroundMax: number;

  /** reference approach speed, m/s (≈1.25–1.3 × stall) */
  approachSpeed: number;
  /** runway length multiplier vs the C172 baseline levels */
  runwayScale: number;
  /** approach start distance/altitude multiplier vs baseline */
  distanceScale: number;
  /** sink rate at touchdown beyond which the gear collapses, fpm */
  crashSinkFpm: number;
}

export interface WorldParams {
  g: number;
  /** sea level air density, kg/m³ */
  rho0: number;
  /** density scale height, m */
  Hscale: number;
}

export const C172: AircraftParams = {
  id: 'c172',
  label: 'Cessna 172',
  blurb: 'The honest trainer. Forgiving, slow, does what you say.',

  m: 1100,
  S: 16.2,
  cbar: 1.5,
  Iyy: 1850,

  CL0: 0.28,
  CLalpha: 5.4,
  CLmax: 1.5,
  alphaStall: (15 * Math.PI) / 180,
  postStallLiftDrop: 0.55,
  postStallDragBoost: 1.8,

  CD0: 0.03,
  k: 0.05,

  Cm0: 0.03,
  Cmalpha: -0.75,
  Cmq: -12.0,
  Cmde: -1.1,
  deMax: (14 * Math.PI) / 180,

  propulsion: 'prop',
  Pmax: 120_000,
  propEff: 0.8,
  TmaxStatic: 2600,
  throttleRate: 0.35,

  gearHeight: 1.35,
  muRoll: 0.03,
  muBrake: 0.4,
  thetaGroundMin: (-1.5 * Math.PI) / 180,
  thetaGroundMax: (15 * Math.PI) / 180,

  approachSpeed: 33,
  runwayScale: 1,
  distanceScale: 1,
  crashSinkFpm: 700,
};

export const CARBON_CUB: AircraftParams = {
  id: 'cub',
  label: 'Carbon Cub',
  blurb: 'STOL machine. Stalls at a walking pace, lands on a postage stamp.',

  m: 600,
  S: 16.5,
  cbar: 1.3,
  Iyy: 1100,

  CL0: 0.4,
  CLalpha: 5.2,
  CLmax: 2.2,
  alphaStall: (17 * Math.PI) / 180,
  postStallLiftDrop: 0.6,
  postStallDragBoost: 1.7,

  CD0: 0.045,
  k: 0.052,

  Cm0: 0.035,
  Cmalpha: -0.7,
  Cmq: -11.0,
  Cmde: -1.15,
  deMax: (16 * Math.PI) / 180,

  propulsion: 'prop',
  Pmax: 138_000,
  propEff: 0.78,
  TmaxStatic: 3900,
  throttleRate: 0.45,

  gearHeight: 1.5,
  muRoll: 0.045,
  muBrake: 0.45,
  thetaGroundMin: (-1 * Math.PI) / 180,
  thetaGroundMax: (18 * Math.PI) / 180,

  approachSpeed: 21,
  runwayScale: 0.6,
  distanceScale: 0.8,
  crashSinkFpm: 800,
};

export const F16: AircraftParams = {
  id: 'f16',
  label: 'F-16',
  blurb: 'You asked for this. Fast, slippery, and it does not glide.',

  m: 9000,
  S: 27.87,
  cbar: 3.45,
  Iyy: 75_000,

  CL0: 0.05,
  CLalpha: 3.7,
  CLmax: 1.6,
  alphaStall: (19 * Math.PI) / 180,
  postStallLiftDrop: 0.6,
  postStallDragBoost: 1.9,

  CD0: 0.022,
  k: 0.12,

  Cm0: 0.02,
  Cmalpha: -0.4,
  Cmq: -6.0,
  Cmde: -1.4,
  deMax: (20 * Math.PI) / 180,

  propulsion: 'jet',
  Pmax: 0,
  propEff: 1,
  TmaxStatic: 68_000,
  throttleRate: 0.28,

  gearHeight: 1.8,
  muRoll: 0.03,
  muBrake: 0.5,
  thetaGroundMin: (-2 * Math.PI) / 180,
  thetaGroundMax: (13 * Math.PI) / 180,

  approachSpeed: 70,
  runwayScale: 2.6,
  distanceScale: 2.5,
  crashSinkFpm: 900,
};

export const AIRCRAFT: Record<AircraftId, AircraftParams> = {
  c172: C172,
  cub: CARBON_CUB,
  f16: F16,
};

export const WORLD: WorldParams = {
  g: 9.80665,
  rho0: 1.225,
  Hscale: 8500,
};

/** Physics runs at a fixed timestep for determinism. */
export const PHYSICS_DT = 1 / 120;

// Unit helpers
export const MS_TO_KT = 1.94384;
export const MS_TO_FPM = 196.8504;
export const M_TO_FT = 3.28084;
export const DEG = Math.PI / 180;
