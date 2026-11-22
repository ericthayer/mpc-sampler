/**
 * Fires a callback roughly every `interval` ms.
 * Uses a Worker so the sequencer keeps time when the tab is in the background,
 * where main-thread timers are throttled to once a second.
 */
export class Ticker {
  #worker: Worker | null = null;
  #timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly callback: () => void,
    private readonly interval = 25,
  ) {}

  start(): void {
    if (this.#worker || this.#timer !== null) return;
    try {
      const source = `let t=null;onmessage=e=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}`;
      const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
      this.#worker = new Worker(url);
      URL.revokeObjectURL(url);
      this.#worker.onmessage = (): void => this.callback();
      this.#worker.onerror = (): void => this.#fallback();
      this.#worker.postMessage(this.interval);
    } catch {
      this.#fallback();
    }
  }

  #fallback(): void {
    this.#worker?.terminate();
    this.#worker = null;
    this.#timer ??= setInterval(this.callback, this.interval);
  }

  stop(): void {
    this.#worker?.postMessage(0);
    this.#worker?.terminate();
    this.#worker = null;
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
  }
}
