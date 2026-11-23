/** Pure tick maths for the sequencer. No audio, no DOM. */
import { MAX_BARS, PPQ, TICKS_PER_BAR, TICKS_PER_STEP, type NoteEvent, type Sequence } from '../core/types.js';

export function secondsPerTick(bpm: number): number {
  return 60 / bpm / PPQ;
}

export function sequenceLength(seq: Sequence): number {
  return seq.bars * TICKS_PER_BAR;
}

/**
 * Duration multiplier for one tick under swing.
 * Swing stretches the first 16th of every 8th-note pair and squeezes the second,
 * so 50 is straight and 66 is a triplet shuffle.
 */
export function swingFactor(tick: number, swing: number): number {
  const s = swing / 100;
  const pair = TICKS_PER_STEP * 2;
  const inPair = ((tick % pair) + pair) % pair;
  return inPair < TICKS_PER_STEP ? 2 * s : 2 * (1 - s);
}

/** Snap a tick to the nearest grid line, wrapping at the sequence end. */
export function quantizeTick(tick: number, division: number, length: number): number {
  const snapped = Math.round(tick / division) * division;
  return ((snapped % length) + length) % length;
}

/** Move a tick part of the way to the grid (`strength` 0..1). */
export function quantizeToward(tick: number, division: number, length: number, strength: number): number {
  const snapped = Math.round(tick / division) * division;
  const moved = Math.round(tick + (snapped - tick) * strength);
  return ((moved % length) + length) % length;
}

export function sortEvents(events: NoteEvent[]): NoteEvent[] {
  return events.sort((a, b) => a.tick - b.tick || a.pad - b.pad);
}

/** Drop the second half. Returns null when the sequence is already one bar. */
export function halveSequence(seq: Sequence): Sequence | null {
  if (seq.bars <= 1) return null;
  const bars = Math.max(1, Math.floor(seq.bars / 2));
  const length = bars * TICKS_PER_BAR;
  return { ...seq, bars, events: seq.events.filter((e) => e.tick < length).map((e) => ({ ...e })) };
}

/** Repeat the content to twice the length. Returns null at the bar limit. */
export function doubleSequence(seq: Sequence): Sequence | null {
  if (seq.bars * 2 > MAX_BARS) return null;
  const length = sequenceLength(seq);
  const copy = seq.events.map((e) => ({ ...e, tick: e.tick + length }));
  return { ...seq, bars: seq.bars * 2, events: sortEvents([...seq.events.map((e) => ({ ...e })), ...copy]) };
}

/** Index events by tick for O(1) lookup while scheduling. */
export function indexByTick(events: NoteEvent[]): Map<number, NoteEvent[]> {
  const map = new Map<number, NoteEvent[]>();
  for (const event of events) {
    const bucket = map.get(event.tick);
    if (bucket) bucket.push(event);
    else map.set(event.tick, [event]);
  }
  return map;
}

/** Bar / beat / tick-in-beat, all 1-based except the tick. */
export function position(tick: number): { bar: number; beat: number; sub: number } {
  const t = Math.max(0, Math.floor(tick));
  return {
    bar: Math.floor(t / TICKS_PER_BAR) + 1,
    beat: Math.floor((t % TICKS_PER_BAR) / PPQ) + 1,
    sub: t % PPQ,
  };
}

/** Tempo from tap timestamps (ms). Ignores taps after a long pause. */
export function tapTempo(taps: number[]): number | null {
  const recent = taps.slice(-6);
  if (recent.length < 2) return null;
  const gaps: number[] = [];
  for (let i = 1; i < recent.length; i++) gaps.push(recent[i]! - recent[i - 1]!);
  if (gaps.some((gap) => gap > 2000)) return null;
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return Math.round((60000 / mean) * 10) / 10;
}
