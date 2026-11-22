import { css, define, emit, h, sheet, SlabElement } from '../dom.js';
import { sharedStyles } from '../styles/shared.js';

const styles = sheet(css`
  :host {
    display: grid;
    justify-items: center;
    gap: calc(var(--_u) * 0.6);
    min-inline-size: 0;
    --_size: var(--slab-knob-size, calc(var(--_u) * 9));
    --_cap: var(--slab-knob-cap, #f4f2ea);
    --_ring: var(--slab-knob-ring, #d9d5c8);
    --_mark: var(--slab-knob-mark, #2a2a2c);
  }
  .knob {
    position: relative;
    inline-size: var(--_size);
    block-size: var(--_size);
    border-radius: 50%;
    background: radial-gradient(circle at 50% 30%, color-mix(in srgb, var(--_ring) 80%, white), var(--_ring) 70%);
    box-shadow:
      inset 0 0 0 calc(var(--_size) * 0.02) rgb(0 0 0 / 0.12),
      0 calc(var(--_size) * 0.05) calc(var(--_size) * 0.1) rgb(0 0 0 / 0.3);
    cursor: grab;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .knob.dragging { cursor: grabbing; }
  .cap {
    position: absolute;
    inset: 16%;
    border-radius: 50%;
    background: linear-gradient(160deg, color-mix(in srgb, var(--_cap) 92%, white), color-mix(in srgb, var(--_cap) 84%, black));
    box-shadow:
      0 calc(var(--_size) * 0.04) calc(var(--_size) * 0.08) rgb(0 0 0 / 0.35),
      inset 0 0 0 calc(var(--_size) * 0.012) rgb(0 0 0 / 0.1);
    rotate: var(--_angle, -135deg);
  }
  .cap::after {
    content: '';
    position: absolute;
    inset: 6% 46% 56%;
    border-radius: 99px;
    background: var(--_mark);
  }
  /* The data wheel has a finger dimple instead of a pointer line. */
  :host([endless]) .cap::after {
    inset: 12% 38% 64%;
    border-radius: 50%;
    background: color-mix(in srgb, var(--_cap) 80%, black);
    box-shadow: inset 0 calc(var(--_size) * 0.015) calc(var(--_size) * 0.03) rgb(0 0 0 / 0.3);
  }
  .caption {
    font-size: max(0.5625rem, calc(var(--_u) * 1.35));
    color: var(--slab-knob-ink, var(--slab-ink, #2a2a2c));
    text-align: center;
    white-space: nowrap;
  }
  :host([focused]) .knob {
    box-shadow:
      0 0 0 calc(var(--_size) * 0.035) var(--slab-led-amber, #ffb02e),
      0 calc(var(--_size) * 0.05) calc(var(--_size) * 0.1) rgb(0 0 0 / 0.3);
  }
`);

export interface KnobInputDetail {
  /** Normalised 0..1. */
  value: number;
}
export interface KnobTurnDetail {
  /** Signed number of detents. */
  delta: number;
  fine: boolean;
}

const SWEEP = 270;
const DRAG_RANGE = 180; // px of travel for the full range
const DETENT_PX = 9;

/**
 * Rotary control exposed as an ARIA slider.
 *
 * Default: absolute knob, `value` 0..1, fires `slab-input`.
 * With `endless`: a data wheel that fires `slab-turn` with detent deltas.
 *
 * Drag up/down, scroll, or use arrow keys (Shift = fine). Double-click fires `slab-reset`.
 */
export class SlabKnob extends SlabElement {
  static observedAttributes = ['label', 'value-text'];
  #knob: HTMLDivElement;
  #caption: HTMLSpanElement;
  #value = 0;
  #spin = 0;
  #dragY = 0;
  #dragValue = 0;
  #accum = 0;

