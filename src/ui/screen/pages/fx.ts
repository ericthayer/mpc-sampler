import type { App } from '../../../app/context.js';
import type { FlexMode } from '../../../audio/engine.js';
import { defaultFx } from '../../../core/defaults.js';
import { DELAY_DIVISIONS, type FxState } from '../../../core/types.js';
import { formatHz, formatPercent } from '../../../core/util.js';
import { h } from '../../dom.js';
import { choice, line, padGrid, range, type PageDef, type Param } from '../page.js';

interface PadFx {
  label: string;
  mode: FlexMode;
  /** Length in beats for tempo-synced effects. */
  beats: number;
}

/** Pad 1 is bottom-left: the bottom row is stutters, the top row is the wild stuff. */
export const PAD_FX: readonly PadFx[] = [
  { label: 'STUT 1/4', mode: 'stutter', beats: 1 },
  { label: 'STUT 1/8', mode: 'stutter', beats: 0.5 },
  { label: 'STUT 1/16', mode: 'stutter', beats: 0.25 },
  { label: 'STUT 1/32', mode: 'stutter', beats: 0.125 },
  { label: 'STUT 1/8T', mode: 'stutter', beats: 1 / 3 },
  { label: 'ROLL UP', mode: 'roll', beats: 0.5 },
  { label: 'GATE 1/8', mode: 'gate', beats: 0.5 },
  { label: 'GATE 1/16', mode: 'gate', beats: 0.25 },
  { label: 'LP SWEEP', mode: 'lpf', beats: 1 },
  { label: 'HP SWEEP', mode: 'hpf', beats: 1 },
  { label: 'CRUSH', mode: 'crush', beats: 1 },
  { label: 'FLANGE', mode: 'flange', beats: 1 },
  { label: 'HALF SPD', mode: 'half', beats: 1 },
  { label: 'TAPE STOP', mode: 'tapestop', beats: 1 },
  { label: 'REVERSE', mode: 'reverse', beats: 1 },
  { label: 'ECHO OUT', mode: 'echo', beats: 0.75 },
];

export function engagePadFx(app: App, pad: number): void {
  const fx = PAD_FX[pad];
  if (!fx) return;
  if (!app.engine.hasWorklet) return app.say('Pad FX need AudioWorklet support');
  app.engine.flex(fx.mode, (fx.beats * 60) / app.project.state.bpm);
  app.ui.update((s) => void (s.activeFx = [pad]), 'modes');
}

export function releasePadFx(app: App, pad?: number): void {
  if (pad !== undefined && !app.ui.state.activeFx.includes(pad)) return;
  if (app.ui.state.activeFx.length === 0) return;
  if (app.engine.hasWorklet) app.engine.flex('off');
  app.ui.update((s) => void (s.activeFx = []), 'modes');
}

/** PAD FX: each pad is a momentary effect on the whole mix. */
export const padFxPage: PageDef = {
  id: 'padfx',
  title: 'PAD FX',
  hint: 'Hold a pad to bend the whole mix. Latch keeps the effect on until you hit the pad again.',
  params: () => [null, null, null],
  chips: (app) => [
    { label: 'Latch', run: () => app.ui.update((s) => void (s.fxLatch = !s.fxLatch), 'modes'), on: () => app.ui.state.fxLatch },
    { label: 'All Off', run: () => releasePadFx(app), disabled: () => app.ui.state.activeFx.length === 0 },
  ],
  padDown: (app, pad) => {
    if (app.ui.state.fxLatch && app.ui.state.activeFx.includes(pad)) releasePadFx(app, pad);
    else engagePadFx(app, pad);
    return true;
  },
  padUp: (app, pad) => {
    if (!app.ui.state.fxLatch) releasePadFx(app, pad);
  },
  padLight: (app, pad) => (app.ui.state.activeFx.includes(pad) ? 'amber' : 'amber-dim'),
  view: (app) => {
    const cells = PAD_FX.map((fx) => h('span', { class: 'cell' }, fx.label));
    const update = (): void => {
      cells.forEach((cell, i) => cell.classList.toggle('on', app.ui.state.activeFx.includes(i)));
    };
    return { el: h('div', { class: 'page padfx' }, padGrid(cells)), update };
  },
};

function fxParam<K extends keyof FxState>(
  app: App,
  label: string,
  group: K,
  key: keyof FxState[K],
  min: number,
  max: number,
  step: number,
  format: (value: number) => string,
): Param {
  const initial = defaultFx()[group][key] as number;
  return range(
    label,
    min,
    max,
    step,
    () => app.project.state.fx[group][key] as number,
    (v) => app.project.update((p) => void ((p.fx[group][key] as number) = v), 'fx'),
    format,
    initial,
  );
}

function filterText(pos: number): string {
  if (Math.abs(pos) <= 0.04) return 'OPEN';
  const t = (Math.abs(pos) - 0.04) / 0.96;
  return pos < 0 ? `LP ${formatHz(20000 * Math.pow(90 / 20000, t))}` : `HP ${formatHz(20 * Math.pow(7000 / 20, t))}`;
}

