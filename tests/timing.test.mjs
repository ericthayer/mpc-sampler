import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  doubleSequence, halveSequence, indexByTick, position, quantizeTick, quantizeToward,
  secondsPerTick, swingFactor, tapTempo,
} from '../dist/seq/timing.js';

test('secondsPerTick: 120 BPM at 96 PPQ', () => {
  assert.ok(Math.abs(secondsPerTick(120) - 0.5 / 96) < 1e-12);
});

test('swing preserves the length of every 8th-note pair', () => {
  for (const swing of [50, 58, 66, 75]) {
    let total = 0;
    for (let tick = 0; tick < 48; tick++) total += swingFactor(tick, swing);
    assert.ok(Math.abs(total - 48) < 1e-9, `swing ${swing}`);
  }
  assert.equal(swingFactor(0, 50), 1);
  assert.ok(swingFactor(0, 66) > 1 && swingFactor(24, 66) < 1);
});

test('quantizeTick snaps to the grid and wraps at the loop end', () => {
  assert.equal(quantizeTick(13, 24, 384), 24);
  assert.equal(quantizeTick(11, 24, 384), 0);
  assert.equal(quantizeTick(380, 24, 384), 0);
});

test('quantizeToward moves part of the way', () => {
  assert.equal(quantizeToward(10, 24, 384, 0), 10);
  assert.equal(quantizeToward(10, 24, 384, 1), 0);
  assert.equal(quantizeToward(10, 24, 384, 0.5), 5);
});

test('halve and double sequences', () => {
  const seq = { name: 's', bars: 2, events: [{ tick: 0, pad: 0, vel: 100, len: 24 }, { tick: 400, pad: 1, vel: 90, len: 24 }] };
  const half = halveSequence(seq);
  assert.equal(half.bars, 1);
  assert.deepEqual(half.events.map((e) => e.tick), [0]);
  assert.equal(halveSequence(half), null);
  const twice = doubleSequence(seq);
  assert.equal(twice.bars, 4);
  assert.deepEqual(twice.events.map((e) => e.tick), [0, 400, 768, 1168]);
  assert.equal(doubleSequence({ ...seq, bars: 8 }), null);
  assert.equal(seq.events.length, 2, 'input is not mutated');
});

test('indexByTick groups simultaneous events', () => {
  const index = indexByTick([{ tick: 0, pad: 0, vel: 1, len: 1 }, { tick: 0, pad: 1, vel: 1, len: 1 }, { tick: 24, pad: 0, vel: 1, len: 1 }]);
  assert.equal(index.get(0).length, 2);
  assert.equal(index.get(24).length, 1);
});

test('position is 1-based bar and beat', () => {
  assert.deepEqual(position(0), { bar: 1, beat: 1, sub: 0 });
  assert.deepEqual(position(384 + 96 * 2 + 5), { bar: 2, beat: 3, sub: 5 });
});

test('tapTempo averages recent taps and rejects long gaps', () => {
  assert.equal(tapTempo([0]), null);
  assert.equal(tapTempo([0, 500, 1000, 1500]), 120);
  assert.equal(tapTempo([0, 500, 4000]), null);
});
