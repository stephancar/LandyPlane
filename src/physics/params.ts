/** Aircraft and world parameters. Loosely Cessna 172-shaped. */

export interface AircraftParams {
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

  /** max shaft power, W */
  Pmax: number;
  propEff: number;
  /** static thrust cap, N */
  TmaxStatic: number;

  /** CG height above ground when on wheels, m */
  gearHeight: number;
  /** rolling friction coefficient */
  muRoll: number;
  /** braking friction coefficient (brakes held) */
  muBrake: number;
  /** pitch attitude limits while on the ground, rad */
  thetaGroundMin: number;
  thetaGroundMax: number;
}

export interface WorldParams {
  g: number;
  /** sea level air density, kg/m³ */
  rho0: number;
  /** density scale height, m */
  Hscale: number;
}

export const C172: AircraftParams = {
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

  Pmax: 120_000,
  propEff: 0.8,
  TmaxStatic: 2600,

  gearHeight: 1.35,
  muRoll: 0.03,
  muBrake: 0.4,
  thetaGroundMin: (-1.5 * Math.PI) / 180,
  thetaGroundMax: (15 * Math.PI) / 180,
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
