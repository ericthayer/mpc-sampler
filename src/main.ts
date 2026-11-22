import { createApp } from './app/create.js';
import { bindHelp } from './app/help.js';
import { bindKeyboard } from './app/keyboard.js';
import { registerServiceWorker } from './io/platform.js';
import { SlabApp } from './ui/components/slab-app.js';

const { app, controller } = createApp();

// Console hook for scripting and debugging: `slab.app.project.state`, `slab.controller.press('play')`.
Object.assign(window, { slab: { app, controller } });

const host = document.querySelector('slab-app');
if (host instanceof SlabApp) {
  host.bind(app, controller);
  bindHelp(app, controller, host);
}
bindKeyboard(app, controller);

// Browsers only allow audio after a gesture; start the engine on the very first one.
const unlock = (): void => app.engine.start();
window.addEventListener('pointerdown', unlock, { once: true, capture: true });
window.addEventListener('keydown', unlock, { once: true, capture: true });

if ('requestIdleCallback' in window) requestIdleCallback(() => void registerServiceWorker());
else setTimeout(() => void registerServiceWorker(), 2000);
