import { createConnection, type Socket } from 'node:net';
import { StringDecoder } from 'node:string_decoder';
import type { RepositoryChange } from '@soticaspar/core';
import { noopLog, type LogFn } from './log';

/**
 * Splits the RRUP stream into changes. Every message ends with an empty line:
 *
 *   ADD\r\n<story id>\r\n<rundown xml>\r\n\r\n
 *   REMOVE\r\n<story id>\r\n\r\n
 *
 * Unknown messages are skipped (port of RrupDevice/RepositoryDevice).
 */
export class RrupParser {
  private pending = '';

  push(chunk: string): RepositoryChange[] {
    this.pending += chunk;
    const changes: RepositoryChange[] = [];
    for (let end = this.pending.indexOf('\r\n\r\n'); end !== -1; end = this.pending.indexOf('\r\n\r\n')) {
      const lines = this.pending.slice(0, end).split('\r\n');
      this.pending = this.pending.slice(end + 4);
      const storyId = lines[1]?.trim() ?? '';
      if (lines[0] === 'ADD') changes.push({ type: 'ADD', storyId, data: lines.slice(2).join('\r\n').trim() });
      else if (lines[0] === 'REMOVE') changes.push({ type: 'REMOVE', storyId });
    }
    return changes;
  }
}

/** `SUBSCRIBE <rundown> <profile>` from a rundown URL ending in `/<profile>/<rundown>`. */
export function subscribeCommand(url: string): string {
  const parts = url.split('/');
  const rundown = parts.pop() ?? '';
  const profile = parts.pop() ?? '';
  return `SUBSCRIBE ${rundown} ${profile}`;
}

export interface RrupClientOptions {
  url: string;
  port: number;
  onChange: (change: RepositoryChange) => void;
  onConnectionChange: (connected: boolean) => void;
  log?: LogFn;
  reconnectDelayMs?: number;
}

/** Connection to the repository server of one rundown; subscribes on every (re)connect and reconnects every 5 s. */
export class RrupClient {
  private socket: Socket | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private stopped = true;
  private readonly host: string;
  private readonly log: LogFn;

  constructor(private readonly options: RrupClientOptions) {
    this.host = new URL(options.url).hostname;
    this.log = options.log ?? noopLog;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    const socket = this.socket;
    this.socket = undefined;
    socket?.destroy();
  }

  private open(): void {
    const socket = createConnection({ host: this.host, port: this.options.port });
    const parser = new RrupParser();
    const decoder = new StringDecoder('utf8');
    let connected = false;
    this.socket = socket;

    socket.once('connect', () => {
      if (this.socket !== socket) return;
      connected = true;
      this.log('info', `Connected to the rundown repository ${this.host}:${this.options.port}`);
      this.options.onConnectionChange(true);
      socket.write(`${subscribeCommand(this.options.url)}\r\n`);
    });
    socket.on('error', (error) => this.log('debug', `Rundown repository ${this.host}:${this.options.port}: ${error.message}`));
    socket.on('data', (data: Buffer) => {
      for (const change of parser.push(decoder.write(data))) this.options.onChange(change);
    });
    socket.once('close', () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      if (connected) this.options.onConnectionChange(false);
      if (!this.stopped) this.reconnectTimer = setTimeout(() => this.open(), this.options.reconnectDelayMs ?? 5000);
    });
  }
}
