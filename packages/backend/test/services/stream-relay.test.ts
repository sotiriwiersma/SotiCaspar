import { createSocket } from 'node:dgram';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { StreamRelay } from '../../src/services/stream-relay';
import { freeUdpPort, waitFor } from './helpers';

async function sendDatagram(port: number, data: Buffer): Promise<void> {
  const socket = createSocket('udp4');
  await new Promise<void>((resolve, reject) => socket.send(data, port, '127.0.0.1', (error) => (error ? reject(error) : resolve())));
  socket.close();
}

describe('StreamRelay', () => {
  const relay = new StreamRelay();
  afterEach(() => relay.close());

  it('forwards every datagram unchanged to the WebSocket clients', async () => {
    const udpPort = await freeUdpPort();
    const url = await relay.open(udpPort);
    expect(url).toMatch(/^ws:\/\/127\.0\.0\.1:\d+$/);

    const received: Buffer[] = [];
    const client = new WebSocket(url);
    client.on('message', (data: Buffer) => received.push(data));
    await new Promise((resolve, reject) => client.once('open', resolve).once('error', reject));

    const packets = [Buffer.from([0x47, 1, 2, 3]), Buffer.alloc(1472, 0x47)];
    for (const packet of packets) await sendDatagram(udpPort, packet);
    await waitFor(() => received.length === 2);
    expect(received).toEqual(packets);
    client.terminate();
  });

  it('releases both ports on close so the stream can be reopened', async () => {
    const udpPort = await freeUdpPort();
    const first = await relay.open(udpPort);
    await relay.close();
    await expect(new Promise((resolve, reject) => new WebSocket(first).once('open', resolve).once('error', reject))).rejects.toThrow();
    await expect(relay.open(udpPort)).resolves.toMatch(/^ws:/);
  });
});
