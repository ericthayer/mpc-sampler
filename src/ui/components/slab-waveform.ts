import { css, define, emit, h, sheet, SlabElement } from '../dom.js';
import { sharedStyles } from '../styles/shared.js';

const styles = sheet(css`
  :host {
    display: block;
    position: relative;
    min-block-size: 0;
    --_wave: var(--slab-screen-accent, #f5c542);
    --_dim: var(--slab-screen-dim, #7d8088);
    --_line: var(--slab-screen-line, #2a2d34);
    --_mark: var(--slab-screen-fg, #f1efe6);
  }
  canvas {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    touch-action: none;
    cursor: ew-resize;
  }
  :host(:not([editable])) canvas {
    cursor: default;
  }
`);

export interface RangeDetail {
  start: number;
  end: number;
}

/**
 * Canvas waveform with a highlighted region, slice markers and a draggable
 * start/end. Fires `slab-range` while the region is dragged.
 */
export class SlabWaveform extends SlabElement {
  #canvas: HTMLCanvasElement;
  #peaks: Float32Array | null = null;
  #start = 0;
  #end = 1;
  #markers: number[] = [];
  #drag: 'start' | 'end' | null = null;
  #observer: ResizeObserver;
  #frame = 0;
  #colors = { wave: '#f5c542', dim: '#7d8088', line: '#2a2d34', mark: '#f1efe6' };

  constructor() {
    super([sharedStyles, styles], false);
    this.#canvas = h('canvas', { role: 'img', 'aria-label': 'Waveform' });
    this.root.append(this.#canvas);
    this.#observer = new ResizeObserver(() => this.#schedule());

    this.#canvas.addEventListener('pointerdown', (event) => {
      if (!this.hasAttribute('editable')) return;
      const x = this.#fraction(event);
      this.#drag = Math.abs(x - this.#start) <= Math.abs(x - this.#end) ? 'start' : 'end';
      this.#canvas.setPointerCapture(event.pointerId);
      this.#move(x);
    });
    this.#canvas.addEventListener('pointermove', (event) => {
      if (this.#drag && this.#canvas.hasPointerCapture(event.pointerId)) this.#move(this.#fraction(event));
    });
    const end = (): void => {
      this.#drag = null;
    };
    this.#canvas.addEventListener('pointerup', end);
    this.#canvas.addEventListener('pointercancel', end);
  }

  connectedCallback(): void {
    const style = getComputedStyle(this);
    const read = (name: string, fallback: string): string => style.getPropertyValue(name).trim() || fallback;
    this.#colors = {
      wave: read('--_wave', this.#colors.wave),
      dim: read('--_dim', this.#colors.dim),
      line: read('--_line', this.#colors.line),
      mark: read('--_mark', this.#colors.mark),
    };
    this.#observer.observe(this);
    this.#schedule();
  }

  disconnectedCallback(): void {
    this.#observer.disconnect();
    cancelAnimationFrame(this.#frame);
  }

  /** Min/max pairs, as produced by `peaks()` in dsp.ts. */
  set peaks(value: Float32Array | null | undefined) {
    this.#peaks = value ?? null;
    this.#schedule();
  }

  setRange(start: number, end: number): void {
    if (start === this.#start && end === this.#end) return;
    this.#start = start;
    this.#end = end;
    this.#schedule();
  }

  set markers(value: number[]) {
    this.#markers = value;
    this.#schedule();
  }

  #fraction(event: PointerEvent): number {
    const rect = this.#canvas.getBoundingClientRect();
    return Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
  }

  #move(x: number): void {
    const gap = 0.002;
    if (this.#drag === 'start') this.#start = Math.min(x, this.#end - gap);
    else this.#end = Math.max(x, this.#start + gap);
    this.#schedule();
    emit<RangeDetail>(this, 'slab-range', { start: this.#start, end: this.#end });
  }

  #schedule(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.#draw());
  }

  #draw(): void {
    const canvas = this.#canvas;
    const ratio = Math.min(3, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { wave, dim, line, mark } = this.#colors;
    ctx.clearRect(0, 0, width, height);
    const mid = height / 2;

    ctx.fillStyle = line;
    ctx.fillRect(0, Math.round(mid), width, Math.max(1, ratio));

    const peaks = this.#peaks;
    if (peaks && peaks.length >= 2) {
      const buckets = peaks.length / 2;
      const x0 = this.#start * width;
      const x1 = this.#end * width;
      for (let x = 0; x < width; x++) {
        const from = Math.floor((x / width) * buckets);
        const to = Math.max(from + 1, Math.floor(((x + 1) / width) * buckets));
        let min = 1;
        let max = -1;
        for (let b = from; b < to && b < buckets; b++) {
          if (peaks[b * 2]! < min) min = peaks[b * 2]!;
          if (peaks[b * 2 + 1]! > max) max = peaks[b * 2 + 1]!;
        }
        if (min > max) continue;
        ctx.fillStyle = x >= x0 && x <= x1 ? wave : dim;
        const top = mid - max * mid * 0.92;
        const bottom = mid - min * mid * 0.92;
        ctx.fillRect(x, top, 1, Math.max(ratio, bottom - top));
      }
    }

    ctx.fillStyle = mark;
    ctx.globalAlpha = 0.55;
    for (const marker of this.#markers) ctx.fillRect(Math.round(marker * (width - 1)), 0, Math.max(1, ratio), height);
    ctx.globalAlpha = 1;

    if (this.hasAttribute('editable') || this.#start > 0 || this.#end < 1) {
      const flag = 5 * ratio;
      for (const [pos, direction] of [[this.#start, 1], [this.#end, -1]] as const) {
        const x = Math.round(pos * (width - 1));
        ctx.fillRect(x, 0, Math.max(1, ratio), height);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + flag * direction, 0);
        ctx.lineTo(x, flag);
        ctx.fill();
      }
    }
  }
}

define('slab-waveform', SlabWaveform);
