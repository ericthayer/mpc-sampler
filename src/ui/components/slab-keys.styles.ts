import { css, sheet } from '../dom.js';

/** Keyboard unit: the faceplate's materials (cream body, dark glass strip, grey caps) in a wide format. */
export const keysStyles = sheet(css`
  :host {
    display: block;
    container: keys / inline-size;
    inline-size: min(100%, 76rem);
    margin-inline: auto;
  }
  .unit {
    --u: clamp(4.5px, 0.62cqi, 7px);
    display: grid;
    gap: calc(var(--u) * 2);
    padding: calc(var(--u) * 2.5);
    border-radius: calc(var(--u) * 3);
    background: linear-gradient(175deg, var(--slab-body-hi, #f1eee5), var(--slab-body, #e4e0d5) 40%, var(--slab-body-lo, #d3cec1));
    color: var(--slab-ink, #2a2a2c);
    box-shadow:
      inset 0 calc(var(--u) * 0.3) 0 rgb(255 255 255 / 0.7),
      0 calc(var(--u) * 2) calc(var(--u) * 5) rgb(0 0 0 / 0.55);
  }

  /* ---- glass strip: transport, readout, sound ---- */
  .strip {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--u) * 2) calc(var(--u) * 3);
    padding: calc(var(--u) * 2) calc(var(--u) * 2.5);
    border-radius: calc(var(--u) * 1.6);
    background: linear-gradient(170deg, var(--slab-glass-hi, #232327), var(--slab-glass, #121214) 55%);
    color: var(--slab-screen-fg, #f1efe6);
  }
  .transport { display: flex; gap: calc(var(--u) * 1.2); }
  .transport slab-button { inline-size: calc(var(--u) * 11); min-inline-size: 64px; --slab-ink: #c9c7bf; }
  .readout {
    display: grid;
    gap: 2px;
    min-inline-size: 0;
    padding: calc(var(--u) * 0.8) calc(var(--u) * 1.6);
    border-radius: calc(var(--u) * 0.8);
    background: var(--slab-screen-bg, #0b0d10);
    font: 0.8125rem/1.3 var(--slab-font-screen, ui-monospace, monospace);
    font-variant-numeric: tabular-nums;
  }
  .readout b { font-size: 1.25rem; color: var(--slab-screen-fg, #f1efe6); }
  .readout .rec { color: var(--slab-led-red, #ff4d4d); }
  .readout span { color: var(--slab-screen-dim, #8a8d95); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sound { display: flex; flex-wrap: wrap; gap: calc(var(--u) * 1.5); margin-inline-start: auto; }
  label.field {
    display: grid;
    gap: 4px;
    font: 700 0.625rem/1 var(--slab-font-label, sans-serif);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #9d9a91;
  }
  select {
    min-block-size: 36px;
    max-inline-size: 15rem;
    padding: 0 28px 0 10px;
    border: 1px solid #4a4843;
    border-radius: 6px;
    background: var(--slab-screen-bg, #0b0d10);
    color: var(--slab-screen-fg, #f1efe6);
    font: 0.875rem/1.2 var(--slab-font-screen, ui-monospace, monospace);
  }

  /* ---- keybed controls ---- */
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: calc(var(--u) * 1.5) calc(var(--u) * 3);
  }
  .octave { display: flex; align-items: center; gap: calc(var(--u) * 1.2); }
  .octave slab-button, .controls > slab-button { inline-size: calc(var(--u) * 9); min-inline-size: 52px; }
  .range { min-inline-size: 5.5em; font: 700 0.875rem/1 var(--slab-font-screen, monospace); text-align: center; }
  .status {
    flex: 1 1 14rem;
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.35;
    color: #5a5853;
    text-align: end;
  }

  /* ---- keybed ---- */
  .bed {
    position: relative;
    display: flex;
    block-size: clamp(150px, 21cqi, 250px);
    padding: calc(var(--u) * 1) calc(var(--u) * 1) 0;
    border-radius: calc(var(--u) * 1.2);
    background: #191b2a;
    touch-action: none;
    user-select: none;
    -webkit-user-select: none;
  }
  .key {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    gap: 2px;
    padding: 0 0 calc(var(--u) * 1.2);
    border: 0;
    font: 700 0.6875rem/1 var(--slab-font-label, sans-serif);
    cursor: pointer;
  }
  .white {
    flex: 1;
    margin-inline: 1px;
    border-radius: 0 0 calc(var(--u) * 0.9) calc(var(--u) * 0.9);
    background: linear-gradient(180deg, #e9e6dc, #fbfaf5 70%, #e4e0d5);
    color: #6d6b65;
    box-shadow: inset 0 -4px 0 #cfcab9;
  }
  .black {
    position: absolute;
    top: calc(var(--u) * 1);
    z-index: 1;
    block-size: 60%;
    border-radius: 0 0 calc(var(--u) * 0.6) calc(var(--u) * 0.6);
    background: linear-gradient(180deg, #2c2d31, #1b1c1f);
    color: #8d8c86;
    box-shadow: inset 0 -4px 0 #0c0c0e;
  }
  .key .qwerty {
    font: 600 0.625rem/1 var(--slab-font-screen, monospace);
    opacity: 0.75;
  }
  .key.down.white { background: linear-gradient(180deg, #cfd8ff, #e6ebff); box-shadow: inset 0 -1px 0 #9aaaf0, 0 0 14px rgb(79 125 255 / 0.55); }
  .key.down.black { background: linear-gradient(180deg, #3a55c6, #2a3e96); box-shadow: 0 0 14px rgb(79 125 255 / 0.7); }
  .key.root .name { color: var(--slab-shift-ink, #a8380f); }
  :focus-visible { outline: 3px solid var(--slab-focus, #ffd24a); outline-offset: 2px; }

  /* Instructions: the same backlit LCD as the faceplate's hint strip (styles/lcd.ts). */
  .hint {
    padding: calc(var(--u) * 1.6) calc(var(--u) * 2.5);
  }
  .hint p {
    font-size: 0.8125rem;
    line-height: 1.75; /* room for the keycaps between lines */
  }
  @container keys (inline-size < 40rem) {
    .sound { margin-inline-start: 0; inline-size: 100%; }
    .sound label.field { flex: 1; }
    select { max-inline-size: none; inline-size: 100%; }
    .status { text-align: start; }
  }
  @media (pointer: coarse) {
    select { min-block-size: 44px; }
  }
`);
