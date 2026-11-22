import type { Pad } from '../core/types.js';
import { clamp, cutoffHz, semitoneRatio } from '../core/util.js';
import type { SamplePool } from './sample-pool.js';

export interface VoiceOptions {
  /** Extra semitones on top of the pad's tuning (16 Levels, recorded notes). */
  semi?: number;
  /** Seconds until release. Only applies to hold-mode and looping pads. */
  duration?: number;
  /** Override the pad's region, e.g. to audition a chop slice. */
  region?: { start: number; end: number };
  /** Play to the end even if the pad is in hold mode (auditioning). */
  forceOneShot?: boolean;
}

interface Voice {
  pad: number;
  /** Extra semitones this voice was started with; one pad can sound several pitches at once. */
  semi: number;
  choke: number;
  sustained: boolean;
  release: number;
  stop: (time: number, fade: number) => void;
}

const CUT_FADE = 0.006;

export function velocityGain(vel: number): number {
  return Math.pow(clamp(vel, 1, 127) / 127, 1.6);
}

/** Builds and tracks the per-hit node graphs. Works on live and offline contexts alike. */
export class VoiceBank {
  #voices = new Set<Voice>();

  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly destination: AudioNode,
    private readonly pool: SamplePool,
  ) {}

  /** Returns false when nothing was started (empty pad, muted, or a loop toggled off). */
  play(padIndex: number, pad: Pad, vel: number, when: number, opts: VoiceOptions = {}): boolean {
    if (pad.mute) return false;
    const buffer = this.pool.buffer(pad.sampleId, pad.reverse);
    if (!buffer) return false;

    const sustained = !opts.forceOneShot && (pad.loop || pad.mode === 'hold');
    const latchedLoop = pad.loop && pad.mode === 'oneshot' && opts.duration === undefined && !opts.forceOneShot;
    const semi = opts.semi ?? 0;
    let wasLooping = false;
    for (const voice of this.#voices) {
      // Re-hitting the same note cuts it; other pitches on the same pad ring together (chords).
      const sameNote = voice.pad === padIndex && voice.semi === semi;
      const choked = pad.choke > 0 && voice.choke === pad.choke && voice.pad !== padIndex;
      if (sameNote || choked) {
        if (sameNote && voice.sustained) wasLooping = true;
        voice.stop(when, CUT_FADE);
      }
    }
    // A one-shot looping pad is a latch: hit to start, hit again to stop.
    if (latchedLoop && wasLooping) return false;

    const start = clamp(opts.region?.start ?? pad.start, 0, 1);
    const end = clamp(opts.region?.end ?? pad.end, 0, 1);
    const length = Math.max(0.004, (Math.max(start, end) - Math.min(start, end)) * buffer.duration);
    const offset = (pad.reverse ? 1 - Math.max(start, end) : Math.min(start, end)) * buffer.duration;
    const rate = semitoneRatio(pad.semi + pad.fine / 100 + semi);
    const peak = velocityGain(vel) * pad.level;
    const attack = Math.max(0.002, pad.attack);

    const ctx = this.ctx;
    const source = new AudioBufferSourceNode(ctx, { buffer, playbackRate: rate });
    const amp = new GainNode(ctx, { gain: 0 });
    let tail: AudioNode = source;
    if (pad.filter !== 'off') {
      const filter = new BiquadFilterNode(ctx, {
        type: pad.filter,
        frequency: cutoffHz(pad.cutoff),
        Q: 0.5 + pad.res * 18,
      });
      tail.connect(filter);
      tail = filter;
    }
    tail.connect(amp);
    tail = amp;
    if (pad.pan !== 0) {
      const panner = new StereoPannerNode(ctx, { pan: pad.pan });
      tail.connect(panner);
      tail = panner;
    }
    tail.connect(this.destination);

    amp.gain.setValueAtTime(0, when);
    amp.gain.linearRampToValueAtTime(peak, when + attack);

    if (pad.loop && !opts.forceOneShot) {
      source.loop = true;
      source.loopStart = offset;
      source.loopEnd = offset + length;
      source.start(when, offset);
    } else {
      const playTime = length / rate;
      source.start(when, offset, length);
      // Short fade at the region end so trimmed samples don't click.
      const fadeAt = when + Math.max(attack, playTime - 0.004);
      amp.gain.setValueAtTime(peak, fadeAt);
      amp.gain.linearRampToValueAtTime(0, Math.max(fadeAt + 0.001, when + playTime));
    }

    let stopped = false;
    const voice: Voice = {
      pad: padIndex,
      semi,
      choke: pad.choke,
      sustained,
      release: Math.max(0.005, pad.release),
      stop: (time: number, fade: number): void => {
        if (stopped) return;
        stopped = true;
        const at = Math.max(time, ctx.currentTime);
        if (typeof amp.gain.cancelAndHoldAtTime === 'function') amp.gain.cancelAndHoldAtTime(at);
        else amp.gain.cancelScheduledValues(at);
        amp.gain.setTargetAtTime(0, at, fade / 3);
        source.stop(at + fade + 0.03);
      },
    };
    source.onended = (): void => {
      this.#voices.delete(voice);
      tail.disconnect();
    };
    this.#voices.add(voice);

    if (sustained && opts.duration !== undefined) voice.stop(when + opts.duration, voice.release);
    return true;
  }

  /** Note-off for hold-mode pads (one pitch, or all of them). One-shots ignore it. */
  release(padIndex: number, when: number, semi?: number): void {
    for (const voice of this.#voices) {
      if (voice.pad === padIndex && voice.sustained && (semi === undefined || voice.semi === semi)) voice.stop(when, voice.release);
    }
  }

  stopAll(when: number): void {
    for (const voice of this.#voices) voice.stop(when, 0.02);
  }

  isSounding(padIndex: number): boolean {
    for (const voice of this.#voices) if (voice.pad === padIndex) return true;
    return false;
  }
}
