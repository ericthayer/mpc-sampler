import { css, define, emit, h, sheet, SlabElement } from '../dom.js';
import { sharedStyles } from '../styles/shared.js';

const styles = sheet(css`
  :host {
    display: block;
    aspect-ratio: 1;
    --_glow: var(--slab-led-blue, #4f7dff);
    --_lit: 0.16;
  }
  :host([light='off']) { --_lit: 0; }
  :host([light='dim']) { --_lit: 0.3; }
  :host([light='on']) { --_lit: 0.85; }
  :host([light='select']) { --_lit: 0.55; --_glow: var(--slab-led-green, #5fe07a); }
  :host([light='red']) { --_lit: 0.85; --_glow: var(--slab-led-red, #ff4d4d); }
  :host([light='amber']) { --_lit: 0.85; --_glow: var(--slab-led-amber, #ffb02e); }
  :host([light='amber-dim']) { --_lit: 0.3; --_glow: var(--slab-led-amber, #ffb02e); }
  :host([light='green']) { --_lit: 0.9; --_glow: var(--slab-led-green, #5fe07a); }

  button {
    position: relative;
    display: block;
    inline-size: 100%;
    block-size: 100%;
    padding: 0;
    border: calc(var(--_u) * 0.28) solid color-mix(in srgb, var(--_glow) calc(var(--_lit) * 100%), #23252e);
    border-radius: calc(var(--_u) * 0.9);
    background:
      radial-gradient(120% 120% at 50% 0%, rgb(255 255 255 / 0.2), transparent 60%),
      color-mix(in srgb, var(--_glow) calc(var(--_lit) * 42%), var(--slab-pad, #8c8e95));
    box-shadow:
      0 0 calc(var(--_u) * var(--_lit) * 2.4) color-mix(in srgb, var(--_glow) calc(var(--_lit) * 90%), transparent),
      inset 0 calc(var(--_u) * -0.5) calc(var(--_u) * 0.8) rgb(0 0 0 / 0.22);
    cursor: pointer;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
    transition: transform 50ms, border-color 140ms, background-color 140ms, box-shadow 140ms;
  }
  button.down {
    transform: scale(0.965);
    filter: brightness(1.12);
  }
  /* Trigger flash, restarted from script on every hit. */
  .flash {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: color-mix(in srgb, var(--_glow) 70%, white);
    opacity: 0;
    pointer-events: none;
  }
  :host([drop]) button {
    border-color: var(--slab-led-amber, #ffb02e);
    border-style: dashed;
  }
  @media (prefers-reduced-motion: reduce) {
    button { transition: none; }
  }
`);

export interface PadDownDetail {
  index: number;
  /** 1..127 */
  velocity: number;
}
export interface PadUpDetail {
  index: number;
}
export interface PadDropDetail {
  index: number;
  files: File[];
}

/**
 * A velocity-sensitive drum pad.
 * Velocity comes from stylus/3D-touch pressure when the device reports it,
 * otherwise from where the pad is struck: higher up the pad = harder.
 *
 * Events: `slab-pad-down`, `slab-pad-up`, `slab-pad-drop` (audio files dropped on it).
 */
export class SlabPad extends SlabElement {
  static observedAttributes = ['index', 'name'];
  #button: HTMLButtonElement;
  #flash: HTMLElement;
  #pointers = new Set<number>();
  #animation: Animation | null = null;

  constructor() {
    super([sharedStyles, styles]);
    this.#flash = h('i', { class: 'flash' });
    this.#button = h('button', { type: 'button' }, this.#flash);
    this.root.append(this.#button);

    this.#button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      this.#button.focus({ preventScroll: true });
      this.#button.setPointerCapture(event.pointerId);
      this.#pointers.add(event.pointerId);
      this.#button.classList.add('down');
      emit<PadDownDetail>(this, 'slab-pad-down', { index: this.index, velocity: this.#velocity(event) });
    });
    const up = (event: PointerEvent): void => {
      if (!this.#pointers.delete(event.pointerId)) return;
      if (this.#pointers.size === 0) {
        this.#button.classList.remove('down');
        emit<PadUpDetail>(this, 'slab-pad-up', { index: this.index });
      }
    };
    this.#button.addEventListener('pointerup', up);
    this.#button.addEventListener('pointercancel', up);
    this.#button.addEventListener('contextmenu', (event) => event.preventDefault());

    // Enter / Space for keyboard users (pointer clicks have detail > 0).
    this.#button.addEventListener('click', (event) => {
      if (event.detail !== 0) return;
      emit<PadDownDetail>(this, 'slab-pad-down', { index: this.index, velocity: 100 });
      emit<PadUpDetail>(this, 'slab-pad-up', { index: this.index });
    });

    this.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      this.toggleAttribute('drop', true);
    });
    this.addEventListener('dragleave', () => this.toggleAttribute('drop', false));
    this.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.toggleAttribute('drop', false);
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length > 0) emit<PadDropDetail>(this, 'slab-pad-drop', { index: this.index, files });
    });
  }

  get index(): number {
    return Number(this.getAttribute('index') ?? 0);
  }

  attributeChangedCallback(): void {
    const name = this.getAttribute('name');
    this.#button.setAttribute('aria-label', `Pad ${this.index + 1}${name ? `, ${name}` : ', empty'}`);
  }

  #velocity(event: PointerEvent): number {
    const hasPressure = event.pointerType === 'pen' || (event.pressure > 0 && event.pressure !== 0.5 && event.pressure !== 1);
    if (hasPressure) return Math.round(30 + Math.min(1, event.pressure * 1.4) * 97);
    const rect = this.#button.getBoundingClientRect();
    const fromBottom = 1 - (event.clientY - rect.top) / Math.max(1, rect.height);
    return Math.round(52 + Math.max(0, Math.min(1, fromBottom)) * 75);
  }

  /** Light up briefly — called when the pad's sound is triggered. */
  flash(): void {
    this.#animation?.cancel();
    this.#animation = this.#flash.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 260, easing: 'ease-out' });
  }
}

define('slab-pad', SlabPad);
