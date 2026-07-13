import type { Game } from '../game/game';
import { C172 } from '../physics/params';
import { clamp } from '../physics/aero';
import { mulberry32 } from '../physics/wind';

interface Cloud {
  x: number;
  y: number;
  s: number;
  a: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private clouds: Cloud[] = [];
  private crashT = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    const rnd = mulberry32(1337);
    for (let i = 0; i < 16; i++) {
      this.clouds.push({
        x: rnd() * 3000 - 1000,
        y: rnd() * 260 + 30,
        s: rnd() * 0.9 + 0.6,
        a: rnd() * 0.25 + 0.1,
      });
    }
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize(): void {
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    this.canvas.width = Math.floor(innerWidth * dpr);
    this.canvas.height = Math.floor(innerHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  draw(game: Game, dt: number): void {
    const ctx = this.ctx;
    const w = innerWidth;
    const h = innerHeight;

    // Self-heal if the canvas was sized while the window had no dimensions
    // (e.g. the tab loaded in a hidden/zero-size pane).
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    if (this.canvas.width !== Math.floor(w * dpr) || this.canvas.height !== Math.floor(h * dpr)) {
      this.resize();
    }
    const s = game.state;
    const d = game.derived;
    const crashed = game.phase === 'done' && game.report?.crashed;

    if (crashed) this.crashT += dt;
    else this.crashT = 0;

    const alt = Math.max(0, s.y - C172.gearHeight);
    // Zoom out as the plane climbs.
    const scale = clamp(6 / (1 + alt / 150), 2.2, 6);

    let cx = w * 0.38;
    let cy = h * 0.55;

    // Stall buffet shake
    if (d?.stalled && !s.onGround && !crashed) {
      cx += (Math.random() - 0.5) * 5;
      cy += (Math.random() - 0.5) * 5;
    }

    const camX = s.x;
    const camY = s.y;
    const sx = (wx: number) => cx + (wx - camX) * scale;
    const sy = (wy: number) => cy + (camY - wy) * scale;

    // Sky
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#8fd0ff');
    grd.addColorStop(0.55, '#bfe7ff');
    grd.addColorStop(1, '#d9f2ff');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);

    this.drawClouds(camX, w);

    const gY = sy(0); // world ground plane at y=0

    this.drawHills(gY, camX, cx, scale, w);

    // Ground
    if (gY < h) {
      ctx.fillStyle = '#3a5c34';
      ctx.fillRect(0, gY, w, h - gY);
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.fillRect(0, gY, w, Math.min(6, h - gY));
    }

    this.drawScenery(gY, camX, cx, scale, sx, w);
    this.drawRunway(game, gY, sx, scale, w);

    // Flight path vector
    if (d && !s.onGround && !crashed) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = 'rgba(0,0,0,.3)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(d.gamma) * 70, cy - Math.sin(d.gamma) * 70);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    this.drawPlane(cx, cy, game, crashed ?? false);

    if (crashed) this.drawCrashFx(cx, cy);

    // Off-screen runway pointer
    this.drawRunwayPointer(game, sx, w, h);

    // Stall red vignette
    if (d?.stalled && !s.onGround) {
      ctx.fillStyle = 'rgba(255,80,80,.08)';
      ctx.fillRect(0, 0, w, h);
    }
  }

  private drawClouds(camX: number, w: number): void {
    const ctx = this.ctx;
    const par = 0.15;
    for (const c of this.clouds) {
      const raw = (c.x - camX * par) % (w + 600);
      const px = raw < -300 ? raw + w + 600 : raw;
      ctx.globalAlpha = c.a;
      ctx.fillStyle = '#ffffff';
      this.blob(px, c.y, 70 * c.s, 28 * c.s);
      this.blob(px + 50 * c.s, c.y + 10 * c.s, 64 * c.s, 24 * c.s);
      this.blob(px - 55 * c.s, c.y + 12 * c.s, 58 * c.s, 22 * c.s);
      ctx.globalAlpha = 1;
    }
  }

  private blob(x: number, y: number, rx: number, ry: number): void {
    this.ctx.beginPath();
    this.ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private drawHills(gY: number, camX: number, cx: number, scale: number, w: number): void {
    const ctx = this.ctx;
    if (gY > innerHeight + 200) return;
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = '#4a7a58';
    ctx.beginPath();
    ctx.moveTo(0, gY);
    for (let i = 0; i <= w; i += 24) {
      const wx = camX - (cx - i) / scale;
      const bump = 26 * Math.sin(wx * 0.008) + 14 * Math.sin(wx * 0.021 + 1.7);
      ctx.lineTo(i, gY - 40 - (bump + 40) * 1.4);
    }
    ctx.lineTo(w, gY);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawScenery(
    gY: number,
    camX: number,
    cx: number,
    scale: number,
    sx: (wx: number) => number,
    w: number,
  ): void {
    if (gY > innerHeight + 300) return;
    const leftWorld = camX - cx / scale - 200;
    const rightWorld = camX + (w - cx) / scale + 200;
    const stepM = 120;
    const start = Math.floor(leftWorld / stepM) * stepM;
    for (let wx = start; wx <= rightWorld; wx += stepM) {
      // keep the runway clear
      if (wx > -80 && wx < 1100) continue;
      const x1 = sx(wx) + Math.sin(wx * 0.07) * 18;
      this.drawTree(x1 - 30, gY, (1 + 0.15 * Math.sin(wx * 0.02)) * scale / 6);
      this.drawTree(x1 + 10, gY, (0.9 + 0.1 * Math.cos(wx * 0.025)) * scale / 6);
      if (Math.floor(wx / stepM) % 3 === 0) this.drawHouse(x1 + 55, gY, scale / 6);
    }
  }

  private drawTree(x: number, y: number, s: number): void {
    const ctx = this.ctx;
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(30,38,28,.9)';
    ctx.fillRect(x - 3 * s, y - 18 * s, 6 * s, 18 * s);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(22,60,36,.95)';
    ctx.beginPath();
    ctx.arc(x, y - 28 * s, 14 * s, 0, Math.PI * 2);
    ctx.arc(x - 12 * s, y - 22 * s, 12 * s, 0, Math.PI * 2);
    ctx.arc(x + 12 * s, y - 22 * s, 12 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawHouse(x: number, y: number, s: number): void {
    const ctx = this.ctx;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(60,60,75,.9)';
    ctx.fillRect(x, y - 22 * s, 34 * s, 22 * s);
    ctx.fillStyle = 'rgba(90,45,45,.9)';
    ctx.beginPath();
    ctx.moveTo(x - 2 * s, y - 22 * s);
    ctx.lineTo(x + 17 * s, y - 36 * s);
    ctx.lineTo(x + 36 * s, y - 22 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(220,240,255,.7)';
    ctx.fillRect(x + 20 * s, y - 14 * s, 8 * s, 7 * s);
    ctx.globalAlpha = 1;
  }

  private drawRunway(game: Game, gY: number, sx: (wx: number) => number, scale: number, w: number): void {
    const ctx = this.ctx;
    if (gY > innerHeight + 100) return;
    const rw = game.level.runway;
    const x0 = sx(rw.startX);
    const x1 = sx(rw.startX + rw.length);
    if (x1 < -50 || x0 > w + 50) return;

    const hpx = Math.max(6, 3 * scale);

    // pavement
    ctx.fillStyle = '#3d434f';
    ctx.fillRect(x0, gY - hpx, x1 - x0, hpx);

    // touchdown zone shading
    const tz1 = sx(rw.startX + rw.touchdownZone);
    ctx.fillStyle = 'rgba(120,220,140,.25)';
    ctx.fillRect(x0, gY - hpx, tz1 - x0, hpx);

    // threshold + end bars
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillRect(x0, gY - hpx, Math.max(3, scale), hpx);
    ctx.fillRect(x1 - Math.max(3, scale), gY - hpx, Math.max(3, scale), hpx);

    // centerline dashes (30 m dash / 20 m gap)
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    for (let wx = rw.startX + 20; wx < rw.startX + rw.length - 20; wx += 50) {
      const a = sx(wx);
      const b = sx(Math.min(wx + 30, rw.startX + rw.length - 10));
      ctx.fillRect(a, gY - hpx * 0.55, b - a, Math.max(1.5, hpx * 0.12));
    }

    // aiming chevrons at the touchdown zone
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    for (const off of [rw.touchdownZone * 0.35, rw.touchdownZone * 0.55]) {
      const px = sx(rw.startX + off);
      ctx.fillRect(px, gY - hpx * 0.9, Math.max(4, scale * 2.5), Math.max(2, hpx * 0.22));
    }
  }

  private drawPlane(cx: number, cy: number, game: Game, crashed: boolean): void {
    const ctx = this.ctx;
    const s = game.state;
    const d = game.derived;
    const k = 0.72; // plane sprite scale

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-s.theta + (crashed ? 0.35 : 0));
    ctx.scale(k, k);

    // fuselage
    ctx.fillStyle = crashed
      ? 'rgba(120,120,125,.95)'
      : d?.stalled && !s.onGround
        ? 'rgba(255,120,120,.95)'
        : 'rgba(250,250,252,.97)';
    ctx.strokeStyle = 'rgba(0,0,0,.3)';
    ctx.lineWidth = 2;
    this.roundRect(-40, -7, 90, 14, 8);
    ctx.fill();
    ctx.stroke();

    // wing, tail
    ctx.fillStyle = 'rgba(255,255,255,.75)';
    this.roundRect(-10, -22, 55, 10, 6);
    ctx.fill();
    this.roundRect(-45, -4, 18, 8, 4);
    ctx.fill();
    this.roundRect(-42, -18, 8, 16, 4);
    ctx.fill();

    // gear
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.fillStyle = s.onGround ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.55)';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(5, 6);
    ctx.lineTo(0, 18);
    ctx.moveTo(28, 6);
    ctx.lineTo(25, 18);
    ctx.moveTo(46, 5);
    ctx.lineTo(46, 15);
    ctx.stroke();
    ctx.globalAlpha = 1;
    this.wheel(-2, 20, 5);
    this.wheel(23, 20, 5);
    this.wheel(46, 18, 4);

    // prop disc
    if (game.level.engine && !crashed) {
      ctx.globalAlpha = 0.45 + 0.55 * s.throttle;
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(50, 0, 10 + 12 * s.throttle, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  private drawCrashFx(cx: number, cy: number): void {
    const ctx = this.ctx;
    const t = this.crashT;
    // smoke puffs
    for (let i = 0; i < 7; i++) {
      const age = (t * 0.9 + i * 0.35) % 2.4;
      const r = 6 + age * 16;
      const x = cx + 10 + Math.sin(i * 2.2) * 14;
      const y = cy - 8 - age * 42;
      ctx.globalAlpha = clamp(0.55 - age * 0.22, 0, 0.55);
      ctx.fillStyle = i % 2 ? 'rgba(70,70,75,1)' : 'rgba(110,110,115,1)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // flicker of flame
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 30);
    ctx.fillStyle = 'rgba(255,140,50,.85)';
    ctx.beginPath();
    ctx.arc(cx + 26, cy + 2, 7 + 2 * Math.sin(t * 21), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawRunwayPointer(game: Game, sx: (wx: number) => number, w: number, h: number): void {
    const ctx = this.ctx;
    const rw = game.level.runway;
    // No pointer while any part of the runway is on screen.
    if (sx(rw.startX) < w && sx(rw.startX + rw.length) > 0) return;

    const mid = rw.startX + rw.length / 2;
    const px = sx(mid);
    const dist = Math.abs(game.state.x - mid);
    const left = px < 0;
    const x = left ? 28 : w - 28;
    const y = h * 0.42;

    ctx.fillStyle = 'rgba(0,0,0,.45)';
    this.roundRect(x - 26, y - 16, 52, 44, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    if (left) {
      ctx.moveTo(x - 12, y);
      ctx.lineTo(x + 8, y - 9);
      ctx.lineTo(x + 8, y + 9);
    } else {
      ctx.moveTo(x + 12, y);
      ctx.lineTo(x - 8, y - 9);
      ctx.lineTo(x - 8, y + 9);
    }
    ctx.closePath();
    ctx.fill();
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${(dist / 1000).toFixed(1)} km`, x, y + 22);
  }

  private wheel(x: number, y: number, r: number): void {
    this.ctx.beginPath();
    this.ctx.arc(x, y, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.stroke();
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    const ctx = this.ctx;
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
}
