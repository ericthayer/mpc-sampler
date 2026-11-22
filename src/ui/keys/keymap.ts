/** Pure helpers for the on-screen and computer-keyboard piano. */
import { PADS_PER_BANK } from '../../core/types.js';

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const BLACK = new Set([1, 3, 6, 8, 10]);

export const LOWEST = 24; // C1
export const HIGHEST = 108; // C8

export function noteName(note: number): string {
  return `${NAMES[((note % 12) + 12) % 12]}${Math.floor(note / 12) - 1}`;
}

export function isBlack(note: number): boolean {
  return BLACK.has(((note % 12) + 12) % 12);
}

/**
 * Computer keys in the layout most music software uses: the home row is the white
 * keys from the lowest C shown, the row above is the black keys.
 */
export const QWERTY_NOTES: Readonly<Record<string, number>> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9,
  KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17,
};
export const OCTAVE_DOWN = 'KeyZ';
export const OCTAVE_UP = 'KeyX';

const LABELS: Readonly<Record<string, string>> = { Semicolon: ';', Quote: "'" };

/** The computer key that plays `offset` semitones above the lowest key, if any. */
export function qwertyLabel(offset: number): string {
  const code = Object.keys(QWERTY_NOTES).find((key) => QWERTY_NOTES[key] === offset);
  return code ? (LABELS[code] ?? code.replace('Key', '')) : '';
}

/** How many octaves fit a keybed of this width (CSS px). */
export function octavesFor(width: number): number {
  return width >= 900 ? 3 : width >= 520 ? 2 : 1;
}

/** Keep the lowest C inside the playable range for the octaves shown. */
export function clampLow(low: number, octaves: number): number {
  const top = HIGHEST - octaves * 12;
  return Math.max(LOWEST, Math.min(top, Math.round(low / 12) * 12));
}

/** Pads with a sound, for the sound picker. */
export function soundOptions(pads: readonly { sampleId: string | null; name: string }[]): { index: number; label: string }[] {
  return pads.flatMap((pad, index) =>
    pad.sampleId
      ? [{ index, label: `${'ABCD'[Math.floor(index / PADS_PER_BANK)]}${String((index % PADS_PER_BANK) + 1).padStart(2, '0')} ${pad.name}` }]
      : [],
  );
}
