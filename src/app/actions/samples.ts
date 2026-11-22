import { crop, detectTransients, equalSlices, normalize, stretch } from '../../audio/dsp.js';
import { wavBlob } from '../../audio/wav.js';
import { emptyPad } from '../../core/defaults.js';
import { PAD_COUNT, PADS_PER_BANK, type Pad, type SampleData } from '../../core/types.js';
import { saveSample } from '../../io/db.js';
import { isAudioFile, pickAudioFiles, saveBlob } from '../../io/files.js';
import { requestPersistentStorage } from '../../io/platform.js';
import { editPad, padLabel, selectedPad, type App } from '../context.js';

function persist(sample: SampleData): void {
  void saveSample(sample).catch(() => undefined);
}

/** Point a pad at a sample and reset its region. Tuning, filter and level are kept. */
export function assignSample(app: App, index: number, sample: SampleData): void {
  editPad(
    app,
    (pad) => {
      pad.sampleId = sample.id;
      pad.name = sample.name;
      pad.start = 0;
      pad.end = 1;
    },
    index,
  );
}

/** Decode audio files onto consecutive pads starting at `startPad`. */
export async function importFiles(app: App, files: File[], startPad: number): Promise<void> {
  const audio = files.filter(isAudioFile);
  if (audio.length === 0) {
    app.say('No audio files found');
    return;
  }
  let loaded = 0;
  for (const file of audio) {
    const target = startPad + loaded;
    if (target >= PAD_COUNT) break;
    try {
      const sample = await app.engine.pool.importFile(app.engine.decodeContext, file, file.name);
      assignSample(app, target, sample);
      persist(sample);
      loaded++;
    } catch {
      app.say(`Can't decode ${file.name}`);
    }
  }
  if (loaded > 0) {
    app.ui.emit('pool');
    app.say(loaded === 1 ? `Loaded to ${padLabel(startPad)}` : `Loaded ${loaded} samples from ${padLabel(startPad)}`);
    void requestPersistentStorage();
  }
}

export async function loadFilesToPad(app: App, index: number): Promise<void> {
  const files = await pickAudioFiles();
  if (files.length > 0) await importFiles(app, files, index);
}

/** Replace a pad's audio with processed PCM. The original sample stays in the pool. */
function replaceAudio(app: App, index: number, channels: Float32Array[], sampleRate: number, suffix: string): void {
  const pad = app.project.state.pads[index]!;
  const base = pad.name.replace(/ (norm|crop|warp)$/i, '');
  const sample = app.engine.pool.create(`${base} ${suffix}`.slice(0, 24), sampleRate, channels);
  assignSample(app, index, sample);
  persist(sample);
  app.ui.emit('pool');
}

export function normalizePad(app: App): void {
  const sample = app.engine.pool.get(selectedPad(app).sampleId);
  if (!sample) return app.say('Empty pad');
  replaceAudio(app, app.ui.state.pad, normalize(sample.channels), sample.sampleRate, 'norm');
  app.say('Normalized');
}

/** Destructively trim the sample to the current start/end. */
export function cropPad(app: App): void {
  const pad = selectedPad(app);
  const sample = app.engine.pool.get(pad.sampleId);
  if (!sample) return app.say('Empty pad');
  if (pad.start <= 0 && pad.end >= 1) return app.say('Nothing to crop');
  replaceAudio(app, app.ui.state.pad, crop(sample.channels, pad.start, pad.end), sample.sampleRate, 'crop');
  app.say('Cropped to region');
}

export function clearPad(app: App, index: number): void {
  app.project.update((p) => {
    p.pads[index] = emptyPad();
  }, 'pads');
  app.say(`${padLabel(index)} cleared`);
}

export function copyPad(app: App, from: number, to: number): void {
  if (from === to) return;
  app.project.update((p) => {
    p.pads[to] = { ...p.pads[from]! };
  }, 'pads');
  app.say(`${padLabel(from)} → ${padLabel(to)}`);
}

const transientCache = new Map<string, number[]>();

/** Slice start points for the selected pad, as fractions of the whole sample. */
export function chopPoints(app: App): number[] {
  const pad = selectedPad(app);
  const { mode, slices, sensitivity } = app.ui.state.chop;
  const sample = app.engine.pool.get(pad.sampleId);
  if (!sample) return [];
  const span = pad.end - pad.start;
  if (mode === 'equal') return equalSlices(slices).map((f) => pad.start + f * span);
  const key = `${sample.id}:${sensitivity.toFixed(2)}`;
  let found = transientCache.get(key);
  if (!found) {
    found = detectTransients(sample.channels, sample.sampleRate, sensitivity, PADS_PER_BANK);
    if (transientCache.size > 24) transientCache.clear();
    transientCache.set(key, found);
  }
  const inRegion = found.filter((f) => f >= pad.start && f < pad.end - 0.005);
  return inRegion[0] === pad.start ? inRegion : [pad.start, ...inRegion].slice(0, PADS_PER_BANK);
}

