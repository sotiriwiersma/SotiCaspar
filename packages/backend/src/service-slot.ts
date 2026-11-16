import type { LogFn } from './events';

interface Service {
  start(): Promise<void> | void;
  stop(): Promise<void> | void;
}

/** Keeps one optional network service running with the port and enabled flag from the settings. */
export class ServiceSlot {
  private running: { port: number; service: Service } | undefined;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly name: string,
    private readonly create: (port: number) => Service,
    private readonly log: LogFn
  ) {}

  /** Starts, restarts or stops the service so that it matches the arguments. Calls are applied in order. */
  apply(enabled: boolean, port: number): Promise<void> {
    this.queue = this.queue.then(() => this.reconcile(enabled, port));
    return this.queue;
  }

  stop(): Promise<void> {
    return this.apply(false, 0);
  }

  private async reconcile(enabled: boolean, port: number): Promise<void> {
    if (this.running && !(enabled && this.running.port === port)) {
      const { service } = this.running;
      this.running = undefined;
      await Promise.resolve(service.stop()).catch((error) => this.log('warn', `Stopping ${this.name} failed: ${String(error)}`));
    }
    if (!enabled || this.running) return;

    const service = this.create(port);
    try {
      await service.start();
      this.running = { port, service };
    } catch (error) {
      this.log('error', `Cannot start ${this.name} on port ${port}: ${String(error)}`);
    }
  }
}
