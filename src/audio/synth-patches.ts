/**
 * Factory synth patches for the keyboard. Each is a seamless single-note loop at C4
 * (MIDI 60), built only from whole-number cycles over the loop length, so playing it
 * with `loop` + `hold` sustains for as long as a key is held, with no click at the seam.
 */
import type { Pad, SampleData } from '../core/types.js';

const SR = 44100;
/** Cycles of C4 in the loop: ~1 s. Neighbouring counts (261, 263) give a ~6.6-cent detune. */
const CYCLES = 262;
const LENGTH = Math.round((CYCLES * SR) / 261.6256);

export const ROOT_NOTE = 60;

type Partials = readonly (readonly [harmonic: number, amplitude: number])[];

const saw = (count: number, tilt = 1): Partials =>
  Array.from({ length: count }, (_, i) => [i + 1, (i % 2 === 0 ? 1 : -1) / Math.pow(i + 1, tilt)] as const);
const square = (count: number): Partials =>
  Array.from({ length: count }, (_, i) => [i * 2 + 1, 1 / (i * 2 + 1)] as const);

/** Sum partials of each oscillator; every frequency is an integer number of cycles in LENGTH. */
function loop(oscillators: readonly { cycles: number; partials: Partials; gain?: number }[]): Float32Array {
  const table = new Float32Array(LENGTH);
  for (let i = 0; i < LENGTH; i++) table[i] = Math.sin((2 * Math.PI * i) / LENGTH);
  const out = new Float32Array(LENGTH);
  for (const osc of oscillators) {
    for (const [harmonic, amplitude] of osc.partials) {
      const step = (osc.cycles * harmonic) % LENGTH;
      const a = amplitude * (osc.gain ?? 1);
      let index = 0;
      for (let n = 0; n < LENGTH; n++) {
        out[n]! += table[index]! * a;
        index += step;
        if (index >= LENGTH) index -= LENGTH;
      }
    }
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  for (let n = 0; n < LENGTH; n++) out[n]! *= 0.9 / peak;
  return out;
}

export interface SynthPatch {
  id: string;
  name: string;
  make: () => Float32Array;
  /** Pad settings that turn the loop into a playable voice. */
  pad: Partial<Pad>;
}

// 24 harmonics keep a C4 saw below 6.3 kHz, so two octaves up still sits under Nyquist.
export const SYNTH_PATCHES: readonly SynthPatch[] = [
  {
    id: 'factory:saw-lead',
    name: 'Saw Lead',
    make: () => loop([{ cycles: CYCLES, partials: saw(24) }, { cycles: CYCLES + 1, partials: saw(24) }]),
    pad: { filter: 'lowpass', cutoff: 0.74, res: 0.25, attack: 0.004, release: 0.18, level: 0.55 },
  },
  {
    id: 'factory:square-bass',
    name: 'Square Bass',
    make: () => loop([{ cycles: CYCLES, partials: square(12) }]),
    pad: { semi: -12, filter: 'lowpass', cutoff: 0.6, res: 0.3, attack: 0.002, release: 0.07, level: 0.65 },
  },
  {
    id: 'factory:warm-pad',
    name: 'Warm Pad',
    make: () =>
      loop([
        { cycles: CYCLES - 1, partials: saw(16, 1.4) },
        { cycles: CYCLES, partials: saw(16, 1.4) },
        { cycles: CYCLES + 1, partials: saw(16, 1.4) },
      ]),
    pad: { filter: 'lowpass', cutoff: 0.66, res: 0.1, attack: 0.35, release: 1.2, level: 0.45 },
  },
  {
    id: 'factory:sub-bass',
    name: 'Sub Bass',
    make: () => loop([{ cycles: CYCLES, partials: [[1, 1], [2, 0.12]] }]),
    pad: { semi: -24, attack: 0.004, release: 0.12, level: 0.85 },
  },
  {
    id: 'factory:organ',
    name: 'Organ',
    make: () => loop([{ cycles: CYCLES, partials: [[1, 1], [2, 0.7], [3, 0.5], [4, 0.35], [6, 0.2], [8, 0.15]] }]),
    pad: { attack: 0.008, release: 0.06, level: 0.5 },
  },
];

export function buildSynthPatches(): SampleData[] {
  return SYNTH_PATCHES.map((patch) => ({
    id: patch.id,
    name: patch.name,
    sampleRate: SR,
    channels: [patch.make()],
    factory: true,
  }));
}

/** Pad settings for a patch, applied on top of an empty pad. */
export function patchPad(patch: SynthPatch, base: Pad): Pad {
  return { ...base, ...patch.pad, sampleId: patch.id, name: patch.name, start: 0, end: 1, loop: true, mode: 'hold', reverse: false, choke: 0, mute: false };
}
