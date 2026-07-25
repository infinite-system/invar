import { Static } from 'ivue/extras';

// invariant: Bracketed paste survives stream chunking (src/modules/terminal/terminal.invariants.md)
class $BracketedPasteInput {
  protected static get startMarker(): Uint8Array {
    return new TextEncoder().encode('\x1b[200~');
  }

  protected static get endMarker(): Uint8Array {
    return new TextEncoder().encode('\x1b[201~');
  }

  static splitAtMarkerEdges(
    text: string,
    maximumPayloadChunkBytes: number,
  ): Uint8Array[] {
    const payloadBytes = new TextEncoder().encode(text);
    const chunks: Uint8Array[] = [];
    for (const markerByte of this.startMarker) {
      chunks.push(Uint8Array.of(markerByte));
    }
    const normalizedMaximumPayloadChunkBytes = Math.max(1, maximumPayloadChunkBytes);
    for (
      let payloadOffset = 0;
      payloadOffset < payloadBytes.length;
      payloadOffset += normalizedMaximumPayloadChunkBytes
    ) {
      chunks.push(
        Uint8Array.from(
          payloadBytes.subarray(
            payloadOffset,
            payloadOffset + normalizedMaximumPayloadChunkBytes,
          ),
        ),
      );
    }
    for (const markerByte of this.endMarker) {
      chunks.push(Uint8Array.of(markerByte));
    }
    return chunks;
  }
}

export namespace BracketedPasteInput {
  export const $Class = $BracketedPasteInput;
  export const Class = Static($Class);
}
