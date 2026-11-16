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
