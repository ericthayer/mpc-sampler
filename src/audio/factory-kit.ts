/**
 * Procedural factory kit. Every sound is synthesised from maths at boot, so the
 * app ships no audio assets and makes sound the moment it opens.
 */
import type { SampleData } from '../core/types.js';
import { biquad } from './dsp.js';

const SR = 44100;

/** Deterministic noise so the kit sounds identical on every load. */
function makeNoise(seed: number): () => number {
  let s = seed >>> 0;
  return (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x7fffffff - 1;
  };
}

function render(seconds: number, fn: (t: number, i: number) => number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR));
  for (let i = 0; i < out.length; i++) out[i] = fn(i / SR, i);
  return fadeOut(out);
}

function fadeOut(data: Float32Array, seconds = 0.004): Float32Array {
  const n = Math.min(data.length, Math.round(seconds * SR));
  for (let i = 0; i < n; i++) data[data.length - 1 - i]! *= i / n;
  return data;
}

function gain(data: Float32Array, peak = 0.92): Float32Array {
  let max = 0;
  for (const v of data) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < data.length; i++) data[i]! *= peak / max;
  return data;
}

const exp = (t: number, rate: number): number => Math.exp(-t * rate);
const TAU = Math.PI * 2;
const drive = (x: number, amount: number): number => Math.tanh(x * amount) / Math.tanh(amount);

/** Sine with an exponential pitch drop from f0 to f1. Returns phase-accurate output. */
function sweep(seconds: number, f0: number, f1: number, pitchRate: number, ampRate: number): Float32Array {
  let phase = 0;
  return render(seconds, (t) => {
    const f = f1 + (f0 - f1) * exp(t, pitchRate);
    phase += (TAU * f) / SR;
    return Math.sin(phase) * exp(t, ampRate);
  });
}

function kick(): Float32Array {
  const body = sweep(0.55, 165, 44, 26, 6.5);
  const noise = makeNoise(11);
  for (let i = 0; i < 180; i++) body[i]! += noise() * 0.35 * (1 - i / 180);
  return gain(body.map((v) => drive(v, 1.8)));
}

function kickPunch(): Float32Array {
  const body = sweep(0.28, 240, 62, 42, 13);
  return gain(body.map((v) => drive(v, 2.6)));
}

function snare(): Float32Array {
  const noise = makeNoise(23);
  const rattle = biquad(render(0.3, (t) => noise() * exp(t, 17)), SR, 'highpass', 1400, 0.7);
  const tone = sweep(0.3, 260, 182, 30, 22);
  return gain(rattle.map((v, i) => drive(v * 0.8 + tone[i]! * 0.75, 1.6)));
}

function clap(): Float32Array {
  const noise = makeNoise(37);
  const bursts = [0, 0.011, 0.022, 0.034];
  const raw = render(0.34, (t) => {
    let env = 0;
    for (const b of bursts) if (t >= b) env = Math.max(env, exp(t - b, b === 0.034 ? 14 : 190));
    return noise() * env;
  });
  return gain(biquad(raw, SR, 'bandpass', 1250, 1.1));
}

function hat(seconds: number, rate: number, seed: number): Float32Array {
  const noise = makeNoise(seed);
  const freqs = [3210, 4115, 5433, 6790, 8123, 9871];
  const phases = freqs.map(() => 0);
  const raw = render(seconds, (t) => {
    let metal = 0;
    for (let k = 0; k < freqs.length; k++) {
      phases[k]! += (TAU * freqs[k]!) / SR;
      metal += Math.sign(Math.sin(phases[k]!));
    }
    return (metal / freqs.length + noise() * 0.6) * exp(t, rate);
  });
  return gain(biquad(raw, SR, 'highpass', 7200, 0.8), 0.8);
}

function rim(): Float32Array {
  const noise = makeNoise(51);
  const raw = render(0.09, (t) => (Math.sin(TAU * 1720 * t) * 0.7 + Math.sin(TAU * 470 * t) * 0.4 + noise() * 0.3) * exp(t, 75));
  return gain(biquad(raw, SR, 'bandpass', 1700, 1.4));
}

function shaker(): Float32Array {
  const noise = makeNoise(63);
  const raw = render(0.16, (t) => noise() * Math.min(1, t * 90) * exp(t, 26));
  return gain(biquad(raw, SR, 'bandpass', 6400, 1.2), 0.7);
}

function tom(f: number): Float32Array {
  const body = sweep(0.42, f * 1.9, f, 22, 8.5);
  return gain(body.map((v) => drive(v, 1.4)), 0.88);
}

