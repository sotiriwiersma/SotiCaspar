import { createSocket } from 'node:dgram';
import type { OscMessage } from '@soticaspar/core';
import { afterEach, describe, expect, it } from 'vitest';
import { OscMonitor } from '../../src/services/osc-monitor';
import { freeUdpPort, sendUdp, waitFor } from './helpers';

describe('OscMonitor', () => {
  let monitor: OscMonitor | undefined;
  afterEach(async () => {
    await monitor?.stop();
    monitor = undefined;
  });

  async function startMonitor(): Promise<{ port: number; received: Array<[string, OscMessage]> }> {
    const port = await freeUdpPort();
    const received: Array<[string, OscMessage]> = [];
    monitor = new OscMonitor(port, (source, message) => received.push([source, message]));
    await monitor.start();
    return { port, received };
  }

  it('delivers messages with the source address', async () => {
    const { port, received } = await startMonitor();
    await sendUdp(port, { address: '/channel/1/framerate', args: [{ type: 'f', value: 25 }] });
    await waitFor(() => received.length === 1);
    expect(received[0]).toEqual(['127.0.0.1', { path: '/channel/1/framerate', args: [25] }]);
  });

  it('keeps only the latest message per path within a batch', async () => {
    const { port, received } = await startMonitor();
    await sendUdp(port, {
      timeTag: 1n,
      elements: [
        { address: '/time', args: [{ type: 'i', value: 1 }] },
        { address: '/time', args: [{ type: 'i', value: 2 }] },
        { address: '/other', args: [{ type: 'i', value: 9 }] },
        { address: '/time', args: [{ type: 'i', value: 3 }] }
      ]
    });
    await waitFor(() => received.length >= 2);
    expect(received.map(([, message]) => message)).toEqual([
      { path: '/time', args: [3] },
      { path: '/other', args: [9] }
    ]);
  });

  it('unpacks bundles and ignores /control messages', async () => {
    const { port, received } = await startMonitor();
    await sendUdp(port, {
      timeTag: 1n,
      elements: [
        { address: '/control/play', args: [{ type: 'i', value: 1 }] },
        { address: '/a', args: [{ type: 's', value: 'x' }] },
        { timeTag: 1n, elements: [{ address: '/b', args: [{ type: 'T' }] }] }
      ]
    });
    await waitFor(() => received.length >= 2);
    expect(received.map(([, message]) => message.path)).toEqual(['/a', '/b']);
  });

  it('survives and logs garbage datagrams', async () => {
    const port = await freeUdpPort();
    const logs: string[] = [];
    const received: OscMessage[] = [];
    monitor = new OscMonitor(port, (_source, message) => received.push(message), (level, text) => logs.push(`${level}:${text}`));
    await monitor.start();
    const socket = createSocket('udp4');
    socket.send(Buffer.from('garbage'), port, '127.0.0.1', () => socket.close());
    await waitFor(() => logs.some((line) => line.startsWith('warn:')));
    await sendUdp(port, { address: '/ok', args: [] });
    await waitFor(() => received.length === 1);
  });
});
