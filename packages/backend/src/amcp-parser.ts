import type { LibraryType } from '@soticaspar/core';

export interface AmcpResponse {
  code: number;
  /** The status line, e.g. `200 CLS OK`. */
  header: string;
  /** Data lines following the header, without the terminating empty line of multi-line responses. */
  body: string[];
  /** Header and body joined by CRLF, as sent by the server. */
  raw: string;
}

export const isSuccess = (response: AmcpResponse) => response.code >= 200 && response.code < 300;

/** Number of data lines that follow the header of a response, `'multi'` for lines up to an empty line. */
function bodyShape(code: number): 0 | 1 | 'multi' {
  switch (code) {
    case 200:
      return 'multi';
    case 101: // event information
    case 201:
    case 400: // command not understood, the next line holds the details
      return 1;
    default:
      return 0;
  }
}

function toResponse(header: string, body: string[]): AmcpResponse {
  return { code: Number.parseInt(header, 10) || 0, header, body, raw: [header, ...body].join('\r\n') };
}

/**
 * Incremental parser for the AMCP response stream (port of the state machine in `AmcpDevice`).
 * Feed it decoded text in arbitrary chunks, it returns the responses completed by each chunk.
 */
export class AmcpResponseParser {
  private pending = '';
  private header: string | undefined;
  private body: string[] = [];
  private expected: 0 | 1 | 'multi' = 0;

  push(chunk: string): AmcpResponse[] {
    this.pending += chunk;
    const responses: AmcpResponse[] = [];

    for (let end = this.pending.indexOf('\r\n'); end !== -1; end = this.pending.indexOf('\r\n')) {
      const line = this.pending.slice(0, end);
      this.pending = this.pending.slice(end + 2);
      const response = this.consume(line);
      if (response) responses.push(response);
    }
    return responses;
  }

  private consume(line: string): AmcpResponse | undefined {
    if (this.header === undefined) {
      if (line === '') return undefined;
      this.header = line;
      this.expected = bodyShape(Number.parseInt(line, 10));
      return this.expected === 0 ? this.complete() : undefined;
    }

    if (this.expected === 'multi' && line === '') return this.complete();
    this.body.push(line);
    return this.expected === 1 ? this.complete() : undefined;
  }

  private complete(): AmcpResponse {
    const response = toResponse(this.header!, this.body);
    this.header = undefined;
    this.body = [];
    return response;
  }
}

// ---------------------------------------------------------------- List responses

export interface MediaInfo {
  name: string;
  type: LibraryType;
  /** `HH:MM:SS:FF`, empty when the server did not report a duration. */
  timecode: string;
}

export interface ThumbnailInfo {
  name: string;
  timestamp: string;
  size: string;
}

interface ListLine {
  name: string;
  /** Whitespace separated fields following the quoted name. */
  fields: string[];
}

/** Splits `"FOLDER\CLIP"  MOVIE  6445960 20121101160514 643 1/60` into name (forward slashes) and fields. */
function parseListLine(line: string): ListLine {
  const split = line.indexOf('" ');
  const quotedName = split === -1 ? line : line.slice(0, split);
  const rest = split === -1 ? '' : line.slice(split + 2).trim();

  const name = quotedName.replaceAll('\\', '/').replace(/^"/, '').replace(/"$/, '');
  return { name, fields: rest === '' ? [] : rest.split(/\s+/) };
}

/** Port of `Timecode::fromTime`, computed from the frame count with a tolerance for floating point error. */
export function formatTimecode(totalFrames: number, fps: number): string {
  const time = totalFrames / fps;
  const hours = Math.floor(time / 3600);
  const minutes = Math.floor((time - hours * 3600) / 60);
  const seconds = Math.floor(time - hours * 3600 - minutes * 60 + 1e-9);
  const frames = Math.floor((time - hours * 3600 - minutes * 60 - seconds) * fps + 1e-6);
  return [hours, minutes, seconds, frames].map((part) => String(part).padStart(2, '0')).join(':');
}

const MEDIA_TYPES: ReadonlySet<string> = new Set<LibraryType>(['MOVIE', 'STILL', 'AUDIO']);

/** Fields: `TYPE size timestamp frames numerator/denominator`, where the frame rate is `denominator / numerator`. */
function mediaTimecode(fields: string[]): string {
  if (fields.length < 5) return '';
  const frames = Number.parseInt(fields[3], 10);
  const [numerator, denominator] = fields[4].split('/').map(Number);
  const fps = denominator / numerator;
  return Number.isFinite(frames) && Number.isFinite(fps) && fps > 0 ? formatTimecode(frames, fps) : '';
}

export function parseMediaList(lines: readonly string[]): MediaInfo[] {
  const items: MediaInfo[] = [];
  for (const line of lines) {
    const { name, fields } = parseListLine(line);
    const type = fields[0]?.toUpperCase();
    if (name !== '' && type !== undefined && MEDIA_TYPES.has(type)) items.push({ name, type: type as LibraryType, timecode: mediaTimecode(fields) });
  }
  return items;
}

/** Templates and data lists only carry names. */
export function parseNameList(lines: readonly string[]): string[] {
  return lines.map((line) => parseListLine(line).name).filter((name) => name !== '');
}

export function parseThumbnailList(lines: readonly string[]): ThumbnailInfo[] {
  const items: ThumbnailInfo[] = [];
  for (const line of lines) {
    const { name, fields } = parseListLine(line);
    if (name !== '' && fields.length >= 2) items.push({ name, timestamp: fields[0], size: fields[1] });
  }
  return items;
}

/** `INFO` lists one channel per line (`1 1080p5000 PLAYING`); returns the video format of each channel. */
export function parseChannelFormats(lines: readonly string[]): string[] {
  return lines.filter((line) => line.trim() !== '').map((line) => line.trim().split(/\s+/)[1] ?? '');
}
