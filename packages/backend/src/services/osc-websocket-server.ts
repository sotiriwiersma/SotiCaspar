import { WebSocketServer } from 'ws';
import type { ControlCommand } from '@soticaspar/core';
import { parseControlCommand } from './control-command';
import { noopLog, type LogFn } from './log';

type PlainArgument = ControlCommand['args'][number];

/**
 * OSC over WebSocket: every text frame is a JSON object `{"path": "/control/play", "args": [1]}`.
 * Arguments other than booleans, numbers and strings are dropped, and a message needs at least one argument.
 */
export class OscWebSocketServer {
  private server: WebSocketServer | undefined;

  constructor(
    private readonly port: number,
    private readonly onCommand: (cmd: ControlCommand) => void,
    private readonly log: LogFn = noopLog
  ) {}

  start(): Promise<void> {
    if (this.server) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const server = new WebSocketServer({ port: this.port });
      server.once('error', reject);
      server.on('listening', () => {
        server.off('error', reject);
        server.on('error', (error) => this.log('error', `OSC WebSocket server: ${error.message}`));
        this.server = server;
        this.log('info', `Listening for OSC messages over WebSocket on port ${this.port}`);
        resolve();
      });
      server.on('connection', (socket, request) => {
        const peer = request.socket.remoteAddress ?? 'unknown';
        this.log('debug', `OSC WebSocket client connected from ${peer}`);
        socket.on('message', (data, isBinary) => {
          if (!isBinary) this.handleText(data.toString(), peer);
        });
        socket.on('error', (error) => this.log('warn', `OSC WebSocket client ${peer}: ${error.message}`));
        socket.on('close', () => this.log('debug', `OSC WebSocket client ${peer} disconnected`));
      });
    });
  }

  stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server) return Promise.resolve();
    server.clients.forEach((client) => client.terminate());
    return new Promise((resolve) => server.close(() => resolve()));
  }

  private handleText(text: string, peer: string): void {
    const message = parseJsonMessage(text);
    if (!message) return;
    const command = parseControlCommand(message.path, message.args);
    if (!command) return;
    this.log('debug', `Received OSC message over WebSocket from ${peer}: ${message.path}`);
    this.onCommand(command);
  }
}

function parseJsonMessage(text: string): { path: string; args: PlainArgument[] } | undefined {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof json !== 'object' || json === null) return undefined;
  const { path, args } = json as { path?: unknown; args?: unknown };
  if (typeof path !== 'string' || path === '' || !Array.isArray(args)) return undefined;
  const plainArgs = args.filter((arg): arg is string | number | boolean => ['string', 'number', 'boolean'].includes(typeof arg));
  return plainArgs.length > 0 ? { path, args: plainArgs } : undefined;
}
