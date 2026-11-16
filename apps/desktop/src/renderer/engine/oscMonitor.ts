import type { BackendApi, OscMessage } from '@soticaspar/core';

type OscBackend = Pick<BackendApi, 'oscSubscribe' | 'oscUnsubscribe' | 'on'>;

export interface WatchSpec {
  deviceName: string;
  path: string;
  handler: (message: OscMessage) => void;
}

interface ActiveWatch {
  id: string;
  signature: string;
  handler: (message: OscMessage) => void;
}

/**
 * Manages OSC subscriptions on the backend for several independent owners (visible rows, the audio meter,
 * auto-play watches). Each owner declares the full set of paths it wants; only differences are (un)subscribed.
 */
export class OscMonitor {
  private readonly owners = new Map<string, ActiveWatch[]>();
  private readonly handlers = new Map<string, (message: OscMessage) => void>();
  private readonly stopListening: () => void;
  private nextId = 0;

  constructor(private readonly backend: OscBackend) {
    this.stopListening = backend.on('osc-message', ({ subscriptionId, message }) => this.handlers.get(subscriptionId)?.(message));
  }

  /** Replaces the watches of `owner` with `specs`. */
  sync(owner: string, specs: readonly WatchSpec[]): void {
    const current = this.owners.get(owner) ?? [];
    const next: ActiveWatch[] = [];
    const reusable = new Map(current.map((w) => [w.signature, w]));

    for (const spec of specs) {
      const signature = `${spec.deviceName}|${spec.path}`;
      const existing = reusable.get(signature);
      if (existing) {
        reusable.delete(signature);
        existing.handler = spec.handler;
        this.handlers.set(existing.id, spec.handler);
        next.push(existing);
        continue;
      }
      const id = `${owner}#${this.nextId++}`;
      this.handlers.set(id, spec.handler);
      next.push({ id, signature, handler: spec.handler });
      this.backend.oscSubscribe({ id, deviceName: spec.deviceName, path: spec.path }).catch(() => undefined);
    }

    for (const stale of reusable.values()) this.release(stale.id);
    if (next.length > 0) this.owners.set(owner, next);
    else this.owners.delete(owner);
  }

  clear(owner: string): void {
    this.sync(owner, []);
  }

  dispose(): void {
    this.stopListening();
    for (const owner of [...this.owners.keys()]) this.clear(owner);
  }

  private release(id: string): void {
    this.handlers.delete(id);
    this.backend.oscUnsubscribe(id).catch(() => undefined);
  }
}
