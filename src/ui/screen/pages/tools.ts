import { bounceToWav } from '../../../app/actions/project.js';
import { warpPad, warpTarget } from '../../../app/actions/samples.js';
import { timeCorrect } from '../../../app/actions/sequence.js';
import { currentSequence, padLabel, selectedPad, type App } from '../../../app/context.js';
import { QUANT_DIVISIONS, SEQ_COUNT } from '../../../core/types.js';
import { clamp, formatPercent, formatSeconds, pad2 } from '../../../core/util.js';
import { clear, h } from '../../dom.js';
import { choice, line, range, type PageDef } from '../page.js';
import { swingParam } from './main.js';

/** TIME CORRECT: grid, swing and quantising what's already recorded. */
export const timingPage: PageDef = {
  id: 'timing',
  title: 'TIME CORRECT',
  hint: 'Division sets the record, note-repeat and correction grid. Apply moves existing notes toward it.',
  params: (app) => [
    choice(
      'Division',
      QUANT_DIVISIONS.map((d) => d.label),
      () => app.project.state.settings.quantDiv,
      (i) => app.project.update((p) => void (p.settings.quantDiv = i), 'settings'),
    ),
    swingParam(app),
    range('Strength', 0, 1, 0.05, () => app.ui.state.correctStrength, (v) => app.ui.update((s) => void (s.correctStrength = v), 'params'), formatPercent, 1),
  ],
  chips: (app) => [
    { label: 'Apply', run: () => timeCorrect(app, app.ui.state.correctStrength), disabled: () => currentSequence(app).events.length === 0 },
    {
      label: 'Rec Quantize',
      run: () => app.project.update((p) => void (p.settings.recQuantize = !p.settings.recQuantize), 'settings'),
      on: () => app.project.state.settings.recQuantize,
    },
  ],
  view: (app) => {
    const grid = line('GRID');
    const rec = line('REC QUANTIZE');
    const notes = line('SEQUENCE');
    const update = (): void => {
      const settings = app.project.state.settings;
      grid.set(`${QUANT_DIVISIONS[settings.quantDiv]?.label} · swing ${settings.swing}%`);
      rec.set(settings.recQuantize ? 'ON' : 'OFF (free timing)');
      notes.set(`${currentSequence(app).events.length} notes`);
    };
    return { el: h('div', { class: 'page lines' }, grid.el, rec.el, notes.el), update };
  },
};

const BEAT_OPTIONS = [1, 2, 4, 8, 16, 32];

/** WARP: make a loop fit the tempo. */
export const warpPage: PageDef = {
  id: 'warp',
  title: 'WARP',
  hint: 'Fit the selected sample to a number of beats at the project tempo. Stretch keeps pitch; Repitch keeps quality.',
  params: (app) => [
    choice('Beats', BEAT_OPTIONS.map(String), () => Math.max(0, BEAT_OPTIONS.indexOf(app.ui.state.warp.beats)), (i) => app.ui.update((s) => void (s.warp.beats = BEAT_OPTIONS[i]!), 'params')),
    choice('Mode', ['STRETCH', 'REPITCH'], () => (app.ui.state.warp.mode === 'stretch' ? 0 : 1), (i) => app.ui.update((s) => void (s.warp.mode = i === 0 ? 'stretch' : 'repitch'), 'params')),
    null,
  ],
  chips: (app) => [{ label: 'Apply', run: () => warpPad(app), disabled: () => selectedPad(app).sampleId === null }],
  view: (app) => {
    const pad = line('PAD');
    const now = line('LENGTH');
    const goal = line('TARGET');
    const update = (): void => {
      const { current, target } = warpTarget(app);
      pad.set(`${padLabel(app.ui.state.pad)} ${selectedPad(app).name || 'Empty'}`);
      now.set(current > 0 ? formatSeconds(current) : '—');
      goal.set(current > 0 ? `${formatSeconds(target)} · ×${(target / current).toFixed(2)} @ ${app.project.state.bpm.toFixed(1)}` : '—');
    };
    return { el: h('div', { class: 'page lines' }, pad.el, now.el, goal.el), update };
  },
};

function cursor(app: App): number {
  return clamp(app.ui.state.songCursor, 0, app.project.state.song.length - 1);
}

/** SONG: chain sequences into an arrangement. */
export const songPage: PageDef = {
  id: 'song',
  title: 'SONG',
  hint: 'Chain sequences into a song. Turn Song Mode on and press PLAY to hear it; Bounce renders it to a WAV.',
  params: (app) => {
    const last = (): number => Math.max(1, app.project.state.song.length - 1);
    return [
      {
        label: 'Step',
        get: () => cursor(app) / last(),
        set: (n) => app.ui.update((s) => void (s.songCursor = clamp(Math.round(n * last()), 0, app.project.state.song.length - 1)), 'params'),
        text: () => `${cursor(app) + 1}/${app.project.state.song.length}`,
        steps: last(),
      },
      range('Seq', 1, SEQ_COUNT, 1, () => (app.project.state.song[cursor(app)]?.seq ?? 0) + 1, (v) => app.project.update((p) => void (p.song[cursor(app)]!.seq = v - 1), 'song'), pad2),
      range('Repeats', 1, 16, 1, () => app.project.state.song[cursor(app)]?.repeats ?? 1, (v) => app.project.update((p) => void (p.song[cursor(app)]!.repeats = v), 'song'), (v) => `×${v}`),
    ];
  },
  chips: (app) => [
    {
      label: 'Add',
      run: () => {
        app.project.update((p) => void p.song.splice(cursor(app) + 1, 0, { seq: app.ui.state.seq, repeats: 1 }), 'song');
        app.ui.update((s) => void (s.songCursor = cursor(app) + 1), 'params');
      },
      disabled: () => app.project.state.song.length >= 64,
    },
    {
      label: 'Remove',
      run: () => app.project.update((p) => void p.song.splice(cursor(app), 1), 'song'),
      disabled: () => app.project.state.song.length <= 1,
    },
    { label: 'Song Mode', run: () => app.ui.update((s) => void (s.songMode = !s.songMode), 'transport'), on: () => app.ui.state.songMode },
    { label: 'Bounce', run: () => void bounceToWav(app, true) },
  ],
  view: (app) => {
    const list = h('ol', { class: 'list' });
    let signature = '';
    const update = (): void => {
      const { song, sequences } = app.project.state;
      const at = cursor(app);
      const playing = app.ui.state.playing && app.ui.state.songMode ? app.ui.state.songStep : -1;
      const next = JSON.stringify(song) + at + playing + sequences.map((s) => s.name).join();
      if (next === signature) return;
      signature = next;
      clear(list);
      const first = clamp(at - 2, 0, Math.max(0, song.length - 5));
      song.slice(first, first + 5).forEach((step, i) => {
        const index = first + i;
        const classes = `row${index === at ? ' on' : ''}${index === playing ? ' live' : ''}`;
        list.append(
          h(
            'li',
            { class: classes },
            h(
              'button',
              { type: 'button', onclick: () => app.ui.update((s) => void (s.songCursor = index), 'params') },
              h('span', { class: 'name' }, `${index + 1}. ${pad2(step.seq + 1)} ${sequences[step.seq]?.name ?? ''}`),
              h('span', { class: 'dim' }, `×${step.repeats}`),
            ),
          ),
        );
      });
    };
    return { el: h('div', { class: 'page browser' }, list), update };
  },
};
