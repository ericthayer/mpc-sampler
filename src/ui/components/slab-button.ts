import { css, define, emit, h, sheet, SlabElement } from '../dom.js';
import { sharedStyles } from '../styles/shared.js';

const styles = sheet(css`
  :host {
    display: grid;
    grid-template-rows: 1fr auto;
    gap: calc(var(--_u) * 0.5);
    min-inline-size: 0;
    --_cap: var(--slab-btn-grey, #56585d);
    --_cap-ink: #f4f2ea;
    --_led: var(--slab-led-red, #ff4d4d);
  }
  :host([tone='dark']) { --_cap: var(--slab-btn-dark, #2c2d31); }
  :host([tone='orange']) { --_cap: var(--slab-btn-orange, #ee6a3c); --_cap-ink: #1b0d06; }
  :host([tone='blue']) { --_cap: var(--slab-btn-blue, #43a7e6); --_cap-ink: #06131d; }
  :host([led='green']) { --_led: var(--slab-led-green, #5fe07a); }
  :host([led='amber']) { --_led: var(--slab-led-amber, #ffb02e); }
  :host([led='white']) { --_led: #f6f4ec; }

  button {
    position: relative;
    display: grid;
    place-items: center;
    inline-size: 100%;
    min-block-size: max(24px, calc(var(--_u) * 4.6));
    padding: calc(var(--_u) * 0.5) calc(var(--_u) * 0.4);
    border: 0;
    border-radius: calc(var(--_u) * 0.7);
    background: linear-gradient(180deg, color-mix(in srgb, var(--_cap) 86%, white), var(--_cap) 45%, color-mix(in srgb, var(--_cap) 82%, black));
    color: var(--_cap-ink);
    box-shadow:
      0 calc(var(--_u) * 0.35) 0 color-mix(in srgb, var(--_cap) 55%, black),
      0 calc(var(--_u) * 0.55) calc(var(--_u) * 0.6) rgb(0 0 0 / 0.35);
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    transition: transform 60ms, box-shadow 60ms, filter 120ms;
  }
  button.down,
  :host([active]) button {
    transform: translateY(calc(var(--_u) * 0.25));
    box-shadow:
      0 calc(var(--_u) * 0.1) 0 color-mix(in srgb, var(--_cap) 55%, black),
      0 calc(var(--_u) * 0.2) calc(var(--_u) * 0.3) rgb(0 0 0 / 0.35);
  }
  :host([active]) button {
    filter: brightness(1.22) saturate(1.15);
  }
  .text {
    font-size: max(0.5625rem, calc(var(--_u) * 1.45));
    text-align: center;
    text-wrap: balance;
    pointer-events: none;
  }
  /* Indicator strip along the bottom edge of the cap. */
  .led {
    position: absolute;
    inset: auto 18% calc(var(--_u) * 0.45);
    block-size: calc(var(--_u) * 0.45);
    border-radius: 99px;
    background: color-mix(in srgb, var(--_led) 28%, #1a1a1a);
    pointer-events: none;
  }
  :host(:not([led])) .led { display: none; }
  :host([led]) .text { translate: 0 calc(var(--_u) * -0.35); }
  :host([active]) .led {
    background: var(--_led);
    box-shadow: 0 0 calc(var(--_u) * 0.9) var(--_led);
  }
  :host([blink]) .led { animation: blink 0.5s steps(2, jump-none) infinite; }
  @keyframes blink { to { background: color-mix(in srgb, var(--_led) 28%, #1a1a1a); box-shadow: none; } }

  .sub {
    font-size: max(0.5rem, calc(var(--_u) * 1.2));
    color: var(--slab-ink, #2a2a2c);
    text-align: center;
    white-space: nowrap;
    min-block-size: 1em;
  }
  :host([shifted]) .sub {
    color: var(--slab-shift-ink, #b2401c);
  }
  @media (prefers-reduced-motion: reduce) {
    button { transition: none; }
    :host([blink]) .led { animation: none; }
  }
`);

export interface PressDetail {
  id: string;
}

/**
 * Hardware-style button. Fires `slab-press` on pointer *down* (so it feels like a
 * physical switch) and `slab-release` on up. Keyboard activation fires both.
 *
 * Attributes: `label`, `sub` (SHIFT function, printed below), `tone`, `led`,
 * `active` (lit), `blink`, `shifted` (highlight the sub label), `toggle`.
 */
export class SlabButton extends SlabElement {
  static observedAttributes = ['label', 'sub', 'active', 'toggle'];
  #button: HTMLButtonElement;
  #text: HTMLSpanElement;
  #sub: HTMLSpanElement;
  #pointerDown = false;

  constructor() {
    super([sharedStyles, styles]);
    this.#text = h('span', { class: 'text label' });
    this.#sub = h('span', { class: 'sub label', 'aria-hidden': 'true' });
    this.#button = h('button', { type: 'button', part: 'cap' }, this.#text, h('i', { class: 'led' }));
    this.root.append(this.#button, this.#sub);

    this.#button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      this.#pointerDown = true;
      this.#button.classList.add('down');
      this.#button.setPointerCapture(event.pointerId);
      emit<PressDetail>(this, 'slab-press', { id: this.id });
    });
    const up = (): void => {
      if (!this.#pointerDown) return;
      this.#pointerDown = false;
      this.#button.classList.remove('down');
      emit<PressDetail>(this, 'slab-release', { id: this.id });
    };
    this.#button.addEventListener('pointerup', up);
    this.#button.addEventListener('pointercancel', up);
    // Keyboard and assistive-tech activation arrive as a click with no pointer sequence.
    this.#button.addEventListener('click', (event) => {
      if (event.detail !== 0) return;
      emit<PressDetail>(this, 'slab-press', { id: this.id });
      emit<PressDetail>(this, 'slab-release', { id: this.id });
    });
  }

  attributeChangedCallback(name: string): void {
    if (name === 'label') this.#text.textContent = this.getAttribute('label') ?? '';
    if (name === 'sub') {
      const sub = this.getAttribute('sub') ?? '';
      this.#sub.textContent = sub;
      if (sub) this.#button.setAttribute('aria-description', `With Shift: ${sub}`);
      else this.#button.removeAttribute('aria-description');
    }
    if (name === 'active' || name === 'toggle') {
      if (this.hasAttribute('toggle')) this.#button.setAttribute('aria-pressed', String(this.hasAttribute('active')));
    }
  }

  set active(on: boolean) {
    this.toggleAttribute('active', on);
  }

  get active(): boolean {
    return this.hasAttribute('active');
  }
}

define('slab-button', SlabButton);
