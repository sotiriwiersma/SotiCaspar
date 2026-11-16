import { createServer, type Server, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import type { RepositoryChange } from '@soticaspar/core';
import { RrupClient, RrupParser, subscribeCommand } from '../../src/services/rrup-client';
import { waitFor } from './helpers';

const ADD_XML = '<items><item><type>MOVIE</type><storyid>s1</storyid></item></items>';

describe('RrupParser', () => {
  it('parses ADD and REMOVE messages split over arbitrary chunks', () => {
    const parser = new RrupParser();
    const stream = `ADD\r\ns1\r\n${ADD_XML}\r\n\r\nREMOVE\r\ns0\r\n\r\nHELLO\r\n\r\n`;
    const changes = [...stream].flatMap((char) => parser.push(char));
    expect(changes).toEqual([
      { type: 'ADD', storyId: 's1', data: ADD_XML },
      { type: 'REMOVE', storyId: 's0' }
    ]);
  });

  it('subscribes with the rundown and profile of the URL', () => {
    expect(subscribeCommand('http://repo:8080/rundowns/evening/news.xml')).toBe('SUBSCRIBE news.xml evening');
  });
});

describe('RrupClient', () => {
  let server: Server | undefined;
  let client: RrupClient | undefined;
  afterEach(async () => {
    client?.stop();
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  });

  async function startServer(onSocket: (socket: Socket, firstLine: string) => void): Promise<number> {
    server = createServer((socket) => {
      socket.once('data', (data) => onSocket(socket, data.toString()));
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    return (server.address() as { port: number }).port;
  }

  it('subscribes on connect, reports changes and reconnects', async () => {
    const subscriptions: string[] = [];
    const sockets: Socket[] = [];
    const port = await startServer((socket, line) => {
      subscriptions.push(line);
      sockets.push(socket);
      socket.write(`REMOVE\r\ns${sockets.length}\r\n\r\n`);
    });
    const changes: RepositoryChange[] = [];
    const status: boolean[] = [];
    client = new RrupClient({
      url: 'http://127.0.0.1/rundowns/profile/show',
      port,
      reconnectDelayMs: 20,
      onChange: (change) => changes.push(change),
      onConnectionChange: (connected) => status.push(connected)
    });
    client.start();

    await waitFor(() => changes.length === 1);
    sockets[0].destroy();
    await waitFor(() => changes.length === 2);

    expect(subscriptions).toEqual(['SUBSCRIBE show profile\r\n', 'SUBSCRIBE show profile\r\n']);
    expect(changes).toEqual([{ type: 'REMOVE', storyId: 's1' }, { type: 'REMOVE', storyId: 's2' }]);
    expect(status).toEqual([true, false, true]);
  });
});
