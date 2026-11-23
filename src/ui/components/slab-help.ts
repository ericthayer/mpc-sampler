import { GUIDE_URL } from '../../app/help-events.js';
import { css, define, emit, h, sheet, SlabElement } from '../dom.js';
import { helpStyles } from '../help/help.styles.js';
import { rich } from '../help/rich.js';
import { sharedStyles } from '../styles/shared.js';

const styles = sheet(css`
  dialog {
    inline-size: min(34rem, calc(100vw - 32px));
    max-block-size: calc(100dvh - 32px);
  }
  .sheet {
    display: grid;
    gap: 16px;
    padding: 22px;
  }
  .lede { color: var(--_dim); }
  .wordmark {
    margin: 0;
    font-size: 1.75rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    line-height: 1;
  }
  .wordmark b { color: var(--_accent); font-weight: 800; }
  dl {
    display: grid;
    grid-template-columns: minmax(7.5rem, auto) minmax(0, 1fr);
    gap: 6px 16px;
    margin: 0;
    font-size: 0.875rem;
  }
  dt { white-space: nowrap; }
  dd { margin: 0; color: var(--_dim); }
  h3 {
    margin: 4px 0 0;
    font: 700 0.6875rem/1 var(--slab-font-screen, ui-monospace, monospace);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--_accent);
  }
`);

export type HelpMode = 'welcome' | 'shortcuts';
export type HelpAction = 'tour' | 'close';

const SHORTCUTS: readonly [string, string][] = [
  ['`Z` `X` `C` `V`', 'Pads 1–4 (bottom row)'],
  ['`A`–`F`  `Q`–`R`  `1`–`4`', 'Pads 5–8, 9–12, 13–16'],
  ['`Space`', 'Play / stop'],
  ['`Enter`', 'Seq record'],
  ['`Shift` (hold)', 'SHIFT functions'],
  ['`←` `→`  `-` `=`', 'Data wheel, − / +'],
  ['`[` `]`', 'Previous / next tab'],
  ['`B` `T` `N`', 'Pad bank, tap tempo, note repeat'],
  ['`M` `L`', 'Mute mode, 16 levels'],
  ['`Backspace`', 'Erase mode'],
  ['`Esc`', 'Back to the main page'],
  ['````', 'Swap between sampler and keyboard'],
  ['`A`–`;`  `W` `E` `T`…', 'Keyboard view: white and black keys'],
  ['`Z` `X`', 'Keyboard view: octave down / up'],
  ['`?`', 'This list'],
];

const TIPS: readonly [string, string][] = [
  ['SHIFT', 'Tap it once and it stays on for the next press, so it works with one finger.'],
  ['SHIFT + pad', 'Runs the function printed under the pad: Song, Warp, Project and more.'],
  ['Knobs', 'K1–K3 control the three values at the bottom of the display. Double-click to reset.'],
  ['Files', 'Drop audio files on any pad to load them.'],
];

/** Modal welcome (first visit) and shortcuts sheet. Fires `slab-help-action`. */
export class SlabHelp extends SlabElement {
  #dialog = h('dialog', { 'aria-labelledby': 'help-title' });

  constructor() {
    super([sharedStyles, helpStyles, styles]);
    this.root.append(this.#dialog);
    this.#dialog.addEventListener('close', () => this.removeAttribute('open'));
    this.#dialog.addEventListener('click', (event) => {
      if (event.target === this.#dialog) this.#dialog.close();
    });
  }

  open(mode: HelpMode): void {
    this.#dialog.replaceChildren(mode === 'welcome' ? this.#welcome() : this.#shortcuts());
    this.setAttribute('open', '');
    if (!this.#dialog.open) this.#dialog.showModal();
  }

  close(): void {
    this.#dialog.close();
  }

  #action(action: HelpAction): void {
    this.#dialog.close();
    emit<HelpAction>(this, 'slab-help-action', action);
  }

  #button(label: string, action: HelpAction, kind = ''): HTMLButtonElement {
    return h('button', { type: 'button', class: `btn ${kind}`, onclick: () => this.#action(action) }, label);
  }

  #guideLink(label: string): HTMLAnchorElement {
    return h('a', { class: 'btn', href: GUIDE_URL, target: '_blank', rel: 'noopener' }, label);
  }

  #welcome(): HTMLElement {
    return h(
      'div',
      { class: 'sheet' },
      h('p', { class: 'wordmark', 'aria-hidden': 'true' }, 'SLAB', h('b', null, '/16')),
      h('h2', { id: 'help-title' }, 'A sampler and beat-maker in your browser'),
      h('p', { class: 'lede' }, 'A demo beat is loaded and ready. Take the two-minute tour to learn the basics by doing them, or read the guide first.'),
      h('div', { class: 'actions' }, this.#button('Take the tour', 'tour', 'primary'), this.#guideLink('Read the guide'), this.#button('Just play', 'close', 'quiet')),
    );
  }

  #shortcuts(): HTMLElement {
    const list = (rows: readonly [string, string][]): HTMLElement =>
      h('dl', null, ...rows.flatMap(([key, text]) => [h('dt', null, ...rich(key)), h('dd', null, text)]));
    return h(
      'div',
      { class: 'sheet' },
      h('p', { class: 'eyebrow' }, 'Help'),
      h('h2', { id: 'help-title' }, 'Shortcuts and tips'),
      h('h3', null, 'Keyboard'),
      list(SHORTCUTS),
      h('h3', null, 'Good to know'),
      list(TIPS),
      h('div', { class: 'actions' }, this.#button('Take the tour', 'tour', 'primary'), this.#guideLink('Full guide'), this.#button('Close', 'close', 'quiet')),
    );
  }
}

define('slab-help', SlabHelp);
