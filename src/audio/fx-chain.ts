import { DELAY_DIVISIONS, PPQ, type FxState } from '../core/types.js';
import { clamp, dbToGain } from '../core/util.js';

export interface MasterChain {
  input: GainNode;
  output: GainNode;
  /** Push the project's FX settings onto the nodes. */
  apply: (fx: FxState, bpm: number) => void;
}

const SMOOTH = 0.02;

/**
 * pads → drive → DJ filter → (dry | delay | reverb) → compressor → limiter → out.
 * Takes any BaseAudioContext so the offline bounce uses the exact same chain.
 */
export function buildMasterChain(ctx: BaseAudioContext): MasterChain {
  // Leave headroom for stacked pads; the limiter at the end catches what's left.
  const input = new GainNode(ctx, { gain: 0.8 });
  const shaper = new WaveShaperNode(ctx, { oversample: '2x' });
  const lowpass = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 20000, Q: 0.7 });
  const highpass = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 20, Q: 0.7 });
  const delaySend = new GainNode(ctx, { gain: 0 });
  const delay = new DelayNode(ctx, { maxDelayTime: 3, delayTime: 0.3 });
  const feedback = new GainNode(ctx, { gain: 0.3 });
  const damping = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 4200 });
  const reverbSend = new GainNode(ctx, { gain: 0 });
  const convolver = new ConvolverNode(ctx);
  const reverbTone = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 8000 });
  const compressor = new DynamicsCompressorNode(ctx, { attack: 0.006, release: 0.16, knee: 8 });
  const makeup = new GainNode(ctx);
  const limiter = new DynamicsCompressorNode(ctx, { threshold: -1.5, knee: 0, ratio: 20, attack: 0.001, release: 0.08 });
  const output = new GainNode(ctx, { gain: 0.94 });

  input.connect(shaper).connect(lowpass).connect(highpass);
  highpass.connect(compressor);
  highpass.connect(delaySend).connect(delay).connect(compressor);
  delay.connect(damping).connect(feedback).connect(delay);
  highpass.connect(reverbSend).connect(convolver).connect(reverbTone).connect(compressor);
  compressor.connect(makeup).connect(limiter).connect(output);

  let lastDrive = -1;
  let lastSize = -1;

  const apply = (fx: FxState, bpm: number): void => {
    const t = ctx.currentTime;
    const set = (param: AudioParam, value: number): void => void param.setTargetAtTime(value, t, SMOOTH);

    // DJ filter: left of centre closes a low-pass, right of centre opens a high-pass.
    const pos = clamp(fx.filter.pos, -1, 1);
    const dead = 0.04;
    set(lowpass.frequency, pos < -dead ? 20000 * Math.pow(90 / 20000, (-pos - dead) / (1 - dead)) : 20000);
    set(highpass.frequency, pos > dead ? 20 * Math.pow(7000 / 20, (pos - dead) / (1 - dead)) : 20);
    const q = 0.7 + fx.filter.res * 11;
    set(lowpass.Q, pos < -dead ? q : 0.7);
    set(highpass.Q, pos > dead ? q : 0.7);

    const driveStep = Math.round(fx.filter.drive * 40);
    if (driveStep !== lastDrive) {
      lastDrive = driveStep;
      shaper.curve = driveStep === 0 ? null : driveCurve(1 + (driveStep / 40) * 14);
    }

    const division = DELAY_DIVISIONS[clamp(Math.round(fx.delay.div), 0, DELAY_DIVISIONS.length - 1)]!;
    set(delay.delayTime, clamp((division.ticks / PPQ) * (60 / bpm), 0.01, 2.9));
    set(feedback.gain, clamp(fx.delay.feedback, 0, 0.92));
    set(delaySend.gain, fx.delay.mix);

    const sizeStep = Math.round(fx.reverb.size * 20);
    if (sizeStep !== lastSize) {
      lastSize = sizeStep;
      convolver.buffer = impulseResponse(ctx.sampleRate, 0.3 + (sizeStep / 20) * 3.7);
    }
    set(reverbTone.frequency, 900 * Math.pow(16, fx.reverb.tone));
    set(reverbSend.gain, fx.reverb.mix * 0.9);

    set(compressor.threshold, fx.comp.on ? fx.comp.threshold : 0);
    set(compressor.ratio, fx.comp.on ? fx.comp.ratio : 1);
    set(makeup.gain, fx.comp.on ? dbToGain(fx.comp.makeup) : 1);
  };

  return { input, output, apply };
}

function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(1024);
  const scale = Math.tanh(amount);
  for (let i = 0; i < curve.length; i++) {
    const x = (i / (curve.length - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / scale;
  }
  return curve;
}

/** Stereo exponentially-decaying noise. Seeded so bounces are repeatable. */
function impulseResponse(sampleRate: number, seconds: number): AudioBuffer {
  const length = Math.round(sampleRate * seconds);
  const buffer = new AudioBuffer({ length, numberOfChannels: 2, sampleRate });
  let seed = 1337;
  const noise = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x7fffffff - 1;
  };
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = noise() * Math.pow(1 - t, 3.2) * (i < 64 ? i / 64 : 1) * 0.5;
    }
  }
  return buffer;
}
