import type { App } from './context.js';
import type { ButtonId, Controller } from './controller.js';

/** Computer keys laid out like the pad grid: top row of keys = top row of pads. */
const PAD_KEYS: Record<string, number> = {
  Digit1: 12, Digit2: 13, Digit3: 14, Digit4: 15,
  KeyQ: 8, KeyW: 9, KeyE: 10, KeyR: 11,
  KeyA: 4, KeyS: 5, KeyD: 6, KeyF: 7,
  KeyZ: 0, KeyX: 1, KeyC: 2, KeyV: 3,
};

const BUTTON_KEYS: Record<string, ButtonId> = {
  Enter: 'qrec',
  Backspace: 'erase',
  KeyB: 'bank',
  KeyT: 'tap',
  KeyN: 'repeat',
  KeyM: 'mute',
  KeyL: 'levels',
  Minus: 'minus',
  Equal: 'plus',
};

function isTyping(event: KeyboardEvent): boolean {
  const target = event.composedPath()[0];
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}

/** True when the event comes from a control the user tabbed to (not one they just clicked). */
function keyboardFocused(event: KeyboardEvent): boolean {
  const target = event.composedPath()[0];
  return target instanceof HTMLElement && target.matches('button:focus-visible, a:focus-visible');
}

/** QWERTY control. Ignored while typing in a field or when a browser shortcut modifier is held. */
export function bindKeyboard(app: App, controller: Controller): void {
  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTyping(event)) return;
    if (event.key === 'Shift') {
      if (!event.repeat) controller.press('shift');
      return;
    }
    const pad = PAD_KEYS[event.code];
    if (pad !== undefined) {
      event.preventDefault();
      if (!event.repeat) controller.padDown(pad, 104);
      return;
    }
    // A control reached with Tab keeps its native Enter/Space activation.
    if ((event.code === 'Space' || event.code === 'Enter') && keyboardFocused(event)) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) controller.press(app.ui.state.playing ? 'stop' : 'play');
      return;
    }
    if (event.code === 'Escape') return app.goto('main');
    if (event.code === 'BracketLeft' || event.code === 'BracketRight') {
      const page = controller.page;
      if (page.tabs) {
        const count = page.tabs.length;
        const step = event.code === 'BracketRight' ? 1 : count - 1;
        app.goto(page.id, (Math.min(app.ui.state.tab, count - 1) + step) % count);
      }
      return;
    }
    if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
      event.preventDefault();
      return controller.wheel(event.code === 'ArrowRight' ? 1 : -1, false);
    }
    const button = BUTTON_KEYS[event.code];
    if (button && !event.repeat) {
      event.preventDefault();
      controller.press(button);
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.key === 'Shift') return controller.release('shift', false);
    const pad = PAD_KEYS[event.code];
    if (pad !== undefined) controller.padUp(pad);
  });

  // Never leave SHIFT or a pad stuck if the window loses focus mid-press.
  window.addEventListener('blur', () => {
    controller.release('shift', false);
    for (const pad of Object.values(PAD_KEYS)) controller.padUp(pad);
  });
}
