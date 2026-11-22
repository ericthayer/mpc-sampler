import type { SlabKeys } from '../ui/components/slab-keys.js';
import type { App } from './context.js';
import type { Controller } from './controller.js';

const STORAGE_KEY = 'slab16.view';

/**
 * Shows one interface at a time: the pad sampler or the keyboard. Both stay mounted
 * and share every store, so swapping is instant and playback never stops.
 */
export function bindViews(app: App, controller: Controller, sampler: HTMLElement, keys: SlabKeys): void {
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('[data-view]')];
  for (const button of buttons) {
    button.addEventListener('click', () => controller.setView(button.dataset.view === 'keys' ? 'keys' : 'sampler'));
  }

  const apply = (): void => {
    const view = app.ui.state.view;
    sampler.hidden = view !== 'sampler';
    keys.hidden = view !== 'keys';
    for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.view === view));
    try {
      localStorage.setItem(STORAGE_KEY, view);
    } catch {
      /* per-viewer convenience only */
    }
  };
  app.ui.subscribe((topic) => {
    if (topic === 'view') apply();
  });

  try {
    if (localStorage.getItem(STORAGE_KEY) === 'keys') controller.setView('keys');
  } catch {
    /* storage blocked: start on the sampler */
  }
  apply();
}
