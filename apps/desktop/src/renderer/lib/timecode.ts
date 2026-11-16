const two = (n: number): string => String(Math.trunc(n)).padStart(2, '0');

/** `hh:mm:ss:ff` (or `hh:mm:ss.ff` with drop frame notation) for a position in seconds. Port of Timecode::fromTime. */
export function fromSeconds(time: number, fps: number, dropFrame: boolean): string {
  const hours = Math.trunc(time / 3600);
  const minutes = Math.trunc((time - hours * 3600) / 60);
  const seconds = Math.trunc(time - hours * 3600 - minutes * 60);
  const frames = Math.trunc((time - hours * 3600 - minutes * 60 - seconds) * fps);
  return `${two(hours)}:${two(minutes)}:${two(seconds)}${dropFrame ? '.' : ':'}${two(frames)}`;
}

/** Countdown/duration display from milliseconds; the last field is hundredths of a second. */
export function fromMilliseconds(ms: number, dropFrame: boolean): string {
  const total = Math.max(0, Math.trunc(ms));
  const hours = Math.trunc(total / 3_600_000) % 24;
  const minutes = Math.trunc(total / 60_000) % 60;
  const seconds = Math.trunc(total / 1000) % 60;
  const hundredths = Math.trunc((total % 1000) / 10);
  return `${two(hours)}:${two(minutes)}:${two(seconds)}${dropFrame ? '.' : ':'}${two(hundredths)}`;
}

export const zeroTimecode = (dropFrame: boolean): string => `00:00:00${dropFrame ? '.' : ':'}00`;

/** The library timecode (`HH:MM:SS:FF`) with the frame separator switched to `.` for drop frame notation. */
export function libraryTimecode(timecode: string, dropFrame: boolean): string {
  if (!dropFrame || timecode === '') return timecode;
  const at = timecode.lastIndexOf(':');
  return at === -1 ? timecode : `${timecode.slice(0, at)}.${timecode.slice(at + 1)}`;
}

// ---------------------------------------------------------------- frame counts <-> hh:mm:ss:ff

/**
 * The timecode runs at a whole number of frames per second (the *nominal* rate): 24 for 23.976, 30 for 29.97,
 * 60 for 59.94. Playout is exact because delays are stored as a frame count and only converted to time with the
 * real rate; the timecode is just a way to read and write that count.
 */
export const nominalFps = (fps: number): number => Math.max(1, Math.round(fps));

/** Drop frame only exists for 29.97 and 59.94: it skips 2 (resp. 4) frame numbers every minute except every tenth. */
const dropFramesOf = (fps: number, dropFrame: boolean): number => {
  if (!dropFrame) return 0;
  const nominal = nominalFps(fps);
  const isNtsc = Math.abs(fps - (nominal * 1000) / 1001) < 0.01;
  return isNtsc && (nominal === 30 || nominal === 60) ? nominal / 15 : 0;
};

/**
 * `hh:mm:ss:ff` for a frame count, or `hh:mm:ss.ff` in drop frame, as everywhere else in the application
 * (`useDropFrameNotation`). Negative counts keep their sign, hours do not wrap.
 */
export function framesToTimecode(frames: number, fps: number, dropFrame = false): string {
  const negative = frames < 0;
  let n = Math.abs(Math.trunc(frames));
  const nominal = nominalFps(fps);
  const drop = dropFramesOf(fps, dropFrame);

  if (drop > 0) {
    const perTenMinutes = Math.round(fps * 600);
    const perMinute = nominal * 60 - drop;
    const tens = Math.floor(n / perTenMinutes);
    const rest = n % perTenMinutes;
    n += drop * 9 * tens + (rest > drop ? drop * Math.floor((rest - drop) / perMinute) : 0);
  }

  const ff = n % nominal;
  const ss = Math.floor(n / nominal) % 60;
  const mm = Math.floor(n / (nominal * 60)) % 60;
  const hh = Math.floor(n / (nominal * 3600));
  return `${negative ? '-' : ''}${two(hh)}:${two(mm)}:${two(ss)}${drop > 0 ? '.' : ':'}${two(ff)}`;
}

/**
 * The frame count of what the user typed. Accepts `hh:mm:ss:ff`, shorter forms from the right (`ss:ff`, `ff`),
 * any of `:` `;` `.` as separator and a leading `-`. A single number is a frame count. Fields may overflow
 * (`00:00:00:50` at 25 fps is 2 seconds). Returns `null` for anything else.
 */
export function timecodeToFrames(text: string, fps: number, dropFrame = false): number | null {
  const match = /^\s*(-)?\s*(\d+(?:[:;.]\d+){0,3})\s*$/.exec(text);
  if (!match) return null;
  const sign = match[1] ? -1 : 1;
  const parts = match[2].split(/[:;.]/).map(Number);
  const [ff = 0, ss = 0, mm = 0, hh = 0] = [...parts].reverse();
  const nominal = nominalFps(fps);
  const drop = dropFramesOf(fps, dropFrame);

  const minutes = hh * 60 + mm;
  const frames = (minutes * 60 + ss) * nominal + ff - drop * (minutes - Math.floor(minutes / 10));
  return Number.isSafeInteger(frames) ? sign * Math.max(0, frames) : null;
}
