import { css, sheet } from '../dom.js';

/**
 * Backlit LCD readout, shared by the faceplate's hint strip and the keyboard's instructions.
 * Put `lcd` on the panel; its paragraphs get green phosphor text, and the last one a blinking cursor.
 * Hosts set their own layout (grid area, padding) and font size. Sizes use the host's --u.
 */
export const lcdStyles = sheet(css`
  .lcd {
    border-radius: calc(var(--u, 6px) * 1.2);
    background:
      repeating-linear-gradient(to bottom, rgb(255 255 255 / 0.025) 0 1px, transparent 1px 3px),
      radial-gradient(120% 140% at 50% 0%, color-mix(in srgb, var(--slab-lcd-fg, #5ff08a) 7%, var(--slab-lcd-bg, #040705)), var(--slab-lcd-bg, #040705) 70%);
    box-shadow:
      0 0 0 calc(var(--u, 6px) * 0.35) #1b1c1f,
      inset 0 calc(var(--u, 6px) * 0.3) calc(var(--u, 6px) * 0.9) rgb(0 0 0 / 0.8);
  }
  .lcd > p {
    margin: 0;
    font-family: var(--slab-font-screen, ui-monospace, 'SF Mono', Menlo, Consolas, monospace);
    font-weight: 500;
    line-height: 1.35;
    letter-spacing: 0.02em;
    color: var(--slab-lcd-fg, #5ff08a);
    text-shadow: 0 0 calc(var(--u, 6px) * 0.6) color-mix(in srgb, var(--slab-lcd-fg, #5ff08a) 55%, transparent);
    text-wrap: balance;
    text-align: center;
  }
  .lcd > p:last-child::after {
    content: '';
    display: inline-block;
    inline-size: 0.55em;
    block-size: 1em;
    margin-inline-start: 0.35em;
    vertical-align: -0.15em;
    background: currentColor;
    box-shadow: 0 0 calc(var(--u, 6px) * 0.6) color-mix(in srgb, var(--slab-lcd-fg, #5ff08a) 55%, transparent);
    animation: lcd-cursor 1.06s steps(1) infinite;
  }
  /* Keys named in the text: green outlined caps, drawn on the same screen. */
  .lcd kbd {
    display: inline-block;
    min-inline-size: 1.6em;
    padding: 0 0.35em;
    border: 1px solid color-mix(in srgb, var(--slab-lcd-fg, #5ff08a) 55%, transparent);
    border-block-end-width: 2px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--slab-lcd-fg, #5ff08a) 9%, transparent);
    font: inherit;
    line-height: 1.25;
    text-align: center;
  }
  /* Keep pairs such as "A–'" or "Z / X" on one line. */
  .lcd .nobr { display: inline-block; white-space: nowrap; }
  @keyframes lcd-cursor { 50% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) {
    .lcd > p:last-child::after { animation: none; }
  }
`);
