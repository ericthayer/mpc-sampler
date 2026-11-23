import type { App } from '../../app/context.js';
import { selectedPad } from '../../app/context.js';
import type { ButtonId, Controller } from '../../app/controller.js';
import { SHIFT_FUNCTIONS } from '../../app/shift-functions.js';
import type { TriggerDetail } from '../../audio/engine.js';
import { BANK_NAMES, PADS_PER_BANK } from '../../core/types.js';
import { define, h, SlabElement } from '../dom.js';
import type { PadLight } from '../screen/page.js';
import { faderTargetLabel } from '../screen/pages/system.js';
import { sharedStyles } from '../styles/shared.js';
import { appStyles } from './slab-app.styles.js';
import { button, modeHint, MODE_BUTTONS, PLAY_BUTTONS, TRANSPORT_BUTTONS, UTILITY_BUTTONS, type ButtonSpec } from './faceplate.js';
import type { SlabButton } from './slab-button.js';
import { SlabFader, type FaderInputDetail } from './slab-fader.js';
import { SlabKnob, type KnobInputDetail, type KnobTurnDetail } from './slab-knob.js';
import { SlabMeter } from './slab-meter.js';
import { SlabPad, type PadDownDetail, type PadDropDetail, type PadUpDetail } from './slab-pad.js';
import { SlabScreen, type FocusDetail } from './slab-screen.js';

/**
 * The instrument faceplate. Owns no state: it forwards gestures to the
 * controller and repaints from the stores once per animation frame.
 */
export class SlabApp extends SlabElement {
  #app!: App;
  #controller!: Controller;
  #device = h('main', { class: 'device' });
  #screen = h('slab-screen', { id: 'screen' }) as SlabScreen;
  #meter = h('slab-meter') as SlabMeter;
  #volume = h('slab-knob', { id: 'volume', label: 'Main Volume' }) as SlabKnob;
  #wheel = h('slab-knob', { id: 'wheel', label: 'Data', endless: true }) as SlabKnob;
  #fader = h('slab-fader', { id: 'fader', label: 'Fader' }) as SlabFader;
  #knobs = [1, 2, 3].map((n) => h('slab-knob', { id: `k${n}`, label: `K${n}` }) as SlabKnob);
  #buttons = new Map<ButtonId, SlabButton>();
  #pads: SlabPad[] = [];
  #banks = BANK_NAMES.map((name) => h('li', null, name));
  #hint = h('p', { 'aria-live': 'polite' });
  #dirty = false;
  #raf = 0;

  constructor() {
    super([sharedStyles, appStyles], false);
  }

