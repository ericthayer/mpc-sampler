/**
 * AudioWorklet processors. This file runs in the audio rendering thread and must
 * stay import-free: it is loaded on its own with `audioWorklet.addModule()`.
 *
 *  - `slab-flex`     master performance FX (stutter, tape stop, reverse…) + lo-fi
 *  - `slab-recorder` captures raw PCM for sampling and resampling
 */
declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

type FlexMode =
  | 'off' | 'stutter' | 'roll' | 'half' | 'reverse' | 'tapestop' | 'gate'
  | 'lpf' | 'hpf' | 'crush' | 'echo' | 'flange' | 'kill';

interface FlexMessage {
  type: 'fx';
  mode: FlexMode;
  /** Length in samples for tempo-synced modes. */
  length: number;
}
interface LofiMessage {
  type: 'lofi';
  bits: number;
  /** 0..1 — amount of sample-rate reduction. */
  rate: number;
  mix: number;
}

const RING_SECONDS = 8;
const DECLICK = 96;

class FlexProcessor extends AudioWorkletProcessor {
  private readonly size = Math.round(sampleRate * RING_SECONDS);
  private readonly ring = [new Float32Array(this.size), new Float32Array(this.size)];
  private readonly echoLine = [new Float32Array(this.size), new Float32Array(this.size)];
  private write = 0;
  private mode: FlexMode = 'off';
  private length = 11025;
  private loopStart = 0;
  private pos = 0;
  private repeats = 0;
  private read = 0;
  private rate = 1;
  private phase = 0;
  private fade = 1;
  /** State-variable filter memory per channel. */
  private readonly low = [0, 0];
  private readonly band = [0, 0];
  private cutoff = 18000;
  private echoSend = 0;
  private echoLength = 11025;
  private lofi = { bits: 16, hold: 1, mix: 0 };
  private readonly held = [0, 0];
  private readonly dry = new Float32Array(2);
  private holdCount = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<FlexMessage | LofiMessage>): void => {
      const msg = event.data;
      if (msg.type === 'lofi') {
        this.lofi = { bits: msg.bits, hold: 1 + Math.round(msg.rate * 40), mix: msg.mix };
        return;
      }
      this.begin(msg.mode, Math.max(64, Math.min(this.size >> 1, Math.round(msg.length))));
    };
  }

  private begin(mode: FlexMode, length: number): void {
    this.mode = mode;
    this.length = length;
    this.fade = 0;
    this.pos = 0;
    this.repeats = 0;
    this.phase = 0;
    this.rate = 1;
    this.read = this.write;
    this.loopStart = (this.write - length + this.size) % this.size;
    this.echoSend = mode === 'echo' ? 1 : 0;
    if (mode === 'echo') this.echoLength = length;
    if (mode === 'lpf') this.cutoff = 16000;
    if (mode === 'hpf') this.cutoff = 30;
  }

  private tap(channel: number, position: number): number {
    const ring = this.ring[channel]!;
    const i = Math.floor(position);
    const frac = position - i;
    const a = ring[((i % this.size) + this.size) % this.size]!;
    const b = ring[(((i + 1) % this.size) + this.size) % this.size]!;
    return a + (b - a) * frac;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || !output[0]) return true;
    const frames = output[0].length;
    const inL = input?.[0];
    const inR = input?.[1] ?? inL;
    const lofi = this.lofi;
    const levels = Math.pow(2, lofi.bits - 1);

    for (let n = 0; n < frames; n++) {
      const dry = this.dry;
      dry[0] = inL?.[n] ?? 0;
      dry[1] = inR?.[n] ?? 0;

      // Persistent lo-fi stage: sample-and-hold + bit reduction.
      if (lofi.mix > 0) {
        if (this.holdCount <= 0) {
          this.held[0] = Math.round(dry[0]! * levels) / levels;
          this.held[1] = Math.round(dry[1]! * levels) / levels;
          this.holdCount = lofi.hold;
        }
        this.holdCount--;
        dry[0] = dry[0]! + (this.held[0]! - dry[0]!) * lofi.mix;
        dry[1] = dry[1]! + (this.held[1]! - dry[1]!) * lofi.mix;
      }

      const frozen = this.mode === 'stutter' || this.mode === 'roll';
      if (!frozen) {
        this.ring[0]![this.write] = dry[0]!;
        this.ring[1]![this.write] = dry[1]!;
      }

      const mode = this.mode;
      let edge = 1;
      if (mode === 'stutter' || mode === 'roll') {
        const d = Math.min(this.pos, this.length - this.pos);
        edge = d < 48 ? d / 48 : 1;
      } else if (mode === 'gate') {
        const p = this.phase / this.length;
        edge = p < 0.5 ? Math.min(1, p * 40) : Math.max(0, 1 - (p - 0.5) * 40);
      } else if (mode === 'lpf') {
        this.cutoff += (320 - this.cutoff) * 0.00012;
      } else if (mode === 'hpf') {
        this.cutoff += (3200 - this.cutoff) * 0.00012;
      }
      const f = 2 * Math.sin((Math.PI * Math.min(this.cutoff, sampleRate * 0.22)) / sampleRate);

      for (let c = 0; c < 2; c++) {
        const x = dry[c]!;
        let y = x;
        switch (mode) {
          case 'stutter':
          case 'roll':
            y = this.ring[c]![(this.loopStart + this.pos) % this.size]! * edge;
            break;
          case 'half':
          case 'tapestop':
          case 'reverse':
            y = this.tap(c, this.read);
            break;
          case 'gate':
            y = x * edge;
            break;
          case 'lpf':
          case 'hpf': {
            // Chamberlin state-variable filter.
            const low = this.low[c]! + f * this.band[c]!;
            const high = x - low - 0.6 * this.band[c]!;
            this.band[c] = this.band[c]! + f * high;
            this.low[c] = low;
            y = mode === 'lpf' ? low : high;
            break;
          }
          case 'crush':
            y = Math.round(this.tap(c, this.write - (this.write % 14)) * 12) / 12;
            break;
          case 'flange':
            y = (x + this.tap(c, this.write - 90 - 70 * Math.sin(this.phase)) * 0.8) * 0.7;
            break;
          case 'kill':
            y = 0;
            break;
          default:
            break;
        }
        // Echo line always runs so tails ring out after the pad is released.
        const line = this.echoLine[c]!;
        const delayed = line[(this.write - this.echoLength + this.size) % this.size]!;
        line[this.write] = x * this.echoSend + delayed * 0.62;
        y += delayed;

        output[c]![n] = y * this.fade + x * (1 - this.fade) * (mode === 'off' ? 1 : 0);
      }

      // Advance per-mode state.
      if (mode === 'stutter' || mode === 'roll') {
        this.pos++;
        if (this.pos >= this.length) {
          this.pos = 0;
          this.repeats++;
          if (mode === 'roll' && this.repeats % 2 === 0 && this.length > 512) this.length >>= 1;
        }
      } else if (mode === 'half') {
        this.read += 0.5;
      } else if (mode === 'tapestop') {
        this.read += this.rate;
        this.rate *= 0.99994 - 2.2 / sampleRate;
        if (this.rate < 0.002) this.rate = 0;
      } else if (mode === 'reverse') {
        this.read -= 1;
      } else if (mode === 'gate') {
        this.phase = (this.phase + 1) % this.length;
      } else if (mode === 'flange') {
        this.phase += (2 * Math.PI * 0.35) / sampleRate;
      }
      if (this.fade < 1) this.fade = Math.min(1, this.fade + 1 / DECLICK);
      this.write = (this.write + 1) % this.size;
    }
    return true;
  }
}

interface RecorderMessage {
  type: 'start' | 'stop';
}

const CHUNK = 4096;

class RecorderProcessor extends AudioWorkletProcessor {
  private active = false;
  private left = new Float32Array(CHUNK);
  private right = new Float32Array(CHUNK);
  private fill = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<RecorderMessage>): void => {
      if (event.data.type === 'start') {
        this.active = true;
        this.fill = 0;
      } else {
        this.flush();
        this.active = false;
        this.port.postMessage({ type: 'done' });
      }
    };
  }

  private flush(): void {
    if (this.fill === 0) return;
    const left = this.left.slice(0, this.fill);
    const right = this.right.slice(0, this.fill);
    this.port.postMessage({ type: 'chunk', left, right }, [left.buffer, right.buffer]);
    this.fill = 0;
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    const inL = input?.[0];
    if (!this.active || !inL) return true;
    const inR = input?.[1] ?? inL;
    for (let n = 0; n < inL.length; n++) {
      this.left[this.fill] = inL[n]!;
      this.right[this.fill] = inR[n]!;
      if (++this.fill === CHUNK) this.flush();
    }
    return true;
  }
}

registerProcessor('slab-flex', FlexProcessor);
registerProcessor('slab-recorder', RecorderProcessor);

export {};
