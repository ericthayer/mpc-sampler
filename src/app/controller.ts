import type { PageId } from '../core/state.js';
import { PADS_PER_BANK, type FaderTarget } from '../core/types.js';
import { clamp } from '../core/util.js';
import { hapticTick } from '../io/platform.js';
import { tapTempo } from '../seq/timing.js';
import type { PageDef, Param } from '../ui/screen/page.js';
import { releasePadFx } from '../ui/screen/pages/fx.js';
import { PAGES } from '../ui/screen/pages/index.js';
import { toggleSampling } from '../ui/screen/pages/record.js';
import { copyPad, exportPadWav, importFiles, loadFilesToPad, normalizePad } from './actions/samples.js';
import { openProjectFile } from './actions/project.js';
import { clearSequence, erasePadEvents, redo, undo } from './actions/sequence.js';
import { absolutePad, editPad, padLabel, selectedPad, type App } from './context.js';
import { runShiftFunction } from './shift-functions.js';

export type ButtonId =
  | 'sample' | 'seq' | 'padfx' | 'knobfx' | 'chop' | 'mute' | 'loop' | 'levels'
  | 'shift' | 'bank' | 'select' | 'tap' | 'minus' | 'plus'
  | 'srec' | 'qrec' | 'stop' | 'play' | 'erase' | 'repeat';

const SHIFT_TAP_MS = 350;

/**
 * Translates hardware gestures (buttons, pads, knobs, wheel, fader) into actions.
 * Fires `pad` (detail: in-bank index) whenever the player strikes a pad to make sound.
 */
export class Controller extends EventTarget {
  #shiftDownAt = 0;
  #shiftUsed = false;
  #taps: number[] = [];
  /** What each held pad is doing, so its release matches its press even if the mode changes. */
  #downPads = new Map<number, { target: number; page: PageDef | null }>();

  constructor(private readonly app: App) {
    super();
  }

  get page(): PageDef {
    return PAGES[this.app.ui.state.page];
  }

  get params(): (Param | null)[] {
    const page = this.page;
    const tab = page.tabs ? Math.min(this.app.ui.state.tab, page.tabs.length - 1) : 0;
    return page.params(this.app, tab);
  }

