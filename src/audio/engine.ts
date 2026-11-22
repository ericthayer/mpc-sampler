import type { FxState, Pad, Project } from '../core/types.js';
import { buildMasterChain, type MasterChain } from './fx-chain.js';
import { SamplePool } from './sample-pool.js';
import { VoiceBank, type VoiceOptions } from './voices.js';

export type FlexMode =
  | 'off' | 'stutter' | 'roll' | 'half' | 'reverse' | 'tapestop' | 'gate'
  | 'lpf' | 'hpf' | 'crush' | 'echo' | 'flange' | 'kill';

export interface TriggerDetail {
  pad: number;
  when: number;
}

/** Live audio graph: pads → master FX → performance FX worklet → volume → speakers. */
export class Engine extends EventTarget {
  readonly pool = new SamplePool();
  #ctx: AudioContext | null = null;
  #chain!: MasterChain;
  #voices!: VoiceBank;
  #flexIn!: GainNode;
  #flexOut!: GainNode;
  #flex: AudioWorkletNode | null = null;
  #volume!: GainNode;
  #analysers: AnalyserNode[] = [];
  #meterBuffer = new Float32Array(512);
  #pending: { fx: FxState; bpm: number; volume: number } | null = null;
  #workletReady: Promise<boolean> | null = null;

  get started(): boolean {
    return this.#ctx !== null;
  }

  get ctx(): AudioContext {
    if (!this.#ctx) throw new Error('Audio engine not started');
    return this.#ctx;
  }

  get now(): number {
    return this.#ctx?.currentTime ?? 0;
  }

  /** A context for decoding files; works before the first user gesture. */
  get decodeContext(): BaseAudioContext {
    return this.#ctx ?? new OfflineAudioContext(2, 1, 44100);
  }

  /** Call from a user gesture. Safe to call repeatedly. */
  start(): void {
    if (this.#ctx) {
      if (this.#ctx.state === 'suspended') void this.#ctx.resume();
      return;
    }
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.#ctx = ctx;
    this.#chain = buildMasterChain(ctx);
    this.#voices = new VoiceBank(ctx, this.#chain.input, this.pool);
    this.#flexIn = new GainNode(ctx);
    this.#flexOut = new GainNode(ctx);
    this.#volume = new GainNode(ctx, { gain: 0.8 });
    const splitter = new ChannelSplitterNode(ctx, { numberOfOutputs: 2 });

    this.#chain.output.connect(this.#flexIn).connect(this.#flexOut).connect(this.#volume).connect(ctx.destination);
    this.#volume.connect(splitter);
    for (let c = 0; c < 2; c++) {
      const analyser = new AnalyserNode(ctx, { fftSize: 512 });
      splitter.connect(analyser, c);
      this.#analysers.push(analyser);
    }
    if (this.#pending) {
      this.#chain.apply(this.#pending.fx, this.#pending.bpm);
      this.#volume.gain.value = this.#pending.volume;
    }
    void ctx.resume();
    void this.worklets();
    this.dispatchEvent(new Event('started'));
  }

  /** Loads the worklet module once and splices the performance-FX node into the chain. */
  worklets(): Promise<boolean> {
    this.#workletReady ??= (async (): Promise<boolean> => {
      try {
        const ctx = this.ctx;
        await ctx.audioWorklet.addModule(new URL('./worklets/flex.worklet.js', import.meta.url));
        const flex = new AudioWorkletNode(ctx, 'slab-flex', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [2],
          channelCount: 2,
          channelCountMode: 'explicit',
        });
        this.#flexIn.disconnect();
        this.#flexIn.connect(flex).connect(this.#flexOut);
        this.#flex = flex;
        if (this.#pending) this.#postLofi(this.#pending.fx);
        return true;
      } catch (error) {
        console.warn('AudioWorklet unavailable — pad FX, lo-fi and recording are disabled.', error);
        return false;
      }
    })();
    return this.#workletReady;
  }

  get hasWorklet(): boolean {
    return this.#flex !== null;
  }

  /** Everything the listener hears before the volume knob — the resampling source. */
  get mixOutput(): AudioNode {
    return this.#flexOut;
  }

  applyProject(project: Project): void {
    this.#pending = { fx: project.fx, bpm: project.bpm, volume: project.volume };
    if (!this.#ctx) return;
    this.#chain.apply(project.fx, project.bpm);
    this.#volume.gain.setTargetAtTime(project.volume, this.now, 0.02);
    this.#postLofi(project.fx);
  }

  #postLofi(fx: FxState): void {
    this.#flex?.port.postMessage({ type: 'lofi', bits: fx.lofi.bits, rate: fx.lofi.rate, mix: fx.lofi.mix });
  }

  trigger(padIndex: number, pad: Pad, vel: number, when?: number, opts?: VoiceOptions): boolean {
    if (!this.#ctx) return false;
    const at = Math.max(when ?? 0, this.now);
    const played = this.#voices.play(padIndex, pad, vel, at, opts);
    if (played) this.dispatchEvent(new CustomEvent<TriggerDetail>('trigger', { detail: { pad: padIndex, when: at } }));
    return played;
  }

  release(padIndex: number, when?: number, semi?: number): void {
    if (this.#ctx) this.#voices.release(padIndex, Math.max(when ?? 0, this.now), semi);
  }

  panic(): void {
    if (this.#ctx) this.#voices.stopAll(this.now);
  }

  isSounding(padIndex: number): boolean {
    return this.#ctx ? this.#voices.isSounding(padIndex) : false;
  }

  /** Momentary master effect. `seconds` sets the loop / gate / echo length. */
  flex(mode: FlexMode, seconds = 0.25): void {
    this.#flex?.port.postMessage({ type: 'fx', mode, length: seconds * this.ctx.sampleRate });
  }

  /** Metronome blip, bypassing the FX chain and the resampler. */
  click(when: number, accent: boolean): void {
    if (!this.#ctx) return;
    const osc = new OscillatorNode(this.#ctx, { type: 'square', frequency: accent ? 1760 : 1175 });
    const amp = new GainNode(this.#ctx, { gain: 0 });
    amp.gain.setValueAtTime(accent ? 0.28 : 0.18, when);
    amp.gain.exponentialRampToValueAtTime(0.0008, when + 0.045);
    osc.connect(amp).connect(this.#volume);
    osc.start(when);
    osc.stop(when + 0.06);
  }

  /** Peak level per channel, 0..1+. */
  meter(): [number, number] {
    const out: [number, number] = [0, 0];
    this.#analysers.forEach((analyser, c) => {
      analyser.getFloatTimeDomainData(this.#meterBuffer);
      let peak = 0;
      for (const v of this.#meterBuffer) if (Math.abs(v) > peak) peak = Math.abs(v);
      out[c] = peak;
    });
    return out;
  }
}
