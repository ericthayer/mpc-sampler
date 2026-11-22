import { css, define, h, sheet, SlabElement } from '../dom.js';
import { gainToDb } from '../../core/util.js';
import { sharedStyles } from '../styles/shared.js';

const SEGMENTS = 6;
/** dBFS at which each segment lights, bottom to top. */
const THRESHOLDS = [-36, -24, -15, -9, -4, -0.5];

const styles = sheet(css`
  :host {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: calc(var(--_u) * 0.7);
  }
  .channel {
    display: flex;
    flex-direction: column-reverse;
    gap: calc(var(--_u) * 0.55);
  }
  i {
    flex: 1;
    min-block-size: calc(var(--_u) * 0.9);
    border-radius: calc(var(--_u) * 0.25);
    background: color-mix(in srgb, var(--_c) 16%, #101012);
  }
  i.on {
    background: var(--_c);
    box-shadow: 0 0 calc(var(--_u) * 0.9) color-mix(in srgb, var(--_c) 70%, transparent);
  }
  i { --_c: var(--slab-led-green, #5fe07a); }
  i:nth-child(5) { --_c: var(--slab-led-amber, #ffb02e); }
  i:nth-child(6) { --_c: var(--slab-led-red, #ff4d4d); }
`);

/** Stereo LED ladder. Purely visual — hidden from assistive tech. */
export class SlabMeter extends SlabElement {
  #segments: HTMLElement[][] = [];
  #lit = [0, 0];
  #hold = [0, 0];

  constructor() {
    super([sharedStyles, styles], false);
    for (let c = 0; c < 2; c++) {
      const segments = Array.from({ length: SEGMENTS }, () => h('i'));
      this.#segments.push(segments);
      this.root.append(h('div', { class: 'channel' }, ...segments));
    }
  }

  connectedCallback(): void {
    this.setAttribute('aria-hidden', 'true');
  }

  /** Feed linear peak levels once per animation frame. */
  set(left: number, right: number): void {
    [left, right].forEach((level, c) => {
      // Fast attack, slow release so short drum hits stay visible.
      this.#hold[c] = Math.max(level, this.#hold[c]! * 0.9);
      const db = gainToDb(this.#hold[c]!);
      let lit = 0;
      while (lit < SEGMENTS && db >= THRESHOLDS[lit]!) lit++;
      if (lit === this.#lit[c]) return;
      this.#lit[c] = lit;
      this.#segments[c]!.forEach((segment, i) => segment.classList.toggle('on', i < lit));
    });
  }
}

define('slab-meter', SlabMeter);
