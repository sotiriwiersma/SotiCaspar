/** Collects values by key and hands them over once per interval, so bursts do not flood the UI. */
export class MessageBatcher<T> {
  private readonly pending = new Map<string, T>();
  private timer: NodeJS.Timeout | undefined;

  /**
   * @param keep `latest` replaces a pending value with the same key, `first` ignores later ones.
   */
  constructor(
    private readonly intervalMs: number,
    private readonly keep: 'latest' | 'first',
    private readonly flush: (values: T[]) => void
  ) {}

  add(key: string, value: T): void {
    if (this.keep === 'first' && this.pending.has(key)) return;
    this.pending.set(key, value);
  }

  start(): void {
    this.timer ??= setInterval(() => this.emit(), this.intervalMs);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
    this.pending.clear();
  }

  private emit(): void {
    if (this.pending.size === 0) return;
    const values = [...this.pending.values()];
    this.pending.clear();
    this.flush(values);
  }
}
