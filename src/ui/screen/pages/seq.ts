import { clearSequence, doubleSeq, halfSequence, selectSequence, setBars, toggleStep } from '../../../app/actions/sequence.js';
import { absolutePad, currentSequence, padLabel, selectedPad, type App } from '../../../app/context.js';
import { PADS_PER_BANK, SEQ_COUNT, STEPS_PER_BAR, TICKS_PER_BAR, TICKS_PER_STEP } from '../../../core/types.js';
import { pad2 } from '../../../core/util.js';
import { h } from '../../dom.js';
import { choice, padGrid, range, type PageDef } from '../page.js';
import { swingParam, tempoParam } from './main.js';

const BAR_OPTIONS = [1, 2, 4, 8];

function barsParam(app: App): ReturnType<typeof choice> {
  return choice(
    'Bars',
    BAR_OPTIONS.map(String),
    () => Math.max(0, BAR_OPTIONS.indexOf(currentSequence(app).bars)),
    (i) => setBars(app, BAR_OPTIONS[i]!),
  );
}

/** SEQ: the pads pick which of the 16 sequences plays. */
export const seqPage: PageDef = {
  id: 'seq',
  title: 'SEQUENCE',
  hint: 'Pads choose a sequence. While playing, the change waits for the end of the loop.',
  params: (app) => [barsParam(app), swingParam(app), tempoParam(app)],
  chips: (app) => [
    { label: 'Half', run: () => halfSequence(app) },
    { label: 'Double', run: () => doubleSeq(app) },
    { label: 'Clear', run: () => clearSequence(app), disabled: () => currentSequence(app).events.length === 0 },
    { label: 'Step Edit', run: () => app.goto('step') },
  ],
  padDown: (app, pad) => {
    selectSequence(app, pad);
    return true;
  },
  padLight: (app, pad) => {
    const ui = app.ui.state;
    if (pad === ui.seq) return 'green';
    if (pad === ui.nextSeq) return 'amber';
    return (app.project.state.sequences[pad]?.events.length ?? 0) > 0 ? 'dim' : 'off';
  },
  view: (app) => {
    const cells = Array.from({ length: SEQ_COUNT }, (_, i) =>
      h('button', { type: 'button', class: 'cell', onclick: () => selectSequence(app, i) }),
    );
    const update = (): void => {
      const ui = app.ui.state;
      cells.forEach((cell, i) => {
        const seq = app.project.state.sequences[i]!;
        const text = `${pad2(i + 1)} ${seq.events.length ? `${seq.bars}b` : '·'}`;
        if (cell.textContent !== text) cell.textContent = text;
        cell.classList.toggle('on', i === ui.seq);
        cell.classList.toggle('next', i === ui.nextSeq);
        cell.classList.toggle('used', seq.events.length > 0);
        cell.setAttribute('aria-label', `Sequence ${i + 1}, ${seq.name}, ${seq.bars} bars`);
        cell.setAttribute('aria-pressed', String(i === ui.seq));
      });
    };
    return { el: h('div', { class: 'page seq' }, padGrid(cells)), update };
  },
};

/** Index of the 16th-note step the playhead is on within the bar being edited, or -1. */
export function playheadStep(app: App): number {
  if (!app.ui.state.playing) return -1;
  const tick = app.sequencer.positionTick();
  if (tick < 0 || Math.floor(tick / TICKS_PER_BAR) !== app.ui.state.stepBar) return -1;
  return Math.floor((tick % TICKS_PER_BAR) / TICKS_PER_STEP);
}

function stepHasNote(app: App, pad: number, step: number): boolean {
  const from = app.ui.state.stepBar * TICKS_PER_BAR + step * TICKS_PER_STEP;
  return currentSequence(app).events.some((e) => e.pad === pad && e.tick >= from && e.tick < from + TICKS_PER_STEP);
}

