import type { Controls } from '../physics/aircraft';

export interface InputEvents {
  onRestart: () => void;
  onPause: () => void;
  onMute: () => void;
  onAnyGesture: () => void;
}

/** Aggregates keyboard + touch into a Controls sample per frame. */
export class Input {
  private keys = new Set<string>();
  private touch = { pitchUp: false, pitchDown: false, thrUp: false, thrDown: false, brakes: false };
  invertPitch = false;

  constructor(private events: InputEvents) {
    addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      this.events.onAnyGesture();
      if (e.code === 'KeyR') this.events.onRestart();
      if (e.code === 'Escape' || e.code === 'KeyP') this.events.onPause();
      if (e.code === 'KeyM') this.events.onMute();
      if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    // Don't let held keys stick when the tab loses focus.
    addEventListener('blur', () => this.keys.clear());
  }

  bindTouchButtons(): void {
    const bind = (id: string, flag: keyof Input['touch']) => {
      const el = document.getElementById(id);
      if (!el) return;
      const down = (e: Event) => {
        e.preventDefault();
        this.touch[flag] = true;
        el.classList.add('active');
        this.events.onAnyGesture();
      };
      const up = (e: Event) => {
        e.preventDefault();
        this.touch[flag] = false;
        el.classList.remove('active');
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    };
    bind('t-pitch-up', 'pitchUp');
    bind('t-pitch-down', 'pitchDown');
    bind('t-thr-up', 'thrUp');
    bind('t-thr-down', 'thrDown');
    bind('t-brakes', 'brakes');
  }

  sample(): Controls {
    let pitch = 0;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW') || this.touch.pitchUp) pitch += 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS') || this.touch.pitchDown) pitch -= 1;
    if (this.invertPitch) pitch = -pitch;

    let throttleDelta = 0;
    if (this.keys.has('Equal') || this.keys.has('NumpadAdd') || this.keys.has('KeyA') || this.touch.thrUp) throttleDelta += 1;
    if (this.keys.has('Minus') || this.keys.has('NumpadSubtract') || this.keys.has('KeyZ') || this.touch.thrDown) throttleDelta -= 1;

    const brakes = this.keys.has('KeyB') || this.touch.brakes;

    return { pitch, throttleDelta, brakes };
  }
}

export function isTouchDevice(): boolean {
  return matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
}
