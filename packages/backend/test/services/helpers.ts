import { createSocket } from 'node:dgram';
import { createServer } from 'node:net';
import { encodePacket, type OscPacket } from '../../src/services/osc-codec';

export async function freeUdpPort(): Promise<number> {
  const socket = createSocket('udp4');
  await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve));
  const { port } = socket.address();
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return port;
}

export async function freeTcpPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

export async function sendUdp(port: number, packet: OscPacket): Promise<void> {
  const socket = createSocket('udp4');
  await new Promise<void>((resolve, reject) =>
    socket.send(encodePacket(packet), port, '127.0.0.1', (error) => (error ? reject(error) : resolve()))
  );
  socket.close();
}

export async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
