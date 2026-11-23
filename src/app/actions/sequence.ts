import { emptySequence } from '../../core/defaults.js';
import { QUANT_DIVISIONS, TICKS_PER_BAR, TICKS_PER_STEP, type Sequence } from '../../core/types.js';
import { doubleSequence, halveSequence, quantizeToward, sequenceLength, sortEvents } from '../../seq/timing.js';
import { currentSequence, padLabel, type App } from '../context.js';

/** Snapshot the sequences, run a change, then notify. Makes the change undoable. */
export function editSequences(app: App, change: () => void): void {
  app.history.push(structuredClone(app.project.state.sequences));
  change();
  app.project.emit('seq');
}

function replaceCurrent(app: App, next: Sequence): void {
  editSequences(app, () => {
    app.project.state.sequences[app.ui.state.seq] = next;
  });
}

export function undo(app: App): void {
  const previous = app.history.undo(structuredClone(app.project.state.sequences));
  if (!previous) return app.say('Nothing to undo');
  app.project.state.sequences = previous;
  app.project.emit('seq');
  app.say('Undo');
}

export function redo(app: App): void {
  const next = app.history.redo(structuredClone(app.project.state.sequences));
  if (!next) return app.say('Nothing to redo');
  app.project.state.sequences = next;
  app.project.emit('seq');
  app.say('Redo');
}

/** Toggle a 16th-note step for a pad in the bar currently shown in Step Edit. */
export function toggleStep(app: App, pad: number, step: number): boolean {
  const seq = currentSequence(app);
  const tick = app.ui.state.stepBar * TICKS_PER_BAR + step * TICKS_PER_STEP;
  if (tick >= sequenceLength(seq)) return false;
  let added = false;
  editSequences(app, () => {
    const at = seq.events.findIndex((e) => e.pad === pad && e.tick >= tick && e.tick < tick + TICKS_PER_STEP);
    if (at >= 0) seq.events.splice(at, 1);
    else {
      seq.events.push({ tick, pad, vel: app.ui.state.stepVel, len: TICKS_PER_STEP });
      sortEvents(seq.events);
      added = true;
    }
  });
  return added;
}

export function clearSequence(app: App): void {
  replaceCurrent(app, { ...emptySequence(app.ui.state.seq), bars: currentSequence(app).bars });
  app.say('Sequence cleared');
}

export function erasePadEvents(app: App, pad: number): void {
  const seq = currentSequence(app);
  if (!seq.events.some((e) => e.pad === pad)) return app.say(`No notes on ${padLabel(pad)}`);
  editSequences(app, () => {
    seq.events = seq.events.filter((e) => e.pad !== pad);
  });
  app.say(`Erased ${padLabel(pad)}`);
}

export function halfSequence(app: App): void {
  const next = halveSequence(currentSequence(app));
  if (!next) return app.say('Already 1 bar');
  replaceCurrent(app, next);
  clampStepBar(app);
  app.say(`${next.bars} bar${next.bars > 1 ? 's' : ''}`);
}

export function doubleSeq(app: App): void {
  const next = doubleSequence(currentSequence(app));
  if (!next) return app.say('Max length reached');
  replaceCurrent(app, next);
  app.say(`${next.bars} bars`);
}

/** Change the length without copying content (events past the end are dropped). */
export function setBars(app: App, bars: number): void {
  const seq = currentSequence(app);
  if (bars === seq.bars) return;
  const length = bars * TICKS_PER_BAR;
  replaceCurrent(app, { ...seq, bars, events: seq.events.filter((e) => e.tick < length) });
  clampStepBar(app);
}

function clampStepBar(app: App): void {
  const bars = currentSequence(app).bars;
  if (app.ui.state.stepBar >= bars) {
    app.ui.update((s) => {
      s.stepBar = bars - 1;
    }, 'params');
  }
}

/** Time Correct: pull every note in the current sequence toward the grid. */
export function timeCorrect(app: App, strength: number): void {
  const seq = currentSequence(app);
  const division = QUANT_DIVISIONS[app.project.state.settings.quantDiv]!;
  const length = sequenceLength(seq);
  editSequences(app, () => {
    for (const event of seq.events) event.tick = quantizeToward(event.tick, division.ticks, length, strength);
    sortEvents(seq.events);
  });
  app.say(`Corrected to ${division.label}`);
}

/** Select a sequence now, or queue it for the next loop when playing. */
export function selectSequence(app: App, index: number): void {
  const ui = app.ui.state;
  if (ui.playing && !ui.songMode) {
    app.ui.update((s) => {
      s.nextSeq = index === s.seq ? null : index;
    }, 'seq');
  } else {
    app.ui.update((s) => {
      s.seq = index;
      s.nextSeq = null;
      s.stepBar = 0;
    }, 'seq');
  }
}
