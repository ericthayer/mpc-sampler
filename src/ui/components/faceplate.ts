/** The faceplate's buttons: what each is called, its SHIFT function, and how its cap looks. */
import type { App } from '../../app/context.js';
import type { ButtonId } from '../../app/controller.js';
import { h } from '../dom.js';
import './slab-button.js';
import type { SlabButton } from './slab-button.js';

export interface ButtonSpec {
  id: ButtonId;
  label: string;
  sub: string;
  tone?: 'dark' | 'orange' | 'blue';
  led?: 'red' | 'green' | 'amber' | 'white';
  toggle?: boolean;
}

export const MODE_BUTTONS: ButtonSpec[] = [
  { id: 'sample', label: 'Sample', sub: 'Input', toggle: true },
  { id: 'seq', label: 'Seq', sub: 'Step Edit', toggle: true },
  { id: 'padfx', label: 'Pad FX', sub: 'Latch', tone: 'orange', toggle: true },
  { id: 'knobfx', label: 'Knob FX', sub: 'FX Select', tone: 'orange', toggle: true },
];
export const PLAY_BUTTONS: ButtonSpec[] = [
  { id: 'chop', label: 'Chop', sub: 'Normalize', tone: 'blue', toggle: true },
  { id: 'mute', label: 'Mute', sub: 'Unmute All', tone: 'blue', toggle: true },
  { id: 'loop', label: 'Loop', sub: 'Reverse', tone: 'blue', toggle: true },
  { id: 'levels', label: '16 Levels', sub: 'Type', tone: 'blue', toggle: true },
];
export const UTILITY_BUTTONS: ButtonSpec[] = [
  { id: 'shift', label: 'Shift', sub: ' ', tone: 'dark', toggle: true },
  { id: 'bank', label: 'Pad Bank', sub: 'Previous' },
  { id: 'erase', label: 'Erase', sub: 'Copy Pad', toggle: true },
  { id: 'repeat', label: 'Note Repeat', sub: 'Triplet', toggle: true },
  { id: 'select', label: 'Sample Select', sub: 'Save Sample', toggle: true },
  { id: 'tap', label: 'Tap Tempo', sub: 'Metro' },
  { id: 'minus', label: '−', sub: 'Undo' },
  { id: 'plus', label: '+', sub: 'Redo' },
];
export const TRANSPORT_BUTTONS: ButtonSpec[] = [
  { id: 'srec', label: 'Sample Record', sub: 'Load File', led: 'red', toggle: true },
  { id: 'qrec', label: 'Seq Record', sub: 'Clear Seq', led: 'red', toggle: true },
  { id: 'stop', label: 'Stop', sub: ' ', tone: 'dark', led: 'white' },
  { id: 'play', label: 'Play', sub: 'Continue', tone: 'dark', led: 'green', toggle: true },
];

export function button(spec: ButtonSpec): SlabButton {
  return h('slab-button', { id: spec.id, label: spec.label, sub: spec.sub, tone: spec.tone, led: spec.led, toggle: spec.toggle }) as SlabButton;
}

/** One-line explanation of the active pad mode, shown on the strip under the pads. */
export function modeHint(app: App): string {
  const ui = app.ui.state;
  if (ui.shift || ui.shiftLatched) return 'SHIFT: pads and buttons run the function printed beneath them.';
  if (ui.copyStage === 'source') return 'COPY: hit the pad to copy from.';
  if (ui.copyStage === 'dest') return 'COPY: hit the pad to copy to.';
  if (ui.eraseMode) return ui.playing ? 'ERASE: hold a pad to wipe its notes as they pass.' : 'ERASE: hit a pad to clear its notes from this sequence.';
  if (ui.muteMode) return 'MUTE: hit pads to silence or restore them. Lit pads are audible.';
  if (ui.levels16) return `16 LEVELS: the pads play the selected pad at 16 ${app.project.state.settings.levelsType === 'tune' ? 'pitches' : 'velocities'}.`;
  if (ui.noteRepeat) return 'NOTE REPEAT: hold a pad to retrigger it on the Time Correct grid.';
  return '';
}
