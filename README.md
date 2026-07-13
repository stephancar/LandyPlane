# LandyPlane

A 2D side-view landing game with honest aerodynamics. Manage pitch and
throttle, bring the plane down on the runway, and get graded on every
touchdown. Easy to pick up, hard to butter.

See [SPEC.md](SPEC.md) for the full functional spec.

## Play

- **↑/↓** (or W/S) — pitch
- **A/Z** (or +/−) — throttle
- **B** (hold) — brakes
- **R** restart · **Esc** level select · **M** mute

Five challenge levels (pass with a score of 50+ to unlock the next) plus a
free-flight sandbox with a live aerodynamics panel. On touch devices,
on-screen controls appear automatically.

## Develop

Requires Node 20+.

```sh
npm install
npm run dev        # dev server on http://localhost:5173
npm test           # unit + simulation tests (Vitest)
npm run test:e2e   # browser tests (Playwright; npx playwright install chromium once)
npm run build      # typecheck + production build to dist/
```

## Architecture

- `src/physics/` — pure, renderer-free flight model at a fixed 120 Hz timestep:
  lift curve with stall, drag polar, power-limited thrust, ground contact,
  brakes, seeded wind/gusts. Fully deterministic.
- `src/game/` — levels, the landing grader (crash rules + 0–100 score),
  game state machine, localStorage persistence.
- `src/render/`, `src/input/`, `src/audio/` — canvas scene, keyboard/touch
  input, Web Audio synth (no assets).
- `tests/` — physics invariants, grader table tests, and simulation tests
  where a scripted autopilot flies every level through the real game loop
  and must land it.
- `e2e/` — Playwright specs for the UI flow.
