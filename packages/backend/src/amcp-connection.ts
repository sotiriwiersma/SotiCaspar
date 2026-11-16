import { createConnection } from 'node:net';
import type { Socket } from 'node:net';
import { StringDecoder } from 'node:string_decoder';
import { AmcpResponseParser, isSuccess } from './amcp-parser';
import type { AmcpResponse } from './amcp-parser';
import type { LogFn } from './events';

export interface AmcpConnectionOptions {
  address: string;
  port: number;
  /** Called whenever the connection is established or lost. */
  onConnectionChange: (connected: boolean) => void;
  log: LogFn;
  /** Delay between connection attempts. Default 5000. */
  reconnectDelayMs?: number;
  /** A response that takes longer than this drops the connection. Default 30000. */
  requestTimeoutMs?: number;
  connectTimeoutMs?: number;
}

interface PendingRequest {
  settle: (result: AmcpResponse | Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * One AMCP TCP connection that reconnects by itself. Commands are written immediately (pipelined) and
 * the server answers them in order, so responses are matched to commands with a FIFO queue.
 */
export class AmcpConnection {
  private readonly reconnectDelayMs: number;
  private readonly requestTimeoutMs: number;
  private readonly connectTimeoutMs: number;

  private socket: Socket | undefined;
  private connectedState = false;
  private stopped = true;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private pending: PendingRequest[] = [];

  constructor(private readonly options: AmcpConnectionOptions) {
    this.reconnectDelayMs = options.reconnectDelayMs ?? 5000;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.connectTimeoutMs = options.connectTimeoutMs ?? 5000;
  }

  get connected(): boolean {
    return this.connectedState;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.open();
  }

  /** Closes the connection for good. Does not report the disconnect; pending requests are rejected. */
  stop(): void {
    this.stopped = true;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const socket = this.socket;
    this.socket = undefined;
    this.connectedState = false;
    this.failPending(new Error('Connection closed'));
    socket?.destroy();
  }

  /** Sends a command and resolves with the server's response, whatever its status code. */
  send(command: string): Promise<AmcpResponse> {
    return new Promise((resolve, reject) => {
      const error = this.write(command, (result) => (result instanceof Error ? reject(result) : resolve(result)));
      if (error) reject(error);
    });
  }

  /** Sends a command without waiting. Failure responses are logged. Returns false when it could not be sent. */
  post(command: string): boolean {
    const error = this.write(command, (result) => {
      if (result instanceof Error) this.options.log('warn', `${this.label}: ${command} failed: ${result.message}`);
      else if (!isSuccess(result)) this.options.log('warn', `${this.label}: ${command} -> ${result.header}`);
    });
    if (error) this.options.log('warn', `${this.label}: ${command} not sent: ${error.message}`);
    return !error;
  }

  private get label(): string {
    return `${this.options.address}:${this.options.port}`;
  }

  /** Returns an error when the command cannot be sent. */
  private write(command: string, settle: PendingRequest['settle']): Error | undefined {
    const text = command.trim();
    if (/[\r\n]/.test(text)) return new Error('A command must be a single line');
    if (!this.socket || !this.connectedState) return new Error('Not connected');

    const request: PendingRequest = {
      settle,
      timer: setTimeout(() => {
        this.options.log('warn', `${this.label}: no response to "${text}", reconnecting`);
        this.socket?.destroy();
      }, this.requestTimeoutMs)
    };
    this.pending.push(request);
    this.socket.write(`${text}\r\n`);
    this.options.log('debug', `${this.label} <- ${text}`);
    return undefined;
  }

  private open(): void {
    const socket = createConnection({ host: this.options.address, port: this.options.port });
    const parser = new AmcpResponseParser();
    const decoder = new StringDecoder('utf8');
    this.socket = socket;

    socket.setNoDelay(true);
    socket.setTimeout(this.connectTimeoutMs);

    socket.once('connect', () => {
      if (this.socket !== socket) return;
      socket.setTimeout(0);
      this.connectedState = true;
      this.options.log('info', `Connected to ${this.label}`);
      this.options.onConnectionChange(true);
    });
    socket.on('timeout', () => socket.destroy());
    socket.on('error', (error) => this.options.log('debug', `${this.label}: ${error.message}`));
    socket.on('data', (data: Buffer) => {
      for (const response of parser.push(decoder.write(data))) this.handleResponse(response);
    });
    socket.once('close', () => {
      if (this.socket !== socket) return;
      const wasConnected = this.connectedState;
      this.connectedState = false;
      this.socket = undefined;
      this.failPending(new Error('Connection closed'));
      if (wasConnected) {
        this.options.log('info', `Disconnected from ${this.label}`);
        this.options.onConnectionChange(false);
      }
      if (!this.stopped) this.reconnectTimer = setTimeout(() => this.open(), this.reconnectDelayMs);
    });
  }

  private handleResponse(response: AmcpResponse): void {
    const request = this.pending.shift();
    this.options.log('debug', `${this.label} -> ${response.header}`);
    if (!request) return;
    clearTimeout(request.timer);
    request.settle(response);
  }

  private failPending(error: Error): void {
    const requests = this.pending;
    this.pending = [];
    for (const request of requests) {
      clearTimeout(request.timer);
      request.settle(error);
    }
  }
}
