/**
 * Minimal observable store. State is mutated in place inside `update()` and
 * listeners are told which topic changed, so they can skip work they don't own.
 */
export type Listener<Topic extends string> = (topic: Topic) => void;

export class Store<T extends object, Topic extends string = string> {
  #state: T;
  #listeners = new Set<Listener<Topic>>();

  constructor(initial: T) {
    this.#state = initial;
  }

  get state(): T {
    return this.#state;
  }

  /** Replace the whole state object (e.g. project load). */
  replace(next: T, topic: Topic): void {
    this.#state = next;
    this.emit(topic);
  }

  update(mutate: (draft: T) => void, topic: Topic): void {
    mutate(this.#state);
    this.emit(topic);
  }

  emit(topic: Topic): void {
    for (const listener of this.#listeners) listener(topic);
  }

  subscribe(listener: Listener<Topic>): () => void {
    this.#listeners.add(listener);
    return (): void => {
      this.#listeners.delete(listener);
    };
  }
}

/** Bounded undo/redo stack of snapshots. */
export class History<S> {
  #past: S[] = [];
  #future: S[] = [];

  constructor(private readonly limit = 50) {}

  /** Record the state as it was *before* a change. */
  push(snapshot: S): void {
    this.#past.push(snapshot);
    if (this.#past.length > this.limit) this.#past.shift();
    this.#future.length = 0;
  }

  undo(current: S): S | null {
    const previous = this.#past.pop();
    if (previous === undefined) return null;
    this.#future.push(current);
    return previous;
  }

  redo(current: S): S | null {
    const next = this.#future.pop();
    if (next === undefined) return null;
    this.#past.push(current);
    return next;
  }

  clear(): void {
    this.#past.length = 0;
    this.#future.length = 0;
  }

  get canUndo(): boolean {
    return this.#past.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }
}
