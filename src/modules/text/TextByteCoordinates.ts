import { Static } from 'ivue/extras';
import type { TextEditPosition } from './TextEdit.interface';
import { TextCoordinates } from './TextCoordinates';

/** One UTF-8 encoding and line-geometry seam for search results and text patches. */
class $TextByteCoordinates {
  protected static get $encoder(): TextEncoder {
    return new TextEncoder();
  }

  protected static get $decoder(): TextDecoder {
    return new TextDecoder('utf-8', { fatal: true });
  }

  static encode(text: string): Uint8Array {
    return this.$encoder.encode(text);
  }

  static decode(bytes: Uint8Array): string {
    return this.$decoder.decode(bytes);
  }

  static lineStartByteOffsets(text: string): readonly number[] {
    return this.lineStarts(text).map((lineStart) => lineStart.byteOffset);
  }

  static positionAtByteOffset(
    sourceBytes: Uint8Array,
    byteOffset: number,
  ): TextEditPosition {
    if (byteOffset < 0 || byteOffset > sourceBytes.byteLength) {
      throw new Error('Text byte offset is outside the source bytes.');
    }
    const prefix = this.decode(sourceBytes.subarray(0, byteOffset));
    const lineStarts = this.lineStarts(prefix);
    const lineIndex = lineStarts.length - 1;
    const lineStart = lineStarts[lineIndex]!;
    const lineText = prefix.slice(lineStart.utf16Offset);
    return {
      line: lineIndex,
      column: TextCoordinates.Class.u16ToGrapheme(lineText, lineText.length),
    };
  }

  protected static lineStarts(text: string): readonly TextLineStart[] {
    const lineStarts: TextLineStart[] = [{ utf16Offset: 0, byteOffset: 0 }];
    const lineBreakPattern = /\r\n|\n|\r/g;
    let previousLineStartUtf16Offset = 0;
    let nextLineStartByteOffset = 0;
    let lineBreakMatch: RegExpExecArray | null;
    while ((lineBreakMatch = lineBreakPattern.exec(text)) !== null) {
      const nextLineStartUtf16Offset =
        lineBreakMatch.index + lineBreakMatch[0].length;
      nextLineStartByteOffset += this.encode(
        text.slice(previousLineStartUtf16Offset, nextLineStartUtf16Offset),
      ).byteLength;
      lineStarts.push({
        utf16Offset: nextLineStartUtf16Offset,
        byteOffset: nextLineStartByteOffset,
      });
      previousLineStartUtf16Offset = nextLineStartUtf16Offset;
    }
    return lineStarts;
  }
}

export namespace TextByteCoordinates {
  export const $Class = Static($TextByteCoordinates);
  export let Class = $Class;
}

interface TextLineStart {
  readonly utf16Offset: number;
  readonly byteOffset: number;
}
