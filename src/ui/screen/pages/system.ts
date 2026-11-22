import { bounceToWav, exportProject, newProject, openProjectFile, shareBounce } from '../../../app/actions/project.js';
import type { App } from '../../../app/context.js';
import type { FaderTarget } from '../../../core/types.js';
import { canShareFiles } from '../../../io/files.js';
import { MidiInput } from '../../../io/midi.js';
import { promptInstall } from '../../../io/platform.js';
import { h } from '../../dom.js';
import { choice, line, range, type Chip, type PageDef } from '../page.js';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteName(note: number): string {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1} (${note})`;
}

/** MIDI CONFIG: play the pads from a controller. */
export const midiPage: PageDef = {
  id: 'midi',
  title: 'MIDI',
  hint: 'Connect a MIDI controller: notes play the current bank, CC 1 / 74 / 71 turn K1–K3, Start/Stop run the transport.',
  params: (app) => [
    range('Base Note', 0, 108, 1, () => app.project.state.settings.midiBase, (v) => app.project.update((p) => void (p.settings.midiBase = v), 'settings'), noteName, 36),
    null,
    null,
  ],
  chips: (app) => [
    app.ui.state.midi.status === 'on'
      ? { label: 'Disconnect', run: () => app.midi.disconnect(), on: () => true }
      : { label: 'Connect', run: () => void app.midi.connect(), disabled: () => !MidiInput.supported },
  ],
  view: (app) => {
    const status = line('STATUS');
    const inputs = line('INPUTS');
    const map = line('PAD 1');
    const update = (): void => {
      const midi = app.ui.state.midi;
      const text = { off: 'Not connected', on: 'Connected', denied: 'Permission denied', unsupported: 'Not supported in this browser' }[midi.status];
      status.set(MidiInput.supported ? text : 'Not supported in this browser');
      inputs.set(midi.inputs.length ? midi.inputs.join(', ') : '—');
      map.set(noteName(app.project.state.settings.midiBase));
    };
    return { el: h('div', { class: 'page lines' }, status.el, inputs.el, map.el), update };
  },
};

const FADER_TARGETS: readonly FaderTarget[] = ['djFilter', 'volume', 'padLevel', 'padTune', 'padCutoff'];
const FADER_LABELS = ['DJ FILTER', 'MASTER VOLUME', 'PAD LEVEL', 'PAD TUNE', 'PAD CUTOFF'];

export function faderTargetLabel(target: FaderTarget): string {
  return FADER_LABELS[FADER_TARGETS.indexOf(target)] ?? '';
}

/** FADER: choose what the fader controls. */
export const faderPage: PageDef = {
  id: 'fader',
  title: 'FADER',
  hint: 'Assign the fader. DJ Filter sweeps low-pass ← centre → high-pass across the whole mix.',
  params: (app) => [
    choice('Target', FADER_LABELS, () => FADER_TARGETS.indexOf(app.project.state.settings.faderTarget), (i) => app.project.update((p) => void (p.settings.faderTarget = FADER_TARGETS[i]!), 'settings')),
    null,
    null,
  ],
  view: (app) => {
    const rows = FADER_LABELS.map((label, i) => {
      const row = h('p', { class: 'line' }, h('span', { class: 'k' }, `${i + 1}`), h('span', { class: 'v' }, label));
      return row;
    });
    const update = (): void => {
      const at = FADER_TARGETS.indexOf(app.project.state.settings.faderTarget);
      rows.forEach((row, i) => row.classList.toggle('on', i === at));
    };
    return { el: h('div', { class: 'page lines' }, ...rows), update };
  },
};

let armed = '';
let armedTimer: ReturnType<typeof setTimeout> | undefined;

/** A chip that replaces the current project: the first tap arms it, a second within 3 s confirms. */
function confirmChip(app: App, label: string, run: () => void): Chip {
  return {
    label: armed === label ? `${label}: sure?` : label,
    on: () => armed === label,
    run: () => {
      clearTimeout(armedTimer);
      if (armed === label) {
        armed = '';
        run();
        return;
      }
      armed = label;
      app.say(`Tap ${label} again to replace this project`);
      armedTimer = setTimeout(() => {
        armed = '';
        app.ui.emit('params');
      }, 3000);
    },
  };
}

function projectChips(app: App): Chip[] {
  const chips: Chip[] = [
    { label: 'Save File', run: () => void exportProject(app) },
    { label: 'Open File', run: () => void openProjectFile(app) },
    { label: 'Bounce WAV', run: () => void bounceToWav(app, app.ui.state.songMode) },
  ];
  if (canShareFiles()) chips.push({ label: 'Share', run: () => void shareBounce(app) });
  chips.push(confirmChip(app, 'New', () => newProject(app, false)), confirmChip(app, 'Demo', () => newProject(app, true)));
  if (app.ui.state.canInstall) {
    chips.push({
      label: 'Install App',
      run: () => void promptInstall().then(() => app.ui.update((s) => void (s.canInstall = false), 'params')),
    });
  }
  return chips;
}

/** PROJECT: name, files, bounce, install. */
export const projectPage: PageDef = {
  id: 'project',
  title: 'PROJECT',
  hint: 'Everything autosaves in this browser. Save File writes one portable .slab file with your samples inside.',
  params: (app) => [
    range('Volume', 0, 1, 0.01, () => app.project.state.volume, (v) => app.project.update((p) => void (p.volume = v), 'volume'), (v) => `${Math.round(v * 100)}`, 0.8),
    null,
    null,
  ],
  chips: projectChips,
  view: (app) => {
    const name = h('input', { id: 'project-name', type: 'text', maxLength: 32, autocomplete: 'off', spellcheck: false });
    name.addEventListener('input', () => app.project.update((p) => void (p.name = name.value), 'project'));
    const contents = line('CONTENTS');
    const storage = line('STORAGE');
    storage.set('…');
    void navigator.storage?.estimate?.().then((estimate) => {
      const used = (estimate.usage ?? 0) / 1e6;
      storage.set(`${used.toFixed(1)} MB used in this browser`);
    });
    const update = (): void => {
      const project = app.project.state;
      if (document.activeElement !== name && name.value !== project.name) name.value = project.name;
      const pads = project.pads.filter((p) => p.sampleId).length;
      const seqs = project.sequences.filter((s) => s.events.length).length;
      contents.set(`${pads} pads · ${seqs} sequences`);
    };
    return {
      el: h(
        'div',
        { class: 'page lines' },
        h('p', { class: 'line' }, h('label', { class: 'k', for: 'project-name' }, 'NAME'), name),
        contents.el,
        storage.el,
      ),
      update,
    };
  },
};
