import { loadPatch, selectPad } from '../../app/actions/keys.js';
import { currentSequence, padLabel, selectedPad, type App } from '../../app/context.js';
import type { ButtonId, Controller, NoteDetail } from '../../app/controller.js';
import { SYNTH_PATCHES } from '../../audio/synth-patches.js';
import { pad2 } from '../../core/util.js';
import { position } from '../../seq/timing.js';
import { define, h, SlabElement } from '../dom.js';
import { clampLow, noteName, soundOptions } from '../keys/keymap.js';
import { lcdStyles } from '../styles/lcd.js';
import { sharedStyles } from '../styles/shared.js';
import './slab-button.js';
import type { SlabButton } from './slab-button.js';
import { SlabKeybed, type KeyNoteDetail } from './slab-keybed.js';
import { keysStyles } from './slab-keys.styles.js';

/**
 * The keyboard interface. Plays the selected pad chromatically (C4 = its original
 * pitch) and shares transport, sequences and sounds with the sampler, so the two
 * views can be swapped at any time without stopping.
 */
export class SlabKeys extends SlabElement {
  #app!: App;
  #controller!: Controller;
  #buttons = new Map<string, SlabButton>();
  #seq = h('b');
  #pos = h('span');
  #sound = h('select', { id: 'keys-sound' });
  #patch = h('select', { id: 'keys-patch' });
  #range = h('span', { class: 'range', 'aria-live': 'polite' });
  #status = h('p', { class: 'status', role: 'status' });
  #bed = new SlabKeybed();
  #sustained = new Set<number>();
  #held = new Set<number>();
  #soundSignature = '';
  #dirty = true;
  #raf = 0;

  constructor() {
    super([sharedStyles, lcdStyles, keysStyles], false);
  }

