import { createApp } from './app/create.js';
import { bindHelp } from './app/help.js';
import { bindKeyboard } from './app/keyboard.js';
import { bindViews } from './app/views.js';
import { SlabKeys } from './ui/components/slab-keys.js';
import { registerServiceWorker } from './io/platform.js';
import { SlabApp } from './ui/components/slab-app.js';

const { app, controller } = createApp();

// Console hook for scripting and debugging: `slab.app.project.state`, `slab.controller.press('play')`.
Object.assign(window, { slab: { app, controller } });

const host = document.querySelector('slab-app');
const keys = document.querySelector('slab-keys');
if (host instanceof SlabApp) {
  host.bind(app, controller);
  bindHelp(app, controller, host);
}
if (keys instanceof SlabKeys) {
  keys.bind(app, controller);
  if (host instanceof SlabApp) bindViews(app, controller, host, keys);
}
bindKeyboard(app, controller, keys instanceof SlabKeys ? keys : null);

// Browsers only allow audio after a gesture; start the engine on the very first one.
const unlock = (): void => app.engine.start();
window.addEventListener('pointerdown', unlock, { once: true, capture: true });
window.addEventListener('keydown', unlock, { once: true, capture: true });

if ('requestIdleCallback' in window) requestIdleCallback(() => void registerServiceWorker());
else setTimeout(() => void registerServiceWorker(), 2000);
