import { DEG, MS_TO_FPM, MS_TO_KT } from '../physics/params';
import type { TouchdownEvent } from '../physics/aircraft';
import type { Runway } from './levels';
import { clamp } from '../physics/aero';

export type CrashReason =
  | 'hard-impact'
  | 'prop-strike'
  | 'off-runway'
  | 'overrun'
  | 'extreme-attitude';

export interface ScorePart {
  label: string;
  points: number;
  max: number;
  note: string;
}

export interface LandingReport {
  crashed: boolean;
  crashReason?: CrashReason;
  crashText?: string;
  score: number;
  tier: 'Buttered' | 'Good' | 'Firm' | 'Ugly but alive' | 'Crashed';
  parts: ScorePart[];
  touchdown: TouchdownEvent;
  stoppedOnRunway: boolean;
  stopX: number;
}

export const CRASH_SINK_FPM = 700;
export const PROP_STRIKE_DEG = -2;
export const EXTREME_ATTITUDE_DEG = 30;
export const OVERRUN_SPEED_KT = 10;

export interface RolloutResult {
  /** where the aircraft came to rest (or left the runway end), m */
  stopX: number;
  /** speed when passing the far end of the runway, m/s (0 if stopped before it) */
  speedAtEnd: number;
}

/** Ideal approach speed used for the speed score: 1.15 × stall speed. */
export function refSpeed(stallMs: number): number {
  return 1.15 * stallMs;
}

export function gradeTouchdownInstant(
  td: TouchdownEvent,
  runway: Runway,
  strictRunway: boolean,
  crashSinkFpm: number = CRASH_SINK_FPM,
): { crashed: boolean; reason?: CrashReason; text?: string } {
  const sinkFpm = td.sinkRate * MS_TO_FPM;
  const pitchDeg = td.pitch / DEG;
  const onRunway = td.x >= runway.startX && td.x <= runway.startX + runway.length;

  if (Math.abs(pitchDeg) > EXTREME_ATTITUDE_DEG) {
    return {
      crashed: true,
      reason: 'extreme-attitude',
      text: `You hit the ground at ${pitchDeg.toFixed(0)}° of pitch. That is not a landing, that is an arrival.`,
    };
  }
  if (sinkFpm > crashSinkFpm) {
    return {
      crashed: true,
      reason: 'hard-impact',
      text: `Touched down at ${sinkFpm.toFixed(0)} fpm — the gear is now part of the wing. (Limit: ${crashSinkFpm} fpm.)`,
    };
  }
  if (pitchDeg < PROP_STRIKE_DEG) {
    return {
      crashed: true,
      reason: 'prop-strike',
      text: `Nose-wheel first at ${pitchDeg.toFixed(1)}° — the propeller met the pavement. Flare next time.`,
    };
  }
  if (strictRunway && !onRunway) {
    const off = td.x < runway.startX ? 'short of' : 'past';
    return {
      crashed: true,
      reason: 'off-runway',
      text: `Touched down ${Math.abs(td.x - (td.x < runway.startX ? runway.startX : runway.startX + runway.length)).toFixed(0)} m ${off} the runway. The grass does not count.`,
    };
  }
  return { crashed: false };
}

