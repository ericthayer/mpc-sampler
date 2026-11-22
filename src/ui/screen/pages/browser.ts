import { assignSample, loadFilesToPad } from '../../../app/actions/samples.js';
import { padLabel, type App } from '../../../app/context.js';
import { emptyPad } from '../../../core/defaults.js';
import type { SampleData } from '../../../core/types.js';
import { clamp, formatSeconds } from '../../../core/util.js';
import { saveSample } from '../../../io/db.js';
import { clear, h } from '../../dom.js';
import type { PageDef } from '../page.js';

const PREVIEW_VOICE = 999;
const VISIBLE = 5;

function samples(app: App): SampleData[] {
  return app.engine.pool.list();
}

function highlighted(app: App): SampleData | undefined {
  const list = samples(app);
  return list[clamp(app.ui.state.browserIndex, 0, list.length - 1)];
}

function preview(app: App): void {
  const sample = highlighted(app);
  if (!sample) return;
  app.engine.start();
  app.engine.trigger(PREVIEW_VOICE, { ...emptyPad(), sampleId: sample.id }, 110);
}

export const browserPage: PageDef = {
  id: 'browser',
  title: 'SAMPLES',
  hint: 'Turn K1 or the wheel to browse, then Assign to put the sample on the selected pad.',
  params: (app) => {
    const last = (): number => Math.max(1, samples(app).length - 1);
    return [
      {
        label: 'Sample',
        get: () => clamp(app.ui.state.browserIndex, 0, last()) / last(),
        set: (n) => {
          const index = clamp(Math.round(n * last()), 0, samples(app).length - 1);
          if (index === app.ui.state.browserIndex) return;
          app.ui.update((s) => void (s.browserIndex = index), 'params');
          preview(app);
        },
        text: () => highlighted(app)?.name ?? '—',
        steps: last(),
      },
      null,
      null,
    ];
  },
  chips: (app) => [
    {
      label: `Assign ${padLabel(app.ui.state.pad)}`,
      run: () => {
        const sample = highlighted(app);
        if (!sample) return;
        assignSample(app, app.ui.state.pad, sample);
        void saveSample(sample).catch(() => undefined);
        app.say(`${sample.name} → ${padLabel(app.ui.state.pad)}`);
      },
    },
    { label: 'Preview', run: () => preview(app) },
    { label: 'Load Files', run: () => void loadFilesToPad(app, app.ui.state.pad) },
  ],
  view: (app) => {
    const list = h('ol', { class: 'list' });
    const count = h('span', { class: 'dim' });
    let signature = '';
    const update = (): void => {
      const all = samples(app);
      const index = clamp(app.ui.state.browserIndex, 0, Math.max(0, all.length - 1));
      const first = clamp(index - Math.floor(VISIBLE / 2), 0, Math.max(0, all.length - VISIBLE));
      const next = `${all.length}:${index}:${first}`;
      if (next === signature) return;
      signature = next;
      count.textContent = `${all.length} in pool`;
      clear(list);
      all.slice(first, first + VISIBLE).forEach((sample, i) => {
        const at = first + i;
        const row = h(
          'li',
          { class: at === index ? 'row on' : 'row' },
          h(
            'button',
            {
              type: 'button',
              onclick: () => {
                app.ui.update((s) => void (s.browserIndex = at), 'params');
                preview(app);
              },
            },
            h('span', { class: 'name' }, sample.name),
            h('span', { class: 'dim' }, `${sample.factory ? 'FACTORY · ' : ''}${formatSeconds((sample.channels[0]?.length ?? 0) / sample.sampleRate)}`),
          ),
        );
        list.append(row);
      });
    };
    return { el: h('div', { class: 'page browser' }, h('div', { class: 'head' }, h('span', { class: 'name' }, 'Sample pool'), count), list), update };
  },
};
