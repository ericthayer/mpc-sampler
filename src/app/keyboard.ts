import type { App } from './context.js';
import { requestHelp } from './help-events.js';
import { OCTAVE_DOWN, OCTAVE_UP, QWERTY_NOTES } from '../ui/keys/keymap.js';

/** What the computer keys drive while the keyboard view is showing. */
export interface PianoInput {
  readonly low: number;
  noteOn: (note: number, velocity: number) => void;
  noteOff: (note: number) => void;
  shiftOctave: (direction: number) => void;
}
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
export function bindKeyboard(app: App, controller: Controller, piano: PianoInput | null): void {
  /** Note each held key started, so octave changes mid-press still release the right note. */
  const pianoDown = new Map<string, number>();
  window.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isTyping(event)) return;
    // A modal help dialog owns the keyboard; Escape closes it natively.
    if (document.querySelector('slab-help[open]')) return;
    if (event.code === 'Backquote') {
      event.preventDefault();
      if (!event.repeat) controller.setView(app.ui.state.view === 'keys' ? 'sampler' : 'keys');
      return;
    }
    if (piano && app.ui.state.view === 'keys') {
      const offset = QWERTY_NOTES[event.code];
      if (offset !== undefined) {
        event.preventDefault();
        if (!event.repeat && !pianoDown.has(event.code)) {
          const note = piano.low + offset;
          pianoDown.set(event.code, note);
          piano.noteOn(note, 100);
        }
        return;
      }
      if (event.code === OCTAVE_DOWN || event.code === OCTAVE_UP) {
        event.preventDefault();
        if (!event.repeat) piano.shiftOctave(event.code === OCTAVE_UP ? 1 : -1);
        return;
      }
      // The pads aren't on screen, so their keys do nothing here.
      if (PAD_KEYS[event.code] !== undefined) return;
    }
    if (event.key === '?') {
      event.preventDefault();
      controller.release('shift', false);
      requestHelp('shortcuts');
      return;
    }
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
    const note = pianoDown.get(event.code);
    if (note !== undefined) {
      pianoDown.delete(event.code);
      piano?.noteOff(note);
      return;
    }
    if (event.key === 'Shift') return controller.release('shift', false);
    const pad = PAD_KEYS[event.code];
    if (pad !== undefined) controller.padUp(pad);
  });

  // Never leave SHIFT or a pad stuck if the window loses focus mid-press.
  window.addEventListener('blur', () => {
    controller.release('shift', false);
    for (const pad of Object.values(PAD_KEYS)) controller.padUp(pad);
    for (const note of pianoDown.values()) piano?.noteOff(note);
    pianoDown.clear();
  });
}
