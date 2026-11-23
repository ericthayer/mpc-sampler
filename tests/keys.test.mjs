import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildSynthPatches, patchPad, ROOT_NOTE, SYNTH_PATCHES } from '../dist/audio/synth-patches.js';
import { demoProject, emptyPad } from '../dist/core/defaults.js';

test('synth patches loop without a click at the seam', () => {
  for (const sample of buildSynthPatches()) {
    const data = sample.channels[0];
    const wrapJump = Math.abs(data[0] - data[data.length - 1]);
    // Largest step anywhere inside the waveform: the seam must be no bigger.
    let biggest = 0;
    for (let i = 1; i < data.length; i++) biggest = Math.max(biggest, Math.abs(data[i] - data[i - 1]));
    assert.ok(wrapJump <= biggest * 1.05, `${sample.name}: seam ${wrapJump.toFixed(4)} vs max step ${biggest.toFixed(4)}`);
    assert.ok(data.every(Number.isFinite), `${sample.name} finite`);
    assert.ok(Math.max(...data.map(Math.abs)) <= 0.91, `${sample.name} headroom`);
  }
});

test('patchPad makes a sustaining, looping voice', () => {
  const pad = patchPad(SYNTH_PATCHES[0], emptyPad());
  assert.equal(pad.loop, true);
  assert.equal(pad.mode, 'hold');
  assert.equal(pad.sampleId, SYNTH_PATCHES[0].id);
  assert.equal(ROOT_NOTE, 60);
});

test('demo project puts the synth patches on bank D', () => {
  const names = demoProject().pads.slice(48, 55).map((p) => p.name);
  assert.deepEqual(names, ['Saw Lead', 'Square Bass', 'Warm Pad', 'Sub Bass', 'Organ', 'Keys C4', 'Chord Stab']);
});

test('keymap: names, black keys, octave clamping, QWERTY labels', async () => {
  const k = await import('../dist/ui/keys/keymap.js');
  assert.equal(k.noteName(60), 'C4');
  assert.equal(k.noteName(61), 'C#4');
  assert.equal(k.isBlack(61), true);
  assert.equal(k.isBlack(64), false);
  assert.equal(k.clampLow(100, 2), 84, 'top of range');
  assert.equal(k.clampLow(10, 1), 24, 'bottom of range');
  assert.equal(k.clampLow(50, 2), 48, 'snaps to a C');
  assert.equal(k.octavesFor(400), 1);
  assert.equal(k.octavesFor(700), 2);
  assert.equal(k.octavesFor(1000), 3);
  assert.equal(k.qwertyLabel(0), 'A');
  assert.equal(k.qwertyLabel(1), 'W');
  assert.equal(k.qwertyLabel(16), ';');
  assert.equal(k.qwertyLabel(30), '');
  const options = k.soundOptions([{ sampleId: null, name: '' }, { sampleId: 'x', name: 'Kick' }]);
  assert.deepEqual(options, [{ index: 1, label: 'A02 Kick' }]);
});
