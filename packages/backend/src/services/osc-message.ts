import type { OscMessage } from '@soticaspar/core';
import { decodePacket, isBundle, type OscArgument, type OscPacket } from './osc-codec';

/** Decodes a UDP datagram into its messages; bundles are flattened depth first. Throws `OscDecodeError`. */
export function parseDatagram(data: Uint8Array): OscMessage[] {
  return flatten(decodePacket(data));
}

function flatten(packet: OscPacket): OscMessage[] {
  if (isBundle(packet)) return packet.elements.flatMap(flatten);
  return [{ path: packet.address, args: packet.args.flatMap(toPlainArgument) }];
}

/** Blobs, time tags and infinitum have no plain representation and are dropped. */
function toPlainArgument(arg: OscArgument): Array<string | number | boolean | null> {
  switch (arg.type) {
    case 'i':
    case 'f':
    case 'd':
    case 's':
      return [arg.value];
    case 'h':
      return [Number(arg.value)];
    case 'T':
      return [true];
    case 'F':
      return [false];
    case 'N':
      return [null];
    default:
      return [];
  }
}
