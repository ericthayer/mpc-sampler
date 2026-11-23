import { FACTORY_SOUNDS } from '../audio/factory-kit.js';
import { patchPad, SYNTH_PATCHES } from '../audio/synth-patches.js';
import {
  PAD_COUNT,
  SEQ_COUNT,
  TICKS_PER_BAR,
  TICKS_PER_STEP,
  type FxState,
  type NoteEvent,
  type Pad,
  type Project,
  type Sequence,
  type Settings,
} from './types.js';
import { pad2 } from './util.js';

export function emptyPad(): Pad {
  return {
    sampleId: null,
    name: '',
    start: 0,
    end: 1,
    loop: false,
    reverse: false,
    semi: 0,
    fine: 0,
    level: 0.85,
    pan: 0,
    filter: 'off',
    cutoff: 1,
    res: 0.1,
    attack: 0,
    release: 0.08,
    mode: 'oneshot',
    choke: 0,
    mute: false,
  };
}

export function emptySequence(index: number): Sequence {
  return { name: `Seq ${pad2(index + 1)}`, bars: 2, events: [] };
}

export function defaultFx(): FxState {
  return {
    filter: { pos: 0, res: 0.15, drive: 0 },
    delay: { div: 4, feedback: 0.35, mix: 0 },
    reverb: { size: 0.5, tone: 0.6, mix: 0 },
    lofi: { bits: 12, rate: 0, mix: 0 },
    comp: { on: true, threshold: -14, ratio: 3, makeup: 2 },
  };
}

export function defaultSettings(): Settings {
  return {
    fullLevel: false,
    countIn: true,
    metronome: false,
    recQuantize: true,
    quantDiv: 3,
    swing: 50,
    levelsType: 'velocity',
    faderTarget: 'djFilter',
    midiBase: 36,
    midiTarget: 'pads',
    inputSource: 'mic',
  };
}

export function blankProject(): Project {
  return {
    version: 1,
    name: 'Untitled',
    bpm: 90,
    volume: 0.8,
    pads: Array.from({ length: PAD_COUNT }, emptyPad),
    sequences: Array.from({ length: SEQ_COUNT }, (_, i) => emptySequence(i)),
    song: [{ seq: 0, repeats: 2 }],
    fx: defaultFx(),
    settings: defaultSettings(),
  };
}

/** Compact pattern notation: `[step, velocity, semitoneOffset?]` per pad index. */
type Hit = [step: number, vel: number, semi?: number];

function pattern(hits: Record<number, Hit[]>, bars: number): NoteEvent[] {
  const events: NoteEvent[] = [];
  for (const [pad, list] of Object.entries(hits)) {
    for (const [step, vel, semi] of list) {
      if (step * TICKS_PER_STEP >= bars * TICKS_PER_BAR) continue;
      const event: NoteEvent = { tick: step * TICKS_PER_STEP, pad: Number(pad), vel, len: TICKS_PER_STEP };
      if (semi) event.semi = semi;
      events.push(event);
    }
  }
  return events.sort((a, b) => a.tick - b.tick);
}

const hats = (steps: number): Hit[] =>
  Array.from({ length: steps / 2 }, (_, i): Hit => [i * 2, i % 2 === 0 ? 96 : 62]);

/** Factory kit on bank A plus two demo sequences, so the first press of PLAY makes a beat. */
export function demoProject(): Project {
  const project = blankProject();
  project.name = 'Demo Beat';
  project.bpm = 88;
  project.settings.swing = 58;

  FACTORY_SOUNDS.forEach((sound, i) => {
    const pad = project.pads[i]!;
    pad.sampleId = sound.id;
    pad.name = sound.name;
  });
  // Bank D: synth patches for the keyboard, then the melodic one-shots from bank A.
  SYNTH_PATCHES.forEach((patch, i) => {
    project.pads[48 + i] = patchPad(patch, emptyPad());
  });
  project.pads[48 + SYNTH_PATCHES.length] = { ...emptyPad(), sampleId: 'factory:keys', name: 'Keys C4', release: 0.3, level: 0.7 };
  project.pads[49 + SYNTH_PATCHES.length] = { ...emptyPad(), sampleId: 'factory:stab', name: 'Chord Stab', level: 0.6 };

  // Hats choke each other; bass and keys respond to note length.
  project.pads[4]!.choke = 1;
  project.pads[5]!.choke = 1;
  project.pads[12]!.mode = 'hold';
  project.pads[12]!.release = 0.12;
  project.pads[13]!.level = 0.6;
  project.pads[14]!.level = 0.7;
  project.pads[15]!.loop = true;
  project.pads[15]!.mode = 'hold';
  project.pads[15]!.level = 0.5;

  const boomBap = project.sequences[0]!;
  boomBap.name = 'Boom Bap';
  boomBap.bars = 2;
  boomBap.events = pattern(
    {
      0: [[0, 118], [7, 92], [10, 112], [16, 118], [22, 96], [26, 110], [29, 84]],
      2: [[4, 112], [12, 114], [20, 112], [28, 116], [31, 58]],
      4: hats(32).filter(([step]) => step !== 30),
      5: [[30, 88]],
      6: [[15, 70]],
      12: [[0, 110, 0], [10, 100, 0], [16, 110, -4], [26, 100, -2]],
      13: [[2, 84], [18, 80]],
    },
    2,
  );
  // Bass notes last a few steps so hold mode has something to release.
  for (const event of boomBap.events) if (event.pad === 12) event.len = TICKS_PER_STEP * 5;

  const fill = project.sequences[1]!;
  fill.name = 'Half Time';
  fill.bars = 2;
  fill.events = pattern(
    {
      0: [[0, 120], [11, 100], [16, 118], [19, 90]],
      3: [[8, 112], [24, 114]],
      4: Array.from({ length: 16 }, (_, i): Hit => [i * 2 + (i % 4 === 3 ? 1 : 0), 70 + (i % 2) * 26]),
      7: [[6, 72], [14, 72], [22, 72], [30, 72]],
      12: [[0, 112, -5], [16, 112, -7]],
      14: [[4, 78, 3], [12, 74, 7], [20, 78, 3], [27, 70, 10]],
    },
    2,
  );
  for (const event of fill.events) if (event.pad === 12) event.len = TICKS_PER_STEP * 10;

  project.song = [
    { seq: 0, repeats: 2 },
    { seq: 1, repeats: 1 },
  ];
  return project;
}

/** Fill in anything missing from an older or hand-edited project file. */
export function migrateProject(raw: Partial<Project>): Project {
  const base = blankProject();
  const project: Project = { ...base, ...raw, version: 1 };
  project.pads = base.pads.map((pad, i) => ({ ...pad, ...(raw.pads?.[i] ?? {}) }));
  project.sequences = base.sequences.map((seq, i) => ({ ...seq, ...(raw.sequences?.[i] ?? {}) }));
  project.fx = {
    filter: { ...base.fx.filter, ...raw.fx?.filter },
    delay: { ...base.fx.delay, ...raw.fx?.delay },
    reverb: { ...base.fx.reverb, ...raw.fx?.reverb },
    lofi: { ...base.fx.lofi, ...raw.fx?.lofi },
    comp: { ...base.fx.comp, ...raw.fx?.comp },
  };
  project.settings = { ...base.settings, ...raw.settings };
  if (!Array.isArray(project.song) || project.song.length === 0) project.song = base.song;
  return project;
}
