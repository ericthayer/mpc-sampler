import type { InputSource } from '../core/types.js';
import { trimLeadingSilence } from './dsp.js';
import type { Engine } from './engine.js';

export interface Capture {
  sampleRate: number;
  channels: Float32Array[];
}

type ChunkMessage = { type: 'chunk'; left: Float32Array; right: Float32Array } | { type: 'done' };

export const MAX_RECORD_SECONDS = 60;

/**
 * Captures audio into raw PCM from one of three sources:
 * the microphone, another tab / the system (screen-share audio), or SLAB's own output.
 */
export class Recorder {
  #node: AudioWorkletNode | null = null;
  #source: AudioNode | null = null;
  #stream: MediaStream | null = null;
  #left: Float32Array[] = [];
  #right: Float32Array[] = [];
  #frames = 0;
  #finish: ((capture: Capture) => void) | null = null;
  #limitHit = false;
  recording = false;
  /** Called once when the maximum length is reached; the owner should call `stop()`. */
  onLimit: (() => void) | null = null;

  constructor(private readonly engine: Engine) {}

  /** Seconds captured so far. */
  get elapsed(): number {
    return this.engine.started ? this.#frames / this.engine.ctx.sampleRate : 0;
  }

  static supports(source: InputSource): boolean {
    if (source === 'resample') return true;
    if (source === 'mic') return typeof navigator.mediaDevices?.getUserMedia === 'function';
    return typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  }

  /** Opens the source (prompting for permission if needed) and starts capturing. */
  async start(source: InputSource): Promise<void> {
    if (this.recording) return;
    this.engine.start();
    if (!(await this.engine.worklets())) throw new Error('Recording needs AudioWorklet support.');
    const ctx = this.engine.ctx;

    if (source === 'resample') {
      this.#source = this.engine.mixOutput;
    } else {
      this.#stream = await openStream(source);
      this.#source = new MediaStreamAudioSourceNode(ctx, { mediaStream: this.#stream });
    }

    const node = new AudioWorkletNode(ctx, 'slab-recorder', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 2,
      channelCountMode: 'explicit',
    });
    // A silent path to the destination keeps every browser pulling the processor.
    node.connect(new GainNode(ctx, { gain: 0 })).connect(ctx.destination);
    this.#limitHit = false;
    this.#left = [];
    this.#right = [];
    this.#frames = 0;
    node.port.onmessage = (event: MessageEvent<ChunkMessage>): void => {
      const msg = event.data;
      if (msg.type === 'chunk') {
        this.#left.push(msg.left);
        this.#right.push(msg.right);
        this.#frames += msg.left.length;
        if (this.elapsed >= MAX_RECORD_SECONDS && !this.#limitHit) {
          this.#limitHit = true;
          this.onLimit?.();
        }
      } else {
        this.#complete();
      }
    };
    this.#source.connect(node);
    this.#node = node;
    this.recording = true;
    node.port.postMessage({ type: 'start' });
  }

  /** Stops and resolves with the captured audio (leading silence removed for live inputs). */
  stop(trimSilence: boolean): Promise<Capture> {
    return new Promise((resolve) => {
      if (!this.#node) {
        resolve({ sampleRate: 44100, channels: [new Float32Array(0)] });
        return;
      }
      this.#finish = (capture): void => {
        resolve(trimSilence ? { ...capture, channels: trimLeadingSilence(capture.channels, capture.sampleRate, 0.012) } : capture);
      };
      this.#node.port.postMessage({ type: 'stop' });
    });
  }

  #complete(): void {
    const ctx = this.engine.ctx;
    const left = concat(this.#left, this.#frames);
    const right = concat(this.#right, this.#frames);
    if (this.#node && this.#source) this.#source.disconnect(this.#node);
    this.#node?.disconnect();
    this.#stream?.getTracks().forEach((track) => track.stop());
    if (this.#stream && this.#source) this.#source.disconnect();
    this.#node = null;
    this.#source = null;
    this.#stream = null;
    this.recording = false;
    const stereo = !identical(left, right);
    this.#finish?.({ sampleRate: ctx.sampleRate, channels: stereo ? [left, right] : [left] });
    this.#finish = null;
  }
}

async function openStream(source: InputSource): Promise<MediaStream> {
  if (source === 'mic') {
    // Disable voice processing: it mangles drums and music.
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  }
  // Browsers only hand out tab/system audio alongside a video track; drop the video straight away.
  const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  stream.getVideoTracks().forEach((track) => track.stop());
  if (stream.getAudioTracks().length === 0) {
    throw new Error('No audio was shared. Pick a tab and tick "Share tab audio".');
  }
  return new MediaStream(stream.getAudioTracks());
}

function concat(chunks: Float32Array[], total: number): Float32Array {
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function identical(a: Float32Array, b: Float32Array): boolean {
  for (let i = 0; i < a.length; i += 97) if (a[i] !== b[i]) return false;
  return true;
}
