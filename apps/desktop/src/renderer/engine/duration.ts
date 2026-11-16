import { fromMilliseconds, zeroTimecode } from '../lib/timecode';

export interface CountdownView {
  /** Remaining time, `00:00:00:00` style. */
  remaining: string;
  /** Total time of the running countdown. */
  total: string;
  /** 0..1 of the countdown still left. */
  fraction: number;
  /** Milliseconds left and in total. */
  remainingMs: number;
  totalMs: number;
  running: boolean;
}

export const idleCountdown = (dropFrame: boolean): CountdownView => ({
  remaining: zeroTimecode(dropFrame),
  total: zeroTimecode(dropFrame),
  fraction: 0,
  remainingMs: 0,
  totalMs: 0,
  running: false
});

/** State of the duration panel countdown (DurationWidget): started by a playing group, ends at zero. */
export function countdownView(durationMs: number, startedAt: number, now: number, dropFrame: boolean): CountdownView {
  const elapsed = now - startedAt;
  if (durationMs <= 0 || elapsed > durationMs) return idleCountdown(dropFrame);
  return {
    remaining: fromMilliseconds(durationMs - elapsed, dropFrame),
    total: fromMilliseconds(durationMs, dropFrame),
    fraction: (durationMs - elapsed) / durationMs,
    remainingMs: durationMs - elapsed,
    totalMs: durationMs,
    running: true
  };
}
