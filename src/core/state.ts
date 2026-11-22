/** Transient UI/session state. Never saved with the project. */
import { Store } from './store.js';
import type { Project } from './types.js';

export type PageId =
  | 'main' | 'sample' | 'record' | 'browser' | 'chop' | 'seq' | 'step' | 'padfx'
  | 'knobfx' | 'comp' | 'midi' | 'fader' | 'song' | 'timing' | 'warp' | 'project';

export type ProjectTopic = 'project' | 'pads' | 'seq' | 'fx' | 'settings' | 'tempo' | 'song' | 'volume';
export type UiTopic =
  | 'page' | 'bank' | 'pad' | 'seq' | 'shift' | 'modes' | 'transport' | 'focus'
  | 'message' | 'recorder' | 'params' | 'midi' | 'pool';

export type RecorderState = 'idle' | 'opening' | 'recording' | 'captured';
export type MidiStatus = 'off' | 'on' | 'denied' | 'unsupported';

export interface UiState {
  page: PageId;
  tab: number;
  bank: number;
  /** Selected pad, absolute index 0..63. */
  pad: number;
  seq: number;
  /** Sequence queued to start at the next loop point. */
  nextSeq: number | null;
  shift: boolean;
  shiftLatched: boolean;
  muteMode: boolean;
  levels16: boolean;
  noteRepeat: boolean;
  triplet: boolean;
  eraseMode: boolean;
  fxLatch: boolean;
  /** Pad copy: waiting for a source pad, then a destination pad. */
  copyStage: 'off' | 'source' | 'dest';
  copyFrom: number;
  /** Which of the three knob parameters the data wheel adjusts. */
  focus: number;
  playing: boolean;
  recording: boolean;
  countingIn: boolean;
  songMode: boolean;
  songStep: number;
  stepBar: number;
  stepVel: number;
  message: string;
  recorder: RecorderState;
  chop: { mode: 'equal' | 'transient'; slices: number; sensitivity: number; target: number };
  warp: { beats: number; mode: 'stretch' | 'repitch' };
  /** Time Correct strength, 0..1. */
  correctStrength: number;
  /** Row highlighted on the Song page. */
  songCursor: number;
  browserIndex: number;
  /** Pad FX currently engaged (in-bank pad indices). */
  activeFx: number[];
  midi: { status: MidiStatus; inputs: string[] };
  canInstall: boolean;
}

export function initialUi(): UiState {
  return {
    page: 'main',
    tab: 0,
    bank: 0,
    pad: 0,
    seq: 0,
    nextSeq: null,
    shift: false,
    shiftLatched: false,
    muteMode: false,
    levels16: false,
    noteRepeat: false,
    triplet: false,
    eraseMode: false,
    fxLatch: false,
    copyStage: 'off',
    copyFrom: 0,
    focus: 0,
    playing: false,
    recording: false,
    countingIn: false,
    songMode: false,
    songStep: 0,
    stepBar: 0,
    stepVel: 100,
    message: '',
    recorder: 'idle',
    chop: { mode: 'equal', slices: 8, sensitivity: 0.5, target: 1 },
    warp: { beats: 4, mode: 'stretch' },
    correctStrength: 1,
    songCursor: 0,
    browserIndex: 0,
    activeFx: [],
    midi: { status: 'off', inputs: [] },
    canInstall: false,
  };
}

export type ProjectStore = Store<Project, ProjectTopic>;
export type UiStore = Store<UiState, UiTopic>;
