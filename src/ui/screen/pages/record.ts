import { commitCapture, loadFilesToPad } from '../../../app/actions/samples.js';
import { absolutePad, padLabel, type App } from '../../../app/context.js';
import { peaks } from '../../../audio/dsp.js';
import { MAX_RECORD_SECONDS, Recorder } from '../../../audio/recorder.js';
import { explain, preflight } from '../../../io/input-access.js';
import type { InputSource } from '../../../core/types.js';
import type { SlabWaveform } from '../../components/slab-waveform.js';
import { h } from '../../dom.js';
import { choice, type PageDef } from '../page.js';

const SOURCES: readonly InputSource[] = ['mic', 'tab', 'resample'];
const SOURCE_LABELS = ['MIC', 'TAB AUDIO', 'RESAMPLE'];
const SOURCE_NOTES: Record<InputSource, string> = {
  mic: 'Microphone or audio interface',
  tab: 'Audio from another tab or app (screen share)',
  resample: "SLAB's own output — pads, sequence and FX",
};

/** Start or stop sampling. Shared by the on-screen chip and the SAMPLE RECORD button. */
export async function toggleSampling(app: App): Promise<void> {
  const ui = app.ui.state;
  if (ui.recorder === 'recording') {
    const source = app.project.state.settings.inputSource;
    app.capture = await app.recorder.stop(source !== 'resample');
    const empty = (app.capture.channels[0]?.length ?? 0) < 64;
    if (empty) app.capture = null;
    app.ui.update((s) => void (s.recorder = empty ? 'idle' : 'captured'), 'recorder');
    app.say(empty ? 'Nothing recorded' : 'Hit a pad to keep it');
    return;
  }
  if (ui.recorder === 'opening') return;
  const source = app.project.state.settings.inputSource;
  const fail = (reason: string): void => {
    app.ui.update((s) => {
      s.recorder = 'idle';
      s.recordError = reason;
    }, 'recorder');
    app.say(source === 'mic' ? 'Microphone unavailable' : 'Tab audio unavailable');
  };
  if (!Recorder.supports(source)) return fail(`${SOURCE_LABELS[SOURCES.indexOf(source)]} recording isn't supported in this browser. Use Resample or Load File.`);
  app.capture = null;
  app.ui.update((s) => {
    s.recorder = 'opening';
    s.recordError = '';
  }, 'recorder');
  if (source !== 'resample') {
    const blocked = await preflight(source);
    if (blocked) return fail(blocked);
  }
  try {
    app.recorder.onLimit = (): void => void toggleSampling(app);
    await app.recorder.start(source);
    app.ui.update((s) => void (s.recorder = 'recording'), 'recorder');
  } catch (error) {
    fail(source === 'resample' ? (error instanceof Error ? error.message : 'Could not record') : await explain(source, error));
  }
}

export const recordPage: PageDef = {
  id: 'record',
  title: 'SAMPLE REC',
  hint: 'Choose a source with K1, press SAMPLE RECORD to start and stop, then hit a pad to keep the take.',
  params: (app) => [
    choice(
      'Source',
      SOURCE_LABELS,
      () => SOURCES.indexOf(app.project.state.settings.inputSource),
      (i) => {
        app.project.update((p) => void (p.settings.inputSource = SOURCES[i]!), 'settings');
        if (app.ui.state.recordError) app.ui.update((s) => void (s.recordError = ''), 'recorder');
      },
    ),
    null,
    null,
  ],
  chips: (app) => [
    {
      label: app.ui.state.recorder === 'recording' ? 'Stop' : 'Record',
      run: () => void toggleSampling(app),
      on: () => app.ui.state.recorder === 'recording',
    },
    {
      label: 'Discard',
      run: () => {
        app.capture = null;
        app.ui.update((s) => void (s.recorder = 'idle'), 'recorder');
      },
      disabled: () => app.ui.state.recorder !== 'captured',
    },
    { label: 'Load File', run: () => void loadFilesToPad(app, app.ui.state.pad) },
  ],
  padDown: (app, pad) => {
    if (app.ui.state.recorder !== 'captured') return false;
    commitCapture(app, absolutePad(app, pad));
    return false; // let the pad play the new sample straight away
  },
  padLight: (app) => (app.ui.state.recorder === 'captured' ? 'amber-dim' : null),
  view: (app) => {
    const state = h('span', { class: 'big' });
    const note = h('span', { class: 'dim' });
    const wave = h('slab-waveform', { class: 'wave' }) as SlabWaveform;
    const problem = h('p', { class: 'notice', role: 'status' });
    let shown: unknown = null;
    const frame = (): void => {
      if (app.ui.state.recorder !== 'recording') return;
      state.textContent = `● REC ${app.recorder.elapsed.toFixed(1)}s`;
    };
    const update = (): void => {
      const ui = app.ui.state;
      const source = app.project.state.settings.inputSource;
      state.classList.toggle('rec', ui.recorder === 'recording');
      if (ui.recorder === 'idle') state.textContent = 'READY';
      else if (ui.recorder === 'opening') state.textContent = 'WAITING…';
      else if (ui.recorder === 'captured' && app.capture) {
        const length = (app.capture.channels[0]?.length ?? 0) / app.capture.sampleRate;
        state.textContent = `TAKE ${length.toFixed(2)}s`;
      }
      note.textContent =
        ui.recorder === 'captured'
          ? `Hit a pad to keep it (selected: ${padLabel(ui.pad)})`
          : ui.recorder === 'recording'
            ? `Max ${MAX_RECORD_SECONDS}s`
            : SOURCE_NOTES[source];
      if (shown !== app.capture) {
        shown = app.capture;
        wave.peaks = app.capture ? peaks(app.capture.channels, 400) : null;
      }
      const blocked = ui.recorder === 'idle' && ui.recordError !== '';
      if (problem.textContent !== ui.recordError) problem.textContent = ui.recordError;
      problem.hidden = !blocked;
      wave.hidden = blocked;
      if (blocked) state.textContent = 'BLOCKED';
      frame();
    };
    return { el: h('div', { class: 'page record' }, h('div', { class: 'head' }, state, note), wave, problem), update, frame };
  },
};
