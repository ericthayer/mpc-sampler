import type { PageId } from '../../../core/state.js';
import type { PageDef } from '../page.js';
import { browserPage } from './browser.js';
import { chopPage } from './chop.js';
import { compPage, knobFxPage, padFxPage } from './fx.js';
import { mainPage } from './main.js';
import { recordPage } from './record.js';
import { samplePage } from './sample.js';
import { seqPage, stepPage } from './seq.js';
import { faderPage, midiPage, projectPage } from './system.js';
import { songPage, timingPage, warpPage } from './tools.js';

export const PAGES: Record<PageId, PageDef> = {
  main: mainPage,
  sample: samplePage,
  record: recordPage,
  browser: browserPage,
  chop: chopPage,
  seq: seqPage,
  step: stepPage,
  padfx: padFxPage,
  knobfx: knobFxPage,
  comp: compPage,
  midi: midiPage,
  fader: faderPage,
  song: songPage,
  timing: timingPage,
  warp: warpPage,
  project: projectPage,
};
