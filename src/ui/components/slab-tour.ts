import type { App } from '../../app/context.js';
import type { Controller } from '../../app/controller.js';
import { openGuide } from '../../app/help-events.js';
import { css, define, h, sheet, SlabElement } from '../dom.js';
import { helpStyles } from '../help/help.styles.js';
import { rich } from '../help/rich.js';
import { TOUR_STEPS, type TourStep } from '../help/tour-steps.js';
import { sharedStyles } from '../styles/shared.js';

const styles = sheet(css`
  dialog[open] {
    position: fixed;
    inset: max(12px, env(safe-area-inset-top, 0px)) auto auto max(12px, env(safe-area-inset-left, 0px));
    z-index: 20;
    display: grid;
    gap: 12px;
    inline-size: min(22rem, calc(100vw - 24px));
    margin: 0;
    padding: 16px 16px 14px;
  }
  .meter {
    display: flex;
    gap: 4px;
  }
  .meter i {
    flex: 1;
    block-size: 3px;
    border-radius: 2px;
    background: var(--_line);
  }
  .meter i.on { background: var(--_accent); }
  .status {
    min-block-size: 1.2em;
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--slab-led-green, #5fe07a);
  }
  .status:empty { display: none; }
  .actions { justify-content: space-between; align-items: center; flex-wrap: nowrap; }
  .actions .end { display: flex; gap: 8px; }
  .actions .btn { padding-inline: 14px; }
  @media (prefers-reduced-motion: no-preference) {
    dialog[open] { animation: rise 180ms ease-out; }
    @keyframes rise { from { opacity: 0; translate: 0 -6px; } }
  }
`);

export type Spotlight = (ids: readonly string[]) => void;

/**
 * Non-modal coach card. Each step outlines the controls to use and marks itself
 * done when the player has done what it asks. It stays open until they press Next,
 * so the instructions remain visible while they play.
 */
export class SlabTour extends SlabElement {
  #dialog = h('dialog', { 'aria-labelledby': 'tour-title' });
  #count = h('p', { class: 'eyebrow' });
  #meter = h('div', { class: 'meter', 'aria-hidden': 'true' });
  #title = h('h2', { id: 'tour-title', tabIndex: -1 });
  #body = h('p');
  #status = h('p', { class: 'status', role: 'status' });
  #back = h('button', { type: 'button', class: 'btn quiet' }, 'Back');
  #next = h('button', { type: 'button', class: 'btn primary' }, 'Next');
  #guide = h('button', { type: 'button', class: 'btn' }, 'Open the guide');
  #close = h('button', { type: 'button', class: 'btn quiet', 'aria-label': 'End tour' }, 'End tour');
  #app: App | null = null;
  #controller: Controller | null = null;
  #spotlight: Spotlight = () => undefined;
  #index = 0;
  #baseline = 0;
  #hits = 0;
  #complete = false;
  #off: (() => void)[] = [];

  constructor() {
    super([sharedStyles, helpStyles, styles]);
    for (let i = 0; i < TOUR_STEPS.length; i++) this.#meter.append(h('i'));
    this.#dialog.append(
      this.#count,
      this.#meter,
      this.#title,
      this.#body,
      this.#status,
      h('div', { class: 'actions' }, this.#close, h('div', { class: 'end' }, this.#back, this.#guide, this.#next)),
    );
    this.root.append(this.#dialog);
    this.#back.addEventListener('click', () => this.#go(this.#index - 1));
    this.#next.addEventListener('click', () => (this.#last ? this.stop() : this.#go(this.#index + 1)));
    this.#close.addEventListener('click', () => this.stop());
    this.#guide.addEventListener('click', () => openGuide());
    this.#dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.stop();
    });
  }

  connect(app: App, controller: Controller, spotlight: Spotlight): void {
    this.#app = app;
    this.#controller = controller;
    this.#spotlight = spotlight;
  }

  get running(): boolean {
    return this.#dialog.open;
  }

  get #last(): boolean {
    return this.#index === TOUR_STEPS.length - 1;
  }

  get #step(): TourStep {
    return TOUR_STEPS[this.#index]!;
  }

  start(): void {
    const app = this.#app;
    const controller = this.#controller;
    if (!app || !controller) return;
    if (!this.running) {
      const check = (): void => this.#check();
      const onPad = (): void => {
        this.#hits++;
        this.#check();
      };
      controller.addEventListener('pad', onPad);
      app.engine.pool.addEventListener('added', check);
      this.#off = [
        app.project.subscribe(check),
        app.ui.subscribe(check),
        () => controller.removeEventListener('pad', onPad),
        () => app.engine.pool.removeEventListener('added', check),
      ];
      this.#dialog.show();
    }
    this.#go(0);
  }

  stop(): void {
    this.#off.forEach((off) => off());
    this.#off = [];
    this.#spotlight([]);
    if (this.#dialog.open) this.#dialog.close();
  }

  #go(index: number): void {
    const app = this.#app;
    if (!app) return;
    this.#index = Math.max(0, Math.min(TOUR_STEPS.length - 1, index));
    const step = this.#step;
    step.enter?.(app);
    this.#baseline = step.begin?.(app) ?? 0;
    this.#hits = 0;
    this.#complete = false;

    this.#count.textContent = `Tour · step ${this.#index + 1} of ${TOUR_STEPS.length}`;
    [...this.#meter.children].forEach((bar, i) => bar.classList.toggle('on', i <= this.#index));
    this.#title.textContent = step.title;
    this.#body.replaceChildren(...rich(step.body));
    this.#status.textContent = '';
    this.#back.hidden = this.#index === 0;
    this.#guide.hidden = !this.#last;
    // A step with a task offers a quiet Skip until it's done; then Next lights up. It never advances on its own.
    this.#next.textContent = this.#last ? 'Finish' : step.done ? 'Skip' : 'Next';
    this.#next.classList.toggle('primary', !step.done);
    this.#spotlight(step.targets);
    this.#title.focus({ preventScroll: true });
  }

  #check(): void {
    const app = this.#app;
    const step = this.#step;
    if (!app || this.#complete || !step.done) return;
    if (!step.done(app, { baseline: this.#baseline, hits: this.#hits })) return;
    this.#complete = true;
    this.#status.textContent = "Done. Press Next when you're ready.";
    this.#next.textContent = 'Next';
    this.#next.classList.add('primary');
  }
}

define('slab-tour', SlabTour);