/** STEP EDIT: the pads are the 16 steps of one bar for the selected pad. */
export const stepPage: PageDef = {
  id: 'step',
  title: 'STEP EDIT',
  hint: 'Pads are the 16 steps of the bar for the selected pad. K1 picks the pad; click the grid to edit any row.',
  params: (app) => [
    range(
      'Pad',
      1,
      PADS_PER_BANK,
      1,
      () => (app.ui.state.pad % PADS_PER_BANK) + 1,
      (v) => {
        const index = absolutePad(app, v - 1);
        if (index === app.ui.state.pad) return;
        app.ui.update((s) => void (s.pad = index), 'pad');
        app.engine.trigger(index, app.project.state.pads[index]!, 100);
      },
      (v) => `${pad2(v)}`,
    ),
    range('Bar', 1, 8, 1, () => app.ui.state.stepBar + 1, (v) => app.ui.update((s) => void (s.stepBar = Math.min(v, currentSequence(app).bars) - 1), 'params'), (v) => `${v}/${currentSequence(app).bars}`),
    range('Velocity', 1, 127, 1, () => app.ui.state.stepVel, (v) => app.ui.update((s) => void (s.stepVel = v), 'params'), (v) => `${v}`, 100),
  ],
  chips: (app) => [
    { label: 'Half', run: () => halfSequence(app) },
    { label: 'Double', run: () => doubleSeq(app) },
    { label: 'Clear', run: () => clearSequence(app), disabled: () => currentSequence(app).events.length === 0 },
  ],
  padDown: (app, pad) => {
    const added = toggleStep(app, app.ui.state.pad, pad);
    if (added && !app.ui.state.playing) app.engine.trigger(app.ui.state.pad, selectedPad(app), app.ui.state.stepVel);
    return true;
  },
  padLight: (app, pad) => {
    if (pad === playheadStep(app)) return 'green';
    if (stepHasNote(app, app.ui.state.pad, pad)) return 'on';
    return pad % 4 === 0 ? 'dim' : 'off';
  },
  view: (app) => {
    const title = h('span', { class: 'name' });
    const canvas = h('canvas', { class: 'matrix', role: 'img', 'aria-label': 'Step grid for this bank' });
    let frameStep = -2;
    const draw = (): void => {
      const ratio = Math.min(3, window.devicePixelRatio || 1);
      const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const style = getComputedStyle(canvas);
      const accent = style.getPropertyValue('--slab-screen-accent').trim() || '#f5c542';
      const line = style.getPropertyValue('--slab-screen-line').trim() || '#2a2d34';
      const fg = style.getPropertyValue('--slab-screen-fg').trim() || '#f1efe6';
      ctx.clearRect(0, 0, width, height);
      const cw = width / STEPS_PER_BAR;
      const rh = height / PADS_PER_BANK;
      const ui = app.ui.state;
      const bankStart = ui.bank * PADS_PER_BANK;
      const barStart = ui.stepBar * TICKS_PER_BAR;
      const selectedRow = PADS_PER_BANK - 1 - (ui.pad - bankStart);
      const head = playheadStep(app);

      for (let step = 0; step < STEPS_PER_BAR; step++) {
        ctx.fillStyle = step === head ? fg : line;
        ctx.globalAlpha = step === head ? 0.28 : step % 4 === 0 ? 0.9 : 0.4;
        ctx.fillRect(Math.round(step * cw), 0, step === head ? Math.ceil(cw) : Math.max(1, ratio), height);
      }
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = accent;
      if (selectedRow >= 0 && selectedRow < PADS_PER_BANK) ctx.fillRect(0, selectedRow * rh, width, rh);
      ctx.globalAlpha = 1;

      for (const event of currentSequence(app).events) {
        const local = event.pad - bankStart;
        if (local < 0 || local >= PADS_PER_BANK || event.tick < barStart || event.tick >= barStart + TICKS_PER_BAR) continue;
        const row = PADS_PER_BANK - 1 - local;
        const x = ((event.tick - barStart) / TICKS_PER_BAR) * width;
        ctx.fillStyle = row === selectedRow ? accent : fg;
        ctx.globalAlpha = 0.45 + (event.vel / 127) * 0.55;
        ctx.fillRect(x + ratio, row * rh + ratio, Math.max(2 * ratio, cw - 2 * ratio), Math.max(ratio, rh - 2 * ratio));
      }
      ctx.globalAlpha = 1;
    };
    canvas.addEventListener('pointerdown', (event) => {
      const rect = canvas.getBoundingClientRect();
      const step = Math.min(STEPS_PER_BAR - 1, Math.floor(((event.clientX - rect.left) / rect.width) * STEPS_PER_BAR));
      const row = Math.min(PADS_PER_BANK - 1, Math.floor(((event.clientY - rect.top) / rect.height) * PADS_PER_BANK));
      const pad = absolutePad(app, PADS_PER_BANK - 1 - row);
      app.ui.update((s) => void (s.pad = pad), 'pad');
      toggleStep(app, pad, step);
    });
    const update = (): void => {
      const ui = app.ui.state;
      title.textContent = `${padLabel(ui.pad)} ${selectedPad(app).name || 'Empty'} · bar ${ui.stepBar + 1}/${currentSequence(app).bars}`;
      draw();
    };
    const frame = (): void => {
      const step = playheadStep(app);
      if (step === frameStep) return;
      frameStep = step;
      draw();
    };
    return { el: h('div', { class: 'page step' }, h('div', { class: 'head' }, title), canvas), update, frame };
  },
};