export function gradeLanding(
  td: TouchdownEvent,
  rollout: RolloutResult,
  runway: Runway,
  stallMs: number,
  strictRunway: boolean,
  crashSinkFpm: number = CRASH_SINK_FPM,
): LandingReport {
  const instant = gradeTouchdownInstant(td, runway, strictRunway, crashSinkFpm);
  const sinkFpm = td.sinkRate * MS_TO_FPM;
  const pitchDeg = td.pitch / DEG;
  const endX = runway.startX + runway.length;
  const overran = rollout.speedAtEnd * MS_TO_KT > OVERRUN_SPEED_KT;
  const stoppedOnRunway =
    !overran && rollout.stopX >= runway.startX && rollout.stopX <= endX;

  if (instant.crashed || overran) {
    const reason = instant.crashed ? instant.reason! : 'overrun';
    const text = instant.crashed
      ? instant.text!
      : `Ran off the far end at ${(rollout.speedAtEnd * MS_TO_KT).toFixed(0)} kt. The fence was not impressed.`;
    return {
      crashed: true,
      crashReason: reason,
      crashText: text,
      score: 0,
      tier: 'Crashed',
      parts: [],
      touchdown: td,
      stoppedOnRunway: false,
      stopX: rollout.stopX,
    };
  }

  const parts: ScorePart[] = [];

  // Sink rate: 40 pts. <=100 fpm full, linear to 0 at 600 fpm.
  const sinkScore = 40 * clamp((600 - sinkFpm) / 500, 0, 1);
  parts.push({
    label: 'Sink rate',
    points: Math.round(sinkScore),
    max: 40,
    note: `${sinkFpm.toFixed(0)} fpm ${sinkFpm <= 100 ? '— butter' : sinkFpm <= 300 ? '— acceptable' : '— firm'}`,
  });

  // Touchdown point: 20 pts. Full inside the touchdown zone; drops linearly to 0
  // by 80% down the runway. Landing short (before threshold, lenient mode) scores 0.
  const distFromThreshold = td.x - runway.startX;
  let zoneScore: number;
  let zoneNote: string;
  if (distFromThreshold < 0) {
    zoneScore = 0;
    zoneNote = `${(-distFromThreshold).toFixed(0)} m short of the pavement`;
  } else if (distFromThreshold <= runway.touchdownZone) {
    zoneScore = 20;
    zoneNote = `${distFromThreshold.toFixed(0)} m in — in the zone`;
  } else {
    const late = (distFromThreshold - runway.touchdownZone) / (runway.length * 0.8 - runway.touchdownZone);
    zoneScore = 20 * clamp(1 - late, 0, 1);
    zoneNote = `${distFromThreshold.toFixed(0)} m in — long`;
  }
  parts.push({ label: 'Touchdown point', points: Math.round(zoneScore), max: 20, note: zoneNote });

  // Speed: 20 pts. Ideal at 1.15 Vs; 0 by ±35% off.
  const vRef = refSpeed(stallMs);
  const speedErr = Math.abs(td.airspeed - vRef) / vRef;
  const speedScore = 20 * clamp(1 - speedErr / 0.35, 0, 1);
  parts.push({
    label: 'Speed control',
    points: Math.round(speedScore),
    max: 20,
    note: `${(td.airspeed * MS_TO_KT).toFixed(0)} kt (ref ${(vRef * MS_TO_KT).toFixed(0)} kt)`,
  });

  // Attitude: 10 pts. Ideal 2..10° nose up.
  let attScore: number;
  if (pitchDeg >= 2 && pitchDeg <= 10) attScore = 10;
  else if (pitchDeg < 2) attScore = 10 * clamp((pitchDeg - PROP_STRIKE_DEG) / 4, 0, 1);
  else attScore = 10 * clamp((15 - pitchDeg) / 5, 0, 1);
  parts.push({
    label: 'Attitude',
    points: Math.round(attScore),
    max: 10,
    note: `${pitchDeg.toFixed(1)}° ${pitchDeg >= 2 && pitchDeg <= 10 ? 'nose-up — textbook' : pitchDeg < 2 ? '— flat' : '— dramatic'}`,
  });

  // Stopped on the runway: 10 pts.
  parts.push({
    label: 'Stopped on runway',
    points: stoppedOnRunway ? 10 : 0,
    max: 10,
    note: stoppedOnRunway ? 'full stop on the pavement' : 'rolled off the pavement',
  });

  const score = Math.round(parts.reduce((s, part) => s + part.points, 0));
  const tier = score >= 90 ? 'Buttered' : score >= 70 ? 'Good' : score >= 50 ? 'Firm' : 'Ugly but alive';

  return {
    crashed: false,
    score,
    tier,
    parts,
    touchdown: td,
    stoppedOnRunway,
    stopX: rollout.stopX,
  };
}
