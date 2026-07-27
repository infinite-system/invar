import { Static } from 'ivue/extras';
import { PngDecoder } from './PngDecoder';
import { JpegDecoder } from './JpegDecoder';

// The image-decoder seam: ONE registry mapping a file extension to the decoder that turns raw bytes
// into straight-alpha RGBA. Every raster format shares the same generator — bytes in, {width, height,
// rgba} out — so format support lives HERE only: Workspace routing asks `supports`, ImagePreview asks
// `decoderFor`, and adding a format is one registry entry plus its decoder file. Neither consumer ever
// carries its own extension list. Pure and stateless — a Static capability like the decoders it holds.
//
// invariant: Seams are drawn at the shared generator (project.invariants.md)
// invariant: An image buffer replaces the code text and leaves other files untouched (src/modules/image/image.invariants.md)
// invariant: Eager circular runtime reads fail during init (project.invariants.md)

class $ImageDecoders {
  protected static get PngDecoder(): ImageDecoderClass {
    return PngDecoder.Class;
  }

  protected static get JpegDecoder(): ImageDecoderClass {
    return JpegDecoder.Class;
  }

  // The single source of truth for previewable raster formats: lowercase dot-extension → decoder.
  // Delegating closures, never `X.Class.decode` snapshots: each decoder Class dereferences at CALL
  // time, so subclass overrides are honored and module init carries no eager edge.
  protected static get $decodersByExtension(): ReadonlyMap<
    string,
    ImageDecoder
  > {
    const decodersByExtension: ReadonlyMap<string, ImageDecoder> = new Map([
      ['.png', (bytes: Uint8Array) => this.PngDecoder.decode(bytes)],
      ['.jpg', (bytes: Uint8Array) => this.JpegDecoder.decode(bytes)],
      ['.jpeg', (bytes: Uint8Array) => this.JpegDecoder.decode(bytes)],
    ]);
    return decodersByExtension;
  }

  /** The decoder registered for `extension` (case-insensitive, dot included), or null when the
   *  extension is not a supported raster format. */
  static decoderFor(extension: string): ImageDecoder | null {
    return this.$decodersByExtension.get(extension.toLowerCase()) ?? null;
  }

  /** True when `extension` (case-insensitive, dot included) has a registered decoder. */
  static supports(extension: string): boolean {
    return this.$decodersByExtension.has(extension.toLowerCase());
  }
}

export namespace ImageDecoders {
  export const $Class = Static($ImageDecoders);
  export const Class = $Class;
}

/** A decoded raster image: dimensions plus a straight-alpha RGBA buffer of length width*height*4. */
export interface DecodedImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

/** A format decoder: raw file bytes to a DecodedImage; throws a clear Error on undecodable bytes. */
export type ImageDecoder = (bytes: Uint8Array) => DecodedImage;

export interface ImageDecoderClass {
  decode(bytes: Uint8Array): DecodedImage;
}
