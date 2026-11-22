/** Web MIDI input: notes play pads, CC 1/74/71 turn K1–K3, MIDI start/stop drive the transport. */
import type { MidiStatus } from '../core/state.js';

export interface MidiHandlers {
  noteOn: (note: number, velocity: number) => void;
  noteOff: (note: number) => void;
  control: (knob: number, value: number) => void;
  transport: (command: 'start' | 'continue' | 'stop') => void;
  status: (status: MidiStatus, inputs: string[]) => void;
}

const KNOB_CCS = [1, 74, 71];

export class MidiInput {
  #access: MIDIAccess | null = null;

  constructor(private readonly handlers: MidiHandlers) {}

  static get supported(): boolean {
    return typeof navigator.requestMIDIAccess === 'function';
  }

  /** Must be called from a user gesture — browsers prompt for permission. */
  async connect(): Promise<void> {
    if (!MidiInput.supported) {
      this.handlers.status('unsupported', []);
      return;
    }
    try {
      this.#access = await navigator.requestMIDIAccess({ sysex: false });
    } catch {
      this.handlers.status('denied', []);
      return;
    }
    this.#access.onstatechange = (): void => this.#bind();
    this.#bind();
  }

  disconnect(): void {
    if (!this.#access) return;
    for (const input of this.#access.inputs.values()) input.onmidimessage = null;
    this.#access.onstatechange = null;
    this.#access = null;
    this.handlers.status('off', []);
  }

  #bind(): void {
    if (!this.#access) return;
    const names: string[] = [];
    for (const input of this.#access.inputs.values()) {
      if (input.state !== 'connected') continue;
      names.push(input.name ?? 'MIDI input');
      input.onmidimessage = (event): void => this.#onMessage(event.data);
    }
    this.handlers.status('on', names);
  }

  #onMessage(data: Uint8Array | null): void {
    if (!data || data.length === 0) return;
    const status = data[0]!;
    if (status === 0xfa) return this.handlers.transport('start');
    if (status === 0xfb) return this.handlers.transport('continue');
    if (status === 0xfc) return this.handlers.transport('stop');
    const kind = status & 0xf0;
    const a = data[1] ?? 0;
    const b = data[2] ?? 0;
    if (kind === 0x90 && b > 0) this.handlers.noteOn(a, b);
    else if (kind === 0x80 || (kind === 0x90 && b === 0)) this.handlers.noteOff(a);
    else if (kind === 0xb0) {
      const knob = KNOB_CCS.indexOf(a);
      if (knob >= 0) this.handlers.control(knob, b / 127);
    }
  }
}
