export interface Clock {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
}

export const systemClock: Clock = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now()
};

export interface Step {
  afterMs: number;
  run: () => void;
}

/** One cancellable timer set per key (an item's delayed play and duration stop, see ItemScheduler.cpp). */
export class Scheduler {
  private readonly timers = new Map<string, unknown[]>();

  constructor(private readonly clock: Clock) {}

  /** Replaces the pending steps of `key`. A step due immediately runs synchronously. */
  schedule(key: string, steps: readonly Step[]): void {
    this.cancel(key);
    const handles: unknown[] = [];
    this.timers.set(key, handles);
    for (const step of steps) {
      if (step.afterMs <= 0) step.run();
      else handles.push(this.clock.setTimeout(() => step.run(), step.afterMs));
    }
  }

  cancel(key: string): void {
    const handles = this.timers.get(key);
    if (!handles) return;
    for (const handle of handles) this.clock.clearTimeout(handle);
    this.timers.delete(key);
  }

  cancelAll(): void {
    for (const key of [...this.timers.keys()]) this.cancel(key);
  }
}
