import type { Engine } from '../audio/engine.js';
import type { ProjectStore, UiStore } from '../core/state.js';
import type { History } from '../core/store.js';
import { PPQ, QUANT_DIVISIONS, TICKS_PER_BAR, TICKS_PER_STEP, type NoteEvent, type Sequence } from '../core/types.js';
import { Ticker } from './ticker.js';
import { indexByTick, quantizeTick, secondsPerTick, sequenceLength, sortEvents, swingFactor } from './timing.js';

const LOOKAHEAD = 0.12;
const START_DELAY = 0.04;
const MARKS = 512;

interface HeldPad {
  vel: number;
  semi: number;
}

/**
 * Transport + lookahead scheduler. A ticker wakes it every 25 ms and it queues
 * every tick that falls inside the next 120 ms on the audio clock, so timing is
 * sample-accurate regardless of main-thread jitter.
 */
export class Sequencer {
  #ticker: Ticker;
  #tick = 0;
  #time = 0;
  #active = false;
  #index = new Map<number, NoteEvent[]>();
  #dirty = true;
  #markTick = new Float64Array(MARKS);
  #markTime = new Float64Array(MARKS);
  #markHead = 0;
  #markCount = 0;
  #suppress = new Set<NoteEvent>();
  #open = new Map<number, { event: NoteEvent; start: number }>();
  #held = new Map<number, HeldPad>();
  #songRepeat = 0;
  #stopTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly project: ProjectStore,
    private readonly ui: UiStore,
    private readonly engine: Engine,
    private readonly history: History<Sequence[]>,
  ) {
    this.#ticker = new Ticker(() => this.#pump());
    project.subscribe((topic) => {
      if (topic === 'seq' || topic === 'project') this.#dirty = true;
    });
    ui.subscribe((topic) => {
      if (topic === 'seq') this.#dirty = true;
    });
  }

  get sequence(): Sequence {
    return this.project.state.sequences[this.ui.state.seq]!;
  }

  /** PLAY: from the top. `resume` continues from where STOP left it. */
  play(resume = false): void {
    this.engine.start();
    const ui = this.ui.state;
    const settings = this.project.state.settings;
    if (ui.playing) this.#haltVoices();
    const countIn = ui.recording && settings.countIn && !resume;
    let from = resume ? Math.floor(this.#lastTick) : 0;
    if (from >= sequenceLength(this.sequence) || from < 0) from = 0;
    this.#tick = countIn ? -TICKS_PER_BAR : from;
    this.#time = this.engine.now + START_DELAY;
    this.#resetMarks();
    this.#songRepeat = 0;
    this.#dirty = true;
    this.ui.update((s) => {
      s.playing = true;
      s.countingIn = countIn;
      if (s.songMode && !resume) {
        s.songStep = 0;
        s.seq = this.project.state.song[0]?.seq ?? s.seq;
      }
    }, 'transport');
    this.ui.emit('seq');
    this.#ensureRunning();
  }

  stop(): void {
    if (this.#stopTimer) clearTimeout(this.#stopTimer);
    this.#stopTimer = null;
    const wasPlaying = this.ui.state.playing;
    this.#lastTick = Math.max(0, this.positionTick());
    this.#closeOpenNotes();
    this.ui.update((s) => {
      s.playing = false;
      s.recording = false;
      s.countingIn = false;
      s.nextSeq = null;
    }, 'transport');
    this.#suppress.clear();
    this.#haltVoices();
    // A second STOP rewinds.
    if (!wasPlaying) this.#lastTick = 0;
    this.#ensureRunning();
  }

  #lastTick = 0;

  /** SEQ RECORD: arm while stopped, punch in/out while playing. */
  toggleRecord(): void {
    const next = !this.ui.state.recording;
    if (next) this.history.push(structuredClone(this.project.state.sequences));
    else this.#closeOpenNotes();
    this.ui.update((s) => {
      s.recording = next;
    }, 'transport');
  }

  /** Current playhead in ticks (fractional; negative during count-in). */
  positionTick(): number {
    if (!this.ui.state.playing || this.#markCount === 0) return this.#lastTick;
    const now = this.engine.now;
    for (let i = 0; i < this.#markCount; i++) {
      const slot = (this.#markHead - 1 - i + MARKS) % MARKS;
      const time = this.#markTime[slot]!;
      if (time <= now) {
        const tick = this.#markTick[slot]!;
        const duration = secondsPerTick(this.project.state.bpm) * swingFactor(tick, this.project.state.settings.swing);
        return tick + Math.min(1, (now - time) / duration);
      }
    }
    return this.#markTick[(this.#markHead - this.#markCount + MARKS) % MARKS]!;
  }

  /** A pad went down. Tracks it for note repeat / erase and records it when recording. */
  padDown(pad: number, vel: number, semi = 0): void {
    this.#held.set(pad, { vel, semi });
    this.#ensureRunning();
    const ui = this.ui.state;
    if (ui.playing && ui.recording && !ui.noteRepeat && !ui.eraseMode) this.#recordNote(pad, vel, semi);
  }

  padUp(pad: number): void {
    this.#held.delete(pad);
    const open = this.#open.get(pad);
    if (open) {
      const length = sequenceLength(this.sequence);
      const now = Math.floor(this.positionTick());
      open.event.len = Math.max(TICKS_PER_STEP / 2, (now - open.start + length) % length);
      this.#open.delete(pad);
      this.project.emit('seq');
    }
  }

  releaseAll(): void {
    this.#held.clear();
  }

  #recordNote(pad: number, vel: number, semi: number): void {
    const settings = this.project.state.settings;
    const seq = this.sequence;
    const length = sequenceLength(seq);
    const division = QUANT_DIVISIONS[settings.quantDiv]!.ticks;
    let now = Math.floor(this.positionTick());
    if (now < 0) {
      // Hits just before the downbeat of the count-in land on beat one.
      if (now < -division / 2) return;
      now = 0;
    }
    const tick = settings.recQuantize ? quantizeTick(now, division, length) : now % length;
    const event: NoteEvent = { tick, pad, vel, len: TICKS_PER_STEP };
    if (semi) event.semi = semi;
    // Replace an identical hit rather than stacking flams on the same grid line.
    const existing = seq.events.findIndex((e) => e.tick === tick && e.pad === pad);
    if (existing >= 0) seq.events.splice(existing, 1);
    seq.events.push(event);
    sortEvents(seq.events);

    // If quantising pushed the note ahead of the playhead, the scheduler would play it a second time.
    const forward = (tick - now + length) % length;
    const scheduledAhead = (this.#tick - now + length) % length;
    if (forward < division && forward >= scheduledAhead) this.#suppress.add(event);

    this.#open.set(pad, { event, start: now });
    this.project.emit('seq');
  }

  #closeOpenNotes(): void {
    for (const pad of [...this.#open.keys()]) this.padUp(pad);
  }

  #haltVoices(): void {
    this.engine.panic();
  }

  #ensureRunning(): void {
    const ui = this.ui.state;
    const wanted = ui.playing || (ui.noteRepeat && this.#held.size > 0);
    if (wanted && !this.#active) {
      if (!ui.playing) {
        this.#tick = 0;
        this.#time = this.engine.now + 0.01;
      }
      this.#active = true;
      this.#ticker.start();
      this.#pump();
    } else if (!wanted && this.#active) {
      this.#active = false;
      this.#ticker.stop();
    }
  }

  #resetMarks(): void {
    this.#markHead = 0;
    this.#markCount = 0;
  }

  #pump(): void {
    if (!this.#active || !this.engine.started) return;
    const horizon = this.engine.now + LOOKAHEAD;
    // Guard against a long main-thread stall: never try to catch up on more than a bar.
    if (this.#time < this.engine.now - 0.5) this.#time = this.engine.now + 0.01;
    let guard = 0;
    while (this.#time < horizon && guard++ < TICKS_PER_BAR) {
      this.#scheduleTick(this.#tick, this.#time);
      if (!this.#advance()) break;
    }
    if (!this.ui.state.playing && !(this.ui.state.noteRepeat && this.#held.size > 0)) this.#ensureRunning();
  }

  /** Step to the next tick. Returns false when the song has ended. */
  #advance(): boolean {
    const { bpm, settings } = this.project.state;
    this.#time += secondsPerTick(bpm) * swingFactor(this.#tick, settings.swing);
    this.#tick++;
    const ui = this.ui.state;
    if (!ui.playing) return true;
    if (this.#tick === 0 && ui.countingIn) {
      this.ui.update((s) => {
        s.countingIn = false;
      }, 'transport');
    }
    if (this.#tick >= sequenceLength(this.sequence)) {
      this.#tick = 0;
      return this.#onLoop();
    }
    return true;
  }

  #onLoop(): boolean {
    const ui = this.ui.state;
    const song = this.project.state.song;
    if (ui.songMode && song.length > 0) {
      this.#songRepeat++;
      if (this.#songRepeat >= (song[ui.songStep]?.repeats ?? 1)) {
        this.#songRepeat = 0;
        const nextStep = ui.songStep + 1;
        if (nextStep >= song.length) {
          const delay = Math.max(0, (this.#time - this.engine.now) * 1000);
          this.#stopTimer = setTimeout(() => this.stop(), delay);
          return false;
        }
        this.ui.update((s) => {
          s.songStep = nextStep;
          s.seq = song[nextStep]!.seq;
        }, 'seq');
      }
    } else if (ui.nextSeq !== null) {
      const next = ui.nextSeq;
      this.ui.update((s) => {
        s.seq = next;
        s.nextSeq = null;
      }, 'seq');
    }
    return true;
  }

  #scheduleTick(tick: number, time: number): void {
    const ui = this.ui.state;
    const { settings, pads, bpm } = this.project.state;
    const spt = secondsPerTick(bpm);

    if (ui.playing) {
      const slot = this.#markHead;
      this.#markTick[slot] = tick;
      this.#markTime[slot] = time;
      this.#markHead = (slot + 1) % MARKS;
      this.#markCount = Math.min(MARKS, this.#markCount + 1);

      const onBeat = ((tick % PPQ) + PPQ) % PPQ === 0;
      if (onBeat && (tick < 0 || settings.metronome || ui.recording)) {
        this.engine.click(time, ((tick % TICKS_PER_BAR) + TICKS_PER_BAR) % TICKS_PER_BAR === 0);
      }
      if (tick >= 0) {
        if (this.#dirty) {
          this.#index = indexByTick(this.sequence.events);
          this.#dirty = false;
        }
        const events = this.#index.get(tick);
        if (events) {
          let erased = false;
          for (const event of events) {
            if (this.#suppress.delete(event)) continue;
            if (ui.eraseMode && this.#held.has(event.pad)) {
              const at = this.sequence.events.indexOf(event);
              if (at >= 0) this.sequence.events.splice(at, 1);
              erased = true;
              continue;
            }
            const pad = pads[event.pad];
            if (pad) this.engine.trigger(event.pad, pad, event.vel, time, { semi: event.semi ?? 0, duration: event.len * spt });
          }
          if (erased) this.project.emit('seq');
        }
      }
    }

    if (ui.noteRepeat && this.#held.size > 0 && !ui.eraseMode) {
      const base = QUANT_DIVISIONS[settings.quantDiv]!.ticks;
      const division = ui.triplet ? Math.max(4, Math.round((base * 2) / 3)) : base;
      if (((tick % division) + division) % division === 0) {
        for (const [padIndex, held] of this.#held) {
          const pad = pads[padIndex];
          if (!pad) continue;
          this.engine.trigger(padIndex, pad, held.vel, time, { semi: held.semi, duration: division * spt * 0.9 });
          if (ui.playing && ui.recording && tick >= 0) {
            const seq = this.sequence;
            if (!seq.events.some((e) => e.tick === tick && e.pad === padIndex)) {
              const event: NoteEvent = { tick, pad: padIndex, vel: held.vel, len: Math.max(1, Math.floor(division * 0.9)) };
              if (held.semi) event.semi = held.semi;
              seq.events.push(event);
              sortEvents(seq.events);
              // The tick has already been scheduled for this lap, so nothing double-fires.
              this.project.emit('seq');
            }
          }
        }
      }
    }
  }
}
