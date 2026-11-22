import type { App } from '../../app/context.js';

export interface TourProgress {
  /** Whatever `begin` measured when the step started. */
  baseline: number;
  /** Pads the player has hit since the step started. */
  hits: number;
}

export interface TourStep {
  title: string;
  /** Plain text; `backticks` render as keyboard keys. */
  body: string;
  /** Faceplate element ids to outline. */
  targets: readonly string[];
  /** Runs once when the step opens. */
  enter?: (app: App) => void;
  begin?: (app: App) => number;
  /** When it returns true the step is complete and the tour moves on. Omit for read-only steps. */
  done?: (app: App, progress: TourProgress) => boolean;
}

const userSamples = (app: App): number => app.engine.pool.list().filter((s) => !s.factory).length;
const seqEvents = (app: App): number => app.project.state.sequences[app.ui.state.seq]?.events.length ?? 0;

export const TOUR_STEPS: readonly TourStep[] = [
  {
    title: 'A two-minute tour',
    body: "You'll play the demo beat, record a part, bend the mix with an effect and load a sound of your own. Each step moves on by itself once you've done it. Press Next to skip one.",
    targets: ['screen'],
  },
  {
    title: 'Start the beat',
    body: 'Press PLAY, or `Space` on a keyboard.',
    targets: ['play'],
    done: (app) => app.ui.state.playing,
  },
  {
    title: 'Play along',
    body: 'Hit a few pads. Striking higher up a pad plays it harder. On a keyboard the bottom row of pads is `Z` `X` `C` `V`; the rows above are `A`–`F`, `Q`–`R` and `1`–`4`.',
    targets: ['pads'],
    done: (_app, progress) => progress.hits >= 4,
  },
  {
    title: 'Change the tempo',
    body: 'Turn K1: drag up or down, or scroll over it. The three knobs always control the three values along the bottom of the display.',
    targets: ['k1'],
    begin: (app) => app.project.state.bpm,
    done: (app, progress) => app.project.state.bpm !== progress.baseline,
  },
  {
    title: 'Record a part',
    body: 'Press SEQ RECORD (or `Enter`), and PLAY too if the beat is stopped. Then tap the clap on pad 4 (`V`) on beats 2 and 4. Notes snap to the nearest 16th.',
    targets: ['qrec', 'pads'],
    begin: seqEvents,
    done: (app, progress) => seqEvents(app) >= progress.baseline + 2,
  },
  {
    title: 'Stop, and undo if you like',
    body: 'Press STOP. Not happy with the take? Press SHIFT, then − to undo it. + redoes.',
    targets: ['stop', 'shift', 'minus'],
    done: (app) => !app.ui.state.playing && !app.ui.state.recording,
  },
  {
    title: 'Bend the mix',
    body: 'Press PLAY, then PAD FX. Every pad is now an effect on the whole mix: hold one down, then let go. The bottom row stutters; the top row is half speed, tape stop, reverse and echo.',
    targets: ['play', 'padfx'],
    done: (app) => app.ui.state.activeFx.length > 0,
  },
  {
    title: 'Bring your own sound',
    body: 'Drag an audio file from your computer onto any pad. Or record one: press SAMPLE RECORD to open the record page, press it again to start and again to stop, then hit the pad that should keep the take.',
    targets: ['pads', 'srec'],
    enter: (app) => {
      if (app.ui.state.page === 'padfx') app.goto('main');
    },
    begin: userSamples,
    done: (app, progress) => userSamples(app) > progress.baseline,
  },
  {
    title: "You're set",
    body: 'Your work saves in this browser as you go. To keep a copy or move it to another computer, press SHIFT, then pad 16 (Project), then Save File. The guide covers chopping, songs, MIDI and beat-making tips. Press `?` any time for shortcuts.',
    targets: [],
  },
];
