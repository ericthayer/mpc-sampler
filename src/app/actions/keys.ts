import { patchPad, type SynthPatch } from '../../audio/synth-patches.js';
import { emptyPad } from '../../core/defaults.js';
import { PADS_PER_BANK } from '../../core/types.js';
import { padLabel, type App } from '../context.js';

const SYNTH_BANK_START = 3 * PADS_PER_BANK;

/**
 * Put a synth patch on a pad without overwriting anyone's sound: the selected pad if
 * it's empty, else the first empty pad in bank D, else any empty pad. Only when every
 * pad is full does it replace the selected one, and it says so.
 */
export function loadPatch(app: App, patch: SynthPatch): void {
  const pads = app.project.state.pads;
  const selected = app.ui.state.pad;
  let target = pads[selected]?.sampleId ? -1 : selected;
  if (target < 0) target = pads.findIndex((pad, i) => i >= SYNTH_BANK_START && !pad.sampleId);
  if (target < 0) target = pads.findIndex((pad) => !pad.sampleId);
  const replaced = target < 0;
  if (replaced) target = selected;
  app.project.update((p) => void (p.pads[target] = patchPad(patch, emptyPad())), 'pads');
  selectPad(app, target);
  app.say(replaced ? `${patch.name} replaced ${padLabel(target)}` : `${patch.name} loaded on ${padLabel(target)}`);
}

/** Choose the pad the keyboard plays; the sampler follows to the same bank. */
export function selectPad(app: App, index: number): void {
  app.ui.update((s) => {
    s.pad = index;
    s.bank = Math.floor(index / PADS_PER_BANK);
  }, 'pad');
}