function summary(fx: FxState): string[] {
  return [
    `${filterText(fx.filter.pos)}${fx.filter.drive > 0 ? ` · drive ${formatPercent(fx.filter.drive)}` : ''}`,
    fx.delay.mix > 0 ? `${DELAY_DIVISIONS[fx.delay.div]?.label} · fb ${formatPercent(fx.delay.feedback)} · ${formatPercent(fx.delay.mix)}` : 'off',
    fx.reverb.mix > 0 ? `size ${formatPercent(fx.reverb.size)} · ${formatPercent(fx.reverb.mix)}` : 'off',
    fx.lofi.mix > 0 ? `${fx.lofi.bits} bit · ${formatPercent(fx.lofi.mix)}` : 'off',
  ];
}

const FX_TABS = ['Filter', 'Delay', 'Reverb', 'Lo-Fi'] as const;
const FX_KEYS = ['filter', 'delay', 'reverb', 'lofi'] as const;

/** KNOB FX: four always-on master effects; the tabs choose which one K1–K3 control. */
export const knobFxPage: PageDef = {
  id: 'knobfx',
  title: 'KNOB FX',
  tabs: FX_TABS,
  hint: 'K1–K3 shape the master effect on the current tab. Double-click a knob to reset it.',
  params: (app, tab) => {
    switch (tab) {
      case 1:
        return [
          choice('Time', DELAY_DIVISIONS.map((d) => d.label), () => app.project.state.fx.delay.div, (i) => app.project.update((p) => void (p.fx.delay.div = i), 'fx')),
          fxParam(app, 'Feedback', 'delay', 'feedback', 0, 0.9, 0.01, formatPercent),
          fxParam(app, 'Mix', 'delay', 'mix', 0, 1, 0.01, formatPercent),
        ];
      case 2:
        return [
          fxParam(app, 'Size', 'reverb', 'size', 0, 1, 0.05, formatPercent),
          fxParam(app, 'Tone', 'reverb', 'tone', 0, 1, 0.01, formatPercent),
          fxParam(app, 'Mix', 'reverb', 'mix', 0, 1, 0.01, formatPercent),
        ];
      case 3:
        return [
          fxParam(app, 'Bits', 'lofi', 'bits', 4, 16, 1, (v) => `${v}`),
          fxParam(app, 'Rate', 'lofi', 'rate', 0, 1, 0.01, formatPercent),
          fxParam(app, 'Mix', 'lofi', 'mix', 0, 1, 0.01, formatPercent),
        ];
      default:
        return [
          fxParam(app, 'Filter', 'filter', 'pos', -1, 1, 0.01, filterText),
          fxParam(app, 'Reso', 'filter', 'res', 0, 1, 0.01, formatPercent),
          fxParam(app, 'Drive', 'filter', 'drive', 0, 1, 0.01, formatPercent),
        ];
    }
  },
  chips: (app, tab) => [
    {
      label: `Reset ${FX_TABS[tab]}`,
      run: () => {
        const key = FX_KEYS[tab]!;
        app.project.update((p) => void Object.assign(p.fx[key], defaultFx()[key]), 'fx');
      },
    },
    {
      label: 'Reset All',
      run: () => app.project.update((p) => void (p.fx = { ...defaultFx(), comp: p.fx.comp }), 'fx'),
    },
  ],
  view: (app, tab) => {
    const rows = FX_TABS.map((name) => line(name.toUpperCase()));
    rows.forEach((row, i) => row.el.classList.toggle('on', i === tab));
    const update = (): void => {
      summary(app.project.state.fx).forEach((text, i) => rows[i]!.set(text));
    };
    return { el: h('div', { class: 'page lines' }, ...rows.map((r) => r.el)), update };
  },
};

/** COMPRESSOR: glue on the master bus. */
export const compPage: PageDef = {
  id: 'comp',
  title: 'COMPRESSOR',
  hint: 'Master bus compressor. Lower the threshold for more squash, then add make-up gain.',
  params: (app) => [
    fxParam(app, 'Thresh', 'comp', 'threshold', -40, 0, 0.5, (v) => `${v.toFixed(1)}dB`),
    fxParam(app, 'Ratio', 'comp', 'ratio', 1, 20, 0.5, (v) => `${v.toFixed(1)}:1`),
    fxParam(app, 'Makeup', 'comp', 'makeup', 0, 12, 0.5, (v) => `+${v.toFixed(1)}dB`),
  ],
  chips: (app) => [
    { label: 'Enabled', run: () => app.project.update((p) => void (p.fx.comp.on = !p.fx.comp.on), 'fx'), on: () => app.project.state.fx.comp.on },
  ],
  view: (app) => {
    const state = line('STATE');
    const detail = line('CURVE');
    const update = (): void => {
      const comp = app.project.state.fx.comp;
      state.set(comp.on ? 'ON' : 'BYPASSED');
      detail.set(`${comp.threshold.toFixed(1)} dB · ${comp.ratio.toFixed(1)}:1 · +${comp.makeup.toFixed(1)} dB`);
    };
    return { el: h('div', { class: 'page lines' }, state.el, detail.el), update };
  },
};
