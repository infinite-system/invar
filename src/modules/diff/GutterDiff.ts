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

  static marksByLine(
    headText: string,
    bufferText: string,
  ): Map<number, GutterDiffMark[]> {
    const marksByLine = new Map<number, GutterDiffMark[]>();
    if (headText === bufferText) return marksByLine;

    if (headText === '') {
      this.DiffAlignment.splitLines(bufferText).forEach(
        (_lineText, lineIndex) => {
          marksByLine.set(lineIndex, [{ kind: 'added', hoverLabel: 'added' }]);
        },
      );
      return marksByLine;
    }

    const { alignedRows } = this.DiffAlignment.align(headText, bufferText);
    for (const alignedRow of alignedRows) {
      if (
        alignedRow.rightLineNumber !== null &&
        (alignedRow.kind === 'added' || alignedRow.kind === 'modified')
      ) {
        marksByLine.set(alignedRow.rightLineNumber - 1, [
          {
            kind: alignedRow.kind,
            hoverLabel: alignedRow.kind,
          },
        ]);
      }
    }

    for (
      let alignedRowIndex = 0;
      alignedRowIndex < alignedRows.length;
      alignedRowIndex += 1
    ) {
      if (alignedRows[alignedRowIndex]?.kind !== 'deleted') continue;
      const firstDeletedRowIndex = alignedRowIndex;
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
      if (bufferLineIndex >= 0) {
        const deletedLineCount = alignedRowIndex - firstDeletedRowIndex + 1;
        const marks = marksByLine.get(bufferLineIndex) ?? [];
        const deletionSitsWithChangedLine = marks.length > 0;
        marks.push({
          kind: 'deleted',
          hoverLabel: `${deletedLineCount} ${
            deletedLineCount === 1 ? 'line' : 'lines'
          } deleted ${
            followingBufferLineNumber === null && !deletionSitsWithChangedLine
              ? 'at end of file'
              : 'above'
          }`,
          deletedLineCount,
        });
        marksByLine.set(bufferLineIndex, marks);
      }
    }

    return marksByLine;
  }
}

export namespace GutterDiff {
  export const $Class = Static($GutterDiff);
  export let Class = $Class;
}

export interface GutterDiffMark {
  readonly kind: GutterDiffStatus;
  readonly hoverLabel: string;
  readonly deletedLineCount?: number;
}

export type GutterDiffStatus = 'added' | 'modified' | 'deleted';
