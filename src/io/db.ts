/** IndexedDB autosave: one project document plus the user's sample PCM. */
import type { Project, SampleData } from '../core/types.js';

const DB_NAME = 'slab16';
const DB_VERSION = 1;
const KV = 'kv';
const SAMPLES = 'samples';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (): void => {
      const db = request.result;
      if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
      if (!db.objectStoreNames.contains(SAMPLES)) db.createObjectStore(SAMPLES, { keyPath: 'id' });
    };
    request.onsuccess = (): void => resolve(request.result);
    request.onerror = (): void => reject(request.error ?? new Error('IndexedDB unavailable'));
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = (): void => resolve();
    tx.onerror = (): void => reject(tx.error ?? new Error('IndexedDB write failed'));
    tx.onabort = (): void => reject(tx.error ?? new Error('IndexedDB write aborted'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => reject(req.error ?? new Error('IndexedDB read failed'));
  });
}

export async function loadProject(): Promise<Partial<Project> | null> {
  try {
    const db = await open();
    const value = await request<unknown>(db.transaction(KV).objectStore(KV).get('project'));
    return value && typeof value === 'object' ? (value as Partial<Project>) : null;
  } catch {
    return null;
  }
}

export async function saveProject(project: Project): Promise<void> {
  const db = await open();
  const tx = db.transaction(KV, 'readwrite');
  tx.objectStore(KV).put(structuredClone(project), 'project');
  await done(tx);
}

export async function loadSamples(): Promise<SampleData[]> {
  try {
    const db = await open();
    return await request<SampleData[]>(db.transaction(SAMPLES).objectStore(SAMPLES).getAll());
  } catch {
    return [];
  }
}

export async function saveSample(sample: SampleData): Promise<void> {
  if (sample.factory) return;
  const db = await open();
  const tx = db.transaction(SAMPLES, 'readwrite');
  tx.objectStore(SAMPLES).put({ id: sample.id, name: sample.name, sampleRate: sample.sampleRate, channels: sample.channels });
  await done(tx);
}

/** Delete stored samples that no pad references any more. */
export async function pruneSamples(keep: Set<string>): Promise<void> {
  const db = await open();
  const tx = db.transaction(SAMPLES, 'readwrite');
  const store = tx.objectStore(SAMPLES);
  const keys = await request<IDBValidKey[]>(store.getAllKeys());
  for (const key of keys) if (typeof key === 'string' && !keep.has(key)) store.delete(key);
  await done(tx);
}

export async function clearAll(): Promise<void> {
  const db = await open();
  const tx = db.transaction([KV, SAMPLES], 'readwrite');
  tx.objectStore(KV).clear();
  tx.objectStore(SAMPLES).clear();
  await done(tx);
}
