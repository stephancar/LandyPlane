import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/game';
import { FREE_FLIGHT, LEVELS, levelById } from '../src/game/levels';
import { AIRCRAFT, C172 } from '../src/physics/params';
import { approachAutopilot, flyUntilDone, takeoffAutopilot } from './helpers/autopilot';
import { NEUTRAL } from '../src/physics/aircraft';

describe('flown scenarios (headless autopilot)', () => {
  it('trainer level can be landed with a passing score', () => {
    const game = new Game(levelById('trainer')!);
    flyUntilDone(game, approachAutopilot);
    expect(game.phase).toBe('done');
    expect(game.report).not.toBeNull();
    expect(game.report!.crashed).toBe(false);
    expect(game.report!.score).toBeGreaterThanOrEqual(50);
  });

  it('short field can be landed without crashing', () => {
    const game = new Game(levelById('shortfield')!);
    flyUntilDone(game, approachAutopilot);
    expect(game.phase).toBe('done');
    expect(game.report!.crashed).toBe(false);
  });

  it('gusty level is landable', () => {
    const game = new Game(levelById('gusty')!);
    flyUntilDone(game, approachAutopilot);
    expect(game.phase).toBe('done');
    expect(game.report!.crashed).toBe(false);
  });

  it('engine-out glide reaches the runway', () => {
    const game = new Game(levelById('engineout')!);
    flyUntilDone(game, approachAutopilot);
    expect(game.phase).toBe('done');
    expect(game.report!.crashed).toBe(false);
    // Engine truly dead: throttle must have stayed at zero.
    expect(game.state.throttle).toBe(0);
  });

  it('tailwind level is landable', () => {
    const game = new Game(levelById('tailwind')!);
    flyUntilDone(game, approachAutopilot);
    expect(game.phase).toBe('done');
    expect(game.report!.crashed).toBe(false);
  });

  it('a full-power dive into the ground is a crash', () => {
    const game = new Game(levelById('trainer')!);
    flyUntilDone(game, () => ({ pitch: -1, throttleDelta: 1, brakes: false }), 60);
    expect(game.phase).toBe('done');
    expect(game.report!.crashed).toBe(true);
    expect(game.report!.score).toBe(0);
  });

  it('free flight: full throttle takeoff gets airborne and climbs', () => {
    const game = new Game(FREE_FLIGHT);
    let climbed = false;
    for (let i = 0; i < 120 * 60 && !climbed; i++) {
      game.stepOnce(takeoffAutopilot(game));
      if (game.state.y - C172.gearHeight > 30) climbed = true;
    }
    expect(climbed).toBe(true);
    expect(game.state.onGround).toBe(false);
  });

  it('is deterministic: same inputs, same trajectory', () => {
    const run = () => {
      const game = new Game(levelById('gusty')!);
      for (let i = 0; i < 120 * 20; i++) game.stepOnce(approachAutopilot(game));
      return { ...game.state, t: game.t, phase: game.phase };
    };
    expect(run()).toEqual(run());
  });

  it('every challenge level starts airborne with sane speed, for every aircraft', () => {
    for (const level of LEVELS) {
      for (const ac of Object.values(AIRCRAFT)) {
        const game = new Game(level, ac);
        expect(game.state.y).toBeGreaterThan(ac.gearHeight + 20);
        expect(game.state.vx).toBeGreaterThan(0.9 * game.stallSpeedMs);
      }
    }
  });

  describe.each(Object.values(AIRCRAFT).map((ac) => [ac.label, ac] as const))(
    'aircraft: %s',
    (_label, ac) => {
      it('lands the trainer with a passing score', () => {
        const game = new Game(levelById('trainer')!, ac);
        flyUntilDone(game, approachAutopilot);
        expect(game.phase).toBe('done');
        expect(game.report!.crashed).toBe(false);
        expect(game.report!.score).toBeGreaterThanOrEqual(50);
      });

      it('survives the engine-out glide', () => {
        const game = new Game(levelById('engineout')!, ac);
        flyUntilDone(game, approachAutopilot);
        expect(game.phase).toBe('done');
        expect(game.report!.crashed).toBe(false);
      });

      it('takes off in free flight', () => {
        const game = new Game(FREE_FLIGHT, ac);
        let climbed = false;
        for (let i = 0; i < 120 * 90 && !climbed; i++) {
          game.stepOnce(takeoffAutopilot(game));
          if (game.state.y - ac.gearHeight > 30) climbed = true;
        }
        expect(climbed).toBe(true);
      });
    },
  );

  it('trimmed hands-off flight is stable (no crash within a minute)', () => {
    const game = new Game(levelById('trainer')!);
    for (let i = 0; i < 120 * 60 && game.phase !== 'done'; i++) game.stepOnce(NEUTRAL);
    // With trim the plane should still be flying or have touched down; it must
    // not have ended in a mid-air-style crash from pitch instability.
    if (game.phase === 'done') {
      expect(game.report!.crashReason).not.toBe('extreme-attitude');
      expect(game.report!.crashReason).not.toBe('hard-impact');
    }
  });

  it('with the throttle cut, the glide comes down within three minutes', () => {
    const game = new Game(levelById('trainer')!);
    flyUntilDone(game, () => ({ pitch: 0, throttleDelta: -1, brakes: false }), 180);
    expect(game.phase).toBe('done');
  });
});
