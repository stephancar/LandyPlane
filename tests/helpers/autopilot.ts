/**
 * Test autopilot: flies approaches through the real Game loop using continuous
 * control values. Not clever — just PD loops with alpha/speed protection —
 * but good enough to verify the scenarios are winnable and the grader fires.
 * Works for any aircraft: speeds scale with the aircraft's stall speed.
 */
import type { Game } from '../../src/game/game';
import type { Controls } from '../../src/physics/aircraft';
import { DEG, WORLD } from '../../src/physics/params';
import { clamp, glideRatioAt, trimAlpha } from '../../src/physics/aero';

export function approachAutopilot(game: Game): Controls {
  const s = game.state;
  const d = game.derived;
  const ac = game.aircraft;
  const alt = s.y - ac.gearHeight;
  const vs = game.stallSpeedMs;

  if (s.onGround) {
    // Rollout: nose down to kill lift so the brakes actually bite.
    return { pitch: -0.3, throttleDelta: -1, brakes: true };
  }

  const va = d?.airspeed ?? Math.hypot(s.vx, s.vy);
  const alpha = d?.alpha ?? 0;
  const vT = 1.25 * vs;
  // Powered approaches are flown on with a short flare; dead-stick glides
  // arrive steep and fast and need to start arresting the sink much earlier.
  const flareAlt = game.level.engine ? Math.max(4, 0.12 * va) : Math.max(4, 0.3 * va);
  let pitch: number;

  if (alt < flareAlt) {
    // Flare: bleed the sink progressively as the ground approaches.
    const vyT = -Math.max(0.6, alt * 0.25);
    pitch = clamp(1.2 * (vyT - s.vy) - 5 * s.q, -1, 1);
  } else {
    // Attitude hold: base pitch = trim alpha on the expected descent path,
    // nudged by the speed error (too fast -> nose up). Stable for all types.
    const glidePath = game.level.engine ? 3.5 * DEG : 1 / glideRatioAt(vT, ac, WORLD);
    const thetaBase = trimAlpha(vT, ac, WORLD) - glidePath;
    const thetaT = clamp(thetaBase + 0.012 * (va - vT), thetaBase - 8 * DEG, thetaBase + 6 * DEG);
    pitch = clamp(3 * (thetaT - s.theta) - 8 * s.q, -1, 1);
  }

  // Protections: never pull into a stall, never hang past warning alpha.
  // In the flare the nose may ride right up to the stall — just stop pulling.
  if (va < 1.1 * vs && alt >= flareAlt) pitch = Math.min(pitch, -0.25);
  if (alt < flareAlt) {
    if (alpha > 0.97 * ac.alphaStall) pitch = Math.min(pitch, 0);
  } else if (alpha > 0.9 * ac.alphaStall) {
    pitch = Math.min(pitch, -0.4);
  }

  // Throttle holds the glidepath toward the aim point (backside technique).
  let throttleDelta: number;
  if (!game.level.engine || alt < flareAlt) {
    throttleDelta = -1;
  } else {
    const aim = game.runway.startX + game.runway.touchdownZone * 0.4;
    const dist = aim - s.x;
    const vyT = dist > 20 ? clamp((-alt * Math.max(s.vx, 5)) / dist, -0.12 * va, -0.4) : -0.1 * va;
    throttleDelta = clamp(0.8 * (vyT - s.vy), -1, 1);
  }

  return { pitch, throttleDelta, brakes: false };
}

export function takeoffAutopilot(game: Game): Controls {
  const s = game.state;
  const rotate = Math.hypot(s.vx, s.vy) > 1.15 * game.stallSpeedMs;
  const thetaT = rotate ? 9 * DEG : 0;
  const pitch = clamp(3 * (thetaT - s.theta) - 6 * s.q, -1, 1);
  return { pitch, throttleDelta: 1, brakes: false };
}

/** Run the game until done or maxSeconds; returns steps taken. */
export function flyUntilDone(game: Game, controller: (g: Game) => Controls, maxSeconds = 240): number {
  let steps = 0;
  const maxSteps = Math.round(maxSeconds * 120);
  while (game.phase !== 'done' && steps < maxSteps) {
    game.stepOnce(controller(game));
    steps++;
  }
  return steps;
}
