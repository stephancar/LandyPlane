import type { AircraftParams, WorldParams } from './params';
import { airDensity, clamp, computeCD, computeCL, isStalled, lerp, wrapPi } from './aero';

/** +1 = nose-up command, -1 = nose-down. throttleDelta: -1 reduce, +1 increase. */
export interface Controls {
  pitch: number;
  throttleDelta: number;
  brakes: boolean;
  /** elevator trim offset, rad — shifts the stick-neutral point (set per level) */
  deTrim?: number;
}

export const NEUTRAL: Controls = { pitch: 0, throttleDelta: 0, brakes: false };

export interface AircraftState {
  /** horizontal position, m (runway threshold at x = 0) */
  x: number;
  /** CG height above the ground plane, m (on wheels: y = gearHeight) */
  y: number;
  vx: number;
  vy: number;
  /** pitch attitude, rad, nose-up positive */
  theta: number;
  /** pitch rate, rad/s */
  q: number;
  /** 0..1 */
  throttle: number;
  onGround: boolean;
}

export interface TouchdownEvent {
  /** descent rate at impact, m/s (positive down) */
  sinkRate: number;
  /** ground speed at impact, m/s */
  speed: number;
  /** airspeed at impact, m/s */
  airspeed: number;
  /** pitch attitude at impact, rad */
  pitch: number;
  /** position of impact, m */
  x: number;
}

/** Values derived during a step, for HUD, sound and grading. */
export interface Derived {
  V: number;
  airspeed: number;
  alpha: number;
  gamma: number;
  rho: number;
  CL: number;
  CD: number;
  lift: number;
  drag: number;
  thrust: number;
  stalled: boolean;
  touchdown: TouchdownEvent | null;
}

export function initialState(p: AircraftParams): AircraftState {
  return { x: 0, y: p.gearHeight, vx: 0, vy: 0, theta: 0, q: 0, throttle: 0, onGround: true };
}

const MIN_AERO_SPEED = 1.0; // m/s below which aero forces are negligible

/**
 * Advance the aircraft by one fixed timestep. Mutates `s`, returns derived data.
 * wind: {wx, wy} in m/s.
 */
export function step(
  s: AircraftState,
  controls: Controls,
  wind: { wx: number; wy: number },
  dt: number,
  p: AircraftParams,
  world: WorldParams,
): Derived {
  const wasAirborne = !s.onGround;
  const vyBefore = s.vy;

  // --- Throttle ---
  s.throttle = clamp(s.throttle + controls.throttleDelta * p.throttleRate * dt, 0, 1);

  // --- Air-relative velocity ---
  const vax = s.vx - wind.wx;
  const vay = s.vy - wind.wy;
  const Va = Math.hypot(vax, vay);
  const V = Math.hypot(s.vx, s.vy);

  const alt = Math.max(0, s.y - p.gearHeight);
  const rho = airDensity(alt, world);

  let alpha = 0;
  let CL = 0;
  let CD = 0;
  let lift = 0;
  let drag = 0;
  let stalled = false;
  let FxAero = 0;
  let FyAero = 0;

  if (Va > MIN_AERO_SPEED) {
    const gammaAir = Math.atan2(vay, vax);
    alpha = wrapPi(s.theta - gammaAir);
    CL = computeCL(alpha, p);
    stalled = isStalled(alpha, p);
    CD = computeCD(CL, stalled, p);

    const qbar = 0.5 * rho * Va * Va;
    lift = qbar * p.S * CL;
    drag = qbar * p.S * CD;

    // Drag along -air-velocity, lift perpendicular (left of velocity = up when flying +x).
    const ux = vax / Va;
    const uy = vay / Va;
    FxAero = -drag * ux - lift * uy;
    FyAero = -drag * uy + lift * ux;
  }

  // --- Thrust ---
  let thrust: number;
  if (p.propulsion === 'jet') {
    // Near-constant thrust, mild density lapse with altitude.
    thrust = s.throttle * p.TmaxStatic * Math.pow(rho / 1.225, 0.7);
  } else {
    // Power-limited prop, capped at static thrust that bleeds off with speed.
    const Pshaft = p.Pmax * s.throttle;
    const Tpower = (p.propEff * Pshaft) / Math.max(Va, 12);
    const Tcap = lerp(p.TmaxStatic, p.TmaxStatic * 0.55, clamp((Va - 5) / 35, 0, 1));
    thrust = clamp(Tpower, 0, Tcap);
  }
  const Tx = thrust * Math.cos(s.theta);
  const Ty = thrust * Math.sin(s.theta);

  // --- Sum forces ---
  let Fx = FxAero + Tx;
  let Fy = FyAero + Ty - p.m * world.g;

  // --- Ground reaction ---
  const contact = s.y <= p.gearHeight + 1e-6;
  if (contact && s.vy <= 0) {
    // Normal force balances everything pushing down (never negative).
    const N = Math.max(0, -Fy);
    if (N > 0) {
      Fy += N;
      // Rolling / braking friction opposes horizontal motion.
      const mu = controls.brakes ? p.muBrake : p.muRoll;
      const Ffric = mu * N;
      if (Math.abs(s.vx) > 0.01) {
        const decel = (Ffric / p.m) * dt;
        if (Math.abs(s.vx) <= decel) s.vx = 0;
        else s.vx -= Math.sign(s.vx) * decel;
      } else if (Math.abs(Fx) < Ffric) {
        Fx = 0;
        s.vx = 0;
      }
    }
  }

  // --- Integrate translation ---
  s.vx += (Fx / p.m) * dt;
  s.vy += (Fy / p.m) * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;

  // --- Ground clamp + touchdown detection ---
  let touchdown: TouchdownEvent | null = null;
  if (s.y <= p.gearHeight) {
    if (wasAirborne) {
      touchdown = {
        sinkRate: Math.max(0, -vyBefore),
        speed: Math.hypot(s.vx, s.vy),
        airspeed: Va,
        pitch: s.theta,
        x: s.x,
      };
    }
    s.y = p.gearHeight;
    if (s.vy < 0) s.vy = 0;
    s.onGround = true;
  } else {
    s.onGround = false;
  }

  // --- Pitch dynamics ---
  const qbarPitch = 0.5 * rho * Va * Va;
  // +1 command (pull) -> negative de -> nose-up moment; trim shifts the neutral point.
  const de = clamp((controls.deTrim ?? 0) - controls.pitch * p.deMax, -p.deMax, p.deMax);
  const qHat = (s.q * p.cbar) / Math.max(2 * Va, 1);
  const Cm = p.Cm0 + p.Cmalpha * alpha + p.Cmq * qHat + p.Cmde * de;
  const M = qbarPitch * p.S * p.cbar * Cm;
  s.q += (M / p.Iyy) * dt;
  s.theta = wrapPi(s.theta + s.q * dt);

  // On the ground the airframe can't pitch through the pavement (or tail-strike past limit).
  if (s.onGround) {
    if (s.theta < p.thetaGroundMin) {
      s.theta = p.thetaGroundMin;
      if (s.q < 0) s.q = 0;
    } else if (s.theta > p.thetaGroundMax) {
      s.theta = p.thetaGroundMax;
      if (s.q > 0) s.q = 0;
    }
  }

  return {
    V,
    airspeed: Va,
    alpha,
    gamma: V > 0.1 ? Math.atan2(s.vy, s.vx) : 0,
    rho,
    CL,
    CD,
    lift,
    drag,
    thrust,
    stalled,
    touchdown,
  };
}
