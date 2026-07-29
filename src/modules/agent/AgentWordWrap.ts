import { Static } from 'ivue/extras';
import { WrapBreakOpportunity } from '../text/WrapBreakOpportunity';
import { TextSegmentation } from '../system/TextSegmentation';
import {
  WrapText,
  type WrapSegment,
  type VisualPosition,
} from '../ui/WrapText';

// invariant: Agent text wraps at word boundaries (src/modules/agent/agent.invariants.md)
// invariant: Seams are drawn at the shared generator (project.invariants.md)
// invariant: Wrapped surfaces share one break generator (project.invariants.md)
class $AgentWordWrap {
  protected static cellWidthOf(grapheme: string): number {
    return grapheme === '\t' ? 1 : WrapText.Class.displayWidth(grapheme);
  }

  protected static tokenRuns(text: string): AgentWordWrapToken[] {
    const tokens: AgentWordWrapToken[] = [];
    for (const wordSegment of TextSegmentation.Class.words(text)) {
      const isWhitespace =
        WrapBreakOpportunity.Class.breakKindBetween(
          wordSegment.text,
          undefined,
          'prose',
        ) === 'whitespace';
      const previousToken = tokens[tokens.length - 1];
      if (previousToken?.isWhitespace === isWhitespace) {
        previousToken.text += wordSegment.text;
      } else {
        tokens.push({ text: wordSegment.text, isWhitespace });
      }
    }
    return tokens;
  }

  protected static wordChunks(word: string, width: number): string[] {
    const graphemes = TextSegmentation.Class.graphemes(word);
    const wordWidth = WrapText.Class.displayWidth(word);
    if (wordWidth <= width) return [word];

    const chunks: string[] = [];
    let graphemeStart = 0;
    while (graphemeStart < graphemes.length) {
      let graphemeEnd = graphemeStart;
      let displayWidth = 0;
      while (graphemeEnd < graphemes.length) {
        const grapheme = graphemes[graphemeEnd]!;
        const graphemeWidth = this.cellWidthOf(grapheme);
        if (
          graphemeEnd > graphemeStart &&
          displayWidth + graphemeWidth > width
        ) {
          break;
        }
        if (graphemeEnd === graphemeStart && graphemeWidth > width) {
          graphemeEnd += 1;
          break;
        }
        displayWidth += graphemeWidth;
        graphemeEnd += 1;
      }

      if (graphemeEnd < graphemes.length) {
        const preferredBreak =
          WrapBreakOpportunity.Class.previousBreakOpportunity(
            graphemes,
            graphemeStart,
            graphemeEnd,
            'prose',
          );
        if (preferredBreak > graphemeStart) {
          graphemeEnd = preferredBreak;
        }
      }
      chunks.push(graphemes.slice(graphemeStart, graphemeEnd).join(''));
      graphemeStart = graphemeEnd;
    }
    return chunks;
  }

