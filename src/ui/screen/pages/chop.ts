import { applyChop, chopPoints, chopRegion } from '../../../app/actions/samples.js';
import { padLabel, selectedPad, type App } from '../../../app/context.js';
import { BANK_NAMES } from '../../../core/types.js';
import type { SlabWaveform } from '../../components/slab-waveform.js';
import { h } from '../../dom.js';
import { choice, range, type PageDef } from '../page.js';

function setChop(app: App, mutate: (chop: App['ui']['state']['chop']) => void): void {
  app.ui.update((s) => mutate(s.chop), 'params');
}

export const chopPage: PageDef = {
  id: 'chop',
  title: 'CHOP',
  hint: 'Pads audition the slices. Apply writes them to the target bank without altering the sample.',
  params: (app) => {
    const chop = app.ui.state.chop;
    return [
      choice('Mode', ['EQUAL', 'TRANSIENT'], () => (chop.mode === 'equal' ? 0 : 1), (i) => setChop(app, (c) => void (c.mode = i === 0 ? 'equal' : 'transient'))),
      chop.mode === 'equal'
        ? range('Slices', 2, 16, 1, () => chop.slices, (v) => setChop(app, (c) => void (c.slices = v)), (v) => `${v}`, 8)
        : range('Sens', 0, 1, 0.05, () => chop.sensitivity, (v) => setChop(app, (c) => void (c.sensitivity = v)), (v) => `${Math.round(v * 100)}%`, 0.5),
      choice('To Bank', BANK_NAMES, () => chop.target, (i) => setChop(app, (c) => void (c.target = i))),
    ];
  },
  chips: (app) => [{ label: 'Apply', run: () => applyChop(app), disabled: () => selectedPad(app).sampleId === null }],
  padDown: (app, pad, velocity) => {
    const region = chopRegion(app, pad);
    if (region) app.engine.trigger(app.ui.state.pad, selectedPad(app), velocity, undefined, { region, forceOneShot: true });
    return true;
  },
  padLight: (app, pad) => (pad < chopPoints(app).length ? 'amber-dim' : 'off'),
  view: (app) => {
    const title = h('span', { class: 'name' });
    const info = h('span', { class: 'dim' });
    const wave = h('slab-waveform', { class: 'wave' }) as SlabWaveform;
    let shown: string | null | undefined;
    const update = (): void => {
      const pad = selectedPad(app);
      const points = chopPoints(app);
      title.textContent = `${padLabel(app.ui.state.pad)} ${pad.name || 'Empty'}`;
      info.textContent = pad.sampleId ? `${points.length} slices → bank ${BANK_NAMES[app.ui.state.chop.target]}` : 'Select a pad with a sample';
      if (shown !== pad.sampleId) {
        shown = pad.sampleId;
        wave.peaks = app.engine.pool.peaks(pad.sampleId);
      }
      wave.setRange(pad.start, pad.end);
      wave.markers = points;
    };
    return { el: h('div', { class: 'page chop' }, h('div', { class: 'head' }, title, info), wave), update };
  },
};