  /** Attach the runtime. Call once, before the element is used. */
  bind(app: App, controller: Controller): void {
    this.#app = app;
    this.#controller = controller;
    this.#build();
    this.#listen();
    this.#screen.app = app;
    app.project.subscribe(() => this.#invalidate());
    app.ui.subscribe(() => this.#invalidate());
    app.engine.addEventListener('trigger', (event) => this.#flash((event as CustomEvent<TriggerDetail>).detail));
    this.#sync();
    this.#raf = requestAnimationFrame(this.#frame);
  }

  disconnectedCallback(): void {
    cancelAnimationFrame(this.#raf);
  }

  /** Outline controls for the guided tour and bring the first into view. Pass [] to clear. */
  spotlight(ids: readonly string[]): void {
    for (const el of this.root.querySelectorAll('[coach]')) el.removeAttribute('coach');
    const targets = ids.map((id) => this.root.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    for (const el of targets) el.setAttribute('coach', '');
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    targets[0]?.scrollIntoView({ block: 'center', behavior: smooth ? 'smooth' : 'auto' });
  }

  #build(): void {
    const add = (specs: ButtonSpec[]): SlabButton[] =>
      specs.map((spec) => {
        const el = button(spec);
        this.#buttons.set(spec.id, el);
        return el;
      });

    const top = h(
      'section',
      { class: 'top', 'aria-label': 'Display and output' },
      h('div', { class: 'brand' }, h('h1', { class: 'wordmark' }, 'SLAB', h('b', null, '/16')), h('span', { class: 'tag' }, 'Sampling groovebox')),
      this.#volume,
      h('ul', { class: 'banks', 'aria-label': 'Pad bank' }, ...this.#banks),
      this.#screen,
      this.#meter,
      h('div', { class: 'grille', 'aria-hidden': 'true' }),
    );

    // Visual order: pads 13–16 on the top row, 1–4 on the bottom.
    const padCells: HTMLElement[] = [];
    for (let row = 3; row >= 0; row--) {
      for (let col = 0; col < 4; col++) {
        const index = row * 4 + col;
        const pad = h('slab-pad', { index: String(index) }) as SlabPad;
        this.#pads[index] = pad;
        padCells.push(
          h('div', { class: 'padcell' }, pad, h('div', { class: 'legend', 'aria-hidden': 'true' }, h('b', null, String(index + 1)), h('span', null, SHIFT_FUNCTIONS[index]!.short))),
        );
      }
    }

    const utility = add(UTILITY_BUTTONS);
    this.#device.append(
      top,
      h('h2', { class: 'heading hmode' }, 'Mode'),
      h('section', { class: 'group', 'aria-label': 'Mode' }, ...add(MODE_BUTTONS)),
      h('section', { class: 'knobs', 'aria-label': 'Parameter knobs' }, ...this.#knobs),
      h('h2', { class: 'heading hplay' }, 'Pad Play'),
      h('section', { class: 'group', 'aria-label': 'Pad play' }, ...add(PLAY_BUTTONS)),
      h('section', { class: 'group', 'aria-label': 'Utility' }, ...utility.slice(0, 2), this.#fader, ...utility.slice(2)),
      h('section', { class: 'pads', id: 'pads', 'aria-label': 'Pads' }, ...padCells),
      h('section', { class: 'group', 'aria-label': 'Data and transport' }, this.#wheel, ...add(TRANSPORT_BUTTONS)),
      h('footer', { class: 'strip' }, this.#hint),
    );
    this.root.append(this.#device);
  }

  #listen(): void {
    const controller = this.#controller;
    const root = this.root;
    const id = (event: Event): string => (event.target instanceof HTMLElement ? event.target.id : '');

    root.addEventListener('slab-press', (event) => controller.press(id(event) as ButtonId));
    root.addEventListener('slab-release', (event) => controller.release(id(event) as ButtonId));
    root.addEventListener('slab-pad-down', (event) => {
      const { index, velocity } = (event as CustomEvent<PadDownDetail>).detail;
      controller.padDown(index, velocity);
    });
    root.addEventListener('slab-pad-up', (event) => controller.padUp((event as CustomEvent<PadUpDetail>).detail.index));
    root.addEventListener('slab-pad-drop', (event) => {
      const { index, files } = (event as CustomEvent<PadDropDetail>).detail;
      controller.drop(index, files);
    });
    root.addEventListener('slab-input', (event) => {
      const target = id(event);
      const { value } = (event as CustomEvent<KnobInputDetail | FaderInputDetail>).detail;
      if (target === 'volume') controller.volume(value);
      else if (target === 'fader') controller.fader(value);
      else controller.knob(Number(target.slice(1)) - 1, value);
    });
    root.addEventListener('slab-turn', (event) => {
      const { delta, fine } = (event as CustomEvent<KnobTurnDetail>).detail;
      controller.wheel(delta, fine);
    });
    root.addEventListener('slab-reset', (event) => {
      const target = id(event);
      if (target === 'volume') controller.volume(0.8);
      else if (/^k[123]$/.test(target)) controller.knobReset(Number(target.slice(1)) - 1);
    });
    root.addEventListener('slab-touch', (event) => {
      const target = id(event);
      if (/^k[123]$/.test(target)) controller.focus(Number(target.slice(1)) - 1);
    });
    root.addEventListener('slab-focus', (event) => controller.focus((event as CustomEvent<FocusDetail>).detail.index));

    // Files dropped anywhere else on the page load from the selected pad.
    window.addEventListener('dragover', (event) => {
      if (event.dataTransfer?.types.includes('Files')) event.preventDefault();
    });
    window.addEventListener('drop', (event) => {
      event.preventDefault();
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length > 0) controller.drop(this.#app.ui.state.pad % PADS_PER_BANK, files);
    });
  }

  #invalidate(): void {
    this.#dirty = true;
  }

  #frame = (): void => {
    this.#raf = requestAnimationFrame(this.#frame);
    const app = this.#app;
    if (this.#dirty) {
      this.#dirty = false;
      this.#sync();
    } else if (app.ui.state.playing && this.#controller.page.padLight) {
      this.#paintPads();
    }
    this.#screen.frame();
    if (app.engine.started) {
      const [left, right] = app.engine.meter();
      this.#meter.set(left, right);
    }
  };

  #flash({ pad, when }: TriggerDetail): void {
    const bank = this.#app.ui.state.bank;
    const local = pad - bank * PADS_PER_BANK;
    const target = this.#pads[local];
    if (!target || local < 0 || local >= PADS_PER_BANK) return;
    const delay = Math.max(0, (when - this.#app.engine.now) * 1000);
    if (delay < 8) target.flash();
    else setTimeout(() => target.flash(), delay);
  }

  #padLight(local: number): PadLight {
    const app = this.#app;
    const ui = app.ui.state;
    const index = ui.bank * PADS_PER_BANK + local;
    const pad = app.project.state.pads[index]!;
    const override = this.#controller.page.padLight?.(app, local);
    if (override) return override;
    if (ui.copyStage === 'dest' && index === ui.copyFrom) return 'amber';
    if (ui.copyStage !== 'off') return pad.sampleId ? 'amber-dim' : 'off';
    if (ui.muteMode) return pad.sampleId ? (pad.mute ? 'off' : 'on') : 'off';
    if (ui.eraseMode) return pad.sampleId ? 'red' : 'off';
    if (ui.levels16) return 'amber-dim';
    if (index === ui.pad) return 'select';
    if (!pad.sampleId) return 'off';
    return pad.mute ? 'off' : 'dim';
  }

  #paintPads(): void {
    const bankStart = this.#app.ui.state.bank * PADS_PER_BANK;
    this.#pads.forEach((el, local) => {
      const light = this.#padLight(local);
      if (el.getAttribute('light') !== light) el.setAttribute('light', light);
      const name = this.#app.project.state.pads[bankStart + local]!.name;
      if (el.getAttribute('name') !== name) el.setAttribute('name', name);
    });
  }

  #sync(): void {
    const app = this.#app;
    const ui = app.ui.state;
    const project = app.project.state;
    const shift = ui.shift || ui.shiftLatched;
    const lit: Partial<Record<ButtonId, boolean>> = {
      sample: ui.page === 'sample',
      seq: ui.page === 'seq' || ui.page === 'step',
      padfx: ui.page === 'padfx' || ui.activeFx.length > 0,
      knobfx: ui.page === 'knobfx',
      chop: ui.page === 'chop',
      mute: ui.muteMode,
      loop: selectedPad(app).loop,
      levels: ui.levels16,
      shift,
      select: ui.page === 'browser',
      tap: project.settings.metronome,
      srec: ui.page === 'record' || ui.recorder !== 'idle',
      qrec: ui.recording,
      play: ui.playing,
      erase: ui.eraseMode || ui.copyStage !== 'off',
      repeat: ui.noteRepeat,
    };
    for (const [id, el] of this.#buttons) {
      el.active = lit[id] ?? false;
      el.toggleAttribute('shifted', shift);
    }
    this.#buttons.get('srec')?.toggleAttribute('blink', ui.recorder === 'recording' || ui.recorder === 'captured');
    this.#buttons.get('qrec')?.toggleAttribute('blink', ui.recording && (!ui.playing || ui.countingIn));
    this.#buttons.get('repeat')?.setAttribute('label', ui.triplet ? 'Note Repeat 3' : 'Note Repeat');
    this.#device.toggleAttribute('data-shift', shift);

    this.#banks.forEach((el, i) => {
      el.classList.toggle('on', i === ui.bank);
      if (i === ui.bank) el.setAttribute('aria-current', 'true');
      else el.removeAttribute('aria-current');
    });
    this.#paintPads();

    this.#screen.sync();
    const params = this.#screen.params;
    this.#knobs.forEach((knob, i) => {
      const param = params[i] ?? null;
      knob.value = param ? param.get() : 0;
      knob.setAttribute('label', param ? `K${i + 1} ${param.label}` : `K${i + 1}`);
      knob.setAttribute('value-text', param ? param.text() : 'Unassigned');
      knob.toggleAttribute('focused', param !== null && ui.focus === i);
    });
    const focused = params[ui.focus] ?? params.find((p) => p !== null) ?? null;
    this.#wheel.setAttribute('label', focused ? `Data: ${focused.label}` : 'Data');
    this.#wheel.setAttribute('value-text', focused ? focused.text() : 'Unassigned');
    this.#volume.value = project.volume;
    this.#volume.setAttribute('value-text', `${Math.round(project.volume * 100)}`);
    this.#fader.value = this.#controller.faderValue();
    this.#fader.setAttribute('label', `Fader: ${faderTargetLabel(project.settings.faderTarget)}`);

    const hint = ui.message || modeHint(app) || this.#controller.page.hint;
    if (this.#hint.textContent !== hint) this.#hint.textContent = hint;
  }

}

define('slab-app', SlabApp);
