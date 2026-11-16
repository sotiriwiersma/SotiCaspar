import { frameBatcher } from '../lib/frame';
import { countdownView, idleCountdown, type CountdownView } from '../engine/duration';
import { app } from './app.svelte';

/** Countdown of the duration panel, driven by group playout. */
class DurationState {
  view = $state.raw<CountdownView>(idleCountdown(false));

  private durationMs = 0;
  private startedAt = 0;
  private readonly frame = frameBatcher(() => this.tick());

  /** `0` resets the countdown. */
  start(ms: number): void {
    this.durationMs = ms;
    this.startedAt = Date.now();
    this.tick();
  }

  private tick(): void {
    const dropFrame = app.settings.useDropFrameNotation;
    this.view = countdownView(this.durationMs, this.startedAt, Date.now(), dropFrame);
    if (this.view.running) this.frame.schedule();
  }
}

export const duration = new DurationState();
