import { css, sheet } from '../dom.js';

/**
 * Adopted by every component. Sizes are expressed in `--u` (1% of the device
 * width, registered as a <length> in app.css) so the whole faceplate scales as one.
 */
export const sharedStyles = sheet(css`
  :host {
    box-sizing: border-box;
    --_u: var(--u, 6px);
    font-family: var(--slab-font-label, 'Helvetica Neue', Helvetica, Arial, sans-serif);
    -webkit-tap-highlight-color: transparent;
  }
  :host([hidden]) {
    display: none !important;
  }
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
  button {
    font: inherit;
    color: inherit;
    margin: 0;
  }
  :focus-visible {
    outline: max(2px, calc(var(--_u) * 0.35)) solid var(--slab-focus, #ffd24a);
    outline-offset: max(2px, calc(var(--_u) * 0.3));
  }
  .label {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    line-height: 1.05;
  }
  .visually-hidden {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
`);
