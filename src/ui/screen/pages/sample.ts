import { clearPad, cropPad, loadFilesToPad, normalizePad } from '../../../app/actions/samples.js';
import { editPad, padLabel, selectedPad, type App } from '../../../app/context.js';
import type { FilterType, Pad } from '../../../core/types.js';
import { cutoffHz, formatHz, formatSeconds, gainToDb, signed } from '../../../core/util.js';
import type { RangeDetail, SlabWaveform } from '../../components/slab-waveform.js';
import { h } from '../../dom.js';
import { choice, onOff, range, type Chip, type PageDef, type Param } from '../page.js';

const FILTERS: readonly FilterType[] = ['off', 'lowpass', 'highpass', 'bandpass'];
const FILTER_LABELS = ['OFF', 'LOW PASS', 'HIGH PASS', 'BAND PASS'];

function padParam(
  app: App,
  label: string,
  min: number,
  max: number,
  step: number,
  key: keyof Pick<Pad, 'start' | 'end' | 'semi' | 'fine' | 'level' | 'pan' | 'cutoff' | 'res' | 'attack' | 'release'>,
  format: (value: number) => string,
  initial: number,
): Param {
  return range(label, min, max, step, () => selectedPad(app)[key], (v) => editPad(app, (p) => void (p[key] = v)), format, initial);
}

function seconds(app: App, fraction: number): string {
  return formatSeconds(fraction * app.engine.pool.duration(selectedPad(app).sampleId));
}

function params(app: App, tab: number): (Param | null)[] {
  switch (tab) {
    case 1:
      return [
        padParam(app, 'Semi', -24, 24, 1, 'semi', signed, 0),
        padParam(app, 'Fine', -50, 50, 1, 'fine', (v) => `${signed(v)}c`, 0),
        padParam(app, 'Level', 0, 1.5, 0.01, 'level', (v) => (v <= 0 ? '-inf' : `${gainToDb(v).toFixed(1)}dB`), 0.85),
      ];
    case 2:
      return [
        choice('Type', FILTER_LABELS, () => FILTERS.indexOf(selectedPad(app).filter), (i) => editPad(app, (p) => void (p.filter = FILTERS[i]!))),
        padParam(app, 'Cutoff', 0, 1, 0.005, 'cutoff', (v) => `${formatHz(cutoffHz(v))}Hz`, 1),
        padParam(app, 'Reso', 0, 1, 0.01, 'res', (v) => `${Math.round(v * 100)}`, 0.1),
      ];
    case 3:
      return [
        padParam(app, 'Attack', 0, 0.5, 0.002, 'attack', formatSeconds, 0),
        padParam(app, 'Release', 0.005, 2, 0.005, 'release', formatSeconds, 0.08),
        padParam(app, 'Pan', -1, 1, 0.02, 'pan', (v) => (Math.abs(v) < 0.01 ? 'C' : `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 50)}`), 0),
      ];
    default:
      return [
        range('Start', 0, 1, 0.001, () => selectedPad(app).start, (v) => editPad(app, (p) => void (p.start = Math.min(v, p.end - 0.002))), (v) => seconds(app, v), 0),
        range('End', 0, 1, 0.001, () => selectedPad(app).end, (v) => editPad(app, (p) => void (p.end = Math.max(v, p.start + 0.002))), (v) => seconds(app, v), 1),
        onOff('Loop', () => selectedPad(app).loop, (on) => editPad(app, (p) => void (p.loop = on))),
      ];
  }
}

function chips(app: App, tab: number): Chip[] {
  const empty = (): boolean => selectedPad(app).sampleId === null;
  if (tab === 3) {
    return [
      {
        label: 'Hold',
        run: () => editPad(app, (p) => void (p.mode = p.mode === 'hold' ? 'oneshot' : 'hold')),
        on: () => selectedPad(app).mode === 'hold',
      },
      {
        label: 'Choke',
        run: () => editPad(app, (p) => void (p.choke = (p.choke + 1) % 5)),
        on: () => selectedPad(app).choke > 0,
      },
    ];
  }
  if (tab !== 0) return [];
  return [
    { label: 'Load', run: () => void loadFilesToPad(app, app.ui.state.pad) },
    { label: 'Reverse', run: () => editPad(app, (p) => void (p.reverse = !p.reverse)), on: () => selectedPad(app).reverse, disabled: empty },
    { label: 'Normalize', run: () => normalizePad(app), disabled: empty },
    { label: 'Crop', run: () => cropPad(app), disabled: empty },
    { label: 'Clear', run: () => clearPad(app, app.ui.state.pad), disabled: empty },
  ];
}

export const samplePage: PageDef = {
  id: 'sample',
  title: 'SAMPLE',
  tabs: ['Trim', 'Tune', 'Filter', 'Amp'],
  hint: 'Hit a pad to edit it. Drag the waveform edges to trim. Wheel and −/+ fine-tune the highlighted knob.',
  params,
  chips,
  view: (app, tab) => {
    const title = h('span', { class: 'name' });
    const info = h('span', { class: 'dim' });
    const wave = h('slab-waveform', { class: 'wave', editable: tab === 0 }) as SlabWaveform;
    wave.addEventListener('slab-range', (event) => {
      const { start, end } = (event as CustomEvent<RangeDetail>).detail;
      editPad(app, (p) => {
        p.start = start;
        p.end = end;
      });
    });
    let shown: string | null | undefined;
    const update = (): void => {
      const pad = selectedPad(app);
      const duration = app.engine.pool.duration(pad.sampleId);
      title.textContent = `${padLabel(app.ui.state.pad)} ${pad.name || 'Empty'}`;
      const flags = [pad.reverse ? 'REV' : '', pad.mode === 'hold' ? 'HOLD' : '', pad.choke ? `CHOKE ${pad.choke}` : ''].filter(Boolean);
      info.textContent = pad.sampleId ? [formatSeconds(duration * (pad.end - pad.start)), ...flags].join(' · ') : 'Load or drop a file';
      if (shown !== pad.sampleId) {
        shown = pad.sampleId;
        wave.peaks = app.engine.pool.peaks(pad.sampleId);
      }
      wave.setRange(pad.start, pad.end);
    };
    return { el: h('div', { class: 'page sample' }, h('div', { class: 'head' }, title, info), wave), update };
  },
};