  constructor() {
    super([sharedStyles, styles]);
    this.#knob = h('div', { class: 'knob', role: 'slider', tabIndex: 0, 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('div', { class: 'cap' }));
    this.#caption = h('span', { class: 'caption label', 'aria-hidden': 'true' });
    this.root.append(this.#knob, this.#caption);

    this.#knob.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      this.#knob.focus({ preventScroll: true });
      this.#knob.setPointerCapture(event.pointerId);
      this.#knob.classList.add('dragging');
      this.#dragY = event.clientY;
      this.#dragValue = this.#value;
      this.#accum = 0;
      emit(this, 'slab-touch', null);
    });
    this.#knob.addEventListener('pointermove', (event) => {
      if (!this.#knob.hasPointerCapture(event.pointerId)) return;
      const dy = this.#dragY - event.clientY;
      if (this.endless) {
        this.#accum += dy;
        this.#dragY = event.clientY;
        const steps = Math.trunc(this.#accum / DETENT_PX);
        if (steps !== 0) {
          this.#accum -= steps * DETENT_PX;
          this.#turn(steps, event.shiftKey);
        }
      } else {
        const range = event.shiftKey ? DRAG_RANGE * 4 : DRAG_RANGE;
        this.#commit(this.#dragValue + dy / range);
      }
    });
    const end = (): void => this.#knob.classList.remove('dragging');
    this.#knob.addEventListener('pointerup', end);
    this.#knob.addEventListener('pointercancel', end);
    this.#knob.addEventListener('dblclick', () => emit(this, 'slab-reset', null));

    this.#knob.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        const direction = event.deltaY < 0 ? 1 : -1;
        if (this.endless) this.#turn(direction, event.shiftKey);
        else this.#commit(this.#value + direction * (event.shiftKey ? 0.005 : 0.02));
        emit(this, 'slab-touch', null);
      },
      { passive: false },
    );

    this.#knob.addEventListener('keydown', (event) => {
      const fine = event.shiftKey;
      let direction = 0;
      if (event.key === 'ArrowUp' || event.key === 'ArrowRight') direction = 1;
      else if (event.key === 'ArrowDown' || event.key === 'ArrowLeft') direction = -1;
      else if (event.key === 'PageUp') direction = 5;
      else if (event.key === 'PageDown') direction = -5;
      else if (event.key === 'Home' && !this.endless) return this.#key(event, () => this.#commit(0));
      else if (event.key === 'End' && !this.endless) return this.#key(event, () => this.#commit(1));
      else return;
      this.#key(event, () => {
        if (this.endless) this.#turn(direction, fine);
        else this.#commit(this.#value + direction * (fine ? 0.004 : 0.02));
      });
    });
  }

  #key(event: KeyboardEvent, action: () => void): void {
    event.preventDefault();
    event.stopPropagation();
    emit(this, 'slab-touch', null);
    action();
  }

  get endless(): boolean {
    return this.hasAttribute('endless');
  }

  get value(): number {
    return this.#value;
  }

  /** Set the position without firing an event. */
  set value(next: number) {
    this.#value = Math.max(0, Math.min(1, Number.isFinite(next) ? next : 0));
    if (!this.endless) this.#paint();
  }

  attributeChangedCallback(name: string): void {
    if (name === 'label') {
      const label = this.getAttribute('label') ?? '';
      this.#caption.textContent = label.split(':')[0] ?? label;
      this.#knob.setAttribute('aria-label', label);
    }
    if (name === 'value-text') this.#knob.setAttribute('aria-valuetext', this.getAttribute('value-text') ?? '');
  }

  #commit(next: number): void {
    const clamped = Math.max(0, Math.min(1, next));
    if (clamped === this.#value) return;
    this.#value = clamped;
    this.#paint();
    emit<KnobInputDetail>(this, 'slab-input', { value: clamped });
  }

  #turn(delta: number, fine: boolean): void {
    this.#spin += delta * 14;
    this.#knob.style.setProperty('--_angle', `${this.#spin}deg`);
    emit<KnobTurnDetail>(this, 'slab-turn', { delta, fine });
  }

  #paint(): void {
    this.#knob.style.setProperty('--_angle', `${-SWEEP / 2 + this.#value * SWEEP}deg`);
    this.#knob.setAttribute('aria-valuenow', String(Math.round(this.#value * 100)));
  }

  connectedCallback(): void {
    if (this.endless) {
      // An endless encoder has no range: expose it as a spinbutton, not a slider.
      this.#knob.setAttribute('role', 'spinbutton');
      this.#knob.removeAttribute('aria-valuemin');
      this.#knob.removeAttribute('aria-valuemax');
    } else this.#paint();
  }
}

define('slab-knob', SlabKnob);
