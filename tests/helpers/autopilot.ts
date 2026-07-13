/**
 * Test autopilot: flies approaches through the real Game loop using continuous
 * control values. Not clever — just PD loops with alpha/speed protection —
 * but good enough to verify the scenarios are winnable and the grader fires.
 */
import type { Game } from '../../src/game/game';
import type { Controls } from '../../src/physics/aircraft';
import { C172, DEG } from '../../src/physics/params';
import { clamp } from '../../src/physics/aero';

export function approachAutopilot(game: Game): Controls {
  const s = game.state;
  const d = game.derived;
  const alt = s.y - C172.gearHeight;
  const vs = game.stallSpeedMs;

  if (s.onGround) {
    // Rollout: nose down to kill lift so the brakes actually bite.
    return { pitch: -0.3, throttleDelta: -1, brakes: true };
  }

  const va = d?.airspeed ?? Math.hypot(s.vx, s.vy);
  const alpha = d?.alpha ?? 0;
  let pitch: number;

  if (alt < 4) {
    // Flare: arrest the sink just above the pavement.
    pitch = clamp(0.9 * (-0.8 - s.vy) - 6 * s.q, -1, 1);
  } else if (!game.level.engine) {
    // Glide: hold approach speed with pitch and take the touchdown point we get.
    const vT = 1.22 * vs;
    pitch = clamp(0.25 * (va - vT) - 6 * s.q, -1, 1);
  } else {
    // Powered approach: fly a straight line to the aim point with pitch...
    const aim = game.level.runway.startX + game.level.runway.touchdownZone * 0.4;
    const dist = aim - s.x;
    const vyT = dist > 20 ? clamp((-alt * Math.max(s.vx, 5)) / dist, -4.5, -0.4) : -1.5;
    pitch = clamp(0.7 * (vyT - s.vy) - 6 * s.q, -1, 1);
  }

  // Protections: never pull into a stall, never chase vy at extreme alpha.
  if (va < 1.12 * vs) pitch = Math.min(pitch, -0.25);
  if (alpha > 11 * DEG) pitch = Math.min(pitch, -0.4);

  // Throttle: hold approach speed, idle in the flare (dead engine: always idle).
  let throttleDelta: number;
  if (!game.level.engine || alt < 4) {
    throttleDelta = -1;
  } else {
    const vT = 1.25 * vs;
    throttleDelta = clamp(1.5 * (vT - va), -1, 1);
  }

  return { pitch, throttleDelta, brakes: false };
}

export function takeoffAutopilot(game: Game): Controls {
  const s = game.state;
  const rotate = Math.hypot(s.vx, s.vy) > 30;
  const thetaT = rotate ? 9 * DEG : 0;
  const pitch = clamp(3 * (thetaT - s.theta) - 6 * s.q, -1, 1);
  return { pitch, throttleDelta: 1, brakes: false };
}

/** Run the game until done or maxSeconds; returns steps taken. */
export function flyUntilDone(game: Game, controller: (g: Game) => Controls, maxSeconds = 180): number {
  let steps = 0;
  const maxSteps = Math.round(maxSeconds * 120);
  while (game.phase !== 'done' && steps < maxSteps) {
    game.stepOnce(controller(game));
    steps++;
  }
  return steps;
}
