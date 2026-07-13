import { C172, PHYSICS_DT, WORLD, MS_TO_KT } from '../physics/params';
import type { AircraftParams } from '../physics/params';
import type { AircraftState, Controls, Derived, TouchdownEvent } from '../physics/aircraft';
import { initialState, NEUTRAL, step } from '../physics/aircraft';
import { glideRatioAt, stallSpeed, trimAlpha, trimElevator } from '../physics/aero';
import { Wind } from '../physics/wind';
import type { Level, Runway } from './levels';
import type { LandingReport } from './grader';
import { gradeLanding, gradeTouchdownInstant, OVERRUN_SPEED_KT } from './grader';

export type Phase = 'flying' | 'rollout' | 'done';

/** How high a bounce must go (m AGL) before we call it "airborne again". */
const BOUNCE_RESET_ALT = 2.0;
const STOPPED_SPEED = 0.5; // m/s

export class Game {
  readonly level: Level;
  readonly aircraft: AircraftParams;
  /** the level's runway scaled for this aircraft */
  readonly runway: Runway;
  /** elevator trim so the start attitude is hands-off stable */
  readonly deTrim: number;

  state: AircraftState;
  derived: Derived | null = null;
  phase: Phase = 'flying';
  report: LandingReport | null = null;
  /** simulation time, s */
  t = 0;
  timeWarp = 1;

  private wind: Wind;
  private accumulator = 0;
  private touchdown: TouchdownEvent | null = null;
  private speedAtEnd = 0;
  private passedEnd = false;

  constructor(level: Level, aircraft: AircraftParams = C172) {
    this.level = level;
    this.aircraft = aircraft;
    this.wind = new Wind(level.wind);

    this.runway = {
      startX: level.runway.startX,
      length: Math.round(level.runway.length * aircraft.runwayScale),
      touchdownZone: Math.round(level.runway.touchdownZone * aircraft.runwayScale),
    };

    const spec = level.start;
    if (spec.kind === 'ground') {
      this.state = initialState(aircraft);
      // Trim for a climb a bit above approach speed so takeoff is calm.
      this.deTrim = trimElevator(trimAlpha(aircraft.approachSpeed * 1.1, aircraft, WORLD), aircraft);
    } else {
      let distance: number;
      let altitude: number;
      let speed: number;
      let throttle: number;
      if (spec.kind === 'glide') {
        altitude = spec.altitude * aircraft.distanceScale;
        // Start where a glide flown at approach speed reaches a bit past the
        // threshold (at approach speed, not the theoretical best-glide speed).
        distance = altitude * glideRatioAt(aircraft.approachSpeed, aircraft, WORLD) * 0.93;
        speed = aircraft.approachSpeed;
        throttle = 0;
      } else {
        distance = spec.distance * aircraft.distanceScale;
        altitude = spec.altitude * aircraft.distanceScale;
        speed = aircraft.approachSpeed * spec.speedFactor;
        throttle = spec.throttle ?? 0.35;
      }
      const glide = Math.atan2(altitude, distance);
      const alpha = trimAlpha(speed, aircraft, WORLD);
      this.deTrim = trimElevator(alpha, aircraft);
      this.state = {
        x: -distance,
        y: altitude + aircraft.gearHeight,
        vx: speed * Math.cos(glide),
        vy: -speed * Math.sin(glide),
        theta: alpha - glide,
        q: 0,
        throttle,
        onGround: false,
      };
    }
  }

  get stallSpeedMs(): number {
    return stallSpeed(this.aircraft, WORLD);
  }

  windNow(): { wx: number; wy: number } {
    return this.wind.at(this.t);
  }

  /** Advance by real elapsed seconds (scaled by timeWarp), stepping physics at a fixed dt. */
  update(realDt: number, controls: Controls): void {
    if (this.phase === 'done') return;
    this.accumulator += Math.min(realDt, 0.25) * this.timeWarp;
    while (this.accumulator >= PHYSICS_DT) {
      this.accumulator -= PHYSICS_DT;
      this.stepOnce(controls);
      if ((this.phase as Phase) === 'done') break;
    }
  }

  /** Single fixed step — used directly by simulation tests for determinism. */
  stepOnce(controls: Controls): void {
    if (this.phase === 'done') return;

    const effective: Controls = {
      ...controls,
      deTrim: this.deTrim,
      throttleDelta: this.level.engine ? controls.throttleDelta : -1,
    };

    const wind = this.wind.at(this.t);
    const d = step(this.state, effective, wind, PHYSICS_DT, this.aircraft, WORLD);
    this.derived = d;
    this.t += PHYSICS_DT;

    if (d.touchdown && this.phase === 'flying') {
      this.touchdown = d.touchdown;
      const instant = gradeTouchdownInstant(
        d.touchdown,
        this.runway,
        this.level.strictRunway,
        this.aircraft.crashSinkFpm,
      );
      if (instant.crashed) {
        this.finish();
        return;
      }
      this.phase = 'rollout';
    }

    if (this.phase === 'rollout') {
      const endX = this.runway.startX + this.runway.length;
      if (!this.passedEnd && this.state.x >= endX) {
        this.passedEnd = true;
        this.speedAtEnd = Math.abs(this.state.vx);
        if (this.speedAtEnd * MS_TO_KT > OVERRUN_SPEED_KT) {
          this.finish();
          return;
        }
      }
      // Big bounce or go-around: back to flying, next touchdown counts instead.
      if (this.state.y - this.aircraft.gearHeight > BOUNCE_RESET_ALT) {
        this.phase = 'flying';
        this.touchdown = null;
        this.passedEnd = false;
        this.speedAtEnd = 0;
        return;
      }
      if (this.state.onGround && Math.hypot(this.state.vx, this.state.vy) < STOPPED_SPEED) {
        this.finish();
      }
    }
  }

  private finish(): void {
    if (!this.touchdown) return;
    this.report = gradeLanding(
      this.touchdown,
      { stopX: this.state.x, speedAtEnd: this.speedAtEnd },
      this.runway,
      this.stallSpeedMs,
      this.level.strictRunway,
      this.aircraft.crashSinkFpm,
    );
    this.phase = 'done';
  }
}

export { NEUTRAL };
