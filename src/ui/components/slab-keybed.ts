import { css, define, emit, h, sheet, SlabElement } from '../dom.js';
import { isBlack, noteName, octavesFor, qwertyLabel } from '../keys/keymap.js';
import { sharedStyles } from '../styles/shared.js';
import { keysStyles } from './slab-keys.styles.js';

const local = sheet(css`
  :host { display: block; }
`);

export interface KeyNoteDetail {
  note: number;
  on: boolean;
  /** 1..127, only on note-on. */
  velocity: number;
}

/**
 * Piano keybed. Fits as many octaves as its width allows (fires `slab-octaves`),
 * supports multi-touch and sliding across keys, and fires `slab-note` for each
 * note on/off. It plays nothing itself.
 */
export class SlabKeybed extends SlabElement {
  #bed = h('div', { class: 'bed', role: 'group', 'aria-label': 'Piano keys' });
  #low = 48;
  #octaves = 2;
  #keys = new Map<number, HTMLButtonElement>();
  #pointers = new Map<number, number>();
  #lit = new Set<number>();
  #observer = new ResizeObserver(([entry]) => {
    const octaves = octavesFor(entry?.contentRect.width ?? 600);
    if (octaves === this.#octaves && this.#keys.size > 0) return;
    this.#octaves = octaves;
    this.#render();
    emit<number>(this, 'slab-octaves', octaves);
  });

  constructor() {
    super([sharedStyles, keysStyles, local], false);
    this.root.append(this.#bed);
    this.#bed.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      this.#bed.setPointerCapture(event.pointerId);
      const key = this.#keyAt(event);
      if (key) this.#press(event.pointerId, key, event);
    });
    this.#bed.addEventListener('pointermove', (event) => {
      if (!this.#pointers.has(event.pointerId)) return;
      const key = this.#keyAt(event);
      if (key && Number(key.dataset.note) !== this.#pointers.get(event.pointerId)) {
        this.#lift(event.pointerId);
        this.#press(event.pointerId, key, event);
      }
    });
    const up = (event: PointerEvent): void => this.#lift(event.pointerId);
    this.#bed.addEventListener('pointerup', up);
    this.#bed.addEventListener('pointercancel', up);
    this.#bed.addEventListener('contextmenu', (event) => event.preventDefault());
    // Assistive tech activates keys as clicks with no pointer sequence.
    this.#bed.addEventListener('click', (event) => {
      const key = event.target instanceof HTMLElement ? event.target.closest<HTMLButtonElement>('.key') : null;
      if (event.detail !== 0 || !key) return;
      const note = Number(key.dataset.note);
      emit<KeyNoteDetail>(this, 'slab-note', { note, on: true, velocity: 100 });
      setTimeout(() => emit<KeyNoteDetail>(this, 'slab-note', { note, on: false, velocity: 0 }), 250);
    });
  }

  connectedCallback(): void {
    this.#observer.observe(this);
  }

  disconnectedCallback(): void {
    this.#observer.disconnect();
  }

  get octaves(): number {
    return this.#octaves;
  }

  set low(note: number) {
    if (note === this.#low) return;
    this.#low = note;
    this.#render();
  }

  /** Light or unlight a key, whatever played it (mouse, QWERTY, MIDI). */
  light(note: number, on: boolean): void {
    if (on) this.#lit.add(note);
    else this.#lit.delete(note);
    this.#keys.get(note)?.classList.toggle('down', on);
  }

  #keyAt(event: PointerEvent): HTMLButtonElement | null {
    const hit = this.root.elementFromPoint(event.clientX, event.clientY);
    return hit instanceof HTMLElement ? hit.closest<HTMLButtonElement>('.key') : null;
  }

  #press(pointer: number, key: HTMLButtonElement, event: PointerEvent): void {
    const note = Number(key.dataset.note);
    this.#pointers.set(pointer, note);
    const rect = key.getBoundingClientRect();
    // Pen pressure when available; otherwise striking nearer the front of the key plays louder.
    const depth = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)));
    const velocity = event.pointerType === 'pen' && event.pressure > 0 ? Math.round(30 + event.pressure * 97) : Math.round(48 + depth * 79);
    emit<KeyNoteDetail>(this, 'slab-note', { note, on: true, velocity: Math.min(127, velocity) });
  }

  #lift(pointer: number): void {
    const note = this.#pointers.get(pointer);
    if (note === undefined) return;
    this.#pointers.delete(pointer);
    if (![...this.#pointers.values()].includes(note)) emit<KeyNoteDetail>(this, 'slab-note', { note, on: false, velocity: 0 });
  }

  #render(): void {
    this.#keys.clear();
    this.#bed.replaceChildren();
    const top = this.#low + this.#octaves * 12;
    const whites = Array.from({ length: top - this.#low + 1 }, (_, i) => this.#low + i).filter((n) => !isBlack(n));
    const width = 100 / whites.length;
    let whiteIndex = 0;
    for (let note = this.#low; note <= top; note++) {
      const black = isBlack(note);
      const offset = note - this.#low;
      const letter = qwertyLabel(offset);
      const root = note % 12 === 0;
      const key = h(
        'button',
        {
          type: 'button',
          tabIndex: -1,
          class: `key ${black ? 'black' : 'white'}${root ? ' root' : ''}${this.#lit.has(note) ? ' down' : ''}`,
          'data-note': String(note),
          'aria-label': noteName(note),
        },
        letter ? h('span', { class: 'qwerty', 'aria-hidden': 'true' }, letter) : null,
        root && !black ? h('span', { class: 'name', 'aria-hidden': 'true' }, noteName(note)) : null,
      );
      if (black) {
        // Centre the black key on the boundary between the two white keys around it.
        // Percentages are of the padded bed, so measure across its content box (inset by --u).
        key.style.left = `calc(var(--u, 6px) + (100% - 2 * var(--u, 6px)) * ${((whiteIndex - 0.3) * width) / 100})`;
        key.style.width = `calc((100% - 2 * var(--u, 6px)) * ${(width * 0.6) / 100})`;
      } else whiteIndex++;
      this.#keys.set(note, key);
      this.#bed.append(key);
    }
  }
}

define('slab-keybed', SlabKeybed);
