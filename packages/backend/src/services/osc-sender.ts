import { createSocket } from 'node:dgram';
import type { OscOutputConfig } from '@soticaspar/core';
import { encodePacket, OSC_IMMEDIATE, type OscArgument, type OscPacket } from './osc-codec';

/** Sends single-argument OSC messages over UDP to a configured OSC output. */
export class OscSender {
  async send(output: OscOutputConfig, path: string, type: string, value: string, useBundle: boolean): Promise<void> {
    const message = { address: path, args: [toArgument(type, value)] };
    const packet: OscPacket = useBundle ? { timeTag: OSC_IMMEDIATE, elements: [message] } : message;
    await sendDatagram(output.address, output.port, encodePacket(packet));
  }
}

/** Mirrors the lenient conversions of the original client: unparsable numbers become 0. */
function toArgument(type: string, value: string): OscArgument {
  switch (type) {
    case 'Boolean':
      return { type: value === 'true' ? 'T' : 'F' };
    case 'Integer':
      return { type: 'i', value: parseInt32(value) };
    case 'Float':
      return { type: 'f', value: parseNumber(value) };
    case 'Double':
      return { type: 'd', value: parseNumber(value) };
    case 'String':
      return { type: 's', value };
    default:
      throw new Error(`Unsupported OSC type "${type}"`);
  }
}

function parseInt32(value: string): number {
  const text = value.trim();
  const number = /^[+-]?\d+$/.test(text) ? Number(text) : 0;
  return number >= -(2 ** 31) && number < 2 ** 31 ? number : 0;
}

function parseNumber(value: string): number {
  const text = value.trim();
  const number = text === '' ? 0 : Number(text);
  return Number.isFinite(number) ? number : 0;
}

function sendDatagram(address: string, port: number, data: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createSocket('udp4');
    socket.once('error', (error) => {
      socket.close();
      reject(error);
    });
    socket.send(data, port, address, (error) => {
      socket.close();
      if (error) reject(error);
      else resolve();
    });
  });
}
