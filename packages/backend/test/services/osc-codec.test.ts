import { describe, expect, it } from 'vitest';
import {
  decodePacket,
  encodePacket,
  OSC_IMMEDIATE,
  OscDecodeError,
  type OscPacket
} from '../../src/services/osc-codec';
import { parseDatagram } from '../../src/services/osc-message';

const roundTrip = (packet: OscPacket): OscPacket => decodePacket(encodePacket(packet));

describe('osc codec', () => {
  it('encodes a message with the documented padding', () => {
    const data = encodePacket({ address: '/foo', args: [{ type: 'i', value: 42 }] });
    expect(data).toEqual(Buffer.from('2f666f6f000000002c690000' + '0000002a', 'hex'));
  });

  it('round trips every supported argument type', () => {
    const packet: OscPacket = {
      address: '/all/types',
      args: [
        { type: 'i', value: -7 },
        { type: 'f', value: 0.5 },
        { type: 's', value: 'héllo' },
        { type: 'b', value: Uint8Array.from([1, 2, 3, 4, 5]) },
        { type: 'h', value: -(2n ** 40n) },
        { type: 'd', value: Math.PI },
        { type: 't', value: 0xdeadbeefn },
        { type: 'T' },
        { type: 'F' },
        { type: 'N' },
        { type: 'I' }
      ]
    };
    expect(roundTrip(packet)).toEqual(packet);
  });

  it.each(['', 'a', 'ab', 'abc', 'abcd'])('pads the string "%s" to four bytes', (text) => {
    const data = encodePacket({ address: '/s', args: [{ type: 's', value: text }] });
    expect(data.length % 4).toBe(0);
    expect(decodePacket(data)).toEqual({ address: '/s', args: [{ type: 's', value: text }] });
  });

  it('round trips nested bundles', () => {
    const packet: OscPacket = {
      timeTag: OSC_IMMEDIATE,
      elements: [
        { address: '/a', args: [] },
        { timeTag: 5n, elements: [{ address: '/b', args: [{ type: 'T' }] }, { timeTag: 6n, elements: [] }] }
      ]
    };
    expect(roundTrip(packet)).toEqual(packet);
  });

  it('decodes a canned CasparCG style datagram', () => {
    const path = '/channel/1/stage/layer/10/foreground/file/time';
    const datagram = Buffer.concat([
      Buffer.from(path + '\0\0', 'latin1'),
      Buffer.from(',ff\0', 'latin1'),
      Buffer.from('4120000041f00000', 'hex')
    ]);
    expect(parseDatagram(datagram)).toEqual([{ path, args: [10, 30] }]);
  });

  it('decodes a canned bundle with a nested bundle into a flat message list', () => {
    const datagram = Buffer.from(
      [
        '2362756e646c6500', // "#bundle"
        '0000000000000001',
        '0000000c', // size of /a
        '2f610000' + '2c690000' + '00000001',
        '0000001c', // size of the nested bundle
        '2362756e646c6500' + '0000000000000001' + '00000008' + '2f620000' + '2c540000'
      ].join(''),
      'hex'
    );
    expect(parseDatagram(datagram)).toEqual([
      { path: '/a', args: [1] },
      { path: '/b', args: [true] }
    ]);
  });

  it('treats a message without type tags as argument-less', () => {
    expect(decodePacket(Buffer.from('/ping\0\0\0', 'latin1'))).toEqual({ address: '/ping', args: [] });
  });

  it('maps arguments to plain values and drops blobs and time tags', () => {
    const data = encodePacket({
      address: '/x',
      args: [
        { type: 'h', value: 9n },
        { type: 'F' },
        { type: 'N' },
        { type: 'b', value: Uint8Array.from([1]) },
        { type: 't', value: 1n },
        { type: 'I' },
        { type: 's', value: 'ok' }
      ]
    });
    expect(parseDatagram(data)).toEqual([{ path: '/x', args: [9, false, null, 'ok'] }]);
  });

  it.each([
    ['unaligned packet', Buffer.from('/foo')],
    ['unterminated string', Buffer.from('/foo/bar/baz!')],
    ['truncated argument', Buffer.from('2f666f6f000000002c690000' + '0000', 'hex')],
    ['unknown type tag', Buffer.from('2f666f6f000000002c7a0000', 'hex')],
    ['address without slash', Buffer.from('666f6f00', 'hex')],
    ['bundle element overrun', Buffer.from('2362756e646c65000000000000000001' + '00000040', 'hex')]
  ])('rejects %s', (_name, data) => {
    expect(() => decodePacket(data)).toThrow(OscDecodeError);
  });
});
