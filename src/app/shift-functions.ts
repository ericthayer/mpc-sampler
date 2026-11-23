import { doubleSeq, halfSequence } from './actions/sequence.js';
import { editPad, type App } from './context.js';

export interface ShiftFunction {
  label: string;
  /** Abbreviation printed under the pad, like a hardware legend. */
  short: string;
  run: (app: App) => void;
}

function toggleSetting(app: App, key: 'fullLevel' | 'countIn' | 'recQuantize', name: string): void {
  app.project.update((p) => void (p.settings[key] = !p.settings[key]), 'settings');
  app.say(`${name} ${app.project.state.settings[key] ? 'on' : 'off'}`);
}

function shiftOctave(app: App, semitones: number, name: string): void {
  editPad(app, (p) => void (p.semi = Math.max(-24, Math.min(24, p.semi + semitones))));
  app.say(name);
}

/** SHIFT + pad 1..16. Index 0 is pad 1 (bottom-left). */
export const SHIFT_FUNCTIONS: readonly ShiftFunction[] = [
  { label: 'Full Level', short: 'Full Lvl', run: (app) => toggleSetting(app, 'fullLevel', 'Full level') },
  { label: 'Half Seq', short: 'Half Seq', run: halfSequence },
  { label: 'Double Seq', short: 'Dbl Seq', run: doubleSeq },
  { label: 'Count-In', short: 'Count-In', run: (app) => toggleSetting(app, 'countIn', 'Count-in') },
  { label: 'Compressor', short: 'Comp', run: (app) => app.goto('comp') },
  { label: 'Half Speed', short: 'Half Spd', run: (app) => shiftOctave(app, -12, 'Half speed') },
  { label: 'Double Speed', short: 'Dbl Spd', run: (app) => shiftOctave(app, 12, 'Double speed') },
  { label: 'MIDI Config', short: 'MIDI', run: (app) => app.goto('midi') },
  { label: 'Fader', short: 'Fader', run: (app) => app.goto('fader') },
  { label: 'Rec Quantize', short: 'Rec Quant', run: (app) => toggleSetting(app, 'recQuantize', 'Rec quantize') },
  {
    label: 'Resample', short: 'Resample',
    run: (app) => {
      app.project.update((p) => void (p.settings.inputSource = 'resample'), 'settings');
      app.goto('record');
    },
  },
  { label: 'Song', short: 'Song', run: (app) => app.goto('song') },
  { label: 'Trim Sample', short: 'Trim', run: (app) => app.goto('sample', 0) },
  { label: 'Time Correct', short: 'T.Correct', run: (app) => app.goto('timing') },
  { label: 'Warp', short: 'Warp', run: (app) => app.goto('warp') },
  { label: 'Project', short: 'Project', run: (app) => app.goto('project') },
];

export function runShiftFunction(app: App, pad: number): void {
  SHIFT_FUNCTIONS[pad]?.run(app);
}
