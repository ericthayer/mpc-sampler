import type { SampleData } from '../core/types.js';
import { sampleNameFromFile, uid } from '../core/util.js';
import { peaks, reverse } from './dsp.js';

interface Entry {
  data: SampleData;
  buffer?: AudioBuffer;
  reversed?: AudioBuffer;
  peaks?: Float32Array;
}

const PEAK_BUCKETS = 600;

/** Owns every sample's PCM and lazily builds the AudioBuffers that play it. */
export class SamplePool extends EventTarget {
  #entries = new Map<string, Entry>();

  add(data: SampleData): SampleData {
    this.#entries.set(data.id, { data });
    this.dispatchEvent(new CustomEvent<SampleData>('added', { detail: data }));
    return data;
  }

  create(name: string, sampleRate: number, channels: Float32Array[]): SampleData {
    return this.add({ id: uid('smp'), name, sampleRate, channels });
  }

  remove(id: string): void {
    if (this.#entries.delete(id)) this.dispatchEvent(new CustomEvent<string>('removed', { detail: id }));
  }

  clearUserSamples(): void {
    for (const [id, entry] of this.#entries) if (!entry.data.factory) this.#entries.delete(id);
  }

  get(id: string | null): SampleData | undefined {
    return id ? this.#entries.get(id)?.data : undefined;
  }

  has(id: string): boolean {
    return this.#entries.has(id);
  }

  list(): SampleData[] {
    return [...this.#entries.values()].map((e) => e.data);
  }

  duration(id: string | null): number {
    const data = this.get(id);
    return data ? (data.channels[0]?.length ?? 0) / data.sampleRate : 0;
  }

  /** AudioBuffers are context-independent, so the same one serves live and offline rendering. */
  buffer(id: string | null, reversed = false): AudioBuffer | undefined {
    const entry = id ? this.#entries.get(id) : undefined;
    if (!entry) return undefined;
    if (reversed) {
      entry.reversed ??= toAudioBuffer(entry.data, reverse(entry.data.channels));
      return entry.reversed;
    }
    entry.buffer ??= toAudioBuffer(entry.data, entry.data.channels);
    return entry.buffer;
  }

  peaks(id: string | null): Float32Array | undefined {
    const entry = id ? this.#entries.get(id) : undefined;
    if (!entry) return undefined;
    entry.peaks ??= peaks(entry.data.channels, PEAK_BUCKETS);
    return entry.peaks;
  }

  /** Decode an audio file with the given context and add it to the pool. */
  async importFile(ctx: BaseAudioContext, file: Blob, fileName: string): Promise<SampleData> {
    const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
    const channels: Float32Array[] = [];
    for (let c = 0; c < Math.min(2, decoded.numberOfChannels); c++) {
      channels.push(Float32Array.from(decoded.getChannelData(c)));
    }
    return this.create(sampleNameFromFile(fileName), decoded.sampleRate, channels);
  }
}

function toAudioBuffer(data: SampleData, channels: Float32Array[]): AudioBuffer {
  const length = Math.max(1, channels[0]?.length ?? 1);
  const buffer = new AudioBuffer({ length, numberOfChannels: Math.max(1, channels.length), sampleRate: data.sampleRate });
  channels.forEach((ch, i) => buffer.copyToChannel(ch as Float32Array<ArrayBuffer>, i));
  return buffer;
}