function cowbell(): Float32Array {
  const raw = render(0.3, (t) => {
    const sq = Math.sign(Math.sin(TAU * 587 * t)) + Math.sign(Math.sin(TAU * 845 * t));
    return sq * 0.5 * (exp(t, 60) * 0.6 + exp(t, 9) * 0.4);
  });
  return gain(biquad(raw, SR, 'bandpass', 1100, 1.6), 0.75);
}

function crash(): Float32Array {
  const noise = makeNoise(77);
  const raw = render(1.5, (t) => {
    const ring = Math.sin(TAU * 5273 * t) * Math.sin(TAU * 7919 * t);
    return (noise() * 0.8 + ring * 0.4) * exp(t, 3.1);
  });
  return gain(biquad(raw, SR, 'highpass', 5200, 0.7), 0.7);
}

/** Tuned to C2 so 16 Levels (tune) plays it chromatically. */
function bass808(): Float32Array {
  const f = 32.7 * 2;
  let phase = 0;
  const raw = render(1.3, (t) => {
    const freq = f + f * 1.5 * exp(t, 55);
    phase += (TAU * freq) / SR;
    return drive(Math.sin(phase) * Math.min(1, t * 400) * exp(t, 2.6), 2.2);
  });
  return gain(raw, 0.9);
}

function saw(phase: number): number {
  return 2 * (phase - Math.floor(phase + 0.5));
}

/** Detuned-saw minor 9th chord through a closing filter. */
function stab(): Float32Array {
  const notes = [220, 261.63, 329.63, 392, 493.88]; // A C E G B
  const raw = render(0.7, (t) => {
    let v = 0;
    for (const n of notes) v += saw(n * t) + saw(n * 1.006 * t + 0.3) + saw(n * 0.994 * t + 0.6);
    return (v / 15) * Math.min(1, t * 300) * exp(t, 5.5);
  });
  // Two cascaded low-passes at a static cutoff approximate a mellow sampled chord.
  return gain(biquad(biquad(raw, SR, 'lowpass', 1900, 0.9), SR, 'lowpass', 2600, 0.7), 0.8);
}

/** Electric-piano-like FM pluck at C4. */
function keys(): Float32Array {
  const f = 261.63;
  const raw = render(0.9, (t) => {
    const mod = Math.sin(TAU * f * 14 * t) * exp(t, 40) * 0.6 + Math.sin(TAU * f * t) * exp(t, 5) * 1.1;
    return Math.sin(TAU * f * t + mod) * Math.min(1, t * 500) * exp(t, 4.2);
  });
  return gain(raw, 0.75);
}

function vinyl(): Float32Array {
  const noise = makeNoise(91);
  const hiss = biquad(render(2, () => noise() * 0.05), SR, 'bandpass', 3000, 0.4);
  const crackle = makeNoise(92);
  for (let i = 0; i < hiss.length; i++) if (crackle() > 0.9993) hiss[i]! += crackle() * 0.5;
  // No fade: this one is meant to loop.
  return gain(hiss, 0.35);
}

interface FactorySound {
  id: string;
  name: string;
  make: () => Float32Array;
}

export const FACTORY_SOUNDS: readonly FactorySound[] = [
  { id: 'factory:kick', name: 'Kick Deep', make: kick },
  { id: 'factory:kick2', name: 'Kick Punch', make: kickPunch },
  { id: 'factory:snare', name: 'Snare', make: snare },
  { id: 'factory:clap', name: 'Clap', make: clap },
  { id: 'factory:hat', name: 'Hat Closed', make: () => hat(0.09, 62, 5) },
  { id: 'factory:ohat', name: 'Hat Open', make: () => hat(0.42, 9, 6) },
  { id: 'factory:rim', name: 'Rimshot', make: rim },
  { id: 'factory:shaker', name: 'Shaker', make: shaker },
  { id: 'factory:tomlo', name: 'Tom Low', make: () => tom(88) },
  { id: 'factory:tomhi', name: 'Tom High', make: () => tom(142) },
  { id: 'factory:cowbell', name: 'Cowbell', make: cowbell },
  { id: 'factory:crash', name: 'Crash', make: crash },
  { id: 'factory:808', name: '808 Bass', make: bass808 },
  { id: 'factory:stab', name: 'Chord Stab', make: stab },
  { id: 'factory:keys', name: 'Keys C4', make: keys },
  { id: 'factory:vinyl', name: 'Vinyl Noise', make: vinyl },
];

export function buildFactoryKit(): SampleData[] {
  return FACTORY_SOUNDS.map((sound) => ({
    id: sound.id,
    name: sound.name,
    sampleRate: SR,
    channels: [sound.make()],
    factory: true,
  }));
}
