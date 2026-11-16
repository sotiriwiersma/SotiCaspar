import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { AddressInfo, Server, Socket } from 'node:net';
import { join } from 'node:path';
import { afterEach } from 'vitest';
import type { DeviceConfig } from '@soticaspar/core';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A scratch directory inside the package, removed after the test. */
export async function makeDataDir(): Promise<string> {
  const dir = await mkdtemp(join(import.meta.dirname, 'data-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

export const device = (name: string, port = 5250, overrides: Partial<DeviceConfig> = {}): DeviceConfig => ({
  name,
  address: '127.0.0.1',
  port,
  username: '',
  password: '',
  description: '',
  shadow: false,
  channels: 0,
  channelFormats: '',
  previewChannel: 0,
  lockedChannel: 0,
  version: '',
  ...overrides
});

export function registerCleanup(cleanup: () => Promise<void> | void): void {
  cleanups.push(async () => cleanup());
}

export async function waitFor(condition: () => boolean | Promise<boolean>, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

export const CANNED_RESPONSES: Record<string, string> = {
  'VERSION SERVER': '201 VERSION OK\r\n2.3.3 Stable\r\n',
  INFO: '200 INFO OK\r\n1 1080p5000 PLAYING\r\n2 PAL PLAYING\r\n\r\n',
  CLS: '200 CLS OK\r\n"AMB"  MOVIE  6445960 20121101160514 643 1/25\r\n"GO\\LOGO"  STILL  1234 20121101150514 0 0/1\r\n\r\n',
  TLS: '200 TLS OK\r\n"LOWERTHIRD"\r\n\r\n',
  'DATA LIST': '200 DATA LIST OK\r\nMYDATA\r\n\r\n',
  'THUMBNAIL LIST': '200 THUMBNAIL LIST OK\r\n"AMB"  20121101160514 123\r\n\r\n',
  'THUMBNAIL RETRIEVE "AMB"': '201 THUMBNAIL RETRIEVE OK\r\nQUJD\r\n',
  'DATA RETRIEVE "MYDATA"': '201 DATA RETRIEVE OK\r\n<templateData/>\r\n'
};

/** An in-process AMCP server answering with canned responses. */
export class FakeAmcpServer {
  readonly received: string[] = [];
  private readonly sockets = new Set<Socket>();
  private server!: Server;

  constructor(private readonly responses: Record<string, string> = CANNED_RESPONSES) {}

  get port(): number {
    return (this.server.address() as AddressInfo).port;
  }

  async listen(port = 0): Promise<void> {
    this.server = createServer((socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
      socket.on('error', () => undefined);

      let buffer = '';
      socket.on('data', (data) => {
        buffer += data.toString('utf8');
        for (let end = buffer.indexOf('\r\n'); end !== -1; end = buffer.indexOf('\r\n')) {
          const command = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          this.received.push(command);
          socket.write(this.responses[command] ?? '202 OK\r\n');
        }
      });
    });
    await new Promise<void>((resolve) => this.server.listen(port, '127.0.0.1', resolve));
    registerCleanup(() => this.close());
  }

  dropConnections(): void {
    for (const socket of this.sockets) socket.destroy();
  }

  async close(): Promise<void> {
    this.dropConnections();
    if (this.server.listening) await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
