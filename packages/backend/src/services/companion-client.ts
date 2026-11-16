import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { createConnection, type Socket } from 'node:net';
import type { CompanionProtocol } from '@soticaspar/core';
import { noopLog, type LogFn } from './log';

export interface CompanionTarget {
  protocol: CompanionProtocol;
  host: string;
  port: number;
}

const CONNECT_TIMEOUT_MS = 3000;
/** How long to wait for Companion's `+OK` / `-ERR` answer to a TCP command. Silence is not an error. */
const REPLY_TIMEOUT_MS = 1500;

interface Waiting {
  resolve: () => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Sends Bitfocus Companion remote control commands (one per line) over TCP or UDP.
 *
 * TCP keeps one connection open, so a press does not wait for a new connection, and reads Companion's answer to each
 * line: `-ERR …` rejects (a button that does not exist, for instance), `+OK` or no answer within a moment resolves.
 * UDP has no answer: a datagram is sent and that is all that can be known.
 */
export class CompanionClient {
  private tcp: { key: string; socket: Socket; ready: Promise<void>; buffer: string; waiting: Waiting[] } | undefined;
  private udp: UdpSocket | undefined;

  constructor(private readonly log: LogFn = noopLog) {}

  async send(target: CompanionTarget, command: string): Promise<void> {
    if (target.protocol === 'UDP') return this.sendUdp(target, command);
    return this.sendTcp(target, command);
  }

  /** Opens (or reuses) the TCP connection; for UDP there is nothing to check. */
  async check(target: CompanionTarget): Promise<void> {
    if (target.protocol === 'TCP') await this.connection(target).ready;
  }

  close(): void {
    this.dropTcp(new Error('Companion connection closed'));
    this.udp?.close();
    this.udp = undefined;
  }

  // ---------------------------------------------------------------- TCP

  private async sendTcp(target: CompanionTarget, command: string): Promise<void> {
    const connection = this.connection(target);
    await connection.ready;
    await new Promise<void>((resolve, reject) => {
      const entry: Waiting = {
        resolve,
        reject,
        timer: setTimeout(() => {
          connection.waiting.splice(connection.waiting.indexOf(entry), 1);
          resolve();
        }, REPLY_TIMEOUT_MS)
      };
      connection.waiting.push(entry);
      connection.socket.write(`${command}\n`, (error) => {
        if (!error) return;
        clearTimeout(entry.timer);
        connection.waiting.splice(connection.waiting.indexOf(entry), 1);
        reject(error);
      });
    });
  }

  private connection(target: CompanionTarget) {
    const key = `${target.host}:${target.port}`;
    if (this.tcp && this.tcp.key === key && !this.tcp.socket.destroyed) return this.tcp;
    this.dropTcp(new Error('Companion connection replaced'));

    const socket = createConnection({ host: target.host, port: target.port });
    socket.setNoDelay(true);
    socket.setKeepAlive(true, 10_000);
    const connection = { key, socket, buffer: '', waiting: [] as Waiting[], ready: Promise.resolve() };
    connection.ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Companion at ${key} does not answer (is its TCP listener on?)`));
        socket.destroy();
      }, CONNECT_TIMEOUT_MS);
      socket.once('connect', () => {
        clearTimeout(timer);
        this.log('info', `Connected to Companion at ${key} (TCP)`);
        resolve();
      });
      socket.once('error', (error) => {
        clearTimeout(timer);
        reject(new Error(`Cannot reach Companion at ${key}: ${error.message}`));
      });
    });
    connection.ready.catch(() => undefined);

    socket.setEncoding('utf8');
    socket.on('data', (data: string) => {
      connection.buffer += data;
      for (let end = connection.buffer.indexOf('\n'); end !== -1; end = connection.buffer.indexOf('\n')) {
        const line = connection.buffer.slice(0, end).trim();
        connection.buffer = connection.buffer.slice(end + 1);
        const entry = connection.waiting.shift();
        if (!entry) continue;
        clearTimeout(entry.timer);
        if (line.startsWith('-ERR')) entry.reject(new Error(`Companion: ${line.replace(/^-ERR\s*/, '') || 'refused the command'}`));
        else entry.resolve();
      }
    });
    socket.on('error', (error) => this.log('warn', `Companion connection: ${error.message}`));
    socket.on('close', () => {
      if (this.tcp === connection) this.dropTcp(new Error(`Companion at ${key} closed the connection`));
    });
    this.tcp = connection;
    return connection;
  }

  private dropTcp(reason: Error): void {
    const connection = this.tcp;
    if (!connection) return;
    this.tcp = undefined;
    for (const entry of connection.waiting.splice(0)) {
      clearTimeout(entry.timer);
      entry.reject(reason);
    }
    connection.socket.destroy();
  }

  // ---------------------------------------------------------------- UDP

  private sendUdp(target: CompanionTarget, command: string): Promise<void> {
    this.udp ??= createSocket('udp4');
    const socket = this.udp;
    return new Promise((resolve, reject) => {
      socket.send(command, target.port, target.host, (error) => (error ? reject(new Error(`Cannot send to Companion at ${target.host}:${target.port}: ${error.message}`)) : resolve()));
    });
  }
}
