import { Game } from './game/game';
import { FREE_FLIGHT, LEVELS, levelById } from './game/levels';
import type { Level } from './game/levels';
import { Renderer } from './render/renderer';
import { Input, isTouchDevice } from './input/input';
import { Sound } from './audio/sound';
import * as storage from './game/storage';
import { AIRCRAFT, DEG, MS_TO_FPM, MS_TO_KT, M_TO_FT } from './physics/params';
import type { AircraftId, AircraftParams } from './physics/params';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const canvas = $('scene') as unknown as HTMLCanvasElement;
const renderer = new Renderer(canvas);
const sound = new Sound();

let saveData = storage.load();
sound.muted = saveData.muted;

function selectedAircraft(): AircraftParams {
  const id = saveData.aircraft as AircraftId;
  return AIRCRAFT[id] ?? AIRCRAFT.c172;
}

let game: Game | null = null;
let paused = false;
let reportShown = false;
let reportTimer: ReturnType<typeof setTimeout> | null = null;

// ---------- UI helpers ----------

function show(id: string, on: boolean): void {
  $(id).hidden = !on;
}

function setMuteLabel(): void {
  $('btn-mute').textContent = sound.muted ? '🔇' : '🔊';
}

function buildAircraftRow(): void {
  const row = $('aircraft-row');
  row.innerHTML = '';
  for (const ac of Object.values(AIRCRAFT)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ac-btn' + (ac.id === selectedAircraft().id ? ' selected' : '');
    btn.id = `ac-${ac.id}`;
    btn.innerHTML = `<div class="ac-name">${ac.label}</div><div class="ac-blurb">${ac.blurb}</div>`;
    btn.addEventListener('click', () => {
      saveData.aircraft = ac.id;
      storage.save(saveData);
      buildAircraftRow();
      buildMenu();
    });
    row.appendChild(btn);
  }
}

function buildMenu(): void {
  saveData = storage.load();
  const list = $('level-list');
  list.innerHTML = '';
  const acId = selectedAircraft().id;
  const ids = LEVELS.map((l) => l.id);
  LEVELS.forEach((level, i) => {
    const unlocked = storage.isUnlocked(i, ids, acId, saveData);
    const best = saveData.bestScores[storage.scoreKey(level.id, acId)];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'level-btn';
    btn.id = `level-${level.id}`;
    btn.disabled = !unlocked;
    btn.innerHTML = `
      <span>
        <span class="lvl-name">${i + 1}. ${level.name}</span>
        <div class="lvl-brief">${unlocked ? level.brief : 'Locked — score 50+ on the previous level.'}</div>
      </span>
      <span class="lvl-best">${best != null ? `best ${best}` : unlocked ? 'not flown' : '🔒'}</span>`;
    if (unlocked) btn.addEventListener('click', () => startLevel(level));
    list.appendChild(btn);
  });
  ($('opt-invert') as HTMLInputElement).checked = saveData.invertPitch;
}

function openMenu(): void {
  buildAircraftRow();
  buildMenu();
  show('menu', true);
  show('report', false);
  show('hud', false);
  show('topbar', false);
  show('help', false);
  show('touch-ui', false);
  show('stall-warning', false);
  show('brake-pill', false);
  paused = true;
}

function startLevel(level: Level): void {
  game = new Game(level, selectedAircraft());
  paused = false;
  reportShown = false;
  if (reportTimer) {
    clearTimeout(reportTimer);
    reportTimer = null;
  }
  show('menu', false);
  show('report', false);
  show('hud', true);
  show('topbar', true);
  show('help', !isTouchDevice());
  show('touch-ui', isTouchDevice());
  $('hud-level').textContent = `${level.name} — ${selectedAircraft().label}`;
  show('hud-wind-row', level.wind.steady !== 0 || level.wind.gustAmplitude !== 0);
  show('aero-card', level.id === FREE_FLIGHT.id);
  location.hash = level.id;
}

