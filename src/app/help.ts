import type { SlabApp } from '../ui/components/slab-app.js';
import { SlabHelp, type HelpAction } from '../ui/components/slab-help.js';
import { SlabTour } from '../ui/components/slab-tour.js';
import type { App } from './context.js';
import type { Controller } from './controller.js';
import { onHelpRequest, openGuide } from './help-events.js';

const WELCOMED_KEY = 'slab16.welcomed';

function firstVisit(): boolean {
  try {
    if (localStorage.getItem(WELCOMED_KEY)) return false;
    localStorage.setItem(WELCOMED_KEY, '1');
    return true;
  } catch {
    return false; // storage blocked: don't nag on every load
  }
}

/** Mount the tour and help dialogs and route every help request to them. */
export function bindHelp(app: App, controller: Controller, faceplate: SlabApp): void {
  const tour = new SlabTour();
  const help = new SlabHelp();
  document.body.append(tour, help);
  tour.connect(app, controller, (ids) => faceplate.spotlight(ids));

  const startTour = (): void => {
    help.close();
    tour.start();
  };

  onHelpRequest((kind) => {
    if (kind === 'tour') startTour();
    else if (kind === 'guide') openGuide();
    else help.open(kind);
  });
  help.addEventListener('slab-help-action', (event) => {
    if ((event as CustomEvent<HelpAction>).detail === 'tour') startTour();
  });

  // Links outside the faceplate (see index.html).
  document.querySelector('#open-tour')?.addEventListener('click', startTour);
  document.querySelector('#open-shortcuts')?.addEventListener('click', () => help.open('shortcuts'));

  // `index.html#tour` (linked from the guide) starts the tour directly.
  if (location.hash === '#tour') startTour();
  else if (firstVisit()) help.open('welcome');
}