  protected static logicalLineSegments(
    logicalLine: string,
    logicalLineIndex: number,
    graphemeOffset: number,
    width: number,
  ): AgentWordWrapSegment[] {
    if (logicalLine.length === 0) {
      return [
        {
          text: '',
          sourceText: '',
          logicalLine: logicalLineIndex,
          isLogicalLineStart: true,
          graphemeStart: graphemeOffset,
          graphemeCount: 0,
          displayWidth: 0,
        },
      ];
    }

    const segments: AgentWordWrapSegment[] = [];
    let rowText = '';
    let rowSourceText = '';
    let rowDisplayWidth = 0;
    let rowGraphemeStart = graphemeOffset;
    let isFirstRow = true;
    let pendingWhitespace = '';

    const flushRow = (): void => {
      segments.push({
        text: rowText,
        sourceText: rowSourceText,
        logicalLine: logicalLineIndex,
        isLogicalLineStart: isFirstRow,
        graphemeStart: rowGraphemeStart,
        graphemeCount: TextSegmentation.Class.graphemes(rowSourceText).length,
        displayWidth: rowDisplayWidth,
      });
      rowGraphemeStart +=
        TextSegmentation.Class.graphemes(rowSourceText).length;
      rowText = '';
      rowSourceText = '';
      rowDisplayWidth = 0;
      isFirstRow = false;
    };

    const appendVisible = (text: string): void => {
      rowText += text;
      rowSourceText += text;
      rowDisplayWidth += WrapText.Class.displayWidth(text);
    };

    const appendTrailingWhitespace = (whitespace: string): void => {
      for (const grapheme of TextSegmentation.Class.graphemes(whitespace)) {
        const graphemeWidth = this.cellWidthOf(grapheme);
        if (
          rowSourceText.length > 0 &&
          rowDisplayWidth + graphemeWidth > width
        ) {
          flushRow();
        }
        appendVisible(grapheme);
      }
    };

    for (const token of this.tokenRuns(logicalLine)) {
      if (token.isWhitespace) {
        pendingWhitespace += token.text;
        continue;
      }

      const tokenWidth = WrapText.Class.displayWidth(token.text);
      const pendingWhitespaceWidth =
        WrapText.Class.displayWidth(pendingWhitespace);
      if (
        rowSourceText.length > 0 &&
        tokenWidth <= width &&
        rowDisplayWidth + pendingWhitespaceWidth + tokenWidth <= width
      ) {
        appendVisible(pendingWhitespace);
        pendingWhitespace = '';
        appendVisible(token.text);
        continue;
      }

      if (rowSourceText.length > 0) {
        rowSourceText += pendingWhitespace;
        pendingWhitespace = '';
        flushRow();
      } else if (pendingWhitespace.length > 0) {
        appendTrailingWhitespace(pendingWhitespace);
        pendingWhitespace = '';
        if (rowSourceText.length > 0 && rowDisplayWidth + tokenWidth > width) {
          flushRow();
        }
      }

      const chunks = this.wordChunks(token.text, width);
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
        appendVisible(chunks[chunkIndex]!);
        if (chunkIndex < chunks.length - 1) flushRow();
      }
    }

    if (pendingWhitespace.length > 0) {
      appendTrailingWhitespace(pendingWhitespace);
    }
    if (rowSourceText.length > 0 || segments.length === 0) flushRow();
    return segments;
  }

  static segments(text: string, width: number): AgentWordWrapSegment[] {
    const segments: AgentWordWrapSegment[] = [];
    const displayWidth = Math.max(1, width);
    let graphemeOffset = 0;
    const logicalLines = text.split('\n');
    for (
      let logicalLineIndex = 0;
      logicalLineIndex < logicalLines.length;
      logicalLineIndex += 1
    ) {
      const logicalLine = logicalLines[logicalLineIndex]!;
      segments.push(
        ...this.logicalLineSegments(
          logicalLine,
          logicalLineIndex,
          graphemeOffset,
          displayWidth,
        ),
      );
      graphemeOffset +=
        TextSegmentation.Class.graphemes(logicalLine).length + 1;
    }
    return segments;
  }

  static wrap(text: string, width: number): string[] {
    return this.segments(text, width).map((segment) => segment.text);
  }

  static visualPositionOf(
    segments: readonly AgentWordWrapSegment[],
    graphemeIndex: number,
  ): VisualPosition {
    return WrapText.Class.visualPositionOf(segments, graphemeIndex);
  }

  static graphemeAtVisualPosition(
    segments: readonly AgentWordWrapSegment[],
    line: number,
    column: number,
  ): number {
    return WrapText.Class.graphemeAtVisualPosition(segments, line, column);
  }
}

export namespace AgentWordWrap {
  export const $Class = Static($AgentWordWrap);
  export let Class = $Class;
}

export interface AgentWordWrapSegment extends WrapSegment {
  readonly sourceText: string;
}

interface AgentWordWrapToken {
  text: string;
  readonly isWhitespace: boolean;
}
