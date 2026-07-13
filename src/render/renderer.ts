import type { Game } from '../game/game';
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
    const s = game.state;
    const d = game.derived;
    const gearHeight = game.aircraft.gearHeight;
    const crashed = (game.phase === 'done' && game.report?.crashed) ?? false;

    // Self-heal if the canvas was sized while the window had no dimensions.
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    if (this.canvas.width !== Math.floor(w * dpr) || this.canvas.height !== Math.floor(h * dpr)) {
      this.resize();
    }

    if (crashed) this.crashT += dt;
    else this.crashT = 0;

    const alt = Math.max(0, s.y - gearHeight);
    // Zoom out as the plane climbs (faster aircraft see a bit more world).
    const zoomRef = 150 * Math.max(1, game.aircraft.approachSpeed / 33);
    const scale = clamp(6 / (1 + alt / zoomRef), 2.2, 6);

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

    this.drawScenery(gY, camX, cx, scale, sx, w, game);
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

    this.drawPlane(cx, cy, game, crashed);

    if (crashed) this.drawCrashFx(cx, cy);

    this.drawRunwayPointer(game, sx, w, h);

    // Stall red vignette
    if (d?.stalled && !s.onGround) {
      ctx.fillStyle = 'rgba(255,80,80,.08)';
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ---------- Aircraft art ----------

  private drawPlane(cx: number, cy: number, game: Game, crashed: boolean): void {
    const ctx = this.ctx;
    const s = game.state;
    const stalled = (game.derived?.stalled ?? false) && !s.onGround;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-s.theta + (crashed ? 0.35 : 0));

    switch (game.aircraft.id) {
      case 'cub':
        ctx.scale(0.62, 0.62);
        this.drawCub(s.throttle, s.onGround, stalled, crashed, game.level.engine);
        break;
      case 'f16':
        ctx.scale(0.95, 0.95);
        this.drawF16(s.throttle, s.onGround, stalled, crashed);
        break;
      default:
        ctx.scale(0.75, 0.75);
        this.drawCessna(s.throttle, s.onGround, stalled, crashed, game.level.engine);
    }

    ctx.restore();
  }

  private body(stalled: boolean, crashed: boolean, livery: string): string {
    if (crashed) return '#84848a';
    if (stalled) return '#ff8a8a';
    return livery;
  }

  private drawCessna(throttle: number, onGround: boolean, stalled: boolean, crashed: boolean, engine: boolean): void {
    const ctx = this.ctx;
    const bodyC = this.body(stalled, crashed, '#fafafc');
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(20,25,35,.45)';

    // Fuselage
    ctx.fillStyle = bodyC;
    ctx.beginPath();
    ctx.moveTo(50, -2);
    ctx.quadraticCurveTo(44, -8, 32, -9); // cowl top
    ctx.lineTo(24, -9);
    ctx.lineTo(14, -17); // windshield
    ctx.lineTo(-4, -17); // cabin roof
    ctx.quadraticCurveTo(-26, -12, -40, -5); // tail boom top
    ctx.lineTo(-46, -4);
    ctx.lineTo(-46, 2);
    ctx.quadraticCurveTo(-16, 8, 6, 9); // belly rear
    ctx.lineTo(30, 9);
    ctx.quadraticCurveTo(46, 7, 50, 3); // cowl bottom
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Red accent stripe
    ctx.fillStyle = crashed ? '#5c5c60' : '#c94040';
    ctx.beginPath();
    ctx.moveTo(46, 3);
    ctx.quadraticCurveTo(10, 7, -44, 1);
    ctx.lineTo(-44, -2);
    ctx.quadraticCurveTo(10, 4, 46, 0);
    ctx.closePath();
    ctx.fill();

    // Fin + rudder
    ctx.fillStyle = bodyC;
    ctx.beginPath();
    ctx.moveTo(-34, -5);
    ctx.lineTo(-44, -26);
    ctx.lineTo(-51, -26);
    ctx.lineTo(-49, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = crashed ? '#5c5c60' : '#c94040';
    ctx.fillRect(-51, -26, 3, 22);
    // Horizontal stab
    ctx.fillStyle = bodyC;
    this.roundRect(-54, -2, 18, 4, 2);
    ctx.fill();
    ctx.stroke();

    // Windows
    ctx.fillStyle = 'rgba(70,105,140,.85)';
    ctx.beginPath();
    ctx.moveTo(22, -9);
    ctx.lineTo(13, -16);
    ctx.lineTo(6, -16);
    ctx.lineTo(6, -9);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(0, -16, -10 - -4 + 4, 7); // rear side window (x -4..0 wide-ish)
    ctx.fillRect(-3, -16, 7, 7);

    // Wing on top (high wing)
    ctx.fillStyle = bodyC;
    this.roundRect(-14, -24, 52, 7, 4);
    ctx.fill();
    ctx.stroke();
    // Strut
    ctx.strokeStyle = 'rgba(20,25,35,.6)';
    ctx.beginPath();
    ctx.moveTo(8, 8);
    ctx.lineTo(22, -17);
    ctx.stroke();

    // Gear with wheel pants
    const gearC = onGround ? '#fafafc' : 'rgba(250,250,252,.6)';
    ctx.strokeStyle = 'rgba(20,25,35,.5)';
    ctx.fillStyle = gearC;
    ctx.beginPath();
    ctx.moveTo(2, 8);
    ctx.lineTo(-2, 19);
    ctx.moveTo(38, 7);
    ctx.lineTo(38, 17);
    ctx.stroke();
    this.tire(-2, 21, 5);
    this.tire(38, 19, 4);

    // Spinner + prop
    ctx.fillStyle = crashed ? '#5c5c60' : '#c94040';
    ctx.beginPath();
    ctx.moveTo(50, -3);
    ctx.quadraticCurveTo(57, 0, 50, 4);
    ctx.closePath();
    ctx.fill();
    if (engine && !crashed) {
      ctx.globalAlpha = 0.35 + 0.6 * throttle;
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(54, 0, 9 + 13 * throttle, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  private drawCub(throttle: number, onGround: boolean, stalled: boolean, crashed: boolean, engine: boolean): void {
    const ctx = this.ctx;
    const bodyC = this.body(stalled, crashed, '#f4c430');
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(60,45,10,.5)';

    // Fuselage: stubby, rounded cowl, boxy cabin
    ctx.fillStyle = bodyC;
    ctx.beginPath();
    ctx.moveTo(46, -4);
    ctx.quadraticCurveTo(48, 0, 46, 6);
    ctx.lineTo(28, 10);
    ctx.quadraticCurveTo(-8, 12, -40, 5);
    ctx.lineTo(-48, 3);
    ctx.lineTo(-48, -3);
    ctx.quadraticCurveTo(-20, -8, 0, -16); // rising back
    ctx.lineTo(16, -16);
    ctx.lineTo(26, -10);
    ctx.quadraticCurveTo(40, -8, 46, -4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Fin + rudder (rounded cub tail)
    ctx.beginPath();
    ctx.moveTo(-32, -4);
    ctx.quadraticCurveTo(-40, -22, -50, -22);
    ctx.quadraticCurveTo(-54, -14, -50, -3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Horizontal stab
    this.roundRect(-54, -1, 20, 4, 2);
    ctx.fill();
    ctx.stroke();

    // Windows: big greenhouse
    ctx.fillStyle = 'rgba(80,115,150,.85)';
    ctx.beginPath();
    ctx.moveTo(24, -10);
    ctx.lineTo(15, -15);
    ctx.lineTo(-6, -14);
    ctx.lineTo(-10, -8);
    ctx.lineTo(24, -8);
    ctx.closePath();
    ctx.fill();

    // High wing
    ctx.fillStyle = bodyC;
    this.roundRect(-18, -24, 58, 7, 3);
    ctx.fill();
    ctx.stroke();
    // Double lift struts
    ctx.strokeStyle = 'rgba(60,45,10,.6)';
    ctx.beginPath();
    ctx.moveTo(6, 10);
    ctx.lineTo(20, -17);
    ctx.moveTo(6, 10);
    ctx.lineTo(8, -17);
    ctx.stroke();

    // Taildragger gear: fat tundra tires forward, tailwheel aft
    ctx.strokeStyle = 'rgba(40,30,10,.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(16, 10);
    ctx.lineTo(12, 20);
    ctx.moveTo(24, 10);
    ctx.lineTo(14, 20);
    ctx.stroke();
    this.tire(12, 24, 8);
    this.tire(-46, 6, 3);

    // Prop
    if (engine && !crashed) {
      ctx.globalAlpha = 0.35 + 0.6 * throttle;
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(50, 0, 11 + 14 * throttle, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    void onGround;
  }

  private drawF16(throttle: number, onGround: boolean, stalled: boolean, crashed: boolean): void {
    const ctx = this.ctx;
    const bodyC = this.body(stalled, crashed, '#9aa2ad');
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(25,30,40,.5)';

    // Afterburner / exhaust glow
    if (!crashed && throttle > 0.05) {
      const ab = throttle > 0.85;
      const len = ab ? 22 + 8 * Math.random() : 6 + 8 * throttle;
      ctx.globalAlpha = ab ? 0.9 : 0.4 + 0.3 * throttle;
      ctx.fillStyle = ab ? '#ff9c3f' : '#ffc98a';
      ctx.beginPath();
      ctx.moveTo(-52, -3);
      ctx.lineTo(-52 - len, 0);
      ctx.lineTo(-52, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Fuselage
    ctx.fillStyle = bodyC;
    ctx.beginPath();
    ctx.moveTo(62, 0); // needle nose
    ctx.quadraticCurveTo(45, -5, 30, -6);
    ctx.lineTo(20, -6);
    // canopy bubble
    ctx.quadraticCurveTo(14, -15, 2, -15);
    ctx.quadraticCurveTo(-6, -15, -10, -7);
    // spine to tail
    ctx.lineTo(-46, -6);
    ctx.lineTo(-52, -4);
    ctx.lineTo(-52, 4);
    ctx.lineTo(-30, 7);
    // ventral intake
    ctx.lineTo(4, 7);
    ctx.lineTo(10, 11);
    ctx.lineTo(26, 11);
    ctx.lineTo(30, 7);
    ctx.quadraticCurveTo(50, 4, 62, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Canopy tint
    ctx.fillStyle = 'rgba(70,110,150,.8)';
    ctx.beginPath();
    ctx.moveTo(19, -6);
    ctx.quadraticCurveTo(14, -14, 2, -14);
    ctx.quadraticCurveTo(-4, -14, -8, -7);
    ctx.closePath();
    ctx.fill();

    // Vertical tail (big, swept)
    ctx.fillStyle = bodyC;
    ctx.beginPath();
    ctx.moveTo(-26, -6);
    ctx.lineTo(-36, -32);
    ctx.lineTo(-44, -32);
    ctx.lineTo(-46, -6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Tail flash
    ctx.fillStyle = crashed ? '#5c5c60' : '#c94040';
    ctx.fillRect(-43.5, -32, 7, 5);

    // Wing (side-view strake line)
    ctx.fillStyle = crashed ? '#6e6e73' : '#7f8792';
    ctx.beginPath();
    ctx.moveTo(16, -3);
    ctx.lineTo(-24, -1);
    ctx.lineTo(-24, 3);
    ctx.lineTo(20, 0);
    ctx.closePath();
    ctx.fill();
    // Horizontal stab
    ctx.beginPath();
    ctx.moveTo(-34, 1);
    ctx.lineTo(-52, 4);
    ctx.lineTo(-52, 7);
    ctx.lineTo(-32, 4);
    ctx.closePath();
    ctx.fill();

    // Nozzle
    ctx.fillStyle = '#4d5259';
    this.roundRect(-56, -4, 6, 8, 2);
    ctx.fill();
    ctx.stroke();

    // Gear
    const gearA = onGround ? 1 : 0.55;
    ctx.globalAlpha = gearA;
    ctx.strokeStyle = 'rgba(25,30,40,.6)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(30, 8);
    ctx.lineTo(28, 20);
    ctx.moveTo(-4, 9);
    ctx.lineTo(-6, 22);
    ctx.stroke();
    ctx.fillStyle = '#2c2f34';
    this.tire(28, 22, 4);
    this.tire(-6, 24, 5);
    ctx.globalAlpha = 1;
  }

  private tire(x: number, y: number, r: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#2c2f34';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9ccd2';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.2, r * 0.35), 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- Scenery ----------

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
    game: Game,
  ): void {
    if (gY > innerHeight + 300) return;
    const leftWorld = camX - cx / scale - 200;
    const rightWorld = camX + (w - cx) / scale + 200;
    const clearL = game.runway.startX - 120;
    const clearR = game.runway.startX + game.runway.length + 200;
    const stepM = 120;
    const start = Math.floor(leftWorld / stepM) * stepM;
    for (let wx = start; wx <= rightWorld; wx += stepM) {
      if (wx > clearL && wx < clearR) continue;
      const x1 = sx(wx) + Math.sin(wx * 0.07) * 18;
      this.drawTree(x1 - 30, gY, ((1 + 0.15 * Math.sin(wx * 0.02)) * scale) / 6);
      this.drawTree(x1 + 10, gY, ((0.9 + 0.1 * Math.cos(wx * 0.025)) * scale) / 6);
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
    const rw = game.runway;
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

  private drawCrashFx(cx: number, cy: number): void {
    const ctx = this.ctx;
    const t = this.crashT;
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
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 30);
    ctx.fillStyle = 'rgba(255,140,50,.85)';
    ctx.beginPath();
    ctx.arc(cx + 26, cy + 2, 7 + 2 * Math.sin(t * 21), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawRunwayPointer(game: Game, sx: (wx: number) => number, w: number, h: number): void {
    const ctx = this.ctx;
    const rw = game.runway;
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
