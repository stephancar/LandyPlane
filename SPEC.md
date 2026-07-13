# LandyPlane v2 — Functional Spec

*Approved 2026-07-13.*

## Concept

A 2D side-view landing game with honest aerodynamics. You manage pitch and
throttle to bring a small aircraft from final approach (or from takeoff) onto
the runway, and the game grades every touchdown. Easy to pick up, hard to
butter.

## Game modes

### Approach Challenge (core game)
A sequence of levels. Each starts the player airborne at some altitude, speed
and distance from the runway; the goal is to touch down on the runway and stop
on it. A level is passed with a score ≥ 50, which unlocks the next.

1. **Trainer** — long runway, calm air, generous grading
2. **Short field** — runway half as long; touch down early and brake
3. **Headwind & gusts** — steady wind plus random gusts
4. **Engine out** — throttle dead, glide it in
5. **Tailwind trap** — tailwind landing; easy to float and overrun

### Free Flight (sandbox)
Start on the runway, take off, fly, land anywhere. Shows the educational aero
panel (AoA, CL/CD, lift/drag/thrust). Landings are still graded but nothing is
locked.

## Landing evaluation

Measured at touchdown: sink rate (fpm), airspeed, pitch attitude, distance from
threshold; then during rollout: whether the aircraft stops within the runway.

**Crash conditions**
- Sink rate > 700 fpm at touchdown
- Nose-first touchdown / prop strike (pitch < −2°)
- Touchdown off the runway (challenge mode only)
- Overrun off the far end at speed (> 10 kt past the end)
- Extreme attitude impact (|pitch| > 30° at ground contact)

**Score (0–100)**
- Sink rate: 40 pts (≤ 100 fpm full marks, linear to 0 at 600 fpm)
- Touchdown point: 20 pts (in the touchdown zone; penalty for landing long)
- Speed: 20 pts (close to 1.15 × stall speed is ideal; too fast/slow penalized)
- Attitude: 10 pts (slightly nose-up, 2–10°)
- Stopped on runway: 10 pts

Tiers: ≥ 90 *Buttered* · ≥ 70 *Good* · ≥ 50 *Firm* · < 50 *Ugly but alive*.
Best score per level in `localStorage`.

## Aircraft (added post-v2.0)

Three selectable aircraft, chosen on the menu, each with its own physics,
art, and per-aircraft level progression / best scores:

- **Cessna 172** — the baseline trainer (prop, power-limited thrust)
- **Carbon Cub** — STOL: stalls ~32 kt, huge static thrust, lands anywhere;
  runways shrink to 60 % and approaches start closer
- **F-16** — jet (near-constant thrust, slow spool), ~110 kt stall, terrible
  glide at approach speed; runways stretch to 260 % and approaches start
  further out. Afterburner glow above 85 % throttle.

Level geometry scales per aircraft (`runwayScale`, `distanceScale`); the
engine-out level derives its start distance from the aircraft's glide ratio
*at approach speed* (not best-glide, which for a jet is unrealistically fast).
Crash sink-rate limits are per aircraft (700/800/900 fpm).

## Flight model

Point-mass + pitch-rate dynamics, C172-ish coefficients, from v1 but fixed:
- Linear lift curve to stall at ~15° AoA, post-stall drop-off; parabolic drag
  polar; power-limited thrust with static-thrust cap; exponential air density.
- Fixed 120 Hz physics timestep, accumulator loop — deterministic and testable;
  time warp scales accumulated time, not the step.
- Ground constraint also constrains pitch (no nose through the pavement).
- Wheel brakes (hold B).
- Wind: steady component per level + seeded gust model; aero forces use
  air-relative velocity.

## Controls (shown on screen)

- **↑/↓** or **W/S** — pitch (push/pull; invert toggle in settings)
- **+/−** or **A/Z** — throttle
- **B** hold — brakes · **R** — restart · **Esc/P** — pause & level select
- **M** — mute
- Touch devices: hold-buttons for pitch/throttle/brakes with pressed-state
  feedback and a throttle readout.

## HUD

Airspeed (kt), altitude AGL (ft), vertical speed (fpm), throttle %, wind arrow
(when wind), stall warning (flashing + beeper) above 85 % of critical AoA,
off-screen runway pointer. Sandbox additionally shows the aero panel.
After landing: report card overlay with score breakdown; on crash: reason.

## Audio

Web Audio, no assets: engine hum follows throttle, stall beeper, touchdown
thump, crash noise. Mute toggle, persisted.

## Non-goals (v2)

No 3D, no roll/yaw, no multiplayer, no flaps/retractable gear, no backend.
Static site, deployable to GitHub Pages.

## Test strategy

- **Unit (Vitest)** — physics invariants: stall speed ≈ 45–55 kt, lift ≈ weight
  in trim, glide ratio sane, brakes effective; grader table-driven cases; gust
  determinism with seeded RNG.
- **Simulation** — scripted autopilot flies scenarios through the real physics
  loop headlessly: controlled approach → graded landing; dive → crash; engine
  out from L4 start → landable.
- **E2E (Playwright, headless)** — page boots, HUD updates from keyboard input,
  level flow, report card, localStorage persistence.
