import type { BackendEvents, Unsubscribe } from '@soticaspar/core';

export type LogLevel = BackendEvents['log']['level'];
export type LogFn = (level: LogLevel, message: string) => void;

type Listener<T> = (payload: T) => void;

/** Minimal typed event emitter. A throwing listener never affects the emitter or other listeners. */
export class TypedEmitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<Listener<never>>>();

  constructor(private readonly onListenerError: (error: unknown) => void) {}

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => {
      set.delete(listener as Listener<never>);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    for (const listener of [...(this.listeners.get(event) ?? [])]) {
      try {
        (listener as Listener<Events[K]>)(payload);
      } catch (error) {
        this.onListenerError(error);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
