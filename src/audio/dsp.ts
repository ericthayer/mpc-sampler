/** Pure DSP on raw Float32 channel data. No Web Audio types, so it runs in Node tests too. */

export type Channels = Float32Array[];

export function peakLevel(channels: Channels): number {
  let peak = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]!);
      if (a > peak) peak = a;
    }
  }
  return peak;
}

/** Scale so the loudest sample hits `target` (linear). Returns new arrays. */
export function normalize(channels: Channels, target = 0.97): Channels {
  const peak = peakLevel(channels);
  const gain = peak > 1e-5 ? target / peak : 1;
  return channels.map((ch) => ch.map((v) => v * gain));
}

export function reverse(channels: Channels): Channels {
  return channels.map((ch) => Float32Array.from(ch).reverse());
}

/** Keep only the region between two fractions of the sample (0..1). */
export function crop(channels: Channels, start: number, end: number): Channels {
  const length = channels[0]?.length ?? 0;
  const a = Math.max(0, Math.floor(start * length));
  const b = Math.min(length, Math.max(a + 1, Math.ceil(end * length)));
  return channels.map((ch) => ch.slice(a, b));
}

export function toMono(channels: Channels): Float32Array {
  const first = channels[0];
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return first;
  const out = new Float32Array(first.length);
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i]! += ch[i]! / channels.length;
  return out;
}

/** Min/max pairs per bucket, for waveform drawing. Length = buckets * 2. */
export function peaks(channels: Channels, buckets: number): Float32Array {
  const mono = toMono(channels);
  const out = new Float32Array(buckets * 2);
  const size = mono.length / buckets;
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * size);
    const to = Math.max(from + 1, Math.floor((b + 1) * size));
    let min = 1;
    let max = -1;
    for (let i = from; i < to && i < mono.length; i++) {
      const v = mono[i]!;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    out[b * 2] = min > max ? 0 : min;
    out[b * 2 + 1] = min > max ? 0 : max;
  }
  return out;
}

/** Slice boundaries (fractions, always starting with 0) dividing the sample evenly. */
export function equalSlices(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i / count);
}

/**
 * Onset detection on a short-time energy envelope.
 * `sensitivity` 0..1 — higher finds more slices. Returns start fractions, first is 0.
 */
export function detectTransients(
  channels: Channels,
  sampleRate: number,
  sensitivity: number,
  maxSlices = 16,
): number[] {
  const mono = toMono(channels);
  const hop = 256;
  const frames = Math.floor(mono.length / hop);
  if (frames < 4) return [0];
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) sum += mono[i]! * mono[i]!;
    energy[f] = Math.sqrt(sum / hop);
  }
  let loudest = 0;
  for (const e of energy) if (e > loudest) loudest = e;
  if (loudest < 1e-4) return [0];

  const ratio = 3.2 - sensitivity * 2.1; // rise factor needed to count as an onset
  const floor = loudest * (0.3 - sensitivity * 0.27);
  const minGap = Math.ceil((0.06 * sampleRate) / hop);
  const candidates: { frame: number; strength: number }[] = [];
  let last = -minGap;
  for (let f = 1; f < frames; f++) {
    const before = Math.max(energy[f - 1]!, 1e-5);
    const now = energy[f]!;
    if (now > floor && now / before > ratio && f - last >= minGap) {
      candidates.push({ frame: f, strength: now / before });
      last = f;
    }
  }
  const strongest = candidates
    .sort((a, b) => b.strength - a.strength)
    .slice(0, Math.max(0, maxSlices - 1))
    .map((c) => (c.frame * hop) / mono.length)
    .filter((pos) => pos > 0.01)
    .sort((a, b) => a - b);
  return [0, ...strongest];
}

/**
 * Time-stretch without changing pitch (WSOLA).
 * `ratio` = output length / input length.
 */
export function stretch(channels: Channels, sampleRate: number, ratio: number): Channels {
  const input = toMono(channels);
  const inLength = input.length;
  const win = Math.max(256, Math.round(sampleRate * 0.04) & ~1);
  const hopOut = win >> 1;
  const search = Math.round(sampleRate * 0.008);
  const outLength = Math.max(win, Math.round(inLength * ratio));
  if (inLength < win * 2 || Math.abs(ratio - 1) < 1e-3) return channels.map((ch) => ch.slice());

  const hann = new Float32Array(win);
  for (let i = 0; i < win; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / win);

  const out = channels.map(() => new Float32Array(outLength + win));
  const maxStart = inLength - win - 1;
  let previous = 0; // input position of the previous grain

  for (let k = 0; k * hopOut < outLength; k++) {
    const target = Math.min(maxStart, Math.round((k * hopOut) / ratio));
    let best = target;
    if (k > 0) {
      // Pick the offset whose start best matches where the previous grain would naturally continue.
      const natural = Math.min(maxStart, previous + hopOut);
      let bestScore = -Infinity;
      const lo = Math.max(0, target - search);
      const hi = Math.min(maxStart, target + search);
      for (let cand = lo; cand <= hi; cand += 2) {
        let score = 0;
        for (let i = 0; i < hopOut; i += 4) score += input[cand + i]! * input[natural + i]!;
        if (score > bestScore) {
          bestScore = score;
          best = cand;
        }
      }
    }
    const outPos = k * hopOut;
    for (let c = 0; c < channels.length; c++) {
      const src = channels[c]!;
      const dst = out[c]!;
      for (let i = 0; i < win; i++) dst[outPos + i]! += src[best + i]! * hann[i]!;
    }
    previous = best;
  }
  return out.map((ch) => ch.subarray(0, outLength).slice());
}

/** Cut leading audio quieter than `threshold` (linear), keeping a few ms of pre-roll. */
export function trimLeadingSilence(channels: Channels, sampleRate: number, threshold: number): Channels {
  const mono = toMono(channels);
  let first = 0;
  while (first < mono.length && Math.abs(mono[first]!) < threshold) first++;
  if (first >= mono.length) return channels;
  const from = Math.max(0, first - Math.round(sampleRate * 0.003));
  return channels.map((ch) => ch.slice(from));
}

export type BiquadKind = 'lowpass' | 'highpass' | 'bandpass';

/** In-place RBJ biquad. Used by the procedural factory kit. */
export function biquad(data: Float32Array, sampleRate: number, kind: BiquadKind, freq: number, q: number): Float32Array {
  const w = (2 * Math.PI * Math.min(freq, sampleRate * 0.45)) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0: number;
  let b1: number;
  let b2: number;
  if (kind === 'lowpass') {
    b0 = (1 - cos) / 2;
    b1 = 1 - cos;
    b2 = b0;
  } else if (kind === 'highpass') {
    b0 = (1 + cos) / 2;
    b1 = -(1 + cos);
    b2 = b0;
  } else {
    b0 = alpha;
    b1 = 0;
    b2 = -alpha;
  }
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i]!;
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
    data[i] = y;
  }
  return data;
}
