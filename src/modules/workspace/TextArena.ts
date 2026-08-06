import { Static } from 'ivue/extras';
import { ByteArrays } from '../system/ByteArrays';
import { TextByteCoordinates } from '../text/TextByteCoordinates';

// A workspace text transaction owns its UTF-8 bytes here. Slices point into fixed slabs, so
// patches retain coordinates instead of JavaScript string copies. Repeated replacement text is
// interned by hash plus exact byte comparison. The hash rejects candidates but never proves equal.
//
// invariant: Cost tracks the actively observed set (project.invariants.md)
class $TextArena {
  protected static get slabByteLength(): number {
    return 64 * 1024;
  }

  protected readonly slabs: Uint8Array[] = [];
  protected readonly internedSlicesByHash = new Map<number, TextArenaSlice[]>();
  protected nextSlabByteOffset = 0;
  protected storedByteLength = 0;

  get byteLength(): number {
    return this.storedByteLength;
  }

  get slabCount(): number {
    return this.slabs.length;
  }

  store(value: string | Uint8Array): TextArenaSlice {
    return this.storeBytes(this.encode(value));
  }

  intern(value: string | Uint8Array): TextArenaSlice {
    const bytes = this.encode(value);
    const hash = this.hash(bytes);
    const candidates = this.internedSlicesByHash.get(hash) ?? [];
    for (const candidate of candidates) {
      if (ByteArrays.Class.equal(this.view(candidate), bytes)) return candidate;
    }
    const slice = this.storeBytes(bytes);
    this.internedSlicesByHash.set(hash, [...candidates, slice]);
    return slice;
  }

  bytes(slice: TextArenaSlice): Uint8Array {
    return Uint8Array.from(this.view(slice));
  }

  matches(
    slice: TextArenaSlice,
    sourceBytes: Uint8Array,
    sourceByteOffset: number,
  ): boolean {
    const expectedBytes = this.view(slice);
    if (
      sourceByteOffset < 0 ||
      sourceByteOffset + expectedBytes.byteLength > sourceBytes.byteLength
    ) {
      return false;
    }
    for (let byteIndex = 0; byteIndex < expectedBytes.byteLength; byteIndex++) {
      if (
        sourceBytes[sourceByteOffset + byteIndex] !== expectedBytes[byteIndex]
      ) {
        return false;
      }
    }
    return true;
  }

  protected view(slice: TextArenaSlice): Uint8Array {
    const slab = this.slabs[slice.slabIndex];
    if (!slab)
      throw new Error(
        `Text arena slice names missing slab ${slice.slabIndex}.`,
      );
    const endByteOffset = slice.byteOffset + slice.byteLength;
    if (slice.byteOffset < 0 || endByteOffset > slab.byteLength) {
      throw new Error('Text arena slice exceeds its slab.');
    }
    return slab.subarray(slice.byteOffset, endByteOffset);
  }

  text(slice: TextArenaSlice): string {
    return new TextDecoder().decode(this.view(slice));
  }

  equals(first: TextArenaSlice, second: TextArenaSlice): boolean {
    if (
      first.slabIndex === second.slabIndex &&
      first.byteOffset === second.byteOffset &&
      first.byteLength === second.byteLength
    ) {
      return true;
    }
    return ByteArrays.Class.equal(this.view(first), this.view(second));
  }

  protected encode(value: string | Uint8Array): Uint8Array {
    return typeof value === 'string'
      ? TextByteCoordinates.Class.encode(value)
      : value;
  }

  protected storeBytes(bytes: Uint8Array): TextArenaSlice {
    const textArenaClass = this.constructor as typeof $TextArena;
    const requiredSlabByteLength = Math.max(
      textArenaClass.slabByteLength,
      bytes.byteLength,
    );
    let slabIndex = this.slabs.length - 1;
    let slab = this.slabs[slabIndex];
    if (!slab || slab.byteLength - this.nextSlabByteOffset < bytes.byteLength) {
      slab = new Uint8Array(requiredSlabByteLength);
      this.slabs.push(slab);
      slabIndex = this.slabs.length - 1;
      this.nextSlabByteOffset = 0;
    }
    const slice: TextArenaSlice = {
      slabIndex,
      byteOffset: this.nextSlabByteOffset,
      byteLength: bytes.byteLength,
    };
    slab.set(bytes, this.nextSlabByteOffset);
    this.nextSlabByteOffset += bytes.byteLength;
    this.storedByteLength += bytes.byteLength;
    return slice;
  }

  protected hash(bytes: Uint8Array): number {
    let hash = 2166136261;
    for (const byte of bytes) {
      hash ^= byte;
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }
}

export namespace TextArena {
  export const $Class = Static($TextArena);
  export let Class = $Class;
  export type Instance = InstanceType<typeof $TextArena>;
}

export interface TextArenaSlice {
  readonly slabIndex: number;
  readonly byteOffset: number;
  readonly byteLength: number;
}