function showReport(): void {
  if (!game?.report) return;
  const r = game.report;
  reportShown = true;

  $('report-tier').textContent = r.crashed ? '💥 Crashed' : `${tierEmoji(r.tier)} ${r.tier}`;
  $('report-score').textContent = r.crashed ? '0' : String(r.score);
  const crashEl = $('report-crash');
  crashEl.hidden = !r.crashed;
  crashEl.textContent = r.crashText ?? '';

  const table = $('report-parts');
  table.innerHTML = '';
  if (!r.crashed) {
    for (const part of r.parts) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${part.label}</td><td class="note">${part.note}</td><td class="pts">${part.points} / ${part.max}</td>`;
      table.appendChild(tr);
    }
  }

  const isChallenge = game.level.id !== FREE_FLIGHT.id;
  let bestNote = '';
  if (isChallenge && !r.crashed) {
    const key = storage.scoreKey(game.level.id, game.aircraft.id);
    const prevBest = storage.load().bestScores[key] ?? 0;
    saveData = storage.recordScore(game.level.id, game.aircraft.id, r.score);
    bestNote =
      r.score > prevBest
        ? `New best for ${game.level.name} (${game.aircraft.label})!`
        : `Best for ${game.level.name} (${game.aircraft.label}): ${saveData.bestScores[key]}`;
  }
  $('report-best').textContent = bestNote;

  // Next level button
  const idx = LEVELS.findIndex((l) => l.id === game!.level.id);
  const next = idx >= 0 ? LEVELS[idx + 1] : undefined;
  const passed = !r.crashed && r.score >= 50;
  const nextBtn = $('btn-next');
  nextBtn.hidden = !(next && passed);
  nextBtn.onclick = next ? () => startLevel(next) : null;

  show('report', true);
}

function tierEmoji(tier: string): string {
  switch (tier) {
    case 'Buttered': return '🧈';
    case 'Good': return '✅';
    case 'Firm': return '📉';
    default: return '🫠';
  }
}

// ---------- Input ----------

const input = new Input({
  onRestart: () => {
    if (game) startLevel(game.level);
  },
  onPause: () => openMenu(),
  onMute: () => {
    sound.setMuted(!sound.muted);
    saveData.muted = sound.muted;
    storage.save(saveData);
    setMuteLabel();
  },
  onAnyGesture: () => sound.ensureStarted(),
});
input.invertPitch = saveData.invertPitch;
input.bindTouchButtons();

$('btn-restart').addEventListener('click', () => game && startLevel(game.level));
$('btn-menu').addEventListener('click', openMenu);
$('btn-mute').addEventListener('click', () => {
  sound.ensureStarted();
  sound.setMuted(!sound.muted);
  saveData.muted = sound.muted;
  storage.save(saveData);
  setMuteLabel();
});
$('btn-retry').addEventListener('click', () => game && startLevel(game.level));
$('btn-levels').addEventListener('click', openMenu);
$('btn-free').addEventListener('click', () => startLevel(FREE_FLIGHT));
$('opt-invert').addEventListener('change', (e) => {
  const on = (e.target as HTMLInputElement).checked;
  input.invertPitch = on;
  saveData.invertPitch = on;
  storage.save(saveData);
});
addEventListener('pointerdown', () => sound.ensureStarted(), { once: false });

// Block touch scrolling/zooming everywhere except inside menu overlays.
document.addEventListener(
  'touchmove',
  (e) => {
    if (!(e.target as HTMLElement | null)?.closest('.overlay')) e.preventDefault();
  },
  { passive: false },
);

setMuteLabel();

// ---------- Main loop ----------

const STALL_WARN_FRACTION = 0.85;
let last = performance.now();

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (game && !paused) {
    const prevPhase = game.phase;
    const prevVy = game.state.vy;
    game.update(dt, input.sample());

    const d = game.derived;
    const s = game.state;

    // Sounds
    const nearStall =
      !!d &&
      !s.onGround &&
      Math.abs(d.alpha) > game.aircraft.alphaStall * STALL_WARN_FRACTION &&
      d.airspeed > 10;
    sound.update(s.throttle, game.level.engine, nearStall);
    if (d?.touchdown) {
      sound.thump(Math.min(1, d.touchdown.sinkRate / 4));
    }
    if (game.phase === 'done' && prevPhase !== 'done' && game.report?.crashed) {
      sound.crash();
    }

    // HUD
    if (d) {
      $('hud-speed').textContent = `${(d.airspeed * MS_TO_KT).toFixed(0)} kt`;
      $('hud-alt').textContent = `${((s.y - game.aircraft.gearHeight) * M_TO_FT).toFixed(0)} ft`;
      $('hud-vs').textContent = `${(s.vy * MS_TO_FPM).toFixed(0)} fpm`;
      $('hud-pitch').textContent = `${(s.theta / DEG).toFixed(1)}°`;
      $('hud-throttle').textContent = `${Math.round(s.throttle * 100)}%`;

      const wind = game.windNow();
      if (!$('hud-wind-row').hidden) {
        const kt = Math.abs(wind.wx) * MS_TO_KT;
        const dir = wind.wx < -0.2 ? 'head' : wind.wx > 0.2 ? 'tail' : '';
        $('hud-wind').textContent = `${kt.toFixed(0)} kt ${dir}`;
      }

      show('stall-warning', nearStall);
      show('brake-pill', input.sample().brakes && s.onGround);

      if (!$('aero-card').hidden) {
        $('aero-aoa').textContent = `${(d.alpha / DEG).toFixed(1)}°`;
        $('aero-clcd').textContent = `${d.CL.toFixed(2)} / ${d.CD.toFixed(3)}`;
        $('aero-lift').textContent = `${(d.lift / 1000).toFixed(1)} kN`;
        $('aero-drag').textContent = `${(d.drag / 1000).toFixed(1)} kN`;
        $('aero-thrust').textContent = `${(d.thrust / 1000).toFixed(2)} kN`;
      }
    }

    // Report card once the landing (or crash) is final — small delay so the
    // player sees the plane stop.
    if (game.phase === 'done' && !reportShown && !reportTimer) {
      reportTimer = setTimeout(() => {
        reportTimer = null;
        if (game?.phase === 'done' && !reportShown) showReport();
      }, 900);
      show('stall-warning', false);
    }

    renderer.draw(game, dt);
    void prevVy;
  } else if (game) {
    renderer.draw(game, 0);
  }

  requestAnimationFrame(frame);
}

// Boot: deep-link to a level via #hash (used by tests), else show the menu.
const hashLevel = levelById(location.hash.slice(1));
if (hashLevel) startLevel(hashLevel);
else openMenu();

// Level links also work without a reload.
addEventListener('hashchange', () => {
  const l = levelById(location.hash.slice(1));
  if (l && (!game || game.level.id !== l.id)) startLevel(l);
});

requestAnimationFrame(frame);

// Expose a tiny debug/test hook.
declare global {
  interface Window {
    __landy?: {
      game: () => Game | null;
      startLevel: (id: string) => void;
    };
  }
}
window.__landy = {
  game: () => game,
  startLevel: (id: string) => {
    const l = levelById(id);
    if (l) startLevel(l);
  },
};
