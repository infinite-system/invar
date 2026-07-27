import { Static } from 'ivue/extras';
import { Highlighter, type LangId } from '../syntax/Highlighter';
import { EditorCoordinates } from './EditorCoordinates';

// Fold discovery is document work, not paint work. One revision-keyed snapshot is shared by the
// gutter, movement, and the visual-row generator; unchanged frames only read the cached array.
// invariant: Cost tracks the actively observed set (project.invariants.md)
class $CodeFolding {
  protected static get $rangesByDocument(): WeakMap<
    FoldableDocument,
    FoldRangeSnapshot
  > {
    const rangesByDocument = new WeakMap<FoldableDocument, FoldRangeSnapshot>();
    Object.defineProperty(this, '$rangesByDocument', {
      configurable: true,
      value: rangesByDocument,
    });
    return rangesByDocument;
  }

  protected static get MATCHING_OPENING_DELIMITER(): Readonly<
    Record<string, string>
  > {
    return { '}': '{', ']': '[' };
  }

  protected static get CLOSING_DELIMITER_FOR(): Readonly<
    Record<string, string>
  > {
    return { '{': '}', '[': ']' };
  }

  static ranges(
    document: FoldableDocument,
    language: LangId,
  ): readonly FoldRange[] {
    const revision = document.revision?.value ?? -1;
    const cached = this.$rangesByDocument.get(document);
    if (
      cached &&
      cached.revision === revision &&
      cached.language === language &&
      cached.lineCount === document.lineCount
    ) {
      return cached.ranges;
    }

    const ranges = this.computeRanges(document, language);
    this.$rangesByDocument.set(document, {
      revision,
      language,
      lineCount: document.lineCount,
      ranges,
      rangesByStartLine: new Map(
        ranges.map((range) => [range.startLine, range]),
      ),
    });
    return ranges;
  }

  static rangeAtLine(
    document: FoldableDocument,
    language: LangId,
    lineIndex: number,
  ): FoldRange | null {
    this.ranges(document, language);
    return (
      this.$rangesByDocument.get(document)?.rangesByStartLine.get(lineIndex) ??
      null
    );
  }

  protected static computeRanges(
    document: FoldableDocument,
    language: LangId,
  ): readonly FoldRange[] {
    const rangesByStartLine = new Map<number, FoldRange>();
    this.collectDelimiterRanges(document, language, rangesByStartLine);
    this.collectIndentationRanges(document, rangesByStartLine);
    return [...rangesByStartLine.values()].sort(
      (firstRange, secondRange) =>
        firstRange.startLine - secondRange.startLine ||
        secondRange.endLine - firstRange.endLine,
    );
  }

  protected static collectDelimiterRanges(
    document: FoldableDocument,
    language: LangId,
    rangesByStartLine: Map<number, FoldRange>,
  ): void {
    const delimiterStack: Array<{ delimiter: string; line: number }> = [];
    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
      const spans = Highlighter.Class.highlightLine(
        document.line(lineIndex),
        language,
      );
      for (const span of spans) {
        if (span.role !== 'operator') continue;
        for (const delimiter of span.text) {
          if (this.CLOSING_DELIMITER_FOR[delimiter]) {
            delimiterStack.push({ delimiter, line: lineIndex });
            continue;
          }
          const openingDelimiter = this.MATCHING_OPENING_DELIMITER[delimiter];
          if (!openingDelimiter) continue;
          const opening = delimiterStack[delimiterStack.length - 1];
          if (!opening || opening.delimiter !== openingDelimiter) continue;
          delimiterStack.pop();
          if (lineIndex > opening.line) {
            this.recordRange(rangesByStartLine, {
              startLine: opening.line,
              endLine: lineIndex,
              kind: 'delimiter',
            });
          }
        }
      }
    }
  }

  protected static collectIndentationRanges(
    document: FoldableDocument,
    rangesByStartLine: Map<number, FoldRange>,
  ): void {
    const contentLines: Array<{ lineIndex: number; indentation: number }> = [];
    for (let lineIndex = 0; lineIndex < document.lineCount; lineIndex++) {
      const lineText = document.line(lineIndex);
      if (lineText.trim().length === 0) continue;
      contentLines.push({
        lineIndex,
        indentation: this.indentationColumns(lineText),
      });
    }

    const openRanges: Array<{ startLine: number; indentation: number }> = [];
    for (
      let contentIndex = 1;
      contentIndex < contentLines.length;
      contentIndex++
    ) {
      const previous = contentLines[contentIndex - 1];
      const current = contentLines[contentIndex];
      if (!previous || !current) continue;
      while (
        openRanges.length > 0 &&
        (openRanges.at(-1)?.indentation ?? -1) >= current.indentation
      ) {
        const completed = openRanges.pop();
        if (completed) {
          this.recordRange(rangesByStartLine, {
            startLine: completed.startLine,
            endLine: current.lineIndex - 1,
            kind: 'indentation',
          });
        }
      }
      if (current.indentation > previous.indentation) {
        openRanges.push({
          startLine: previous.lineIndex,
          indentation: previous.indentation,
        });
      }
    }
    while (openRanges.length > 0) {
      const completed = openRanges.pop();
      if (completed) {
        this.recordRange(rangesByStartLine, {
          startLine: completed.startLine,
          endLine: document.lineCount - 1,
          kind: 'indentation',
        });
      }
    }
  }

  protected static indentationColumns(lineText: string): number {
    const leadingWhitespace = lineText.match(/^[ \t]*/)?.[0] ?? '';
    return EditorCoordinates.Class.lineWidth(leadingWhitespace);
  }

  protected static recordRange(
    rangesByStartLine: Map<number, FoldRange>,
    range: FoldRange,
  ): void {
    const existing = rangesByStartLine.get(range.startLine);
    if (!existing || range.endLine > existing.endLine) {
      rangesByStartLine.set(range.startLine, range);
    }
  }
}

export namespace CodeFolding {
  export const $Class = $CodeFolding;
  export const Class = Static($CodeFolding);
}

export interface FoldRange {
  readonly startLine: number;
  readonly endLine: number;
  readonly kind: 'delimiter' | 'indentation';
}

export interface FoldableDocument {
  readonly lineCount: number;
  line(index: number): string;
  readonly revision?: { readonly value: number };
}

export interface FoldRangeSnapshot {
  readonly revision: number;
  readonly language: LangId;
  readonly lineCount: number;
  readonly ranges: readonly FoldRange[];
  readonly rangesByStartLine: ReadonlyMap<number, FoldRange>;
}