  bind(app: App, controller: Controller): void {
    this.#app = app;
    this.#controller = controller;
    this.#build();
    app.project.subscribe(() => (this.#dirty = true));
    app.ui.subscribe(() => (this.#dirty = true));
    controller.addEventListener('note', (event) => {
      const { note, on } = (event as CustomEvent<NoteDetail>).detail;
      this.#bed.light(note, on);
    });
    this.#raf = requestAnimationFrame(this.#frame);
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.#raf);
  }

  #button(id: string, label: string, sub: string, extra: Record<string, string | boolean> = {}): SlabButton {
    const el = h('slab-button', { id, label, sub, ...extra }) as SlabButton;
    this.#buttons.set(id, el);
    return el;
  }

  #build(): void {
    this.#patch.append(
      h('option', { value: '' }, 'Choose…'),
      ...SYNTH_PATCHES.map((patch) => h('option', { value: patch.id }, patch.name)),
    );
    const field = (text: string, control: HTMLSelectElement): HTMLElement => h('label', { class: 'field' }, text, control);
    // Only one interface is visible at a time, so each supplies the page's main landmark and heading.
    const unit = h(
      'main',
      { class: 'unit', 'aria-labelledby': 'keys-title' },
      h('h1', { id: 'keys-title', class: 'visually-hidden' }, 'SLAB/16 keyboard'),
      h(
        'div',
        { class: 'strip' },
        h('div', { class: 'transport' }, this.#button('stop', 'Stop', ' ', { tone: 'dark', led: 'white' }), this.#button('play', 'Play', ' ', { tone: 'dark', led: 'green', toggle: true }), this.#button('qrec', 'Rec', ' ', { led: 'red', toggle: true })),
        h('div', { class: 'readout', 'aria-live': 'off' }, this.#seq, this.#pos),
        h('div', { class: 'sound' }, field('Sound (pad)', this.#sound), field('Load synth patch', this.#patch)),
      ),
      h(
        'div',
        { class: 'controls' },
        h('div', { class: 'octave', role: 'group', 'aria-label': 'Octave' }, this.#button('oct-down', 'Oct −', ' '), this.#range, this.#button('oct-up', 'Oct +', ' ')),
        this.#button('sustain', 'Sustain', ' ', { led: 'amber', toggle: true }),
        this.#status,
      ),
      this.#bed,
      h('div', { class: 'hint lcd' }, h('p', null, 'Computer keys: ', h('span', { class: 'nobr' }, h('kbd', null, 'A'), '–', h('kbd', null, "'")), ' white keys, ', h('kbd', null, 'W'), ' ', h('kbd', null, 'E'), ' ', h('kbd', null, 'T'), ' ', h('kbd', null, 'Y'), ' ', h('kbd', null, 'U'), ' ', h('kbd', null, 'O'), ' ', h('kbd', null, 'P'), ' black keys, ', h('span', { class: 'nobr' }, h('kbd', null, 'Z'), ' / ', h('kbd', null, 'X')), ' octave. ', h('kbd', null, 'Space'), ' plays, ', h('kbd', null, 'Enter'), ' records, ', h('kbd', null, '`'), ' switches back to the sampler.')),
    );
    this.root.append(unit);

    this.root.addEventListener('slab-press', (event) => {
      const id = (event.target as HTMLElement).id;
      if (id === 'oct-down' || id === 'oct-up') return this.shiftOctave(id === 'oct-up' ? 1 : -1);
      if (id === 'sustain') return this.#toggleSustain();
      this.#controller.press(id as ButtonId);
    });
    this.#bed.addEventListener('slab-note', (event) => {
      const { note, on, velocity } = (event as CustomEvent<KeyNoteDetail>).detail;
      if (on) this.noteOn(note, velocity);
      else this.noteOff(note);
    });
    this.#bed.addEventListener('slab-octaves', () => this.shiftOctave(0));
    this.#sound.addEventListener('change', () => selectPad(this.#app, Number(this.#sound.value)));
    this.#patch.addEventListener('change', () => {
      const patch = SYNTH_PATCHES.find((p) => p.id === this.#patch.value);
      this.#patch.value = '';
      if (patch) loadPatch(this.#app, patch);
    });
  }

  /** Note-on from any of this view's inputs (mouse, touch, computer keys). */
  noteOn(note: number, velocity: number): void {
    this.#held.add(note);
    this.#sustained.delete(note);
    this.#controller.keyDown(note, velocity);
  }

  noteOff(note: number): void {
    this.#held.delete(note);
    if (this.#app.ui.state.keys.sustain) this.#sustained.add(note);
    else this.#controller.keyUp(note);
  }

  /** Lowest C of the keybed; computer keys play upward from here. */
  get low(): number {
    return this.#app.ui.state.keys.low;
  }

  shiftOctave(direction: number): void {
    const low = clampLow(this.low + direction * 12, this.#bed.octaves);
    if (low !== this.low) this.#app.ui.update((s) => void (s.keys.low = low), 'keys');
    else this.#dirty = true;
  }

  #toggleSustain(): void {
    const on = !this.#app.ui.state.keys.sustain;
    this.#app.ui.update((s) => void (s.keys.sustain = on), 'keys');
    if (on) return;
    for (const note of this.#sustained) if (!this.#held.has(note)) this.#controller.keyUp(note);
    this.#sustained.clear();
  }

  #frame = (): void => {
    this.#raf = requestAnimationFrame(this.#frame);
    if (this.hidden) return;
    if (this.#dirty) {
      this.#dirty = false;
      this.#sync();
    }
    const tick = this.#app.sequencer.positionTick();
    const p = position(tick);
    const ui = this.#app.ui.state;
    const state = ui.recording ? (ui.countingIn ? 'COUNT-IN' : '● REC') : ui.playing ? '▶ PLAY' : '■ STOP';
    const text = `${tick < 0 ? `-${Math.ceil(-tick / 96)}` : `${pad2(p.bar)}.${p.beat}`} · ${this.#app.project.state.bpm.toFixed(1)} BPM · ${state}`;
    if (this.#pos.textContent !== text) this.#pos.textContent = text;
    this.#pos.classList.toggle('rec', ui.recording);
  };

  #sync(): void {
    const app = this.#app;
    const ui = app.ui.state;
    const seq = currentSequence(app);
    this.#seq.textContent = `SEQ ${pad2(ui.seq + 1)} ${seq.name}`;
    this.#buttons.get('play')!.active = ui.playing;
    this.#buttons.get('qrec')!.active = ui.recording;
    this.#buttons.get('qrec')!.toggleAttribute('blink', ui.recording && (!ui.playing || ui.countingIn));
    this.#buttons.get('sustain')!.active = ui.keys.sustain;

    const options = soundOptions(app.project.state.pads);
    const signature = options.map((o) => o.label).join('|');
    if (signature !== this.#soundSignature) {
      this.#soundSignature = signature;
      this.#sound.replaceChildren(...options.map((o) => h('option', { value: String(o.index) }, o.label)));
    }
    if (!options.some((o) => o.index === ui.pad)) {
      this.#sound.prepend(h('option', { value: String(ui.pad), 'data-empty': '' }, `${padLabel(ui.pad)} (empty)`));
      this.#soundSignature = '';
    }
    this.#sound.value = String(ui.pad);

    const low = clampLow(ui.keys.low, this.#bed.octaves);
    this.#bed.low = low;
    this.#range.textContent = `${noteName(low)}–${noteName(low + this.#bed.octaves * 12)}`;
    const pad = selectedPad(app);
    this.#status.textContent =
      ui.message ||
      (pad.sampleId
        ? `Playing ${padLabel(ui.pad)} ${pad.name}. C4 is its original pitch.${pad.loop || pad.mode === 'hold' ? '' : ' One-shot: notes play to the end of the sample.'}`
        : 'This pad is empty. Choose a sound, or load a synth patch.');
  }
}

define('slab-keys', SlabKeys);
