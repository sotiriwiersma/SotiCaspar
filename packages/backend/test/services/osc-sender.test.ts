import { createSocket, type Socket } from 'node:dgram';
import type { OscOutputConfig } from '@soticaspar/core';
import { afterEach, describe, expect, it } from 'vitest';
import { decodePacket, OSC_IMMEDIATE, type OscPacket } from '../../src/services/osc-codec';
import { OscSender } from '../../src/services/osc-sender';

describe('OscSender', () => {
  let receiver: Socket | undefined;
  afterEach(() => receiver?.close());

  async function listen(): Promise<{ output: OscOutputConfig; next: () => Promise<Buffer> }> {
    const socket = createSocket('udp4');
    receiver = socket;
    const next = new Promise<Buffer>((resolve) => socket.once('message', resolve));
    await new Promise<void>((resolve) => socket.bind(0, '127.0.0.1', resolve));
    return {
      output: { name: 'out', address: '127.0.0.1', port: socket.address().port, description: '' },
      next: () => next
    };
  }

  const send = async (type: string, value: string, useBundle = false): Promise<OscPacket> => {
    const { output, next } = await listen();
    await new OscSender().send(output, '/test/path', type, value, useBundle);
    return decodePacket(await next());
  };

  it.each([
    ['String', 'hello', { type: 's', value: 'hello' }],
    ['Integer', '42', { type: 'i', value: 42 }],
    ['Integer', '4.5', { type: 'i', value: 0 }],
    ['Float', '0.25', { type: 'f', value: 0.25 }],
    ['Double', '3.14', { type: 'd', value: 3.14 }],
    ['Double', 'abc', { type: 'd', value: 0 }],
    ['Boolean', 'true', { type: 'T' }],
    ['Boolean', 'false', { type: 'F' }]
  ])('sends %s "%s"', async (type, value, expected) => {
    expect(await send(type, value)).toEqual({ address: '/test/path', args: [expected] });
  });

  it('wraps the message in a bundle on request', async () => {
    expect(await send('Integer', '1', true)).toEqual({
      timeTag: OSC_IMMEDIATE,
      elements: [{ address: '/test/path', args: [{ type: 'i', value: 1 }] }]
    });
  });

  it('rejects unknown types', async () => {
    const { output } = await listen();
    await expect(new OscSender().send(output, '/x', 'Blob', '1', false)).rejects.toThrow('Unsupported OSC type');
  });
});
