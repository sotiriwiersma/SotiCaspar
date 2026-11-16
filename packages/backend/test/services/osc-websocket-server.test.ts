import type { ControlCommand } from '@soticaspar/core';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { OscWebSocketServer } from '../../src/services/osc-websocket-server';
import { freeTcpPort, waitFor } from './helpers';

describe('OscWebSocketServer', () => {
  let server: OscWebSocketServer | undefined;
  let client: WebSocket | undefined;
  afterEach(async () => {
    client?.terminate();
    await server?.stop();
  });

  async function connect(): Promise<{ commands: ControlCommand[]; send: (data: string | Buffer) => void }> {
    const port = await freeTcpPort();
    const commands: ControlCommand[] = [];
    server = new OscWebSocketServer(port, (command) => commands.push(command));
    await server.start();
    const socket = new WebSocket(`ws://127.0.0.1:${port}`);
    client = socket;
    await new Promise((resolve, reject) => socket.once('open', resolve).once('error', reject));
    return { commands, send: (data) => socket.send(data) };
  }

  it('turns JSON messages into control commands', async () => {
    const { commands, send } = await connect();
    send(JSON.stringify({ path: '/control/play', args: [1] }));
    send(JSON.stringify({ path: '/control/u1/update', args: [true, 'text', 0.5, null, { a: 1 }] }));
    await waitFor(() => commands.length === 2);
    expect(commands).toEqual([
      { command: 'play', args: [1] },
      { uid: 'u1', command: 'update', args: [true, 'text', 0.5] }
    ]);
  });

  it('ignores invalid, argument-less, unknown and binary messages', async () => {
    const { commands, send } = await connect();
    send('not json');
    send('[1]');
    send(JSON.stringify({ path: '/control/play', args: [] }));
    send(JSON.stringify({ path: '/control/play', args: [null] }));
    send(JSON.stringify({ path: '', args: [1] }));
    send(JSON.stringify({ path: '/control/bogus', args: [1] }));
    send(Buffer.from(JSON.stringify({ path: '/control/play', args: [1] })));
    send(JSON.stringify({ path: '/control/stop', args: [1] }));
    await waitFor(() => commands.length === 1);
    expect(commands).toEqual([{ command: 'stop', args: [1] }]);
  });

  it('closes connected clients on stop', async () => {
    await connect();
    const closed = new Promise((resolve) => client!.once('close', resolve));
    await server!.stop();
    await closed;
  });
});
