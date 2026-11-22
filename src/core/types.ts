/** Project data model. Everything in `Project` is plain JSON and is what gets saved. */

export const BANKS = 4;
export const PADS_PER_BANK = 16;
export const PAD_COUNT = BANKS * PADS_PER_BANK;
export const SEQ_COUNT = 16;

/** Sequencer resolution: ticks per quarter note. 4/4 only. */
export const PPQ = 96;
export const TICKS_PER_STEP = PPQ / 4;
export const STEPS_PER_BAR = 16;
export const TICKS_PER_BAR = PPQ * 4;
export const MAX_BARS = 8;

export const BANK_NAMES = ['A', 'B', 'C', 'D'] as const;

export type FilterType = 'off' | 'lowpass' | 'highpass' | 'bandpass';
export type PadMode = 'oneshot' | 'hold';

export interface Pad {
  sampleId: string | null;
  name: string;
  /** Playback region as a fraction of the sample, 0..1. */
  start: number;
  end: number;
  loop: boolean;
  reverse: boolean;
  semi: number;
  fine: number;
  /** Linear gain, 0..1.5. */
  level: number;
  pan: number;
  filter: FilterType;
  /** Normalised 0..1, mapped logarithmically to 20 Hz..20 kHz. */
  cutoff: number;
  res: number;
  attack: number;
  release: number;
  mode: PadMode;
  /** 0 = none. Pads sharing a group cut each other off. */
  choke: number;
  mute: boolean;
}

export interface NoteEvent {
  tick: number;
  /** Absolute pad index, 0..63. */
  pad: number;
  /** 1..127 */
  vel: number;
  /** Length in ticks; only audible for hold-mode and looping pads. */
  len: number;
  /** Semitone offset recorded from 16 Levels (tune). */
  semi?: number;
}

export interface Sequence {
  name: string;
  bars: number;
  events: NoteEvent[];
}

export interface SongStep {
  seq: number;
  repeats: number;
}

export interface FxState {
  /** DJ filter: -1 = fully low-passed, 0 = open, 1 = fully high-passed. */
  filter: { pos: number; res: number; drive: number };
  /** `div` indexes DELAY_DIVISIONS. */
  delay: { div: number; feedback: number; mix: number };
  reverb: { size: number; tone: number; mix: number };
  lofi: { bits: number; rate: number; mix: number };
  comp: { on: boolean; threshold: number; ratio: number; makeup: number };
}

export type LevelsType = 'velocity' | 'tune';
export type FaderTarget = 'volume' | 'padLevel' | 'padTune' | 'padCutoff' | 'djFilter';
export type InputSource = 'mic' | 'tab' | 'resample';

export interface Settings {
  fullLevel: boolean;
  countIn: boolean;
  metronome: boolean;
  recQuantize: boolean;
  /** Indexes QUANT_DIVISIONS. */
  quantDiv: number;
  /** 50 (straight) .. 75 */
  swing: number;
  levelsType: LevelsType;
  faderTarget: FaderTarget;
  /** MIDI note mapped to pad 1 of the current bank. */
  midiBase: number;
  inputSource: InputSource;
}

export interface Project {
  version: 1;
  name: string;
  bpm: number;
  volume: number;
  pads: Pad[];
  sequences: Sequence[];
  song: SongStep[];
  fx: FxState;
  settings: Settings;
}

/** Raw PCM a sample is made of. Independent of any AudioContext. */
export interface SampleData {
  id: string;
  name: string;
  sampleRate: number;
  channels: Float32Array[];
  /** Regenerated at boot; never written to storage. */
  factory?: boolean;
}

export interface Division {
  label: string;
  ticks: number;
}

export const QUANT_DIVISIONS: readonly Division[] = [
  { label: '1/4', ticks: 96 },
  { label: '1/8', ticks: 48 },
  { label: '1/8T', ticks: 32 },
  { label: '1/16', ticks: 24 },
  { label: '1/16T', ticks: 16 },
  { label: '1/32', ticks: 12 },
  { label: '1/32T', ticks: 8 },
];

export const DELAY_DIVISIONS: readonly Division[] = [
  { label: '1/32', ticks: 12 },
  { label: '1/16', ticks: 24 },
  { label: '1/8T', ticks: 32 },
  { label: '1/8', ticks: 48 },
  { label: '3/16', ticks: 72 },
  { label: '1/4', ticks: 96 },
  { label: '3/8', ticks: 144 },
  { label: '1/2', ticks: 192 },
];
