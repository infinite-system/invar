import { Static } from 'ivue/extras';
import { DiffAlignment } from './DiffAlignment';

// Per-line editor gutter status against the active file's git HEAD blob. Alignment stays in the
// existing DiffAlignment capability; this projection only converts aligned rows into buffer-line
// decorations.
//
// invariant: The editor gutter reflects HEAD changes (src/modules/diff/diff.invariants.md)
class $GutterDiff {
  protected static get DiffAlignment() {
    return DiffAlignment.Class;
  }

  static statusByLine(
    headText: string,
    bufferText: string,
  ): Map<number, GutterDiffStatus> {
    const statusByLine = new Map<number, GutterDiffStatus>();
    if (headText === bufferText) return statusByLine;

    if (headText === '') {
      this.DiffAlignment.splitLines(bufferText).forEach(
        (_lineText, lineIndex) => {
          statusByLine.set(lineIndex, 'added');
        },
      );
      return statusByLine;
    }

    const { alignedRows } = this.DiffAlignment.align(headText, bufferText);
    for (const alignedRow of alignedRows) {
      if (
        alignedRow.rightLineNumber !== null &&
        (alignedRow.kind === 'added' || alignedRow.kind === 'modified')
      ) {
        statusByLine.set(
          alignedRow.rightLineNumber - 1,
          alignedRow.kind,
        );
      }
    }

    for (
      let alignedRowIndex = 0;
      alignedRowIndex < alignedRows.length;
      alignedRowIndex += 1
    ) {
      if (alignedRows[alignedRowIndex]?.kind !== 'deleted') continue;
      while (
        alignedRowIndex + 1 < alignedRows.length &&
        alignedRows[alignedRowIndex + 1]?.kind === 'deleted'
      ) {
        alignedRowIndex += 1;
      }

      const followingBufferLineNumber =
        alignedRows
          .slice(alignedRowIndex + 1)
          .find((alignedRow) => alignedRow.rightLineNumber !== null)
          ?.rightLineNumber ?? null;
      const bufferLineIndex =
        followingBufferLineNumber === null
          ? this.DiffAlignment.splitLines(bufferText).length - 1
          : followingBufferLineNumber - 1;
      if (bufferLineIndex >= 0 && !statusByLine.has(bufferLineIndex)) {
        statusByLine.set(bufferLineIndex, 'deleted');
      }
    }

    return statusByLine;
  }
}

export namespace GutterDiff {
  export const $Class = $GutterDiff;
  export const Class = Static($GutterDiff);
}

export type GutterDiffStatus = 'added' | 'modified' | 'deleted';