  /** True if SHIFT is held or latched. Consumes a latch. */
  #takeShift(): boolean {
    const ui = this.app.ui.state;
    const active = ui.shift || ui.shiftLatched;
    if (active) {
      this.#shiftUsed = true;
      if (ui.shiftLatched) this.app.ui.update((s) => void (s.shiftLatched = false), 'shift');
    }
    return active;
  }

  #togglePage(page: PageId): void {
    this.app.goto(this.app.ui.state.page === page ? 'main' : page);
  }

  press(id: ButtonId): void {
    const { app } = this;
    app.engine.start();
    if (id === 'shift') {
      this.#shiftDownAt = performance.now();
      this.#shiftUsed = false;
      app.ui.update((s) => void (s.shift = true), 'shift');
      return;
    }
    const shift = this.#takeShift();
    const ui = app.ui.state;
    switch (id) {
      case 'sample':
        return shift ? app.goto('record') : this.#togglePage('sample');
      case 'seq':
        return this.#togglePage(shift ? 'step' : 'seq');
      case 'padfx':
        if (shift) app.ui.update((s) => void (s.fxLatch = !s.fxLatch), 'modes');
        return shift ? app.goto('padfx') : this.#togglePage('padfx');
      case 'knobfx':
        return shift ? app.goto('knobfx', ui.page === 'knobfx' ? (ui.tab + 1) % 4 : ui.tab) : this.#togglePage('knobfx');
      case 'chop':
        return shift ? normalizePad(app) : this.#togglePage('chop');
      case 'mute':
        if (shift) {
          app.project.update((p) => p.pads.forEach((pad) => void (pad.mute = false)), 'pads');
          return app.say('All pads unmuted');
        }
        return app.ui.update((s) => void (s.muteMode = !s.muteMode), 'modes');
      case 'loop':
        return shift ? editPad(app, (p) => void (p.reverse = !p.reverse)) : editPad(app, (p) => void (p.loop = !p.loop));
      case 'levels':
        if (shift) {
          app.project.update((p) => void (p.settings.levelsType = p.settings.levelsType === 'velocity' ? 'tune' : 'velocity'), 'settings');
          return app.say(`16 Levels: ${app.project.state.settings.levelsType}`);
        }
        return app.ui.update((s) => void (s.levels16 = !s.levels16), 'modes');
      case 'bank':
        return app.ui.update((s) => {
          s.bank = (s.bank + (shift ? 3 : 1)) % 4;
          s.pad = s.bank * PADS_PER_BANK + (s.pad % PADS_PER_BANK);
        }, 'bank');
      case 'select':
        return shift ? void exportPadWav(app) : this.#togglePage('browser');
      case 'tap':
        return shift ? this.#toggleMetronome() : this.#tap();
      case 'minus':
        return shift ? undo(app) : this.wheel(-1, false);
      case 'plus':
        return shift ? redo(app) : this.wheel(1, false);
      case 'srec':
        if (shift) return void loadFilesToPad(app, ui.pad);
        if (ui.page !== 'record') return app.goto('record');
        return void toggleSampling(app);
      case 'qrec':
        return shift ? clearSequence(app) : app.sequencer.toggleRecord();
      case 'stop':
        releasePadFx(app);
        app.sequencer.releaseAll();
        return app.sequencer.stop();
      case 'play':
        return app.sequencer.play(shift);
      case 'erase':
        if (shift) {
          app.ui.update((s) => void (s.copyStage = s.copyStage === 'off' ? 'source' : 'off'), 'modes');
          return app.say(app.ui.state.copyStage === 'source' ? 'Copy: hit the source pad' : 'Copy cancelled');
        }
        return app.ui.update((s) => void (s.eraseMode = !s.eraseMode), 'modes');
      case 'repeat':
        return app.ui.update((s) => void (shift ? (s.triplet = !s.triplet) : (s.noteRepeat = !s.noteRepeat)), 'modes');
    }
  }

  /**
   * `latch`: a quick tap of the on-screen SHIFT latches it for the next press, so it
   * works with one finger or a mouse. The keyboard's Shift key never latches.
   */
  release(id: ButtonId, latch = true): void {
    if (id !== 'shift' || !this.app.ui.state.shift) return;
    const quick = latch && performance.now() - this.#shiftDownAt < SHIFT_TAP_MS;
    this.app.ui.update((s) => {
      s.shift = false;
      s.shiftLatched = quick && !this.#shiftUsed ? !s.shiftLatched : false;
    }, 'shift');
  }

  #toggleMetronome(): void {
    this.app.project.update((p) => void (p.settings.metronome = !p.settings.metronome), 'settings');
    this.app.say(`Metronome ${this.app.project.state.settings.metronome ? 'on' : 'off'}`);
  }

  #tap(): void {
    this.#taps.push(performance.now());
    if (this.#taps.length > 8) this.#taps.shift();
    const bpm = tapTempo(this.#taps);
    if (bpm === null) return;
    this.app.project.update((p) => void (p.bpm = clamp(bpm, 40, 240)), 'tempo');
  }

  padDown(inBank: number, velocity: number): void {
    const { app } = this;
    app.engine.start();
    const index = absolutePad(app, inBank);
    if (this.#takeShift()) return runShiftFunction(app, inBank);

    const ui = app.ui.state;
    if (ui.copyStage === 'source') {
      app.ui.update((s) => {
        s.copyFrom = index;
        s.copyStage = 'dest';
      }, 'modes');
      return app.say(`Copy ${padLabel(index)}: hit the destination`);
    }
    if (ui.copyStage === 'dest') {
      copyPad(app, ui.copyFrom, index);
      return app.ui.update((s) => void (s.copyStage = 'off'), 'modes');
    }

    hapticTick();
    this.dispatchEvent(new CustomEvent<number>('pad', { detail: inBank }));
    const page = this.page;
    if (page.padDown?.(app, inBank, velocity)) {
      this.#downPads.set(inBank, { target: -1, page });
      return;
    }
    if (ui.muteMode) return editPad(app, (p) => void (p.mute = !p.mute), index);
    if (ui.eraseMode) {
      if (ui.playing) {
        app.sequencer.padDown(index, velocity);
        this.#downPads.set(inBank, { target: index, page: null });
      } else erasePadEvents(app, index);
      return;
    }

    const settings = app.project.state.settings;
    let target = index;
    let vel = settings.fullLevel ? 127 : velocity;
    let semi = 0;
    if (ui.levels16) {
      // The 16 pads become 16 velocities, or 16 semitones, of the selected pad.
      target = ui.pad;
      if (settings.levelsType === 'velocity') vel = Math.round(((inBank + 1) / PADS_PER_BANK) * 127);
      else semi = inBank - 4;
    } else if (ui.pad !== index) {
      app.ui.update((s) => void (s.pad = index), 'pad');
    }
    const pad = app.project.state.pads[target]!;
    app.engine.trigger(target, pad, vel, undefined, semi ? { semi } : undefined);
    app.sequencer.padDown(target, vel, semi);
    this.#downPads.set(inBank, { target, page: null });
  }

  padUp(inBank: number): void {
    const down = this.#downPads.get(inBank);
    if (!down) return;
    this.#downPads.delete(inBank);
    if (down.page) return down.page.padUp?.(this.app, inBank);
    // With 16 Levels several pads share one voice; only release when the last one lifts.
    const stillHeld = [...this.#downPads.values()].some((other) => other.target === down.target);
    if (stillHeld) return;
    this.app.engine.release(down.target);
    this.app.sequencer.padUp(down.target);
  }

  /** Audio files dropped on a pad load from that pad onward; a .slab file opens a project. */
  drop(inBank: number, files: File[]): void {
    const project = files.find((file) => /\.(slab|zip)$/i.test(file.name));
    if (project) void openProjectFile(this.app, project);
    else void importFiles(this.app, files, absolutePad(this.app, inBank));
  }

  knob(index: number, value: number): void {
    const param = this.params[index];
    if (!param) return;
    if (this.app.ui.state.focus !== index) this.app.ui.update((s) => void (s.focus = index), 'focus');
    param.set(value);
  }

  knobReset(index: number): void {
    this.params[index]?.reset?.();
  }

  focus(index: number): void {
    if (this.params[index]) this.app.ui.update((s) => void (s.focus = index), 'focus');
  }

  /** Data wheel and −/+ nudge the focused parameter one detent (or a tenth with `fine`). */
  wheel(delta: number, fine: boolean): void {
    const params = this.params;
    const param = params[this.app.ui.state.focus] ?? params.find((p) => p !== null);
    if (!param) return;
    const step = 1 / Math.max(1, param.steps);
    param.set(clamp(param.get() + delta * (fine && param.steps > 20 ? step / 4 : step), 0, 1));
  }

  volume(value: number): void {
    this.app.project.update((p) => void (p.volume = value), 'volume');
  }

  fader(value: number): void {
    const { app } = this;
    const target: FaderTarget = app.project.state.settings.faderTarget;
    switch (target) {
      case 'volume':
        return this.volume(value);
      case 'djFilter':
        return app.project.update((p) => void (p.fx.filter.pos = Math.abs(value - 0.5) < 0.03 ? 0 : value * 2 - 1), 'fx');
      case 'padLevel':
        return editPad(app, (p) => void (p.level = value * 1.5));
      case 'padTune':
        return editPad(app, (p) => void (p.semi = Math.round((value - 0.5) * 24)));
      case 'padCutoff':
        return editPad(app, (p) => {
          p.cutoff = value;
          if (p.filter === 'off') p.filter = 'lowpass';
        });
    }
  }

  /** Where the fader should sit for the current target. */
  faderValue(): number {
    const { project } = this.app;
    const pad = selectedPad(this.app);
    switch (project.state.settings.faderTarget) {
      case 'volume':
        return project.state.volume;
      case 'djFilter':
        return (project.state.fx.filter.pos + 1) / 2;
      case 'padLevel':
        return pad.level / 1.5;
      case 'padTune':
        return clamp(pad.semi / 24 + 0.5, 0, 1);
      case 'padCutoff':
        return pad.cutoff;
    }
  }
}
