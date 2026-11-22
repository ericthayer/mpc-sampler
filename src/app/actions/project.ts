import { audioBufferChannels, bounce, songPlan } from '../../audio/bounce.js';
import { wavBlob } from '../../audio/wav.js';
import { blankProject, demoProject, migrateProject } from '../../core/defaults.js';
import type { Project } from '../../core/types.js';
import { debounce } from '../../core/util.js';
import { clearAll, loadProject, loadSamples, pruneSamples, saveProject, saveSample } from '../../io/db.js';
import { pickFiles, saveBlob, shareFile } from '../../io/files.js';
import { decodeProject, encodeProject } from '../../io/project-file.js';
import { unzipFirst } from '../../io/zip.js';
import type { App } from '../context.js';

function safeName(name: string): string {
  return name.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-') || 'slab-project';
}

function usedSampleIds(project: Project): Set<string> {
  return new Set(project.pads.map((p) => p.sampleId).filter((id): id is string => id !== null));
}

function installProject(app: App, project: Project): void {
  app.sequencer.stop();
  app.history.clear();
  app.capture = null;
  app.project.replace(project, 'project');
  app.ui.update((s) => {
    s.seq = 0;
    s.bank = 0;
    s.pad = 0;
    s.songStep = 0;
    s.stepBar = 0;
    s.recorder = 'idle';
  }, 'seq');
  app.ui.emit('pool');
  app.goto('main');
}

export function newProject(app: App, demo: boolean): void {
  app.engine.pool.clearUserSamples();
  installProject(app, demo ? demoProject() : blankProject());
  app.say(demo ? 'Demo beat loaded' : 'New project');
}

/** Restore the autosaved session, or fall back to the demo beat. */
export async function restoreSession(app: App): Promise<void> {
  const [saved, samples] = await Promise.all([loadProject(), loadSamples()]);
  if (!saved) return;
  for (const sample of samples) app.engine.pool.add(sample);
  app.project.replace(migrateProject(saved), 'project');
  app.ui.emit('pool');
}

/** Write the project to IndexedDB shortly after every change. */
export function startAutosave(app: App): void {
  const save = debounce(() => {
    const project = app.project.state;
    void saveProject(project)
      .then(() => pruneSamples(usedSampleIds(project)))
      .catch(() => undefined);
  }, 900);
  app.project.subscribe(() => save());
}

/** Export everything — settings, sequences and sample audio — as one `.slab` file. */
export async function exportProject(app: App): Promise<void> {
  const project = app.project.state;
  const used = usedSampleIds(project);
  const samples = app.engine.pool.list().filter((s) => used.has(s.id) && !s.factory);
  const blob = new Blob([encodeProject(project, samples)], { type: 'application/octet-stream' });
  const saved = await saveBlob(blob, `${safeName(project.name)}.slab`, 'SLAB/16 project', '.slab');
  app.say(saved ? 'Project saved' : 'Save cancelled');
}

export async function openProjectFile(app: App, file?: File): Promise<void> {
  const picked =
    file ??
    (await pickFiles({ accept: '.slab,.zip', description: 'SLAB/16 project', types: { 'application/octet-stream': ['.slab', '.zip'] } }))[0];
  if (!picked) return;
  try {
    const raw = await picked.arrayBuffer();
    // A project saved from an embedded preview arrives wrapped in a .zip.
    const bundle = decodeProject(unzipFirst(raw)?.data ?? raw);
    await clearAll().catch(() => undefined);
    app.engine.pool.clearUserSamples();
    for (const sample of bundle.samples) {
      app.engine.pool.add(sample);
      void saveSample(sample).catch(() => undefined);
    }
    installProject(app, migrateProject(bundle.project));
    app.say(`Opened ${app.project.state.name}`);
  } catch (error) {
    app.say(error instanceof Error ? error.message : 'Could not open project');
  }
}

async function renderWav(app: App, song: boolean): Promise<Blob> {
  const project = app.project.state;
  const plan = song ? songPlan(project) : { sequences: [project.sequences[app.ui.state.seq]!] };
  const buffer = await bounce(project, app.engine.pool, plan);
  return wavBlob(audioBufferChannels(buffer), buffer.sampleRate);
}

/** Render the current sequence (or the whole song) to a WAV file, faster than real time. */
export async function bounceToWav(app: App, song: boolean): Promise<void> {
  app.say('Bouncing…');
  try {
    const blob = await renderWav(app, song);
    const name = `${safeName(app.project.state.name)}-${song ? 'song' : 'seq'}.wav`;
    const saved = await saveBlob(blob, name, 'WAV audio', '.wav');
    app.say(saved ? 'Bounce saved' : 'Save cancelled');
  } catch {
    app.say('Bounce failed');
  }
}

/** Render and hand the WAV to the OS share sheet. */
export async function shareBounce(app: App): Promise<void> {
  app.say('Bouncing…');
  try {
    const blob = await renderWav(app, app.ui.state.songMode);
    const shared = await shareFile(blob, `${safeName(app.project.state.name)}.wav`, app.project.state.name);
    app.say(shared ? 'Shared' : 'Sharing unavailable');
  } catch {
    app.say('Bounce failed');
  }
}
