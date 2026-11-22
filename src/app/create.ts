import { Engine } from '../audio/engine.js';
import { buildFactoryKit } from '../audio/factory-kit.js';
import { Recorder } from '../audio/recorder.js';
import { demoProject } from '../core/defaults.js';
import { initialUi, type PageId, type ProjectTopic, type UiState, type UiTopic } from '../core/state.js';
import { History, Store } from '../core/store.js';
import { PADS_PER_BANK, type Project, type Sequence } from '../core/types.js';
import { MidiInput } from '../io/midi.js';
import { bindMediaSession, setWakeLock, updateMediaSession, watchInstallPrompt } from '../io/platform.js';
import { Sequencer } from '../seq/sequencer.js';
import { releasePadFx } from '../ui/screen/pages/fx.js';
import { PAGES } from '../ui/screen/pages/index.js';
import { restoreSession, startAutosave } from './actions/project.js';
import type { App } from './context.js';
import { Controller } from './controller.js';

const MESSAGE_MS = 2200;

export interface Runtime {
  app: App;
  controller: Controller;
}

/** Build the stores, audio engine and sequencer, and wire the cross-cutting behaviour. */
export function createApp(): Runtime {
  const project = new Store<Project, ProjectTopic>(demoProject());
  const ui = new Store<UiState, UiTopic>(initialUi());
  const engine = new Engine();
  const history = new History<Sequence[]>();
  const sequencer = new Sequencer(project, ui, engine, history);
  const recorder = new Recorder(engine);

  for (const sample of buildFactoryKit()) engine.pool.add(sample);

  let messageTimer: ReturnType<typeof setTimeout> | undefined;
  let controller: Controller | null = null;

  const midi = new MidiInput({
    noteOn: (note, velocity) => {
      const pad = note - project.state.settings.midiBase;
      if (pad >= 0 && pad < PADS_PER_BANK) controller?.padDown(pad, velocity);
    },
    noteOff: (note) => {
      const pad = note - project.state.settings.midiBase;
      if (pad >= 0 && pad < PADS_PER_BANK) controller?.padUp(pad);
    },
    control: (knob, value) => controller?.knob(knob, value),
    transport: (command) => (command === 'stop' ? sequencer.stop() : sequencer.play(command === 'continue')),
    status: (status, inputs) => ui.update((s) => void (s.midi = { status, inputs }), 'midi'),
  });

  const app: App = {
    project,
    ui,
    engine,
    sequencer,
    recorder,
    history,
    midi,
    capture: null,
    say: (message) => {
      clearTimeout(messageTimer);
      ui.update((s) => void (s.message = message), 'message');
      messageTimer = setTimeout(() => ui.update((s) => void (s.message = ''), 'message'), MESSAGE_MS);
    },
    goto: (page: PageId, tab = 0) => {
      const leaving = ui.state.page;
      if (leaving === 'padfx' && page !== 'padfx' && !ui.state.fxLatch) releasePadFx(app);
      const tabs = PAGES[page].tabs?.length ?? 1;
      ui.update((s) => {
        // Returning to a tabbed page keeps the tab you were on.
        s.tab = page === leaving && tab === 0 ? Math.min(s.tab, tabs - 1) : Math.min(tab, tabs - 1);
        if (page !== leaving) s.focus = 0;
        s.page = page;
      }, 'page');
    },
  };
  controller = new Controller(app);

  // Keep the audio graph in step with the project.
  engine.applyProject(project.state);
  project.subscribe((topic) => {
    if (topic === 'fx' || topic === 'tempo' || topic === 'volume' || topic === 'project') engine.applyProject(project.state);
  });

  // Platform integration that follows the transport.
  bindMediaSession({ play: () => sequencer.play(), stop: () => sequencer.stop() });
  let wasPlaying = false;
  ui.subscribe((topic) => {
    if (topic !== 'transport' || ui.state.playing === wasPlaying) return;
    wasPlaying = ui.state.playing;
    void setWakeLock(wasPlaying);
    updateMediaSession(project.state.name, wasPlaying);
  });
  watchInstallPrompt((available) => ui.update((s) => void (s.canInstall = available), 'params'));

  void restoreSession(app).finally(() => startAutosave(app));
  return { app, controller };
}
