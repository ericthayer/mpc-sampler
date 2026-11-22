# SLAB/16

A 16-pad sampling groovebox that runs in the browser. Load or record sounds, chop
them across the pads, sequence a beat, and bounce it to a WAV.

Built with TypeScript, Web Components and the Web Audio API. **Zero runtime
dependencies, no bundler** — `tsc` emits native ES modules and the browser loads
them directly (≈67 KB gzipped for the whole app).

> SLAB/16 is an independent project. Its workflow is inspired by classic pad
> samplers, but it is not affiliated with, endorsed by, or a reproduction of any
> hardware manufacturer's product.

## Run it

```sh
npm install        # TypeScript is the only dev dependency
npm start          # build, then serve on http://localhost:5173
npm run dev        # same, with tsc --watch
npm test           # build + 23 unit tests (node:test, no extra packages)
```

Any static host works: serve the repository root after `npm run build`
(`index.html`, `styles/`, `dist/`, `sw.js`, `manifest.webmanifest`, `icons/`).
Microphone, MIDI, install and offline support need HTTPS or `localhost`.

## What it does

| Area | Features |
| --- | --- |
| **Keyboard** | A second interface you can swap to at any time (`` ` ``): plays the selected pad chromatically with chords, sustain, octave shift and slide-to-play; five looping synth patches (Saw Lead, Square Bass, Warm Pad, Sub Bass, Organ) on bank D; records melodies into the same sequences; MIDI notes can drive it |
| **Pads** | 4 banks × 16 pads, velocity from strike position or stylus pressure, multi-touch, choke groups, one-shot / hold / loop modes, mute, 16 Levels (velocity or chromatic tuning), Full Level |
| **Samples** | Drag-and-drop or file picker (WAV, MP3, AAC, OGG, FLAC…), record from **microphone**, **another tab / system audio**, or **resample** SLAB's own output |
| **Sample edit** | Trim with draggable start/end, loop, reverse, tune (±24 st + cents), level, pan, attack/release, per-pad filter (LP/HP/BP), normalize, crop, save as WAV |
| **Chop** | Equal slices or transient detection → slices written across a bank, non-destructively |
| **Warp** | Fit a loop to N beats at the project tempo: WSOLA time-stretch (keeps pitch) or re-pitch |
| **Sequencer** | 16 sequences, 1–8 bars, 96 PPQ, real-time record with count-in and quantize, step edit, swing, note repeat (incl. triplets), erase, Time Correct, half / double length, undo / redo, song mode |
| **Pad FX** | 16 momentary performance effects on the mix: stutters, roll, gates, filter sweeps, bit-crush, flange, half-speed, tape stop, reverse, echo-out. Latchable |
| **Knob FX** | DJ filter + drive, tempo-synced delay, reverb, lo-fi, master compressor and limiter |
| **Project** | Autosave to IndexedDB, single-file `.slab` export/import (samples included), bounce sequence or song to WAV faster than real time, share sheet on mobile |
| **Control** | QWERTY keys, Web MIDI (notes → pads, CC 1/74/71 → K1–K3, Start/Stop), hardware media keys |
| **Platform** | Installable PWA, works offline, screen wake lock while playing, haptic tick on pad hits |

The app opens with a synthesised factory kit and a demo beat, so PLAY makes sound
immediately. No audio files ship with the app; the kit is generated from maths at boot.

## Help and tutorial

- **Guide** (`help.html`): quick start, six hands-on lessons, drum patterns to enter in step edit, a full controls reference, troubleshooting, and curated links for learning production and finding legally usable samples.
- **Guided tour**: a nine-step walkthrough that highlights each control and marks each step done when you've done it. Steps stay on screen until you press Next. It opens on first visit (from the welcome dialog), from the compass button above the instrument, from the Project page, or with `index.html#tour`.
- **Shortcuts**: press `?` in the app.

## Controls

**SHIFT** works held (multi-touch or the keyboard's Shift key) or tapped: a quick
tap latches it for the next press, so everything is reachable with one finger or a mouse.

| Button | Press | SHIFT + press |
| --- | --- | --- |
| SAMPLE | Sample edit (Trim / Tune / Filter / Amp) | Record page |
| SEQ | Sequence select (pads pick the sequence) | Step edit |
| PAD FX | Pads become momentary mix effects | Toggle latch |
| KNOB FX | Master effects on K1–K3 | Next effect |
| CHOP | Slice the selected sample across a bank | Normalize |
| MUTE | Pads toggle mute | Unmute all |
| LOOP | Loop the selected pad | Reverse it |
| 16 LEVELS | Pads play the selected pad at 16 levels | Velocity ↔ tune |
| PAD BANK | Next bank | Previous bank |
| SAMPLE SELECT | Browse the sample pool | Save sample as WAV |
| TAP TEMPO | Tap the tempo | Metronome |
| − / + | Nudge the highlighted parameter | Undo / redo |
| SAMPLE RECORD | Open the record page, then start/stop | Load file to pad |
| SEQ RECORD | Arm / punch in | Clear sequence |
| PLAY | Play from the top | Continue |
| ERASE | Erase mode (hit or hold pads) | Copy pad |
| NOTE REPEAT | Hold a pad to retrigger on the grid | Triplets |

**SHIFT + pad** runs the function printed under it: Full Level, Half Seq, Double
Seq, Count-In, Compressor, Half Speed, Double Speed, MIDI, Fader assign, Rec
Quantize, Resample, Song, Trim, Time Correct, Warp, Project.

**Knobs.** K1–K3 control the three parameters at the bottom of the display. The
data wheel and −/+ fine-tune whichever is highlighted. Double-click a knob to reset.

**Keyboard**

| Keys | Action |
| --- | --- |
| `1234` / `QWER` / `ASDF` / `ZXCV` | Pads 13–16 / 9–12 / 5–8 / 1–4 |
| `Space` | Play / stop |
| `Enter` | Seq record |
| `Shift` | SHIFT (hold) |
| `←` `→`, `-` `=` | Data wheel, − / + |
| `[` `]` | Previous / next tab |
| `B` `T` `N` `M` `L` | Bank, tap tempo, note repeat, mute, 16 levels |
| `Backspace` | Erase mode |
| `Esc` | Back to the main page |
| `` ` `` | Swap between sampler and keyboard |
| `A`–`'`, `W E T Y U O P`, `Z` `X` | Keyboard view: white keys, black keys, octave down / up |

## Architecture

```
src/
  core/      Project model, observable store + undo history, defaults       (pure)
  audio/     Engine, voices, master FX chain, sample pool, recorder, bounce
             dsp.ts / wav.ts / factory-kit.ts                               (pure)
             worklets/flex.worklet.ts — performance FX + PCM recorder (audio thread)
  seq/       Lookahead scheduler on the audio clock, tick maths             (timing.ts pure)
  io/        IndexedDB, .slab container, file pickers, Web MIDI, platform APIs
  app/       Controller (gestures → actions), actions, keyboard map
  ui/        Web Components (shadow DOM, constructable stylesheets)
             screen/pages — one module per display page
             help/ — guided-tour steps; slab-tour / slab-help components
styles/app.css   Design tokens (custom properties) and page chrome
help.html        The guide (static; styles/help.css)
sw.js            Offline cache (network-first)
```

- **State** lives in two stores: `project` (saved) and `ui` (session). Components
  hold no state; `slab-app` repaints from the stores once per animation frame.
- **Timing.** A Worker-driven ticker wakes the sequencer every 25 ms; it schedules
  every tick in the next 120 ms on the `AudioContext` clock, so playback is
  sample-accurate and keeps running in a background tab.
- **One voice path.** `VoiceBank` and `buildMasterChain` take any
  `BaseAudioContext`, so the offline bounce renders through exactly the code the
  live engine uses.
- **Layout.** Every size derives from `--u` (1% of the faceplate width, a
  registered `<length>`). A container query swaps the desktop faceplate for a
  stacked handheld layout below 36rem — same DOM, grid areas only.
- **Components** are standalone ES modules: `slab-pad`, `slab-knob`,
  `slab-button`, `slab-fader`, `slab-meter`, `slab-waveform`, `slab-screen`.
  Theme them through the `--slab-*` custom properties in `styles/app.css`.

## Web APIs and browser support

| API | Used for | Without it |
| --- | --- | --- |
| Web Audio, AudioWorklet | Everything audible; pad FX, lo-fi, recording | Required (all current browsers) |
| `getUserMedia` | Mic sampling | Use file import or resample |
| `getDisplayMedia` | Tab / system audio sampling (desktop Chromium, partial elsewhere) | Use mic or file import |
| File System Access | Native open / save dialogs (Chromium) | Falls back to `<input type=file>` and download links |
| IndexedDB, Storage persistence | Autosave | Session isn't kept across reloads |
| Web MIDI | Controller input (Chromium, Firefox) | Pads, keyboard and touch still work |
| Service Worker, Web App Manifest | Offline + install | Runs as a normal page |
| Wake Lock, Media Session, Vibration, Web Share | Device integration | Skipped silently |

Tested in Chromium. The code targets current Safari (16.4+) and Firefox as well;
on iOS, audio follows the ring/silent switch like any web page.

## Limits worth knowing

- Recording stops at 60 seconds per take.
- Pad FX and lo-fi are live-only; a bounce contains the sequence plus filter, delay, reverb and compressor. Resample to print the rest.
- Time signature is fixed at 4/4.
- Undo covers sequence edits, not pad or sample edits (destructive sample edits keep the original in the pool until reload).
