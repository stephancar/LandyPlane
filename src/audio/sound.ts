/**
 * All sound is synthesized with Web Audio — no assets.
 * Engine hum follows throttle, stall beeper pulses, thump/crash on touchdown.
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private stallOsc: OscillatorNode | null = null;
  private stallGain: GainNode | null = null;
  private stallOn = false;
  muted = false;

  /** Must be called from a user gesture (browser autoplay policy). */
  ensureStarted(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);

    // Engine: sawtooth through a lowpass, pitch/gain track throttle.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 50;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(lp).connect(this.engineGain).connect(this.master);
    this.engineOsc.start();

    // Stall beeper: square wave gated on/off.
    this.stallOsc = this.ctx.createOscillator();
    this.stallOsc.type = 'square';
    this.stallOsc.frequency.value = 880;
    this.stallGain = this.ctx.createGain();
    this.stallGain.gain.value = 0;
    this.stallOsc.connect(this.stallGain).connect(this.master);
    this.stallOsc.start();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
    }
  }

  /** Call every frame. nearStall = above warning AoA threshold. */
  update(throttle: number, engineOn: boolean, nearStall: boolean): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.stallGain) return;
    const t = this.ctx.currentTime;
    const thr = engineOn ? throttle : 0;
    this.engineOsc.frequency.setTargetAtTime(45 + 85 * thr, t, 0.08);
    this.engineGain.gain.setTargetAtTime(thr > 0.01 ? 0.05 + 0.1 * thr : 0.015 * (engineOn ? 1 : 0), t, 0.1);

    if (nearStall && !this.stallOn) {
      this.stallOn = true;
      this.pulseStall();
    } else if (!nearStall) {
      this.stallOn = false;
      this.stallGain.gain.setTargetAtTime(0, t, 0.03);
    }
  }

  private pulseStall(): void {
    if (!this.ctx || !this.stallGain) return;
    if (!this.stallOn) return;
    const t = this.ctx.currentTime;
    this.stallGain.gain.setValueAtTime(0.06, t);
    this.stallGain.gain.setValueAtTime(0, t + 0.12);
    setTimeout(() => this.pulseStall(), 240);
  }

  thump(intensity: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.18);
    const g = this.ctx.createGain();
    const vol = Math.min(0.5, 0.1 + intensity * 0.4);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  crash(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const len = 0.8;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.4;
    src.connect(g).connect(this.master);
    src.start(t);
  }
}