/** The region `[start, end]` of slice `i`, or null if there is no such slice. */
export function chopRegion(app: App, i: number): { start: number; end: number } | null {
  const points = chopPoints(app);
  const start = points[i];
  if (start === undefined) return null;
  return { start, end: points[i + 1] ?? selectedPad(app).end };
}

/** Write each slice to a pad of the target bank. Slices share the source sample. */
export function applyChop(app: App): void {
  const source = selectedPad(app);
  const sample = app.engine.pool.get(source.sampleId);
  const points = chopPoints(app);
  if (!sample || points.length === 0) return app.say('Nothing to chop');
  const bank = app.ui.state.chop.target;
  app.project.update((p) => {
    points.forEach((start, i) => {
      const slice: Pad = {
        ...source,
        name: `${source.name.slice(0, 18)} ${i + 1}`,
        start,
        end: points[i + 1] ?? source.end,
        loop: false,
      };
      p.pads[bank * PADS_PER_BANK + i] = slice;
    });
  }, 'pads');
  app.ui.update((s) => {
    s.bank = bank;
    s.pad = bank * PADS_PER_BANK;
  }, 'bank');
  app.goto('main');
  app.say(`${points.length} slices on bank ${'ABCD'[bank]}`);
}

/** Seconds the selected pad's region should last to span `beats` at the project tempo. */
export function warpTarget(app: App): { current: number; target: number } {
  const pad = selectedPad(app);
  const current = app.engine.pool.duration(pad.sampleId) * (pad.end - pad.start);
  const target = (app.ui.state.warp.beats * 60) / app.project.state.bpm;
  return { current, target };
}

/** Fit the pad's region to a whole number of beats, by time-stretch or by re-pitching. */
export function warpPad(app: App): void {
  const pad = selectedPad(app);
  const sample = app.engine.pool.get(pad.sampleId);
  if (!sample) return app.say('Empty pad');
  const { current, target } = warpTarget(app);
  if (current <= 0) return;
  if (app.ui.state.warp.mode === 'repitch') {
    const semitones = 12 * Math.log2(current / target);
    editPad(app, (p) => {
      p.semi = Math.max(-24, Math.min(24, Math.round(semitones)));
      p.fine = Math.round((semitones - Math.round(semitones)) * 100);
    });
    app.say(`Re-pitched ${semitones >= 0 ? '+' : ''}${semitones.toFixed(2)} st`);
    return;
  }
  const region = crop(sample.channels, pad.start, pad.end);
  replaceAudio(app, app.ui.state.pad, stretch(region, sample.sampleRate, target / current), sample.sampleRate, 'warp');
  editPad(app, (p) => {
    p.semi = 0;
    p.fine = 0;
  });
  app.say(`Warped to ${app.ui.state.warp.beats} beats`);
}

/** Save the selected pad's region as a WAV file. */
export async function exportPadWav(app: App): Promise<void> {
  const pad = selectedPad(app);
  const sample = app.engine.pool.get(pad.sampleId);
  if (!sample) return app.say('Empty pad');
  const blob = wavBlob(crop(sample.channels, pad.start, pad.end), sample.sampleRate);
  const saved = await saveBlob(blob, `${pad.name || 'sample'}.wav`, 'WAV audio', '.wav');
  app.say(saved ? 'Sample saved' : 'Save cancelled');
}

/** Keep the pending recording on a pad. */
export function commitCapture(app: App, index: number): void {
  const capture = app.capture;
  if (!capture || (capture.channels[0]?.length ?? 0) === 0) return;
  const count = app.engine.pool.list().filter((s) => !s.factory).length + 1;
  const sample = app.engine.pool.create(`Rec ${count}`, capture.sampleRate, normalize(capture.channels, 0.95));
  assignSample(app, index, sample);
  persist(sample);
  app.capture = null;
  app.ui.update((s) => {
    s.recorder = 'idle';
    s.pad = index;
  }, 'recorder');
  app.ui.emit('pool');
  app.say(`Recording on ${padLabel(index)}`);
}
