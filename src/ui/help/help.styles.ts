import { css, sheet } from '../dom.js';

/** Shared look for the tour card and help dialogs: the display's dark glass and type. */
export const helpStyles = sheet(css`
  :host {
    --_bg: var(--slab-screen-bg, #0b0d10);
    --_fg: var(--slab-screen-fg, #f1efe6);
    --_dim: var(--slab-screen-dim, #8a8d95);
    --_line: var(--slab-screen-line, #2a2d34);
    --_accent: var(--slab-screen-accent, #f5c542);
  }
  [hidden] { display: none !important; }
  dialog {
    padding: 0;
    border: 1px solid var(--_line);
    border-radius: 12px;
    background: var(--_bg);
    color: var(--_fg);
    box-shadow: 0 18px 48px rgb(0 0 0 / 0.55);
    font: 0.9375rem/1.45 var(--slab-font-label, 'Helvetica Neue', Helvetica, Arial, sans-serif);
  }
  dialog::backdrop {
    background: rgb(10 10 12 / 0.62);
  }
  h2 {
    margin: 0;
    font-size: 1.125rem;
    line-height: 1.2;
    text-wrap: balance;
  }
  h2:focus { outline: none; }
  p { margin: 0; text-wrap: pretty; }
  .eyebrow {
    font: 700 0.6875rem/1 var(--slab-font-screen, ui-monospace, monospace);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--_accent);
  }
  kbd {
    display: inline-block;
    min-inline-size: 1.6em;
    padding: 0.05em 0.4em;
    border: 1px solid var(--_dim);
    border-block-end-width: 2px;
    border-radius: 4px;
    font: 600 0.8125em/1.3 var(--slab-font-screen, ui-monospace, monospace);
    text-align: center;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-block-size: 40px;
    padding: 0 16px;
    border: 1px solid var(--_dim);
    border-radius: 99px;
    background: none;
    color: var(--_fg);
    font: 700 0.75rem/1 var(--slab-font-label, sans-serif);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-decoration: none;
    cursor: pointer;
  }
  .btn.primary {
    border-color: var(--_accent);
    background: var(--_accent);
    color: #14110a;
  }
  .btn.quiet { border-color: transparent; color: var(--_dim); }
  .btn:hover { border-color: var(--_fg); }
  .btn.primary:hover { filter: brightness(1.08); }
`);
