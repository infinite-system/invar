import { StyledText, fg, bg, bold, type TextChunk } from '@opentui/core';
import { Static } from 'ivue/extras';
import type { Palette } from '../theme/ThemePalettes';
import type { ProjectedLine } from './AgentTranscriptProjection';
import type { TranscriptMatchHighlight } from './AgentTranscriptSearch';
import type { ComposerRow } from './AgentComposer';
import type { ThinkingSegment } from './AgentThinkingIndicator';
import { WrapText } from '../ui/WrapText';

// invariant: The transcript is the single source of agent session truth (src/modules/agent/agent.invariants.md)
// invariant: Agent footer stays within its pane (src/modules/agent/agent.invariants.md)

class $AgentPaneRenderer {
  protected static pushHighlighted(
    chunks: TextChunk[],
    text: string,
    selection: SelectionRange | null,
    paint: (text: string) => TextChunk,
    palette: Palette,
  ): void {
    if (!selection || selection.end <= selection.start) {
      chunks.push(paint(text));
      return;
    }
    const before = WrapText.Class.sliceByDisplayCells(text, 0, selection.start);
    const selected = WrapText.Class.sliceByDisplayCells(
      text,
      selection.start,
      selection.end,
    );
    const after = WrapText.Class.sliceByDisplayCells(
      text,
      selection.end,
      Number.MAX_SAFE_INTEGER,
    );
    if (before) chunks.push(paint(before));
    chunks.push(bg(palette.selection)(fg(palette.fg)(selected)));
    if (after) chunks.push(paint(after));
  }

  /** Paint one transcript body row carrying BOTH a selection span and search-match spans: segment the row
   *  at every span boundary (all DISPLAY CELLS, sliced grapheme-safe through the shared WrapText seam) and
   *  give each segment its one single-ROW background — selection wins, then the current match (selection
   *  colour, it IS the focus), then other matches (the editor's dim find-match background), then plain. */
  protected static pushSearchHighlightedRow(
    chunks: TextChunk[],
    text: string,
    selection: SelectionRange | null,
    searchHighlights: readonly TranscriptMatchHighlight[],
    paint: (text: string) => TextChunk,
    palette: Palette,
  ): void {
    const selectionActive =
      selection !== null && selection.end > selection.start;
    if (!selectionActive && searchHighlights.length === 0) {
      chunks.push(paint(text));
      return;
    }
    const totalCells = WrapText.Class.displayWidth(text);
    const clampCell = (cell: number): number =>
      Math.max(0, Math.min(cell, totalCells));
    const boundarySet = new Set<number>([0, totalCells]);
    if (selectionActive) {
      boundarySet.add(clampCell(selection.start));
      boundarySet.add(clampCell(selection.end));
    }
    for (const highlight of searchHighlights) {
      boundarySet.add(clampCell(highlight.startCell));
      boundarySet.add(clampCell(highlight.endCell));
    }
    const boundaries = [...boundarySet].sort((first, second) => first - second);
    for (
      let boundaryIndex = 0;
      boundaryIndex + 1 < boundaries.length;
      boundaryIndex += 1
    ) {
      const segmentStart = boundaries[boundaryIndex]!;
      const segmentEnd = boundaries[boundaryIndex + 1]!;
      const segmentText = WrapText.Class.sliceByDisplayCells(
        text,
        segmentStart,
        segmentEnd,
      );
      if (!segmentText) continue;
      const covers = (spanStart: number, spanEnd: number): boolean =>
        spanStart < segmentEnd && spanEnd > segmentStart;
      if (selectionActive && covers(selection.start, selection.end)) {
        chunks.push(bg(palette.selection)(fg(palette.fg)(segmentText)));
      } else if (
        searchHighlights.some(
          (highlight) =>
            highlight.current && covers(highlight.startCell, highlight.endCell),
        )
      ) {
        chunks.push(bg(palette.selection)(fg(palette.fg)(segmentText)));
      } else if (
        searchHighlights.some((highlight) =>
          covers(highlight.startCell, highlight.endCell),
        )
      ) {
        chunks.push(bg(palette.cursorLine)(paint(segmentText)));
      } else {
        chunks.push(paint(segmentText));
      }
    }
  }

