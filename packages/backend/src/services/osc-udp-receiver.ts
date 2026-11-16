import { createSocket, type Socket } from 'node:dgram';
import type { OscMessage } from '@soticaspar/core';
import { noopLog, type LogFn } from './log';
import { parseDatagram } from './osc-message';

/** Binds a UDP port on all interfaces and reports every OSC message in the datagrams it receives. */
export class OscUdpReceiver {
  private socket: Socket | undefined;

  constructor(
    private readonly port: number,
    private readonly onMessage: (sourceAddress: string, message: OscMessage) => void,
    private readonly log: LogFn = noopLog
  ) {}

  start(): Promise<void> {
    if (this.socket) return Promise.resolve();
    const socket = createSocket({ type: 'udp4', reuseAddr: true });
    socket.on('message', (data, remote) => {
      try {
        for (const message of parseDatagram(data)) this.onMessage(remote.address, message);
      } catch (error) {
        this.log('warn', `Ignoring invalid OSC datagram from ${remote.address}: ${errorMessage(error)}`);
      }
    });
    socket.on('error', (error) => this.log('error', `OSC UDP socket on port ${this.port}: ${error.message}`));

    return new Promise((resolve, reject) => {
      const onBindError = (error: Error): void => {
        socket.close();
        reject(error);
      };
      socket.once('error', onBindError);
      socket.bind(this.port, '0.0.0.0', () => {
        socket.off('error', onBindError);
        this.socket = socket;
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    const socket = this.socket;
    this.socket = undefined;
    return socket ? new Promise((resolve) => socket.close(() => resolve())) : Promise.resolve();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
