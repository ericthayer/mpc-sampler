import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankProject, demoProject, migrateProject } from '../dist/core/defaults.js';
import { History, Store } from '../dist/core/store.js';
import { decodeProject, encodeProject } from '../dist/io/project-file.js';

test('project file round-trips settings and sample PCM', () => {
  const project = demoProject();
  project.name = 'Round Trip';
  const samples = [
    { id: 'a', name: 'Mono', sampleRate: 44100, channels: [Float32Array.from([0, 0.25, -0.5, 1])] },
    { id: 'b', name: 'Stereo ünï', sampleRate: 48000, channels: [Float32Array.from([0.1, 0.2]), Float32Array.from([-0.1, -0.2])] },
  ];
  const bundle = decodeProject(encodeProject(project, samples));
  assert.deepEqual(bundle.project, JSON.parse(JSON.stringify(project)));
  assert.equal(bundle.samples.length, 2);
  assert.deepEqual([...bundle.samples[0].channels[0]], [0, 0.25, -0.5, 1]);
  assert.equal(bundle.samples[1].name, 'Stereo ünï');
  assert.equal(bundle.samples[1].sampleRate, 48000);
  assert.ok(Math.abs(bundle.samples[1].channels[1][1] + 0.2) < 1e-7);
});

test('decodeProject rejects foreign and truncated files', () => {
  assert.throws(() => decodeProject(new TextEncoder().encode('RIFF....WAVE').buffer), /Not a SLAB/);
  const good = encodeProject(blankProject(), [{ id: 'a', name: 'x', sampleRate: 44100, channels: [new Float32Array(100)] }]);
  assert.throws(() => decodeProject(good.slice(0, good.byteLength - 40)), /truncated/);
});

test('migrateProject fills gaps from older files', () => {
  const migrated = migrateProject({ name: 'Old', bpm: 101, pads: [{ sampleId: 'x', name: 'Kick' }], fx: { delay: { mix: 0.4 } } });
  assert.equal(migrated.pads.length, 64);
  assert.equal(migrated.pads[0].name, 'Kick');
  assert.equal(migrated.pads[0].end, 1);
  assert.equal(migrated.sequences.length, 16);
  assert.equal(migrated.fx.delay.mix, 0.4);
  assert.equal(typeof migrated.fx.delay.feedback, 'number');
  assert.equal(migrated.settings.swing, 50);
});

test('demo project events sit inside their sequences', () => {
  const project = demoProject();
  for (const seq of project.sequences) {
    for (const event of seq.events) {
      assert.ok(event.tick >= 0 && event.tick < seq.bars * 384);
      assert.ok(event.vel >= 1 && event.vel <= 127);
    }
  }
});

test('Store notifies with the topic; History undoes and redoes', () => {
  const store = new Store({ n: 0 });
  const seen = [];
  const off = store.subscribe((topic) => seen.push(topic));
  store.update((s) => void (s.n = 1), 'a');
  off();
  store.update((s) => void (s.n = 2), 'b');
  assert.deepEqual(seen, ['a']);

  const history = new History(2);
  history.push('one');
  history.push('two');
  history.push('three');
  assert.equal(history.undo('now'), 'three');
  assert.equal(history.redo('three'), 'now');
  assert.equal(history.undo('now'), 'three');
  assert.equal(history.undo('three'), 'two');
  assert.equal(history.undo('two'), null, 'bounded to the limit');
});

test('zip wrapper round-trips a file and matches a known CRC', async () => {
  const { crc32, unzipFirst, zipStore } = await import('../dist/io/zip.js');
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const data = Uint8Array.from({ length: 1000 }, (_, i) => (i * 7) % 256);
  const zip = zipStore('beat.wav', data);
  const entry = unzipFirst(zip.buffer);
  assert.equal(entry.name, 'beat.wav');
  assert.deepEqual([...new Uint8Array(entry.data)], [...data]);
  assert.equal(unzipFirst(new ArrayBuffer(64)), null);
});
