import { css, define, emit, h, sheet, SlabElement } from '../dom.js';
import { sharedStyles } from '../styles/shared.js';

const styles = sheet(css`
  :host {
    display: grid;
    place-items: center;
    min-inline-size: 0;
    min-block-size: 0;
    /* Set --slab-fader-flow: horizontal-tb on the host for a horizontal fader. */
    --_flow: var(--slab-fader-flow, vertical-lr);
    --_dir: var(--slab-fader-dir, rtl);
    --_thumb-to: var(--slab-fader-thumb-to, bottom);
  }
  .well {
    display: grid;
    place-items: stretch;
    inline-size: 100%;
    block-size: 100%;
    padding: calc(var(--_u) * 1.1);
    border-radius: calc(var(--_u) * 1.1);
    background: var(--slab-fader-well, #f4f2ea);
    box-shadow: inset 0 calc(var(--_u) * 0.15) calc(var(--_u) * 0.5) rgb(0 0 0 / 0.18);
  }
  input {
    appearance: none;
    -webkit-appearance: none;
    writing-mode: var(--_flow);
    direction: var(--_dir);
    inline-size: 100%;
    block-size: 100%;
    min-inline-size: 0;
    min-block-size: 0;
    margin: 0;
    background: transparent;
    cursor: grab;
    touch-action: none;
  }
  input::-webkit-slider-runnable-track {
    inline-size: 100%;
    block-size: calc(var(--_u) * 1.3);
    border-radius: 99px;
    background: #1c1c1f;
  }
  input::-moz-range-track {
    inline-size: 100%;
    block-size: calc(var(--_u) * 1.3);
    border-radius: 99px;
    background: #1c1c1f;
  }
  input::-webkit-slider-thumb {
    -webkit-appearance: none;
    inline-size: calc(var(--_u) * 4.4);
    block-size: calc(var(--_u) * 5.6);
    margin-block-start: calc(var(--_u) * -2.15);
    border: 0;
    border-radius: calc(var(--_u) * 0.6);
    background: linear-gradient(to var(--_thumb-to), #fbfaf5, #cfcbc0 48%, #1c1c1f 48% 52%, #e2dfd5 52%, #bdb9ad);
    box-shadow: 0 calc(var(--_u) * 0.3) calc(var(--_u) * 0.7) rgb(0 0 0 / 0.4);
  }
  input::-moz-range-thumb {
    inline-size: calc(var(--_u) * 4.4);
    block-size: calc(var(--_u) * 5.6);
    border: 0;
    border-radius: calc(var(--_u) * 0.6);
    background: linear-gradient(to var(--_thumb-to), #fbfaf5, #cfcbc0 48%, #1c1c1f 48% 52%, #e2dfd5 52%, #bdb9ad);
    box-shadow: 0 calc(var(--_u) * 0.3) calc(var(--_u) * 0.7) rgb(0 0 0 / 0.4);
  }
`);

export interface FaderInputDetail {
  /** Normalised 0..1. */
  value: number;
}

/**
 * Assignable fader built on a native range input, so keyboard and screen-reader
 * behaviour come for free. Fires `slab-input`.
 */
export class SlabFader extends SlabElement {
  static observedAttributes = ['label', 'value-text'];
  #input: HTMLInputElement;

  constructor() {
    super([sharedStyles, styles]);
    this.#input = h('input', { type: 'range', min: '0', max: '1000', value: '500', id: 'fader' });
    this.root.append(h('div', { class: 'well' }, this.#input));
    this.#input.addEventListener('input', () => {
      emit<FaderInputDetail>(this, 'slab-input', { value: Number(this.#input.value) / 1000 });
    });
  }

  attributeChangedCallback(name: string): void {
    if (name === 'label') this.#input.setAttribute('aria-label', this.getAttribute('label') ?? 'Fader');
    if (name === 'value-text') this.#input.setAttribute('aria-valuetext', this.getAttribute('value-text') ?? '');
  }

  get value(): number {
    return Number(this.#input.value) / 1000;
  }

  set value(next: number) {
    this.#input.value = String(Math.round(Math.max(0, Math.min(1, next)) * 1000));
  }
}

define('slab-fader', SlabFader);
