import { selectSequence } from '../../../app/actions/sequence.js';
import { currentSequence, padLabel, selectedPad, type App } from '../../../app/context.js';
import { SEQ_COUNT } from '../../../core/types.js';
import { pad2 } from '../../../core/util.js';
import { position } from '../../../seq/timing.js';
import type { SlabWaveform } from '../../components/slab-waveform.js';
import { h } from '../../dom.js';
import { choice, range, type PageDef } from '../page.js';

const SEQ_LABELS = Array.from({ length: SEQ_COUNT }, (_, i) => pad2(i + 1));

export function tempoParam(app: App): ReturnType<typeof range> {
  return range(
    'Tempo',
    40,
    240,
    0.5,
    () => app.project.state.bpm,
    (v) => app.project.update((p) => void (p.bpm = v), 'tempo'),
    (v) => v.toFixed(1),
    90,
  );
}

export function swingParam(app: App): ReturnType<typeof range> {
  return range(
    'Swing',
    50,
    75,
    1,
    () => app.project.state.settings.swing,
    (v) => app.project.update((p) => void (p.settings.swing = v), 'settings'),
    (v) => `${v}%`,
    50,
  );
}

export const mainPage: PageDef = {
  id: 'main',
  title: 'MAIN',
  hint: 'Keys 1234 · QWER · ASDF · ZXCV play the pads. Space = play/stop. Drop audio files on any pad.',
  params: (app) => [
    tempoParam(app),
    swingParam(app),
    choice('Seq', SEQ_LABELS, () => app.ui.state.nextSeq ?? app.ui.state.seq, (i) => selectSequence(app, i)),
  ],
  chips: (app) => [
    {
      label: 'Song',
      run: () => app.ui.update((s) => void (s.songMode = !s.songMode), 'transport'),
      on: () => app.ui.state.songMode,
    },
    {
      label: 'Metro',
      run: () => app.project.update((p) => void (p.settings.metronome = !p.settings.metronome), 'settings'),
      on: () => app.project.state.settings.metronome,
    },
    {
      label: 'Full Lvl',
      run: () => app.project.update((p) => void (p.settings.fullLevel = !p.settings.fullLevel), 'settings'),
      on: () => app.project.state.settings.fullLevel,
    },
  ],
  view: (app) => {
    const seqNumber = h('span', { class: 'big' });
    const seqName = h('span', { class: 'name' });
    const bpm = h('span', { class: 'big' });
    const pos = h('span', { class: 'big mono' });
    const bars = h('span', { class: 'dim' });
    const padName = h('span', { class: 'name' });
    const wave = h('slab-waveform', { class: 'wave' }) as SlabWaveform;
    const el = h(
      'div',
      { class: 'page main' },
      h('div', { class: 'cells' },
        h('div', { class: 'cell' }, h('span', { class: 'k' }, 'SEQ'), seqNumber, seqName),
        h('div', { class: 'cell' }, h('span', { class: 'k' }, 'BPM'), bpm, bars),
        h('div', { class: 'cell' }, h('span', { class: 'k' }, 'BAR.BEAT'), pos, h('span', { class: 'dim' }, ' ')),
      ),
      h('div', { class: 'padrow' }, padName, wave),
    );
    let shownSample: string | null | undefined;
    const frame = (): void => {
      const tick = app.sequencer.positionTick();
      const p = position(tick);
      const text = tick < 0 ? `-${Math.ceil(-tick / 96)}` : `${pad2(p.bar)}.${p.beat}`;
      if (pos.textContent !== text) pos.textContent = text;
    };
    const update = (): void => {
      const ui = app.ui.state;
      const seq = currentSequence(app);
      const pad = selectedPad(app);
      seqNumber.textContent = pad2(ui.seq + 1) + (ui.nextSeq !== null ? `→${pad2(ui.nextSeq + 1)}` : '');
      seqName.textContent = ui.songMode ? `Song step ${ui.songStep + 1}` : seq.name;
      bpm.textContent = app.project.state.bpm.toFixed(1);
      bars.textContent = `${seq.bars} bar${seq.bars > 1 ? 's' : ''} · ${seq.events.length} ev`;
      padName.textContent = `${padLabel(ui.pad)} ${pad.name || 'Empty — drop a file here'}`;
      if (shownSample !== pad.sampleId) {
        shownSample = pad.sampleId;
        wave.peaks = app.engine.pool.peaks(pad.sampleId);
      }
      wave.setRange(pad.start, pad.end);
      frame();
    };
    return { el, update, frame };
  },
};