  /** Paint pre-composed styled segments (thinking line / mode line). */
  protected static pushSegments(
    chunks: TextChunk[],
    segments: readonly ThinkingSegment[],
  ): void {
    for (const segment of segments) {
      chunks.push(
        segment.bold
          ? bold(fg(segment.color)(segment.text))
          : fg(segment.color)(segment.text),
      );
    }
  }

  static render(context: AgentPaneRenderContext): StyledText {
    const {
      palette,
      padLeft,
      bodyRows,
      selectionRanges,
      searchHighlights,
      thinking,
      waitingNote,
      rule,
      composer,
      modeLine,
      focused,
    } = context;
    const chunks: TextChunk[] = [];
    const leftPad = ' '.repeat(Math.max(0, padLeft));

    // Transcript body (padded left), each row with its single-row selection + search-match highlights.
    bodyRows.forEach((line, index) => {
      if (leftPad) chunks.push(fg(palette.fg)(leftPad));
      const paint = (text: string): TextChunk =>
        line.bold ? bold(fg(line.color)(text)) : fg(line.color)(text);
      this.pushSearchHighlightedRow(
        chunks,
        line.text,
        selectionRanges[index] ?? null,
        searchHighlights[index] ?? [],
        paint,
        palette,
      );
      chunks.push(fg(palette.fg)('\n'));
    });

    // Focus colour drives the prompt AND the frame rules together — accent while the pane owns the
    // keyboard, dim on blur — so the whole composer frame reads as one focused unit.
    const promptColor = focused ? palette.accent : palette.dim;

    // The animated thinking line, breathing-room ABOVE it and exactly one spacer below (the user-specced
    // rhythm: blank · thinking · blank · rule). Idle keeps the original two spacers so the frame sits at
    // the same airy distance from the transcript either way (total chrome height is unchanged by busy).
    if (thinking) {
      chunks.push(fg(palette.fg)('\n')); // blank ABOVE the thinking line
      if (leftPad) chunks.push(fg(palette.fg)(leftPad));
      this.pushSegments(chunks, thinking);
      chunks.push(fg(palette.fg)('\n'));
    }
    // The calm secondary waiting-note, after a blank-line gap (airy Claude spacing).
    if (waitingNote) {
      chunks.push(fg(palette.fg)('\n'));
      if (leftPad) chunks.push(fg(palette.fg)(leftPad));
      this.pushSegments(chunks, waitingNote);
      chunks.push(fg(palette.fg)('\n'));
    }

    // Composer frame: spacer(s), an (inset) top rule, the wrapped composer rows (inset), a bottom rule,
    // the mode line flush with the pane bottom.
    chunks.push(fg(palette.fg)('\n')); // blank spacer (always)
    if (!thinking) chunks.push(fg(palette.fg)('\n')); // second spacer only when idle (busy already led with one)
    if (leftPad) chunks.push(fg(palette.fg)(leftPad));
    chunks.push(fg(promptColor)(rule));
    chunks.push(fg(palette.fg)('\n'));
    composer.forEach((row) => {
      if (leftPad) chunks.push(fg(palette.fg)(leftPad));
      chunks.push(fg(promptColor)(row.isFirstLine ? '❯ ' : '  '));
      this.pushHighlighted(
        chunks,
        row.text,
        row.selection,
        (text) => fg(palette.fg)(text),
        palette,
      );
      chunks.push(fg(palette.fg)('\n'));
    });

    if (leftPad) chunks.push(fg(palette.fg)(leftPad));
    chunks.push(fg(promptColor)(rule));
    chunks.push(fg(palette.fg)('\n'));
    this.pushSegments(chunks, modeLine);

    return new StyledText(chunks);
  }
}

export namespace AgentPaneRenderer {
  export const $Class = Static($AgentPaneRenderer);
  export let Class = $Class;
}

export interface SelectionRange {
  readonly start: number;
  readonly end: number;
}

export interface AgentPaneRenderContext {
  palette: Palette;
  padLeft: number;
  bodyRows: readonly ProjectedLine[];
  selectionRanges: readonly (SelectionRange | null)[];
  searchHighlights: readonly (readonly TranscriptMatchHighlight[])[];
  thinking: readonly ThinkingSegment[] | null;
  waitingNote: readonly ThinkingSegment[] | null;
  rule: string;
  composer: readonly ComposerRow[];
  modeLine: readonly ThinkingSegment[];
  focused: boolean;
}
