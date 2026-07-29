import { Static } from 'ivue/extras';
import { Highlighter, type LangId } from '../syntax/Highlighter';
import { TextCoordinates } from '../text/TextCoordinates';
import type { DocumentFoldRange } from '../text/DocumentFoldState.interface';

// Fold discovery is proportional to what asks for it: gutter paint caches exact ranges only for
// visible starts, while whole-document commands share the global snapshot.
// invariant: Cost tracks the actively observed set (project.invariants.md)
class $CodeFolding {
  protected static get $rangesByDocument(): WeakMap<
    FoldableDocument,
    FoldRangeSnapshot
  > {
    const rangesByDocument = new WeakMap<FoldableDocument, FoldRangeSnapshot>();
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

  protected static snapshot(
    document: FoldableDocument,
    language: LangId,
  ): FoldRangeSnapshot {
    const revision = document.revision?.value ?? -1;
    const cached = this.$rangesByDocument.get(document);
    if (
      cached &&
      cached.language === language &&
      cached.lineCount === document.lineCount &&
      (cached.revision === revision ||
        this.canReuseFoldStructure(cached, document, language, revision))
    ) {
      cached.revision = revision;
      return cached;
    }
    const snapshot: FoldRangeSnapshot = {
      revision,
      language,
      lineCount: document.lineCount,
      ranges: null,
      rangesByStartLine: new Map(),
    };
    this.$rangesByDocument.set(document, snapshot);
    return snapshot;
  }

  static ranges(
    document: FoldableDocument,
    language: LangId,
  ): readonly FoldRange[] {
    const snapshot = this.snapshot(document, language);
    if (snapshot.ranges !== null) return snapshot.ranges;
    snapshot.ranges = this.computeRanges(document, language).map((range) => {
      const locallyDiscoveredRange = snapshot.rangesByStartLine.get(
        range.startLine,
      );
      const publishedRange =
        locallyDiscoveredRange !== null &&
        locallyDiscoveredRange !== undefined &&
        locallyDiscoveredRange.endLine === range.endLine &&
        locallyDiscoveredRange.kind === range.kind
          ? locallyDiscoveredRange
          : range;
      snapshot.rangesByStartLine.set(range.startLine, publishedRange);
      return publishedRange;
    });
    return snapshot.ranges;
  }

  static rangeAtLine(
    document: FoldableDocument,
    language: LangId,
    lineIndex: number,
  ): FoldRange | null {
    const snapshot = this.snapshot(document, language);
    if (snapshot.rangesByStartLine.has(lineIndex)) {
      return snapshot.rangesByStartLine.get(lineIndex) ?? null;
    }
    const range = this.discoverRangeAtLine(
      document,
      language,
      lineIndex,
      snapshot.rangesByStartLine,
    );
    snapshot.rangesByStartLine.set(lineIndex, range);
    return range;
  }

  /** Whether a visible line begins a fold. Only the observed gutter line is
   *  discovered, then its exact range survives non-structural revisions. */
  static startsAtLine(
    document: FoldableDocument,
    language: LangId,
    lineIndex: number,
  ): boolean {
    return this.rangeAtLine(document, language, lineIndex) !== null;
  }

  protected static canReuseFoldStructure(
    cached: FoldRangeSnapshot,
    document: FoldableDocument,
    language: LangId,
    revision: number,
  ): boolean {
    const lineChange = document.lastLineChange;
    return (
      cached.language === language &&
      cached.lineCount === document.lineCount &&
      lineChange?.revision === revision &&
      lineChange.deletedLineCount === lineChange.insertedLineCount &&
      this.foldStructureUnchanged(lineChange, language)
    );
  }

  protected static discoverRangeAtLine(
    document: FoldableDocument,
    language: LangId,
    lineIndex: number,
    rangesByStartLine: Map<number, FoldRange | null>,
  ): FoldRange | null {
    if (lineIndex < 0 || lineIndex >= document.lineCount) return null;
    const lineText = document.line(lineIndex);
    if (lineText.trim().length === 0) return null;
    const delimiterStack: Array<{ delimiter: string; lineIndex: number }> = [];
    this.collectDelimiterRangesFromLine(
      delimiterStack,
      rangesByStartLine,
      lineText,
      language,
      lineIndex,
    );
    if (delimiterStack.length > 0) {
      for (
        let candidateLineIndex = lineIndex + 1;
        candidateLineIndex < document.lineCount;
        candidateLineIndex++
      ) {
        this.collectDelimiterRangesFromLine(
          delimiterStack,
          rangesByStartLine,
          document.line(candidateLineIndex),
          language,
          candidateLineIndex,
        );
        if (delimiterStack.length === 0)
          return rangesByStartLine.get(lineIndex) ?? null;
      }
    }
    const indentation = this.indentationColumns(lineText);
    let indentationIncreased = false;
    for (
      let candidateLineIndex = lineIndex + 1;
      candidateLineIndex < document.lineCount;
      candidateLineIndex++
    ) {
      const candidateLine = document.line(candidateLineIndex);
      if (candidateLine.trim().length === 0) continue;
      if (!indentationIncreased) {
        if (this.indentationColumns(candidateLine) <= indentation) return null;
        indentationIncreased = true;
        continue;
      }
      if (this.indentationColumns(candidateLine) <= indentation) {
        return {
          startLine: lineIndex,
          endLine: candidateLineIndex - 1,
          kind: 'indentation',
        };
      }
    }
    return indentationIncreased
      ? {
          startLine: lineIndex,
          endLine: document.lineCount - 1,
          kind: 'indentation',
        }
      : null;
  }

  protected static collectDelimiterRangesFromLine(
    delimiterStack: Array<{ delimiter: string; lineIndex: number }>,
    rangesByStartLine: Map<number, FoldRange | null>,
    lineText: string,
    language: LangId,
    lineIndex: number,
  ): void {
    for (const span of Highlighter.Class.highlightLine(lineText, language)) {
      if (span.role !== 'operator') continue;
      for (const delimiter of span.text) {
        if (this.CLOSING_DELIMITER_FOR[delimiter]) {
          delimiterStack.push({ delimiter, lineIndex });
          continue;
        }
        const openingDelimiter = this.MATCHING_OPENING_DELIMITER[delimiter];
        const opening = delimiterStack.at(-1);
        if (!openingDelimiter || opening?.delimiter !== openingDelimiter)
          continue;
        delimiterStack.pop();
        if (lineIndex <= opening.lineIndex) continue;
        const existingRange = rangesByStartLine.get(opening.lineIndex);
        if (!existingRange || lineIndex > existingRange.endLine) {
          rangesByStartLine.set(opening.lineIndex, {
            startLine: opening.lineIndex,
            endLine: lineIndex,
            kind: 'delimiter',
          });
        }
      }
    }
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

  protected static foldStructureUnchanged(
    lineChange: FoldableLineChange,
    language: LangId,
  ): boolean {
    for (
      let changedLineOffset = 0;
      changedLineOffset < lineChange.insertedLineCount;
      changedLineOffset++
    ) {
      const deletedLine = lineChange.deletedLines[changedLineOffset] ?? '';
      const insertedLine = lineChange.insertedLines[changedLineOffset] ?? '';
      if (
        this.foldStructureSignature(deletedLine, language) !==
        this.foldStructureSignature(insertedLine, language)
      ) {
        return false;
      }
    }
    return true;
  }

  protected static foldStructureSignature(
    lineText: string,
    language: LangId,
  ): string {
    if (lineText.trim().length === 0) return 'blank';
    let delimiters = '';
    for (const span of Highlighter.Class.highlightLine(lineText, language)) {
      if (span.role !== 'operator') continue;
      for (const character of span.text) {
        if (
          this.CLOSING_DELIMITER_FOR[character] ||
          this.MATCHING_OPENING_DELIMITER[character]
        ) {
          delimiters += character;
        }
      }
    }
    return `${this.indentationColumns(lineText)}:${delimiters}`;
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
    return TextCoordinates.Class.lineWidth(leadingWhitespace);
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
  export const $Class = Static($CodeFolding);
  export let Class = $Class;
}

/** A foldable region is a DOCUMENT range; the view adds no coordinate of its own. */
export type FoldRange = DocumentFoldRange;

export interface FoldableDocument {
  readonly lineCount: number;
  line(index: number): string;
  readonly revision?: { readonly value: number };
  readonly lastLineChange?: FoldableLineChange | null;
}

export interface FoldableLineChange {
  readonly deletedLineCount: number;
  readonly deletedLines: readonly string[];
  readonly insertedLineCount: number;
  readonly insertedLines: readonly string[];
  readonly revision: number;
}

export interface FoldRangeSnapshot {
  revision: number;
  readonly language: LangId;
  readonly lineCount: number;
  ranges: readonly FoldRange[] | null;
  readonly rangesByStartLine: Map<number, FoldRange | null>;
}
