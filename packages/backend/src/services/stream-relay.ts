import { createSocket, type Socket } from 'node:dgram';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import { noopLog, type LogFn } from './log';

/**
 * Receives the MPEG-TS stream the server sends to `udpPort` and forwards every datagram unchanged to the
 * WebSocket clients of a server on 127.0.0.1 (a random port), where the Live panel decodes it.
 */
export class StreamRelay {
  private udp: Socket | undefined;
  private server: WebSocketServer | undefined;

  constructor(private readonly log: LogFn = noopLog) {}

  /** Starts relaying and resolves with the WebSocket URL to connect to. */
  async open(udpPort: number): Promise<string> {
    await this.close();
    const server = await listenWebSocket();
    try {
      this.udp = await bindUdp(udpPort, (datagram) => {
        for (const client of server.clients) {
          // A client that cannot keep up only loses picture; never buffer an unbounded amount for it.
          if (client.readyState === WebSocket.OPEN && client.bufferedAmount < MAX_BUFFERED) client.send(datagram, { binary: true });
        }
      });
    } catch (error) {
      await closeServer(server);
      throw error;
    }
    this.server = server;
    const { port } = server.address() as AddressInfo;
    this.log('info', `Relaying the live stream from UDP port ${udpPort} to ws://127.0.0.1:${port}`);
    return `ws://127.0.0.1:${port}`;
  }

  async close(): Promise<void> {
    const { udp, server } = this;
    this.udp = undefined;
    this.server = undefined;
    udp?.close();
    if (server) await closeServer(server);
  }
}

const MAX_BUFFERED = 4 * 1024 * 1024;

function listenWebSocket(): Promise<WebSocketServer> {
  return new Promise((resolve, reject) => {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    server.once('error', reject);
    server.once('listening', () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

function bindUdp(port: number, onDatagram: (datagram: Buffer) => void): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createSocket({ type: 'udp4', reuseAddr: true });
    socket.once('error', reject);
    socket.on('message', onDatagram);
    socket.bind(port, () => {
      socket.off('error', reject);
      resolve(socket);
    });
  });
}

function closeServer(server: WebSocketServer): Promise<void> {
  server.clients.forEach((client) => client.terminate());
  return new Promise((resolve) => server.close(() => resolve()));
}
