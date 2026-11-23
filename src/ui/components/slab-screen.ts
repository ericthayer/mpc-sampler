import type { App } from '../../app/context.js';
import { BANK_NAMES, PADS_PER_BANK } from '../../core/types.js';
import { pad2 } from '../../core/util.js';
import { clear, define, emit, h, SlabElement } from '../dom.js';
import type { Chip, PageDef, PageView, Param } from '../screen/page.js';
import { PAGES } from '../screen/pages/index.js';
import { sharedStyles } from '../styles/shared.js';
import { screenStyles } from './slab-screen.styles.js';
import './slab-waveform.js';

export interface FocusDetail {
  index: number;
}

/**
 * The display. Renders the current page: status line, tabs, body, soft
 * buttons and the three knob parameters. All state lives in the stores —
 * call `sync()` after a change and `frame()` once per animation frame.
 */
export class SlabScreen extends SlabElement {
  #app: App | null = null;
  #view: PageView | null = null;
  #mounted = '';
  #params: (Param | null)[] = [null, null, null];
  #chips: Chip[] = [];
  #chipSignature = '\u0000';
  #title = h('span', { class: 'title' });
  #where = h('span', { class: 'dim' });
  #state = h('span', { class: 'state' });
  #tabs = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Page sections' });
  #body = h('div', { class: 'body', role: 'tabpanel' });
  #toast = h('div', { class: 'toast', 'aria-hidden': 'true' });
  #chipRow = h('div', { class: 'chips', role: 'toolbar', 'aria-label': 'Page actions' });
  #paramCells: { button: HTMLButtonElement; label: HTMLElement; value: HTMLElement; bar: HTMLElement }[] = [];

  constructor() {
    super([sharedStyles, screenStyles], false);
    const params = h('div', { class: 'params', role: 'group', 'aria-label': 'Knob parameters' });
    for (let i = 0; i < 3; i++) {
      const label = h('span', { class: 'k' });
      const value = h('span', { class: 'v' });
      const bar = h('i');
      const button = h(
        'button',
        { type: 'button', class: 'param', onclick: () => emit<FocusDetail>(this, 'slab-focus', { index: i }) },
        label,
        value,
        h('span', { class: 'bar' }, bar),
      );
      this.#paramCells.push({ button, label, value, bar });
      params.append(button);
    }
    this.root.append(
      h(
        'section',
        { class: 'ui', 'aria-label': 'Display' },
        h('header', { class: 'status' }, this.#title, this.#where, this.#state),
        this.#tabs,
        this.#body,
        this.#chipRow,
        params,
      ),
    );
  }

  set app(app: App) {
    this.#app = app;
    this.sync();
  }

  get page(): PageDef {
    return PAGES[this.#app?.ui.state.page ?? 'main'];
  }

  /** The three parameters K1–K3 currently control. */
  get params(): (Param | null)[] {
    return this.#params;
  }

  sync(): void {
    const app = this.#app;
    if (!app) return;
    const ui = app.ui.state;
    const page = this.page;
    const tab = page.tabs ? Math.min(ui.tab, page.tabs.length - 1) : 0;

    const key = `${page.id}:${tab}`;
    if (key !== this.#mounted) {
      this.#mounted = key;
      this.#view = page.view(app, tab);
      clear(this.#body);
      this.#body.append(this.#view.el, this.#toast);
      this.#renderTabs(page, tab);
      this.#chipSignature = '\u0000'; // force a rebuild, even for a page with no chips
    }

    this.#title.textContent = page.title;
    this.#where.textContent = `${BANK_NAMES[ui.bank]}${pad2((ui.pad % PADS_PER_BANK) + 1)} · SEQ ${pad2(ui.seq + 1)} · ${app.project.state.bpm.toFixed(1)}`;
    const state = ui.recording ? (ui.countingIn ? 'COUNT' : '● REC') : ui.playing ? '▶ PLAY' : '■ STOP';
    this.#state.textContent = state;
    this.#state.className = `state${ui.recording ? ' rec' : ui.playing ? ' play' : ''}`;
    if (this.#toast.textContent !== ui.message) this.#toast.textContent = ui.message;

    this.#params = page.params(app, tab);
    this.#paramCells.forEach((cell, i) => {
      const param = this.#params[i] ?? null;
      cell.button.disabled = param === null;
      cell.button.setAttribute('aria-pressed', String(param !== null && ui.focus === i));
      cell.label.textContent = param ? `K${i + 1} ${param.label}` : `K${i + 1}`;
      const text = param ? param.text() : '—';
      if (cell.value.textContent !== text) cell.value.textContent = text;
      cell.bar.style.setProperty('--_n', String(param ? param.get() : 0));
    });

    this.#renderChips(page.chips?.(app, tab) ?? []);
    this.#view?.update();
  }

  frame(): void {
    this.#view?.frame?.();
  }

  #renderTabs(page: PageDef, tab: number): void {
    clear(this.#tabs);
    page.tabs?.forEach((name, i) => {
      this.#tabs.append(
        h(
          'button',
          {
            type: 'button',
            class: 'tab',
            role: 'tab',
            'aria-selected': String(i === tab),
            onclick: () => this.#app?.goto(page.id, i),
          },
          name,
        ),
      );
    });
  }

  #renderChips(chips: Chip[]): void {
    this.#chips = chips;
    const signature = chips.map((c) => c.label).join('|');
    if (signature !== this.#chipSignature) {
      this.#chipSignature = signature;
      clear(this.#chipRow);
      chips.forEach((chip, i) => {
        this.#chipRow.append(h('button', { type: 'button', class: 'chip', onclick: () => this.#chips[i]?.run() }, chip.label));
      });
    }
    [...this.#chipRow.children].forEach((el, i) => {
      const chip = chips[i];
      if (!chip || !(el instanceof HTMLButtonElement)) return;
      el.disabled = chip.disabled?.() ?? false;
      if (chip.on) el.setAttribute('aria-pressed', String(chip.on()));
      else el.removeAttribute('aria-pressed');
    });
  }
}

define('slab-screen', SlabScreen);
