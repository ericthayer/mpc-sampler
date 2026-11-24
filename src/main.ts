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

// Hand over from the boot loader in index.html once the instrument has painted.
requestAnimationFrame(() => {
  document.documentElement.classList.add('ready');
  const boot = document.querySelector('.boot');
  if (!boot) return;
  const remove = (): void => boot.remove();
  boot.addEventListener('transitionend', remove, { once: true });
  setTimeout(remove, 800); // in case no transition runs (reduced motion, hidden tab)
});

// Browsers only allow audio after a gesture. Desktop browsers accept a press; iOS only
// accepts the end of a tap. Keep listening until audio is actually running.
const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;
const unlock = (): void => {
  app.engine.unlock();
  if (!app.engine.running) return;
  for (const type of UNLOCK_EVENTS) window.removeEventListener(type, unlock, true);
};
for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, { capture: true, passive: true });
// iOS suspends audio when the app is backgrounded or a call comes in; take it back on the next tap.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && app.engine.started && !app.engine.running) {
    for (const type of UNLOCK_EVENTS) window.addEventListener(type, unlock, { capture: true, passive: true });
  }
});

if ('requestIdleCallback' in window) requestIdleCallback(() => void registerServiceWorker());
else setTimeout(() => void registerServiceWorker(), 2000);
