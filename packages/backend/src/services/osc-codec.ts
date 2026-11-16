/** OSC 1.0 wire format (plus the common 1.1 types `h d t T F N I`), messages and bundles. */

export type OscArgument =
  | { type: 'i'; value: number }
  | { type: 'f'; value: number }
  | { type: 's'; value: string }
  | { type: 'b'; value: Uint8Array }
  | { type: 'h'; value: bigint }
  | { type: 'd'; value: number }
  | { type: 't'; value: bigint }
  | { type: 'T' }
  | { type: 'F' }
  | { type: 'N' }
  | { type: 'I' };

export interface OscPacketMessage {
  address: string;
  args: OscArgument[];
}

export interface OscBundle {
  /** 64 bit NTP time tag. `OSC_IMMEDIATE` means "process now". */
  timeTag: bigint;
  elements: OscPacket[];
}

export type OscPacket = OscPacketMessage | OscBundle;

export const OSC_IMMEDIATE = 1n;

const BUNDLE_TAG = '#bundle';

export function isBundle(packet: OscPacket): packet is OscBundle {
  return 'elements' in packet;
}

// ---------------------------------------------------------------- encode

export function encodePacket(packet: OscPacket): Buffer {
  return isBundle(packet) ? encodeBundle(packet) : encodeMessage(packet);
}

function encodeMessage(message: OscPacketMessage): Buffer {
  const tags = ',' + message.args.map((arg) => arg.type).join('');
  return Buffer.concat([encodeString(message.address), encodeString(tags), ...message.args.map(encodeArgument)]);
}

function encodeBundle(bundle: OscBundle): Buffer {
  const header = Buffer.alloc(8);
  header.writeBigUInt64BE(bundle.timeTag);
  const elements = bundle.elements.flatMap((element) => {
    const body = encodePacket(element);
    const size = Buffer.alloc(4);
    size.writeInt32BE(body.length);
    return [size, body];
  });
  return Buffer.concat([encodeString(BUNDLE_TAG), header, ...elements]);
}

function encodeArgument(arg: OscArgument): Buffer {
  switch (arg.type) {
    case 'i': {
      const buffer = Buffer.alloc(4);
      buffer.writeInt32BE(arg.value);
      return buffer;
    }
    case 'f': {
      const buffer = Buffer.alloc(4);
      buffer.writeFloatBE(arg.value);
      return buffer;
    }
    case 'd': {
      const buffer = Buffer.alloc(8);
      buffer.writeDoubleBE(arg.value);
      return buffer;
    }
    case 'h': {
      const buffer = Buffer.alloc(8);
      buffer.writeBigInt64BE(arg.value);
      return buffer;
    }
    case 't': {
      const buffer = Buffer.alloc(8);
      buffer.writeBigUInt64BE(arg.value);
      return buffer;
    }
    case 's':
      return encodeString(arg.value);
    case 'b': {
      const size = Buffer.alloc(4);
      size.writeInt32BE(arg.value.length);
      return Buffer.concat([size, arg.value, Buffer.alloc(padding(arg.value.length))]);
    }
    default:
      return Buffer.alloc(0);
  }
}

function encodeString(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8');
  return Buffer.concat([bytes, Buffer.alloc(padding(bytes.length + 1) + 1)]);
}

/** Bytes needed to round `length` up to a multiple of four. */
function padding(length: number): number {
  return (4 - (length % 4)) % 4;
}

// ---------------------------------------------------------------- decode

export class OscDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OscDecodeError';
  }
}

export function decodePacket(data: Uint8Array): OscPacket {
  const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return new Reader(buffer).readPacket();
}

class Reader {
  private offset = 0;

  constructor(private readonly buffer: Buffer) {}

  readPacket(): OscPacket {
    if (this.buffer.length % 4 !== 0) throw new OscDecodeError('OSC packet size is not a multiple of four');
    const address = this.readString();
    return address === BUNDLE_TAG ? this.readBundle() : this.readMessage(address);
  }

  private readBundle(): OscBundle {
    const timeTag = this.readBigUInt64();
    const elements: OscPacket[] = [];
    while (this.offset < this.buffer.length) {
      const size = this.readInt32();
      if (size < 0 || size % 4 !== 0) throw new OscDecodeError(`Invalid bundle element size ${size}`);
      const end = this.offset + size;
      if (end > this.buffer.length) throw new OscDecodeError('Bundle element exceeds packet');
      elements.push(new Reader(this.buffer.subarray(this.offset, end)).readPacket());
      this.offset = end;
    }
    return { timeTag, elements };
  }

  private readMessage(address: string): OscPacketMessage {
    if (!address.startsWith('/')) throw new OscDecodeError(`Invalid OSC address "${address}"`);
    // Messages without a type tag string (OSC 1.0 legacy) carry no arguments.
    if (this.offset >= this.buffer.length) return { address, args: [] };
    const tags = this.readString();
    if (!tags.startsWith(',')) return { address, args: [] };
    return { address, args: [...tags.slice(1)].map((tag) => this.readArgument(tag)) };
  }

  private readArgument(tag: string): OscArgument {
    switch (tag) {
      case 'i':
        return { type: 'i', value: this.readInt32() };
      case 'f':
        return { type: 'f', value: this.take(4).readFloatBE() };
      case 'd':
        return { type: 'd', value: this.take(8).readDoubleBE() };
      case 'h':
        return { type: 'h', value: this.take(8).readBigInt64BE() };
      case 't':
        return { type: 't', value: this.readBigUInt64() };
      case 's':
        return { type: 's', value: this.readString() };
      case 'b':
        return { type: 'b', value: this.readBlob() };
      case 'T':
      case 'F':
      case 'N':
      case 'I':
        return { type: tag };
      default:
        throw new OscDecodeError(`Unsupported OSC type tag "${tag}"`);
    }
  }

  private take(size: number): Buffer {
    if (this.offset + size > this.buffer.length) throw new OscDecodeError('Unexpected end of OSC packet');
    const slice = this.buffer.subarray(this.offset, this.offset + size);
    this.offset += size;
    return slice;
  }

  private readInt32(): number {
    return this.take(4).readInt32BE();
  }

  private readBigUInt64(): bigint {
    return this.take(8).readBigUInt64BE();
  }

  private readString(): string {
    const end = this.buffer.indexOf(0, this.offset);
    if (end < 0) throw new OscDecodeError('Unterminated OSC string');
    const value = this.buffer.toString('utf8', this.offset, end);
    this.offset = Math.min(this.buffer.length, end + 1 + padding(end + 1 - this.offset));
    return value;
  }

  private readBlob(): Uint8Array {
    const size = this.readInt32();
    if (size < 0) throw new OscDecodeError(`Invalid blob size ${size}`);
    const bytes = Uint8Array.from(this.take(size));
    this.take(padding(size));
    return bytes;
  }
}
