/** Opening and saving local files, using the File System Access API where it exists. */
import { zipStore } from './zip.js';

const AUDIO_ACCEPT = 'audio/*,.wav,.mp3,.m4a,.aac,.ogg,.oga,.flac,.aif,.aiff,.webm';

export interface PickOptions {
  multiple?: boolean;
  /** `accept` for the fallback <input>, e.g. "audio/*". */
  accept?: string;
  description?: string;
  /** Extension list per MIME type for the native picker. */
  types?: Record<string, string[]>;
}

export function pickAudioFiles(): Promise<File[]> {
  return pickFiles({
    multiple: true,
    accept: AUDIO_ACCEPT,
    description: 'Audio',
    types: { 'audio/*': ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac', '.aif', '.aiff', '.webm'] },
  });
}

export async function pickFiles(options: PickOptions): Promise<File[]> {
  if (typeof window.showOpenFilePicker === 'function' && options.types) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: options.multiple ?? false,
        types: [{ description: options.description ?? 'Files', accept: options.types }],
      });
      return await Promise.all(handles.map((handle) => handle.getFile()));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return [];
      // SecurityError inside sandboxed frames: fall through to the classic input.
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = options.multiple ?? false;
    if (options.accept) input.accept = options.accept;
    input.addEventListener('change', () => resolve([...(input.files ?? [])]), { once: true });
    input.addEventListener('cancel', () => resolve([]), { once: true });
    input.click();
  });
}

export function isAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || /\.(wav|mp3|m4a|aac|ogg|oga|flac|aiff?|webm)$/i.test(file.name);
}

/** Files from a drop, in the order the user selected them. */
export function filesFromDrop(event: DragEvent): File[] {
  return [...(event.dataTransfer?.files ?? [])];
}

interface DownloadsCapability {
  save: (file: { filename: string; data: Blob }) => Promise<unknown>;
}
interface ClaudeHost {
  use: (name: string) => Promise<unknown>;
}

/** Embedded as a Claude artifact, saving goes through the host, which only accepts well-known types. */
async function saveThroughHost(host: ClaudeHost, blob: Blob, filename: string): Promise<boolean> {
  try {
    const downloads = (await host.use('downloads')) as DownloadsCapability | null;
    if (!downloads) return false;
    try {
      await downloads.save({ filename, data: blob });
    } catch (error) {
      if ((error as { code?: string } | null)?.code !== 'rejected_extension') return false;
      const zipped = zipStore(filename, new Uint8Array(await blob.arrayBuffer()));
      await downloads.save({ filename: `${filename.replace(/\.[^.]+$/, '')}.zip`, data: new Blob([zipped], { type: 'application/zip' }) });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Save a generated file. Tries, in order: the host's download bridge (when embedded
 * as a Claude artifact), the native save dialog, then a classic download link.
 */
export async function saveBlob(blob: Blob, filename: string, description: string, extension: string): Promise<boolean> {
  const host = (window as Window & { claude?: ClaudeHost }).claude;
  if (host) return saveThroughHost(host, blob, filename);
  if (typeof window.showSaveFilePicker === 'function') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description, accept: { [blob.type || 'application/octet-stream']: [extension] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Hand a file to the OS share sheet (mobile). Returns false when sharing files isn't possible. */
export async function shareFile(blob: Blob, filename: string, title: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });
  if (typeof navigator.canShare !== 'function' || !navigator.canShare({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch {
    return false;
  }
}

export function canShareFiles(): boolean {
  if (typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([new Blob(['x'])], 'x.wav', { type: 'audio/wav' })] });
  } catch {
    return false;
  }
}
