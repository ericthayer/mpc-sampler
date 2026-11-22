import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crop, detectTransients, equalSlices, normalize, peakLevel, peaks, reverse, stretch, trimLeadingSilence } from '../dist/audio/dsp.js';
import { buildFactoryKit } from '../dist/audio/factory-kit.js';
import { encodeWav } from '../dist/audio/wav.js';

const SR = 44100;
const sine = (seconds, freq = 220, amp = 0.5) =>
  Float32Array.from({ length: Math.round(seconds * SR) }, (_, i) => Math.sin((2 * Math.PI * freq * i) / SR) * amp);

test('normalize hits the target peak', () => {
  const out = normalize([sine(0.1, 220, 0.2)], 0.9);
  assert.ok(Math.abs(peakLevel(out) - 0.9) < 1e-3);
});

test('reverse and crop return new arrays of the right shape', () => {
  const src = Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...reverse([src])[0]], [8, 7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual([...crop([src], 0.25, 0.75)[0]], [3, 4, 5, 6]);
  assert.deepEqual([...src], [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('peaks returns min/max pairs', () => {
  const p = peaks([sine(0.5)], 100);
  assert.equal(p.length, 200);
  assert.ok(p[0] <= 0 && p[1] >= 0);
});

test('equalSlices divides evenly', () => {
  assert.deepEqual(equalSlices(4), [0, 0.25, 0.5, 0.75]);
});

test('detectTransients finds hits spaced through silence', () => {
  const data = new Float32Array(SR * 2);
  const hits = [0, 0.5, 1.0, 1.5];
  for (const at of hits) {
    const from = Math.round(at * SR);
    for (let i = 0; i < 4000; i++) data[from + i] = Math.sin(i * 0.3) * Math.exp(-i / 800);
  }
  const found = detectTransients([data], SR, 0.5, 16);
  assert.equal(found.length, 4);
  found.forEach((f, i) => assert.ok(Math.abs(f * 2 - hits[i]) < 0.02, `slice ${i} at ${f * 2}`));
});

test('stretch changes length by the ratio and keeps the pitch', () => {
  const src = sine(1, 220, 0.5);
  for (const ratio of [0.5, 1.5, 2]) {
    const out = stretch([src], SR, ratio)[0];
    assert.equal(out.length, Math.round(src.length * ratio));
    // Count zero crossings in the middle second-ish: frequency should still be ~220 Hz.
    let crossings = 0;
    const from = Math.floor(out.length * 0.25);
    const to = Math.floor(out.length * 0.75);
    for (let i = from + 1; i < to; i++) if (out[i - 1] <= 0 && out[i] > 0) crossings++;
    const freq = crossings / ((to - from) / SR);
    assert.ok(Math.abs(freq - 220) < 8, `ratio ${ratio}: ${freq.toFixed(1)} Hz`);
    assert.ok(peakLevel([out.subarray(from, to)]) > 0.3, 'no drop-outs');
  }
});

test('trimLeadingSilence removes the quiet lead-in', () => {
  const data = new Float32Array(SR);
  data.fill(0.5, SR / 2);
  const out = trimLeadingSilence([data], SR, 0.01)[0];
  assert.ok(out.length < SR / 2 + 200 && out.length >= SR / 2);
});

test('factory kit: 16 finite, audible, non-clipping sounds', () => {
  const kit = buildFactoryKit();
  assert.equal(kit.length, 16);
  for (const sound of kit) {
    const ch = sound.channels[0];
    assert.ok(ch.length > 1000, sound.name);
    assert.ok(ch.every(Number.isFinite), `${sound.name} finite`);
    const peak = peakLevel(sound.channels);
    assert.ok(peak > 0.2 && peak <= 1, `${sound.name} peak ${peak}`);
  }
});

test('encodeWav writes a valid 16-bit header', () => {
  const buf = encodeWav([sine(0.01), sine(0.01)], SR);
  const view = new DataView(buf);
  const tag = (o) => String.fromCharCode(...new Uint8Array(buf, o, 4));
  assert.equal(tag(0), 'RIFF');
  assert.equal(tag(8), 'WAVE');
  assert.equal(view.getUint16(22, true), 2);
  assert.equal(view.getUint32(24, true), SR);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(view.getUint32(40, true), 441 * 4);
  assert.equal(buf.byteLength, 44 + 441 * 4);
});
