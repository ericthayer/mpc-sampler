import { css, sheet } from '../dom.js';

/** The display is its own size container, so its type scales with the screen, not the page. */
export const screenStyles = sheet(css`
  :host {
    display: block;
    container-type: inline-size;
    min-inline-size: 0;
    --_bg: var(--slab-screen-bg, #0b0d10);
    --_fg: var(--slab-screen-fg, #f1efe6);
    --_dim: var(--slab-screen-dim, #8a8d95);
    --_line: var(--slab-screen-line, #2a2d34);
    --_accent: var(--slab-screen-accent, #f5c542);
    --_rec: var(--slab-led-red, #ff4d4d);
  }
  .ui {
    display: grid;
    /* Named areas: empty tab / chip rows are hidden without shifting the others. */
    grid-template: 'status' auto 'tabs' auto 'body' minmax(0, 1fr) 'chips' auto 'params' auto / minmax(0, 1fr);
    block-size: 100%;
    background: var(--_bg);
    color: var(--_fg);
    font-family: var(--slab-font-screen, ui-monospace, 'SF Mono', Menlo, Consolas, monospace);
    font-size: clamp(0.5625rem, var(--slab-screen-font, 3.05cqi), 1.05rem);
    line-height: 1.25;
    font-variant-numeric: tabular-nums;
    overflow: hidden;
  }
  button, input {
    font: inherit;
    color: inherit;
  }
  button {
    border: 0;
    background: none;
    cursor: pointer;
    touch-action: manipulation;
  }
  :focus-visible {
    outline: 2px solid var(--_accent);
    outline-offset: -2px;
  }
  .dim { color: var(--_dim); }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-inline-size: 0; }
  .big { font-size: 1.7em; font-weight: 700; line-height: 1.05; white-space: nowrap; }
  .big.rec { color: var(--_rec); }
  .k { color: var(--_dim); font-size: 0.82em; letter-spacing: 0.06em; }

  .status {
    grid-area: status;
    display: flex;
    justify-content: space-between;
    gap: 0.8em;
    padding: 0.35em 0.7em;
    border-block-end: 1px solid var(--_line);
    white-space: nowrap;
  }
  .status .title { font-weight: 700; letter-spacing: 0.06em; }
  .status .state.play { color: var(--slab-led-green, #5fe07a); }
  .status .state.rec { color: var(--_rec); }

  .tabs {
    grid-area: tabs;
    display: flex;
    gap: 0.3em;
    padding: 0.3em 0.7em 0;
  }
  .tabs:empty { display: none; }
  .tab {
    min-block-size: 24px;
    padding: 0.15em 0.7em;
    border: 1px solid var(--_line);
    border-radius: 0.3em;
    color: var(--_dim);
  }
  .tab[aria-selected='true'] {
    background: var(--_fg);
    border-color: var(--_fg);
    color: var(--_bg);
    font-weight: 700;
  }

  .body {
    grid-area: body;
    position: relative;
    min-block-size: 0;
    padding: 0.45em 0.7em;
  }
  .toast {
    position: absolute;
    inset: auto 0.7em 0.4em;
    padding: 0.3em 0.6em;
    border-radius: 0.3em;
    background: var(--_accent);
    color: #14110a;
    font-weight: 700;
    text-align: center;
    pointer-events: none;
  }
  .toast:empty { display: none; }

  .chips {
    grid-area: chips;
    display: flex;
    gap: 0.35em;
    padding: 0.1em 0.7em 0.4em;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .chips:empty { display: none; }
  .chip {
    flex: none;
    min-block-size: 24px;
    padding: 0.15em 0.7em;
    border: 1px solid var(--_dim);
    border-radius: 99px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 0.9em;
    white-space: nowrap;
  }
  .chip[aria-pressed='true'] {
    background: var(--_accent);
    border-color: var(--_accent);
    color: #14110a;
    font-weight: 700;
  }
  .chip:disabled { opacity: 0.38; cursor: default; }

  .params {
    grid-area: params;
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border-block-start: 1px solid var(--_line);
  }
  .param {
    display: grid;
    gap: 0.1em;
    padding: 0.35em 0.7em 0.45em;
    text-align: start;
    min-inline-size: 0;
  }
  .param + .param { border-inline-start: 1px solid var(--_line); }
  .param[aria-pressed='true'] { background: color-mix(in srgb, var(--_line) 70%, transparent); }
  .param[aria-pressed='true'] .k { color: var(--_accent); }
  .param .v { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 700; }
  .param .bar { display: block; block-size: 2px; background: var(--_line); }
  .param .bar i { display: block; block-size: 100%; inline-size: calc(var(--_n, 0) * 100%); background: var(--_accent); }
  .param:disabled { cursor: default; }
  .param:disabled .bar { visibility: hidden; }

  /* ---- page bodies ---- */
  .page { block-size: 100%; min-block-size: 0; display: grid; gap: 0.35em; align-content: stretch; }
  .head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.8em; min-inline-size: 0; }
  .head .dim { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wave, .matrix { inline-size: 100%; block-size: 100%; min-block-size: 0; }
  .page.sample, .page.chop, .page.record, .page.step { grid-template-rows: auto minmax(0, 1fr); }
  .matrix { display: block; cursor: crosshair; touch-action: none; }
  .notice { margin: 0; align-self: start; color: var(--slab-led-amber, #ffb02e); line-height: 1.35; text-wrap: pretty; }
  .notice[hidden], .wave[hidden] { display: none; }

  .page.main { grid-template-rows: auto minmax(0, 1fr); }
  .cells { display: grid; grid-template-columns: 1.15fr 1fr 0.9fr; gap: 0.6em; }
  .cells .cell { display: grid; min-inline-size: 0; }
  .cells .cell > * { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .padrow { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 0.15em; min-block-size: 0; }

  .page.lines { align-content: start; gap: 0.2em; }
  .line { display: grid; grid-template-columns: 8.2em minmax(0, 1fr); gap: 0.6em; margin: 0; padding: 0.12em 0.4em; border-radius: 0.25em; align-items: baseline; }
  .line .v { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .line.on { background: var(--_fg); color: var(--_bg); }
  .line.on .k { color: var(--_bg); }
  .line input { inline-size: 100%; min-block-size: 24px; padding: 0.1em 0.4em; border: 1px solid var(--_dim); border-radius: 0.25em; background: var(--_bg); }

  .page.browser { grid-template-rows: auto minmax(0, 1fr); }
  .page.browser:has(> .list:only-child) { grid-template-rows: minmax(0, 1fr); }
  .list { list-style: none; margin: 0; padding: 0; display: grid; align-content: start; overflow: hidden; }
  .row button { display: flex; justify-content: space-between; gap: 0.8em; inline-size: 100%; min-block-size: 24px; padding: 0.12em 0.4em; border-radius: 0.25em; text-align: start; }
  .row.on button { background: var(--_fg); color: var(--_bg); }
  .row.on .dim { color: var(--_bg); }
  .row.live .name::before { content: '▶ '; color: var(--slab-led-green, #5fe07a); }

  .padgrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: minmax(0, 1fr); gap: 0.3em; block-size: 100%; }
  .padgrid .cell { display: grid; place-items: center; min-block-size: 0; padding: 0 0.2em; border: 1px solid var(--_line); border-radius: 0.3em; font-size: 0.86em; text-align: center; white-space: nowrap; overflow: hidden; color: var(--_dim); }
  .padgrid .cell.used { color: var(--_fg); border-color: var(--_dim); }
  .padgrid .cell.on { background: var(--_accent); border-color: var(--_accent); color: #14110a; font-weight: 700; }
  .padgrid .cell.next { border-color: var(--_accent); color: var(--_accent); }
`);
