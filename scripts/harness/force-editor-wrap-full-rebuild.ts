// Positive-control preload for the large-file editing instrument. Once per
// revision it reproduces the pre-fix work that the current index deliberately
// cannot perform: document-sized line-text/row-count/fold-projection/prefix
// arrays plus per-line no-wrap segmentation. It then gives the production
// implementation a fresh projection-neutral fold-set identity, forcing its
// full-build branch too. This is intentionally expensive: the scale
// instrument must prove that it can see the removed defect.
import type { FoldRange } from '../../src/modules/editor/CodeFolding';
import {
  EditorWrap,
  type DocumentWrapIndex,
  type WrappableDocument,
} from '../../src/modules/editor/EditorWrap';

class $ForcedFullRebuildEditorWrap extends EditorWrap.$Class {
  protected static readonly legacyIndexByDocument = new WeakMap<
    WrappableDocument,
    {
      readonly lineTexts: readonly string[];
      readonly prefix: readonly number[];
      readonly revision: number;
      readonly rowCounts: readonly number[];
      readonly visibleLineByLine: readonly number[];
    }
  >();

  protected static readonly forcedFoldRangesByDocument = new WeakMap<
    WrappableDocument,
    {
      readonly revision: number;
      readonly foldedRanges: readonly FoldRange[];
    }
  >();

  protected static override syncWrapIndex(
    document: WrappableDocument,
    wrapWidth: number | null,
    foldedRanges: readonly FoldRange[] = [],
  ): DocumentWrapIndex {
    const revision = document.revision?.value ?? -1;
    const previous = this.forcedFoldRangesByDocument.get(document);
    if (previous?.revision === revision) {
      return super.syncWrapIndex(document, wrapWidth, previous.foldedRanges);
    }
    this.performLegacyFullRebuild(document, wrapWidth, revision);
    const nextFoldRanges =
      foldedRanges.length === 0
        ? [
            {
              startLine: document.lineCount,
              endLine: document.lineCount,
              kind: 'delimiter' as const,
            },
          ]
        : [...foldedRanges];
    this.forcedFoldRangesByDocument.set(document, {
      foldedRanges: nextFoldRanges,
      revision,
    });
    return super.syncWrapIndex(document, wrapWidth, nextFoldRanges);
  }

  protected static performLegacyFullRebuild(
    document: WrappableDocument,
    wrapWidth: number | null,
    revision: number,
  ): void {
    const lineTexts: string[] = new Array(document.lineCount);
    const rowCounts: number[] = new Array(document.lineCount);
    const visibleLineByLine: number[] = new Array(document.lineCount);
    const prefix: number[] = new Array(document.lineCount + 1);
    prefix[0] = 0;
    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
      const lineText = document.line(lineIndex);
      lineTexts[lineIndex] = lineText;
      visibleLineByLine[lineIndex] = lineIndex;
      const rowCount = this.segmentsForLine(lineText, wrapWidth).length;
      rowCounts[lineIndex] = rowCount;
      prefix[lineIndex + 1] = (prefix[lineIndex] ?? 0) + rowCount;
    }
    this.legacyIndexByDocument.set(document, {
      lineTexts,
      prefix,
      revision,
      rowCounts,
      visibleLineByLine,
    });
  }
}

EditorWrap.Class = $ForcedFullRebuildEditorWrap;
