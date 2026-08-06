import { Static } from 'ivue/extras';

class $ChannelFrame {
  /** Wire-kind bytes are fixed by protocol 1.0 and read on every frame. */
  static readonly FRAME_KIND = {
    Hello: 1,
    Welcome: 2,
    Request: 3,
    Response: 4,
    StreamOpen: 5,
    StreamData: 6,
    StreamEnd: 7,
    Cancel: 8,
  } as const;

  protected static get magic(): Uint8Array {
    return new Uint8Array([0x49, 0x56, 0x43, 0x48]);
  }

  static get MAJOR_VERSION(): number {
    return 1;
  }

  static get MINOR_VERSION(): number {
    return 0;
  }

  static get MAXIMUM_HEADER_BYTE_COUNT(): number {
    return 65_536;
  }

  static get MAXIMUM_BODY_BYTE_COUNT(): number {
    return 1_048_576;
  }

  static encode(
    kind: ChannelFrameKind,
    header: Readonly<Record<string, unknown>>,
    body: Uint8Array = new Uint8Array(),
  ): Uint8Array {
    const headerBytes = new TextEncoder().encode(JSON.stringify(header));
    if (headerBytes.length > this.MAXIMUM_HEADER_BYTE_COUNT) {
      throw new Error(
        `Channel header exceeds ${this.MAXIMUM_HEADER_BYTE_COUNT} bytes`,
      );
    }
    if (body.length > this.MAXIMUM_BODY_BYTE_COUNT) {
      throw new Error(
        `Channel body exceeds ${this.MAXIMUM_BODY_BYTE_COUNT} bytes`,
      );
    }
    const encoded = new Uint8Array(16 + headerBytes.length + body.length);
    encoded.set(this.magic, 0);
    encoded[4] = this.MAJOR_VERSION;
    encoded[5] = this.MINOR_VERSION;
    encoded[6] = kind;
    const view = new DataView(encoded.buffer);
    view.setUint32(8, headerBytes.length);
    view.setUint32(12, body.length);
    encoded.set(headerBytes, 16);
    encoded.set(body, 16 + headerBytes.length);
    return encoded;
  }

  protected bufferedBytes = new Uint8Array();

  push(bytes: Uint8Array): ChannelDecodedFrame[] {
    const channelFrameClass = this.constructor as typeof $ChannelFrame;
    const combined = new Uint8Array(this.bufferedBytes.length + bytes.length);
    combined.set(this.bufferedBytes);
    combined.set(bytes, this.bufferedBytes.length);
    const frames: ChannelDecodedFrame[] = [];
    let offset = 0;
    while (combined.length - offset >= 16) {
      this.assertPrefix(combined, offset);
      const view = new DataView(combined.buffer, combined.byteOffset + offset);
      const headerByteCount = view.getUint32(8);
      const bodyByteCount = view.getUint32(12);
      if (headerByteCount > channelFrameClass.MAXIMUM_HEADER_BYTE_COUNT) {
        throw new Error(`Channel header declares ${headerByteCount} bytes`);
      }
      if (bodyByteCount > channelFrameClass.MAXIMUM_BODY_BYTE_COUNT) {
        throw new Error(`Channel body declares ${bodyByteCount} bytes`);
      }
      const frameByteCount = 16 + headerByteCount + bodyByteCount;
      if (combined.length - offset < frameByteCount) break;
      const headerStart = offset + 16;
      const bodyStart = headerStart + headerByteCount;
      let header: Record<string, unknown>;
      try {
        header = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            combined.subarray(headerStart, bodyStart),
          ),
        ) as Record<string, unknown>;
      } catch (error) {
        throw new Error(`Invalid channel JSON header: ${String(error)}`);
      }
      frames.push({
        majorVersion: combined[offset + 4] as number,
        minorVersion: combined[offset + 5] as number,
        kind: combined[offset + 6] as ChannelFrameKind,
        header,
        body: combined.slice(bodyStart, offset + frameByteCount),
      });
      offset += frameByteCount;
    }
    this.bufferedBytes = combined.slice(offset);
    return frames;
  }

  protected assertPrefix(bytes: Uint8Array, offset: number): void {
    const channelFrameClass = this.constructor as typeof $ChannelFrame;
    for (
      let magicIndex = 0;
      magicIndex < channelFrameClass.magic.length;
      magicIndex += 1
    ) {
      if (bytes[offset + magicIndex] !== channelFrameClass.magic[magicIndex]) {
        throw new Error('Invalid channel frame magic');
      }
    }
    if (bytes[offset + 7] !== 0)
      throw new Error('Unsupported channel frame flags');
    if (bytes[offset + 4] !== channelFrameClass.MAJOR_VERSION) {
      throw new Error(`Unsupported channel major version ${bytes[offset + 4]}`);
    }
  }
}

export namespace ChannelFrame {
  export const $Class = Static($ChannelFrame);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export type ChannelFrameKind =
  (typeof ChannelFrame.Class.FRAME_KIND)[keyof typeof ChannelFrame.Class.FRAME_KIND];

export interface ChannelDecodedFrame {
  majorVersion: number;
  minorVersion: number;
  kind: ChannelFrameKind;
  header: Record<string, unknown>;
  body: Uint8Array;
}
