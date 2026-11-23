import type { App } from '../../app/context.js';
import type { PageId } from '../../core/state.js';
import { clamp, denorm, norm } from '../../core/util.js';
import { h } from '../dom.js';

/** One of the three knob-controlled parameters shown along the bottom of the display. */
export interface Param {
  label: string;
  /** Normalised 0..1 position for the knob. */
  get: () => number;
  set: (n: number) => void;
  /** Human-readable value. */
  text: () => string;
  /** Number of detents across the full range; drives data-wheel step size. */
  steps: number;
  reset?: () => void;
}

/** A soft button on the display. */
export interface Chip {
  label: string;
  run: () => void;
  /** Lit when true. */
  on?: () => boolean;
  disabled?: () => boolean;
}

export interface PageView {
  el: HTMLElement;
  /** Re-read state after any store change. */
  update: () => void;
  /** Called every animation frame while this page is visible. */
  frame?: () => void;
}

export type PadLight = 'off' | 'dim' | 'on' | 'select' | 'red' | 'amber' | 'amber-dim' | 'green';

export interface PageDef {
  id: PageId;
  title: string;
  tabs?: readonly string[];
  /** One line of guidance shown on the bottom strip. */
  hint: string;
  params: (app: App, tab: number) => (Param | null)[];
  chips?: (app: App, tab: number) => Chip[];
  view: (app: App, tab: number) => PageView;
  /** Return true to stop the pad from playing its sound. `pad` is 0..15 within the bank. */
  padDown?: (app: App, pad: number, velocity: number) => boolean;
  padUp?: (app: App, pad: number) => void;
  /** Override pad lighting; return null to use the default. */
  padLight?: (app: App, pad: number) => PadLight | null;
}

export function range(
  label: string,
  min: number,
  max: number,
  step: number,
  read: () => number,
  write: (value: number) => void,
  format: (value: number) => string,
  initial?: number,
): Param {
  const param: Param = {
    label,
    get: () => norm(read(), min, max),
    set: (n) => write(denorm(n, min, max, step)),
    text: () => format(read()),
    steps: step > 0 ? Math.round((max - min) / step) : 200,
  };
  if (initial !== undefined) param.reset = (): void => write(initial);
  return param;
}

export function choice(label: string, options: readonly string[], read: () => number, write: (index: number) => void): Param {
  const last = Math.max(1, options.length - 1);
  return {
    label,
    get: () => clamp(read(), 0, last) / last,
    set: (n) => write(clamp(Math.round(n * last), 0, options.length - 1)),
    text: () => options[read()] ?? '—',
    steps: last,
  };
}

export function onOff(label: string, read: () => boolean, write: (on: boolean) => void): Param {
  return choice(label, ['OFF', 'ON'], () => (read() ? 1 : 0), (i) => write(i === 1));
}

/** Label/value line used by text-based pages. */
export function line(label: string, value = ''): { el: HTMLElement; set: (text: string) => void } {
  const valueEl = h('span', { class: 'v' }, value);
  return {
    el: h('p', { class: 'line' }, h('span', { class: 'k' }, label), valueEl),
    set: (text: string): void => {
      if (valueEl.textContent !== text) valueEl.textContent = text;
    },
  };
}

/** A 4×4 grid that mirrors the pads: cell 0 is bottom-left, like pad 1. */
export function padGrid(cells: HTMLElement[]): HTMLElement {
  const grid = h('div', { class: 'padgrid' });
  for (let row = 3; row >= 0; row--) for (let col = 0; col < 4; col++) grid.append(cells[row * 4 + col]!);
  return grid;
}
