export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Normalise `value` in [min,max] to 0..1. */
export function norm(value: number, min: number, max: number): number {
  return max === min ? 0 : clamp((value - min) / (max - min), 0, 1);
}

/** Map 0..1 onto [min,max], optionally snapping to `step`. */
export function denorm(n: number, min: number, max: number, step = 0): number {
  const v = lerp(min, max, clamp(n, 0, 1));
  return step > 0 ? Math.round(v / step) * step : v;
}

/** 0..1 → 20 Hz..20 kHz, logarithmic. */
export function cutoffHz(n: number): number {
  return 20 * Math.pow(1000, clamp(n, 0, 1));
}

export function semitoneRatio(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

export function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

export function gainToDb(gain: number): number {
  return 20 * Math.log10(Math.max(gain, 1e-6));
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function formatHz(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)}k` : `${Math.round(hz)}`;
}

export function formatSeconds(s: number): string {
  return s < 1 ? `${Math.round(s * 1000)}ms` : `${s.toFixed(2)}s`;
}

export function formatPercent(n: number): string {
  return `${Math.round(n * 100)}%`;
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

let uidCounter = 0;
export function uid(prefix = 's'): string {
  uidCounter += 1;
  return `${prefix}${Date.now().toString(36)}${uidCounter.toString(36)}`;
}

/** Strip extension and tidy a file name for an 8-ish character display. */
export function sampleNameFromFile(fileName: string): string {
  return fileName.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_]+/g, ' ').trim().slice(0, 24) || 'Sample';
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
