import { TICKS_PER_BAR, type Project, type Sequence } from '../core/types.js';
import { secondsPerTick, swingFactor } from '../seq/timing.js';
import { buildMasterChain } from './fx-chain.js';
import type { SamplePool } from './sample-pool.js';
import { VoiceBank } from './voices.js';

const SAMPLE_RATE = 44100;
const TAIL_SECONDS = 2.5;

export interface BouncePlan {
  /** Sequences in playback order (already expanded for repeats). */
  sequences: Sequence[];
}

export function songPlan(project: Project): BouncePlan {
  const sequences: Sequence[] = [];
  for (const step of project.song) {
    const seq = project.sequences[step.seq];
    if (seq) for (let r = 0; r < Math.max(1, step.repeats); r++) sequences.push(seq);
  }
  return { sequences };
}

/** Start time (seconds) of every tick in a sequence, honouring swing. */
function tickTimes(bars: number, bpm: number, swing: number): Float64Array {
  const total = bars * TICKS_PER_BAR;
  const times = new Float64Array(total + 1);
  const spt = secondsPerTick(bpm);
  for (let t = 0; t < total; t++) times[t + 1] = times[t]! + spt * swingFactor(t, swing);
  return times;
}

/**
 * Render sequences faster than real time through the same voice and FX code the
 * live engine uses. Performance FX (pad FX) are live-only and not part of a bounce.
 */
export async function bounce(project: Project, pool: SamplePool, plan: BouncePlan): Promise<AudioBuffer> {
  const { bpm, settings } = project;
  const spt = secondsPerTick(bpm);
  const lengths = plan.sequences.map((seq) => tickTimes(seq.bars, bpm, settings.swing));
  const musicSeconds = lengths.reduce((sum, times) => sum + times[times.length - 1]!, 0);
  const ctx = new OfflineAudioContext(2, Math.ceil((musicSeconds + TAIL_SECONDS) * SAMPLE_RATE), SAMPLE_RATE);

  const chain = buildMasterChain(ctx);
  chain.apply(project.fx, bpm);
  const volume = new GainNode(ctx, { gain: 1 });
  chain.output.connect(volume).connect(ctx.destination);
  const voices = new VoiceBank(ctx, chain.input, pool);

  let offset = 0.01;
  plan.sequences.forEach((seq, i) => {
    const times = lengths[i]!;
    for (const event of seq.events) {
      const pad = project.pads[event.pad];
      if (!pad || event.tick >= times.length - 1) continue;
      voices.play(event.pad, pad, event.vel, offset + times[event.tick]!, {
        semi: event.semi ?? 0,
        duration: event.len * spt,
      });
    }
    offset += times[times.length - 1]!;
  });
  // Latched loops would otherwise drone through the tail.
  voices.stopAll(offset);
  return ctx.startRendering();
}

export function audioBufferChannels(buffer: AudioBuffer): Float32Array[] {
  return Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
}
