import { Static } from 'ivue/extras';
import { TextByteCoordinates } from '../text/TextByteCoordinates';
import type { TextEdit } from '../text/TextEdit.interface';
import {
  type TextPatch,
  type TextPatchDirection,
  type TextPatchVerification,
} from './TextPatch';

/** Apply verified text patches to one byte source without filesystem or editor ownership. */
class $TextPatchApplication {
  static apply(
    sourceBytes: Uint8Array,
    verifiedPatches: readonly VerifiedTextPatch[],
    direction: TextPatchDirection,
  ): TextPatchApplicationResult {
    const orderedPatches = [...verifiedPatches].sort(
      (firstPatch, secondPatch) =>
        this.byteOffset(firstPatch) - this.byteOffset(secondPatch),
    );
    const finalByteOffsets = new Map<TextPatch.Instance, number>();
    const replacementChunks: Uint8Array[] = [];
    let sourceByteOffset = 0;
    let finalByteOffset = 0;
    for (const verifiedPatch of orderedPatches) {
      const subjectByteOffset = this.byteOffset(verifiedPatch);
      const subjectBytes = verifiedPatch.patch.subjectBytes(direction);
      const replacementBytes = verifiedPatch.patch.replacementBytes(direction);
      if (subjectByteOffset < sourceByteOffset) {
        throw new Error('Verified text patches overlap.');
      }
      const unchangedBytes = sourceBytes.slice(
        sourceByteOffset,
        subjectByteOffset,
      );
      replacementChunks.push(unchangedBytes, replacementBytes);
      finalByteOffset += unchangedBytes.byteLength;
      finalByteOffsets.set(verifiedPatch.patch, finalByteOffset);
      finalByteOffset += replacementBytes.byteLength;
      sourceByteOffset = subjectByteOffset + subjectBytes.byteLength;
    }
    replacementChunks.push(sourceBytes.slice(sourceByteOffset));
    const replacementByteLength = replacementChunks.reduce(
      (totalByteLength, replacementChunk) =>
        totalByteLength + replacementChunk.byteLength,
      0,
    );
    const replacementBytes = new Uint8Array(replacementByteLength);
    let writeByteOffset = 0;
    for (const replacementChunk of replacementChunks) {
      replacementBytes.set(replacementChunk, writeByteOffset);
      writeByteOffset += replacementChunk.byteLength;
    }
    return { bytes: replacementBytes, finalByteOffsets };
  }

  static textEdits(
    sourceBytes: Uint8Array,
    verifiedPatches: readonly VerifiedTextPatch[],
    direction: TextPatchDirection,
  ): readonly TextEdit[] {
    return verifiedPatches.map((verifiedPatch) => {
      const startByteOffset = this.byteOffset(verifiedPatch);
      const subjectBytes = verifiedPatch.patch.subjectBytes(direction);
      return {
        start: TextByteCoordinates.Class.positionAtByteOffset(
          sourceBytes,
          startByteOffset,
        ),
        end: TextByteCoordinates.Class.positionAtByteOffset(
          sourceBytes,
          startByteOffset + subjectBytes.byteLength,
        ),
        expectedText: TextByteCoordinates.Class.decode(subjectBytes),
        replacementText: TextByteCoordinates.Class.decode(
          verifiedPatch.patch.replacementBytes(direction),
        ),
      };
    });
  }

  protected static byteOffset(verifiedPatch: VerifiedTextPatch): number {
    const byteOffset = verifiedPatch.verification.byteOffset;
    if (byteOffset === undefined) {
      throw new Error('A text patch application requires verification.');
    }
    return byteOffset;
  }
}

export namespace TextPatchApplication {
  export const $Class = Static($TextPatchApplication);
  export let Class = $Class;
}

export interface VerifiedTextPatch {
  readonly patch: TextPatch.Instance;
  readonly verification: TextPatchVerification;
}

export interface TextPatchApplicationResult {
  readonly bytes: Uint8Array;
  readonly finalByteOffsets: ReadonlyMap<TextPatch.Instance, number>;
}
