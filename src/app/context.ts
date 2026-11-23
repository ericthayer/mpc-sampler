import type { Engine } from '../audio/engine.js';
import type { Capture, Recorder } from '../audio/recorder.js';
import type { PageId, ProjectStore, UiStore } from '../core/state.js';
import type { History } from '../core/store.js';
import { BANK_NAMES, PADS_PER_BANK, type Pad, type Sequence } from '../core/types.js';
import { pad2 } from '../core/util.js';
import type { MidiInput } from '../io/midi.js';
import type { Sequencer } from '../seq/sequencer.js';

/** Everything an action or screen page needs. Built once in `createApp()`. */
export interface App {
  project: ProjectStore;
  ui: UiStore;
  engine: Engine;
  sequencer: Sequencer;
  recorder: Recorder;
  history: History<Sequence[]>;
  midi: MidiInput;
  /** A finished recording waiting to be dropped on a pad. */
  capture: Capture | null;
  /** Flash a short status message on the display. */
  say: (message: string) => void;
  goto: (page: PageId, tab?: number) => void;
}

export function selectedPad(app: App): Pad {
  return app.project.state.pads[app.ui.state.pad]!;
}

export function currentSequence(app: App): Sequence {
  return app.project.state.sequences[app.ui.state.seq]!;
}

export function absolutePad(app: App, inBank: number): number {
  return app.ui.state.bank * PADS_PER_BANK + inBank;
}

/** "A01" style label for an absolute pad index. */
export function padLabel(index: number): string {
  return `${BANK_NAMES[Math.floor(index / PADS_PER_BANK)] ?? '?'}${pad2((index % PADS_PER_BANK) + 1)}`;
}

/** Mutate the selected (or a given) pad and notify. */
export function editPad(app: App, mutate: (pad: Pad) => void, index = app.ui.state.pad): void {
  app.project.update((p) => {
    const pad = p.pads[index];
    if (pad) mutate(pad);
  }, 'pads');
}
