import { C172, PHYSICS_DT, WORLD } from '../physics/params';
import type { AircraftState, Controls, Derived, TouchdownEvent } from '../physics/aircraft';
import { initialState, NEUTRAL, step } from '../physics/aircraft';
import { stallSpeed } from '../physics/aero';
import { Wind } from '../physics/wind';
import type { Level } from './levels';
import type { LandingReport } from './grader';
import { gradeLanding, gradeTouchdownInstant, OVERRUN_SPEED_KT } from './grader';
import { MS_TO_KT } from '../physics/params';

export type Phase = 'flying' | 'rollout' | 'done';

/** How high a bounce must go (m AGL) before we call it "airborne again". */
const BOUNCE_RESET_ALT = 2.0;
const STOPPED_SPEED = 0.5; // m/s

export class Game {
  readonly level: Level;
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

  constructor(level: Level) {
    this.level = level;
    this.wind = new Wind(level.wind);
    this.state = level.start ? { ...level.start } : initialState(C172);
  }

  get stallSpeedMs(): number {
    return stallSpeed(C172, WORLD);
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
      deTrim: this.level.deTrim,
      throttleDelta: this.level.engine ? controls.throttleDelta : -1,
    };

    const wind = this.wind.at(this.t);
    const d = step(this.state, effective, wind, PHYSICS_DT, C172, WORLD);
    this.derived = d;
    this.t += PHYSICS_DT;

    if (d.touchdown && this.phase === 'flying') {
      this.touchdown = d.touchdown;
      const instant = gradeTouchdownInstant(d.touchdown, this.level.runway, this.level.strictRunway);
      if (instant.crashed) {
        this.finish();
        return;
      }
      this.phase = 'rollout';
    }

    if (this.phase === 'rollout') {
      const endX = this.level.runway.startX + this.level.runway.length;
      if (!this.passedEnd && this.state.x >= endX) {
        this.passedEnd = true;
        this.speedAtEnd = Math.abs(this.state.vx);
        if (this.speedAtEnd * MS_TO_KT > OVERRUN_SPEED_KT) {
          this.finish();
          return;
        }
      }
      // Big bounce or go-around: back to flying, next touchdown counts instead.
      if (this.state.y - C172.gearHeight > BOUNCE_RESET_ALT) {
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
      this.level.runway,
      this.stallSpeedMs,
      this.level.strictRunway,
    );
    this.phase = 'done';
  }
}

export { NEUTRAL };
