import { Static } from 'ivue/extras';
import type { DecodedImage } from './ImageDecoders';
import { ImageResample } from './ImageResample';

// The sixel encoder: resamples the decoded image to the target PIXEL rect through the shared resample
// seam, quantizes to a fixed 6×6×6 colour cube (216 palette entries — a stable palette beats a
// per-image median cut for a preview: deterministic output, no perceptible banding at preview sizes),
// and emits one DCS sequence: raster attributes, palette definitions for the colours actually used,
// then per-6-row bands of run-length-encoded sixel characters (one pass per colour present in the
// band, `$` carriage returns between colours, `-` between bands). Sixel pixels are inert once painted
// — there is nothing to delete; a later cell repaint over the region simply overwrites them.
// Pure and stateless — a Static capability.
//
// invariant: A pixel tier places and deletes graphics explicitly (src/modules/image/image.invariants.md)

class $SixelEncoder {
  // The fixed 6-level channel ladder: 0, 51, 102, 153, 204, 255 → sixel's 0..100 scale.
  protected static get CHANNEL_LEVELS(): number {
    return 6;
  }

  protected static get ImageResample() {
    return ImageResample.Class;
  }

  /** Quantize an 0..255 channel to its 6-level index. */
  protected static channelIndex(value: number): number {
    return Math.round((value / 255) * (this.CHANNEL_LEVELS - 1));
  }

  /** The sixel palette register (0..215) for an RGB sample. */
  protected static paletteIndex(
    red: number,
    green: number,
    blue: number,
  ): number {
    return (
      this.channelIndex(red) * this.CHANNEL_LEVELS * this.CHANNEL_LEVELS +
      this.channelIndex(green) * this.CHANNEL_LEVELS +
      this.channelIndex(blue)
    );
  }

  /** A palette register's channel value on sixel's 0..100 scale. */
  protected static paletteChannel(levelIndex: number): number {
    return Math.round((levelIndex / (this.CHANNEL_LEVELS - 1)) * 100);
  }

  static encode(paint: SixelPaint): string {
    const { image, pixelWidth, pixelHeight, background } = paint;
    const grid = this.ImageResample.toRgbGrid(
      image,
      pixelWidth,
      pixelHeight,
      background[0],
      background[1],
      background[2],
    );

    // Quantize every sample to its palette register once; collect the used registers.
    const registers = new Uint8Array(pixelWidth * pixelHeight);
    const usedRegisters = new Set<number>();
    for (
      let sampleIndex = 0;
      sampleIndex < pixelWidth * pixelHeight;
      sampleIndex++
    ) {
      const gridOffset = sampleIndex * 3;
      const register = this.paletteIndex(
        grid[gridOffset]!,
        grid[gridOffset + 1]!,
        grid[gridOffset + 2]!,
      );
      registers[sampleIndex] = register;
      usedRegisters.add(register);
    }

    // DCS introducer (P2=1: unset pixels keep the screen content) + raster attributes (1:1 aspect).
    const parts: string[] = [`\x1bP0;1;0q"1;1;${pixelWidth};${pixelHeight}`];
    for (const register of [...usedRegisters].sort(
      (left, right) => left - right,
    )) {
      const redLevel = Math.floor(
        register / (this.CHANNEL_LEVELS * this.CHANNEL_LEVELS),
      );
      const greenLevel =
        Math.floor(register / this.CHANNEL_LEVELS) % this.CHANNEL_LEVELS;
      const blueLevel = register % this.CHANNEL_LEVELS;
      parts.push(
        `#${register};2;${this.paletteChannel(redLevel)};` +
          `${this.paletteChannel(greenLevel)};${this.paletteChannel(blueLevel)}`,
      );
    }

    // Emit 6-row bands: per colour present in the band, one RLE pass over the columns.
    const bandCount = Math.ceil(pixelHeight / 6);
    for (let bandIndex = 0; bandIndex < bandCount; bandIndex++) {
      const bandTop = bandIndex * 6;
      // Which registers appear in this band, and each column's 6-bit mask per register.
      const bandRegisters = new Set<number>();
      for (let rowOffset = 0; rowOffset < 6; rowOffset++) {
        const verticalPixelIndex = bandTop + rowOffset;
        if (verticalPixelIndex >= pixelHeight) break;
        for (
          let horizontalPixelIndex = 0;
          horizontalPixelIndex < pixelWidth;
          horizontalPixelIndex++
        ) {
          bandRegisters.add(
            registers[verticalPixelIndex * pixelWidth + horizontalPixelIndex]!,
          );
        }
      }
      const passes: string[] = [];
      for (const register of [...bandRegisters].sort(
        (left, right) => left - right,
      )) {
        let pass = `#${register}`;
        let runCharacter = '';
        let runLength = 0;
        const flushRun = (): void => {
          if (runLength === 0) return;
          // RLE pays for itself from 4 repeats (`!<n>c` is 4+ chars); shorter runs emit literally.
          pass +=
            runLength >= 4
              ? `!${runLength}${runCharacter}`
              : runCharacter.repeat(runLength);
          runLength = 0;
        };
        for (
          let horizontalPixelIndex = 0;
          horizontalPixelIndex < pixelWidth;
          horizontalPixelIndex++
        ) {
          let mask = 0;
          for (let rowOffset = 0; rowOffset < 6; rowOffset++) {
            const verticalPixelIndex = bandTop + rowOffset;
            if (verticalPixelIndex >= pixelHeight) break;
            if (
              registers[
                verticalPixelIndex * pixelWidth + horizontalPixelIndex
              ] === register
            ) {
              mask |= 1 << rowOffset;
            }
          }
          const character = String.fromCharCode(63 + mask);
          if (character === runCharacter) {
            runLength++;
          } else {
            flushRun();
            runCharacter = character;
            runLength = 1;
          }
        }
        flushRun();
        passes.push(pass);
      }
      parts.push(passes.join('$'));
      parts.push(bandIndex < bandCount - 1 ? '-' : '');
    }
    parts.push('\x1b\\');
    return parts.join('');
  }
}

export namespace SixelEncoder {
  export const $Class = $SixelEncoder;
  export const Class = Static($SixelEncoder);
}

/** One sixel paint request: the decoded image resampled to an exact pixel rect over a background. */
export interface SixelPaint {
  image: DecodedImage;
  /** Target width in PIXELS (already aspect-fitted by the caller). */
  pixelWidth: number;
  /** Target height in PIXELS (already aspect-fitted by the caller). */
  pixelHeight: number;
  /** Background composited under transparency, as [red, green, blue] 0..255. */
  background: [number, number, number];
}
