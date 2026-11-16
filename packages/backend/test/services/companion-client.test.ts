import { createSocket } from 'node:dgram';
import { createServer, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { CompanionClient } from '../../src/services/companion-client';

/** A stand-in for Companion's TCP listener: answers `+OK`, or `-ERR …` for page 99, like Companion does. */
async function fakeCompanion(answer = true): Promise<{ server: Server; port: number; lines: string[]; connections: number }> {
  const state = { lines: [] as string[], connections: 0 };
  const server = createServer((socket: Socket) => {
    state.connections++;
    let buffer = '';
    socket.setEncoding('utf8');
    socket.on('data', (data: string) => {
      buffer += data;
      for (let end = buffer.indexOf('\n'); end !== -1; end = buffer.indexOf('\n')) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        state.lines.push(line);
        if (answer) socket.write(line.includes(' 99/') ? '-ERR Page not found\n' : '+OK\n');
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return Object.assign(state, { server, port: (server.address() as AddressInfo).port });
}

describe('CompanionClient', () => {
  const clients: CompanionClient[] = [];
  const servers: Server[] = [];
  afterEach(async () => {
    for (const client of clients.splice(0)) client.close();
    await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
  });
  const client = () => {
    const c = new CompanionClient();
    clients.push(c);
    return c;
  };

  it('sends one line per command over one TCP connection', async () => {
    const companion = await fakeCompanion();
    servers.push(companion.server);
    const c = client();
    const target = { protocol: 'TCP' as const, host: '127.0.0.1', port: companion.port };
    await c.send(target, 'LOCATION 1/0/0 PRESS');
    await c.send(target, 'LOCATION 2/1/4 DOWN');
    expect(companion.lines).toEqual(['LOCATION 1/0/0 PRESS', 'LOCATION 2/1/4 DOWN']);
    expect(companion.connections).toBe(1);
  });

  it('reports what Companion refuses', async () => {
    const companion = await fakeCompanion();
    servers.push(companion.server);
    await expect(client().send({ protocol: 'TCP', host: '127.0.0.1', port: companion.port }, 'LOCATION 99/0/0 PRESS')).rejects.toThrow('Companion: Page not found');
  });

  it('does not fail when Companion sends no answer', async () => {
    const companion = await fakeCompanion(false);
    servers.push(companion.server);
    await client().send({ protocol: 'TCP', host: '127.0.0.1', port: companion.port }, 'LOCATION 1/0/0 PRESS');
    expect(companion.lines).toEqual(['LOCATION 1/0/0 PRESS']);
  });

  it('reports a Companion that cannot be reached, and checks the connection', async () => {
    const companion = await fakeCompanion();
    const port = companion.port;
    await new Promise((r) => companion.server.close(r));
    const target = { protocol: 'TCP' as const, host: '127.0.0.1', port };
    await expect(client().send(target, 'LOCATION 1/0/0 PRESS')).rejects.toThrow(/Cannot reach Companion at 127.0.0.1:/);
    await expect(client().check(target)).rejects.toThrow(/Cannot reach Companion/);
  });

  it('connects again after Companion restarts', async () => {
    const first = await fakeCompanion();
    const c = client();
    await c.send({ protocol: 'TCP', host: '127.0.0.1', port: first.port }, 'LOCATION 1/0/0 PRESS');
    const port = first.port;
    await new Promise((r) => {
      first.server.close(r);
      first.server.emit('close');
    });
    // a fresh Companion on another port, as after a settings change
    const second = await fakeCompanion();
    servers.push(second.server);
    await c.send({ protocol: 'TCP', host: '127.0.0.1', port: second.port }, 'LOCATION 1/0/1 PRESS');
    expect(second.lines).toEqual(['LOCATION 1/0/1 PRESS']);
    expect(port).not.toBe(second.port);
  });

  it('sends one datagram per command over UDP', async () => {
    const receiver = createSocket('udp4');
    const received: string[] = [];
    receiver.on('message', (message) => received.push(message.toString()));
    await new Promise<void>((resolve) => receiver.bind(0, '127.0.0.1', resolve));
    const port = receiver.address().port;
    try {
      const c = client();
      await c.send({ protocol: 'UDP', host: '127.0.0.1', port }, 'LOCATION 1/2/3 UP');
      await c.check({ protocol: 'UDP', host: '127.0.0.1', port });
      await new Promise((r) => setTimeout(r, 100));
      expect(received).toEqual(['LOCATION 1/2/3 UP']);
    } finally {
      receiver.close();
    }
  });
});
