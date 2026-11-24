import { css, sheet } from '../dom.js';

/**
 * Faceplate layout. Two arrangements of the same controls:
 *  - wide shell: the classic desktop-sampler faceplate, scaled to fit the viewport height
 *  - narrow shell (< 36rem): a stacked handheld layout with full-width pads
 * Every control is a direct grid item placed by named area, so the reflow is pure CSS.
 */
export const appStyles = sheet(css`
  :host {
    display: block;
    container: shell / inline-size;
  }
  .device {
    /* 1u = 1% of the device width. --u is registered as a <length> in app.css. */
    /* --slab-chrome-block: height of the nav row when it sits above the instrument (portrait). */
    /* Never wider than 1000px; everything inside scales from --dw, so the board shrinks as a whole. */
    --dw: min(100cqi, 1000px, max(36rem, calc((100dvh - 2rem - var(--slab-chrome-block, 0px)) * 0.752)));
    --u: calc(var(--dw) / 100);
    inline-size: var(--dw);
    margin-inline: auto;
    padding: calc(var(--u) * 2.5);
    display: grid;
    grid-template-columns: repeat(2, calc(var(--u) * 10)) minmax(0, 1fr) repeat(2, calc(var(--u) * 10));
    grid-template-areas:
      'top    top    top   top    top'
      'hmode  hmode  knobs hplay  hplay'
      'sample seq    knobs chop   mute'
      'padfx  knobfx knobs loop   levels'
      'shift  bank   pads  select tap'
      'fader  fader  pads  wheel  wheel'
      'fader  fader  pads  wheel  wheel'
      'fader  fader  pads  minus  plus'
      'fader  fader  pads  srec   qrec'
      'erase  repeat pads  stop   play'
      'strip  strip  strip strip  strip';
    column-gap: calc(var(--u) * 1.5);
    row-gap: calc(var(--u) * 1.1);
    align-items: center;
    border-radius: calc(var(--u) * 3);
    background: linear-gradient(175deg, var(--slab-body-hi, #f1eee5), var(--slab-body, #e4e0d5) 40%, var(--slab-body-lo, #d3cec1));
    color: var(--slab-ink, #2a2a2c);
    box-shadow:
      inset 0 calc(var(--u) * 0.3) 0 rgb(255 255 255 / 0.7),
      inset 0 calc(var(--u) * -0.6) calc(var(--u) * 1) rgb(0 0 0 / 0.12),
      0 calc(var(--u) * 2) calc(var(--u) * 5) rgb(0 0 0 / 0.55);
  }

  /* ---- top glass panel ---- */
  .top {
    grid-area: top;
    display: grid;
    grid-template-columns: calc(var(--u) * 16) minmax(0, 1fr) calc(var(--u) * 8);
    grid-template-rows: auto minmax(0, 1fr) auto;
    grid-template-areas:
      'brand  screen meter'
      'volume screen meter'
      'banks  screen grille';
    gap: calc(var(--u) * 1.5) calc(var(--u) * 2.2);
    padding: calc(var(--u) * 2.4);
    margin-block-end: calc(var(--u) * 1.4);
    border-radius: calc(var(--u) * 1.6);
    background: linear-gradient(170deg, var(--slab-glass-hi, #232327), var(--slab-glass, #121214) 55%);
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.06), 0 calc(var(--u) * 0.4) calc(var(--u) * 0.8) rgb(0 0 0 / 0.35);
    color: #f1efe6;
    --slab-knob-cap: #d9d7d0;
    --slab-knob-ring: #3a3a3f;
    --slab-knob-ink: #c9c7bf;
  }
  /* The brand is its own container so the wordmark and tagline are sized to fit their column. */
  .brand { grid-area: brand; display: grid; gap: calc(var(--u) * 0.3); min-inline-size: 0; container-type: inline-size; }
  .wordmark {
    margin: 0;
    font-size: min(max(1rem, calc(var(--u) * 3.6)), 20.5cqi);
    font-weight: 800;
    letter-spacing: 0.06em;
    line-height: 1;
  }
  .wordmark b { color: var(--slab-screen-accent, #f5c542); font-weight: 800; }
  /* One line where it fits; at the 8px legibility floor it wraps to two rather than clipping. */
  .tag {
    font-size: max(0.5rem, min(calc(var(--u) * 1.15), 6.6cqi));
    font-weight: 700;
    letter-spacing: 0.14em;
    line-height: 1.25;
    text-transform: uppercase;
    text-wrap: balance;
    color: #8d8c86;
  }
  #volume { grid-area: volume; align-self: center; --slab-knob-size: calc(var(--u) * 9.5); }
  .banks {
    grid-area: banks;
    display: flex;
    gap: calc(var(--u) * 1.3);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: max(0.625rem, calc(var(--u) * 1.9));
    font-weight: 800;
    color: #4a4a4f;
  }
  .banks .on { color: #f1efe6; text-shadow: 0 0 calc(var(--u) * 1) rgb(255 255 255 / 0.6); }
  slab-screen {
    grid-area: screen;
    aspect-ratio: 16 / 10.4;
    align-self: center;
    border-radius: calc(var(--u) * 0.9);
    overflow: hidden;
    box-shadow: 0 0 0 calc(var(--u) * 0.5) #050506, 0 0 0 calc(var(--u) * 0.62) rgb(255 255 255 / 0.08);
  }
  slab-meter { grid-area: meter; align-self: stretch; padding-inline: calc(var(--u) * 1.6); }
  .grille {
    grid-area: grille;
    block-size: calc(var(--u) * 8);
    border-radius: calc(var(--u) * 0.6);
    background:
      radial-gradient(circle, #050506 38%, transparent 42%) 0 0 / calc(var(--u) * 0.9) calc(var(--u) * 0.9),
      #2a2a2e;
  }

  /* ---- body controls ---- */
  .heading {
    display: flex;
    align-items: center;
    gap: calc(var(--u) * 0.8);
    margin: 0;
    font-size: max(0.5rem, calc(var(--u) * 1.2));
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .heading::before, .heading::after { content: ''; flex: 1; block-size: 1px; background: currentColor; opacity: 0.55; }
  .hmode { grid-area: hmode; }
  .hplay { grid-area: hplay; }
  .group { display: contents; }

  .knobs { grid-area: knobs; display: flex; justify-content: space-evenly; align-items: center; }
  #wheel { grid-area: wheel; --slab-knob-size: calc(var(--u) * 12); }
  #fader { grid-area: fader; align-self: stretch; justify-self: center; inline-size: calc(var(--u) * 8); }

  #sample { grid-area: sample; } #seq { grid-area: seq; } #padfx { grid-area: padfx; } #knobfx { grid-area: knobfx; }
  #chop { grid-area: chop; } #mute { grid-area: mute; } #loop { grid-area: loop; } #levels { grid-area: levels; }
  #shift { grid-area: shift; } #bank { grid-area: bank; } #select { grid-area: select; } #tap { grid-area: tap; }
  #minus { grid-area: minus; } #plus { grid-area: plus; } #srec { grid-area: srec; } #qrec { grid-area: qrec; }
  #stop { grid-area: stop; } #play { grid-area: play; } #erase { grid-area: erase; } #repeat { grid-area: repeat; }

  .pads {
    grid-area: pads;
    align-self: start;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: calc(var(--u) * 0.7) calc(var(--u) * 0.9);
    margin-inline: calc(var(--u) * 0.6);
    padding: calc(var(--u) * 1.1);
    border-radius: calc(var(--u) * 1.2);
    background: var(--slab-pad-frame, #191b2a);
    box-shadow: inset 0 calc(var(--u) * 0.3) calc(var(--u) * 0.8) rgb(0 0 0 / 0.5);
  }
  .padcell { display: grid; gap: calc(var(--u) * 0.35); min-inline-size: 0; }
  .legend {
    display: flex;
    justify-content: space-between;
    gap: calc(var(--u) * 0.4);
    font-size: max(0.5rem, calc(var(--u) * 1.12));
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #e9e7df;
    white-space: nowrap;
    overflow: hidden;
  }
  .legend span { color: #a4a6b4; overflow: hidden; text-overflow: ellipsis; }
  .device[data-shift] .legend span { color: var(--slab-led-amber, #ffb02e); }

  /* Hint strip: a backlit LCD sunk into the faceplate. Green phosphor text, faint scanlines, a blinking cursor. */
  .strip {
    grid-area: strip;
    display: grid;
    align-items: center;
    min-block-size: calc(var(--u) * 5.5);
    margin-block-start: calc(var(--u) * 1.2);
    padding: calc(var(--u) * 0.9) calc(var(--u) * 2);
    border-radius: calc(var(--u) * 1.2);
    background:
      repeating-linear-gradient(to bottom, rgb(255 255 255 / 0.025) 0 1px, transparent 1px 3px),
      radial-gradient(120% 140% at 50% 0%, color-mix(in srgb, var(--slab-lcd-fg, #5ff08a) 7%, var(--slab-lcd-bg, #040705)), var(--slab-lcd-bg, #040705) 70%);
    box-shadow:
      0 0 0 calc(var(--u) * 0.35) #1b1c1f,
      inset 0 calc(var(--u) * 0.3) calc(var(--u) * 0.9) rgb(0 0 0 / 0.8);
  }
  .strip p {
    margin: 0;
    font-family: var(--slab-font-screen, ui-monospace, 'SF Mono', Menlo, Consolas, monospace);
    font-size: max(0.6875rem, calc(var(--u) * 1.4));
    font-weight: 500;
    line-height: 1.35;
    letter-spacing: 0.02em;
    color: var(--slab-lcd-fg, #5ff08a);
    text-shadow: 0 0 calc(var(--u) * 0.6) color-mix(in srgb, var(--slab-lcd-fg, #5ff08a) 55%, transparent);
    text-wrap: balance;
    text-align: center;
  }
  .strip p::after {
    content: '';
    display: inline-block;
    inline-size: 0.55em;
    block-size: 1em;
    margin-inline-start: 0.35em;
    vertical-align: -0.15em;
    background: currentColor;
    box-shadow: 0 0 calc(var(--u) * 0.6) color-mix(in srgb, var(--slab-lcd-fg, #5ff08a) 55%, transparent);
    animation: cursor 1.06s steps(1) infinite;
  }
  @keyframes cursor { 50% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) {
    .strip p::after { animation: none; }
  }

  /* Guided-tour highlight: only present while the tour points at a control. */
  [coach] {
    outline: max(3px, calc(var(--u) * 0.45)) solid var(--slab-led-amber, #ffb02e);
    outline-offset: max(3px, calc(var(--u) * 0.5));
    animation: coach 0.9s ease-in-out infinite alternate;
  }
  @keyframes coach {
    to { outline-color: rgb(255 176 46 / 0.15); }
  }
  @media (prefers-reduced-motion: reduce) {
    [coach] { animation: none; }
  }

  /* Touch screens get taller button caps. */
  @media (pointer: coarse) {
    slab-button::part(cap) { min-block-size: 44px; }
  }

  /* ---- handheld layout ---- */
  @container shell (inline-size < 36rem) {
    .device {
      --dw: 100cqi;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      grid-template-areas:
        'top    top    top    top'
        'k1     k2     k3     wheel'
        'sample seq    padfx  knobfx'
        'chop   mute   loop   levels'
        'shift  bank   select tap'
        'erase  repeat minus  plus'
        'fader  fader  fader  fader'
        'pads   pads   pads   pads'
        'srec   qrec   stop   play'
        'strip  strip  strip  strip';
      column-gap: calc(var(--u) * 2);
      row-gap: calc(var(--u) * 2);
      padding: calc(var(--u) * 3);
      border-radius: calc(var(--u) * 4);
    }
    .top {
      grid-template-columns: minmax(0, 1fr) auto auto auto;
      grid-template-rows: auto auto;
      grid-template-areas:
        'brand  banks  meter  volume'
        'screen screen screen screen';
      align-items: center;
      gap: calc(var(--u) * 2.5);
      padding: calc(var(--u) * 3);
      margin-block-end: 0;
    }
    .tag, .grille, .heading { display: none; }
    .wordmark { font-size: calc(var(--u) * 6); }
    .banks { font-size: calc(var(--u) * 3.6); gap: calc(var(--u) * 1.6); }
    #volume { --slab-knob-size: calc(var(--u) * 11); }
    slab-meter { inline-size: calc(var(--u) * 7); block-size: calc(var(--u) * 11); padding: 0; }
    slab-screen { aspect-ratio: 16 / 11.6; --slab-screen-font: 3.45cqi; }
    .knobs { display: contents; }
    #k1 { grid-area: k1; } #k2 { grid-area: k2; } #k3 { grid-area: k3; }
    .knobs slab-knob, #wheel { --slab-knob-size: calc(var(--u) * 15); }
    slab-button::part(cap) { min-block-size: max(44px, calc(var(--u) * 10)); }
    #fader {
      inline-size: 100%;
      block-size: calc(var(--u) * 12);
      --slab-fader-flow: horizontal-tb;
      --slab-fader-dir: ltr;
      --slab-fader-thumb-to: right;
    }
    .pads { margin-inline: 0; gap: calc(var(--u) * 1.2) calc(var(--u) * 1.6); padding: calc(var(--u) * 2); }
    .legend { font-size: max(0.5625rem, calc(var(--u) * 2.3)); }
    .strip { margin-block-start: 0; padding: calc(var(--u) * 2) calc(var(--u) * 3); }
    .strip p { font-size: max(0.75rem, calc(var(--u) * 3.1)); }
  }
`);
