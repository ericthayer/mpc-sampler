/**
 * `.slab` project container — a single portable file:
 *
 *   "SLAB16\n" | uint32 headerBytes | header JSON | float32 PCM for each sample channel…
 *
 * The header lists every sample's shape so the PCM can be sliced back out.
 */
import type { Project, SampleData } from '../core/types.js';

const MAGIC = 'SLAB16\n';

interface SampleHeader {
  id: string;
  name: string;
  sampleRate: number;
  channels: number;
  frames: number;
}

interface FileHeader {
  project: Project;
  samples: SampleHeader[];
}

export interface ProjectBundle {
  project: Partial<Project>;
  samples: SampleData[];
}

export function encodeProject(project: Project, samples: SampleData[]): ArrayBuffer {
  const header: FileHeader = {
    project,
    samples: samples.map((s) => ({
      id: s.id,
      name: s.name,
      sampleRate: s.sampleRate,
      channels: s.channels.length,
      frames: s.channels[0]?.length ?? 0,
    })),
  };
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  // Pad the header so the PCM that follows is 4-byte aligned.
  const prefix = MAGIC.length + 4;
  const padding = (4 - ((prefix + headerBytes.length) % 4)) % 4;
  const pcmBytes = header.samples.reduce((sum, s) => sum + s.channels * s.frames * 4, 0);
  const buffer = new ArrayBuffer(prefix + headerBytes.length + padding + pcmBytes);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < MAGIC.length; i++) bytes[i] = MAGIC.charCodeAt(i);
  new DataView(buffer).setUint32(MAGIC.length, headerBytes.length + padding, true);
  bytes.set(headerBytes, prefix);
  bytes.fill(0x20, prefix + headerBytes.length, prefix + headerBytes.length + padding);

  let offset = prefix + headerBytes.length + padding;
  for (const sample of samples) {
    for (const channel of sample.channels) {
      new Float32Array(buffer, offset, channel.length).set(channel);
      offset += channel.length * 4;
    }
  }
  return buffer;
}

export function decodeProject(buffer: ArrayBuffer): ProjectBundle {
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC.charCodeAt(i)) throw new Error('Not a SLAB/16 project file.');
  }
  const headerLength = new DataView(buffer).getUint32(MAGIC.length, true);
  const prefix = MAGIC.length + 4;
  if (prefix + headerLength > buffer.byteLength) throw new Error('Project file is truncated.');
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(prefix, prefix + headerLength))) as FileHeader;

  let offset = prefix + headerLength;
  const samples: SampleData[] = [];
  for (const info of header.samples ?? []) {
    const channels: Float32Array[] = [];
    for (let c = 0; c < info.channels; c++) {
      const byteLength = info.frames * 4;
      if (offset + byteLength > buffer.byteLength) throw new Error('Project file is truncated.');
      // slice() copies, so alignment of `offset` doesn't matter.
      channels.push(new Float32Array(buffer.slice(offset, offset + byteLength)));
      offset += byteLength;
    }
    samples.push({ id: info.id, name: info.name, sampleRate: info.sampleRate, channels });
  }
  return { project: header.project, samples };
}
