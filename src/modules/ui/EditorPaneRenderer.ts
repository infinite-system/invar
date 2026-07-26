// The editor pane renderer: the gutter (line numbers + diff markers) and the code body, in both
// wrap and no-wrap modes, with syntax highlighting and find-match backgrounds. Extracted from
// RootView's closure so the editor render lives with its own contracts (smoke-editor, smoke-wrap,
// smoke-gutter-diff, smoke-find) instead of inside the god-view.
//
// Wrap mode produces the VISUAL-ROW WINDOW (wrapRowsWindow) that the caret block, applySelection,
// and the mouse hit-test all read, so — like the other pane renderers — render() RETURNS that window
// and RootView stores it (the shared source of truth). No closure capture, no state held here.
//
// invariant: Word wrap is a pure view mapping (src/modules/editor/editor.invariants.md)
// invariant: The editor gutter reflects HEAD changes (src/modules/diff/diff.invariants.md)
// invariant: Cost tracks the actively observed set (project.invariants.md)
import {
  StyledText,
  fg,
  bg,
  bold,
  underline,
  type TextChunk,
} from '@opentui/core';
import { Static } from 'ivue/extras';
import { EditorCoordinates } from '../editor/EditorCoordinates';
import { EditorWrap, type VisualRow } from '../editor/EditorWrap';
import { Highlighter, type Role, type Span } from '../syntax/Highlighter';
import type { BracketCell } from '../editor/BracketMatch';
import { LanguageRegistry } from '../syntax/LanguageRegistry';
import type { Palette } from '../theme/ThemePalettes';
import type { Workspace } from '../workspace/Workspace';
import type { FindInBuffer } from '../search/FindInBuffer';
import type {
  EditorDecorationColor,
  EditorLineDecoration,
} from '../workspace/GutterDecorations';
class $EditorPaneRenderer {
  protected static get indentGuideTabWidth() {
    return 4;
  }
  protected static roleColor(role: Role, palette: Palette): string {
    switch (role) {
      case 'keyword':
        return palette.keyword;
      case 'string':
        return palette.string;
      case 'number':
        return palette.number;
      case 'comment':
        return palette.comment;
      case 'func':
        return palette.func;
      case 'type':
        return palette.type;
      case 'operator':
        return palette.operator;
      case 'added':
        return palette.added;
      case 'removed':
        return palette.deleted;
      default:
        return palette.fg;
    }
  }
  public static render(
    context: EditorPaneRenderContext,
  ): EditorPaneRender | null {
    const { workspace, palette } = context;
    if (workspace.showingDiff.value) return null;
    const editor = workspace.editor;
    if (!editor.hasDocument.value) return null;
    const language = LanguageRegistry.Class.forPath(editor.document.path);
    const height = context.viewportHeight;
    const top = editor.viewport.scrollTop.value;
    const visibleLines = editor.document.slice(top, height);
    const lineNumberWidth = String(editor.document.lineCount).length + 1;
    const currentLineIndex = editor.cursor.line.value;
    const focused = workspace.focus.value === 'editor';
    const documentHandle = workspace.activeDocumentHandle;
    const decorationsByLine = documentHandle
      ? workspace.gutterDecorations.byLine(documentHandle)
      : new Map<number, EditorLineDecoration[]>();
    const gutterChunks: TextChunk[] = [];
    const codeChunks: TextChunk[] = [];
    const decorationColor = (color: EditorDecorationColor): string => {
      if (color === 'added') return palette.added;
      if (color === 'modified') return palette.modified;
      if (color === 'deleted') return palette.deleted;
      if (color === 'error') return palette.error;
      if (color === 'warning') return palette.warning;
      return palette.info;
    };
    // invariant: TS diagnostics render as a gutter mark and an underline (src/modules/ui/ui.invariants.md)
    const pushGutterMarker = (
      lineIndex: number,
      isCurrentLine: boolean,
    ): void => {
      const decoration = decorationsByLine
        .get(lineIndex)
        ?.toSorted(
          (first, second) => second.gutter.priority - first.gutter.priority,
        )[0];
      if (!decoration) {
        gutterChunks.push(
          fg(palette.accent)(isCurrentLine && focused ? '▏' : ' '),
        );
        return;
      }
      gutterChunks.push(
        fg(decorationColor(decoration.gutter.color))(
          decoration.gutter.glyph === 'underline' ? '▁' : '▎',
        ),
      );
    };
    const sourceFindEngine = context.findEngineFor(editor.document.path);
    // Plain text (binary or no language) renders in the default foreground with no token spans.
    const plainForeground =
      editor.document.binary.value || language === 'plain';
    // `windowSpans` are the token spans covering EXACTLY windowText (already sliced/aligned to the
    // window), or null on the plain path. Tokenization happens ONCE per line/window at the call
    // sites; every sub-segment here is a SLICE of those spans — never a re-tokenization. Re-tokenizing
    // a slice loses left context (a wrap continuation of `// ...` has no `//` prefix; the text after
    // a find-match boundary inside a comment has none either) and painted such text default-white.
    const pushCodeChunks = (
      windowText: string,
      lineIndex: number,
      windowStartGrapheme = 0,
      windowSpans: readonly Span[] | null = null,
    ): void => {
      const lineMatches =
        sourceFindEngine?.matches.value.filter(
          (match) => match.line === lineIndex,
        ) ?? [];
      const lineUnderlines = (decorationsByLine.get(lineIndex) ?? []).flatMap(
        (decoration) => (decoration.underline ? [decoration.underline] : []),
      );
      const windowGraphemeCount =
        EditorCoordinates.Class.graphemeCount(windowText);
      const boundaries = new Set<number>([0, windowGraphemeCount]);
      // Indent guides: a faint vertical bar drawn IN PLACE of the leading-whitespace space at each indent
      // level (display columns 0, tabWidth, 2*tabWidth, ...). Swapping a space for the guide glyph keeps
      // the cell count identical, so caret/selection columns are untouched. Only on a line's FIRST visual
      // row (windowStartGrapheme === 0, i.e. the physical line start); a diagnostic/find highlight over the
      // same cell takes precedence below. Tabs render as-is (the scan stops at the first non-space).
      // invariant: Indent guides mark leading whitespace without shifting columns (src/modules/ui/ui.invariants.md)
      const indentGuideGraphemes = new Set<number>();
      if (context.showIndentGuides && windowStartGrapheme === 0) {
        for (
          let indentGrapheme = 0;
          indentGrapheme < windowGraphemeCount;
          indentGrapheme += 1
        ) {
          if (windowText[indentGrapheme] !== ' ') break;
          if (
            EditorCoordinates.Class.displayColumn(windowText, indentGrapheme) %
              this.indentGuideTabWidth ===
            0
          ) {
            indentGuideGraphemes.add(indentGrapheme);
            boundaries.add(indentGrapheme);
            boundaries.add(indentGrapheme + 1);
          }
        }
      }
      for (const match of lineMatches) {
        boundaries.add(
          Math.max(
            0,
            Math.min(
              windowGraphemeCount,
              match.startColumn - windowStartGrapheme,
            ),
          ),
        );
        boundaries.add(
          Math.max(
            0,
            Math.min(
              windowGraphemeCount,
              match.endColumn - windowStartGrapheme,
            ),
          ),
        );
      }
      for (const lineUnderline of lineUnderlines) {
        boundaries.add(
          Math.max(
            0,
            Math.min(
              windowGraphemeCount,
              lineUnderline.startColumn - windowStartGrapheme,
            ),
          ),
        );
        boundaries.add(
          Math.max(
            0,
            Math.min(
              windowGraphemeCount,
              lineUnderline.endColumn - windowStartGrapheme,
            ),
          ),
        );
      }
      // Bracket-match cells on this line become their own single-cell segments (a boundary at the column
      // and the next), so the match background paints exactly the bracket cell.
      const lineBracketColumns = (context.bracketHighlights ?? [])
        .filter((cell) => cell.line === lineIndex)
        .map((cell) => cell.column);
      for (const bracketColumn of lineBracketColumns) {
        boundaries.add(
          Math.max(
            0,
            Math.min(windowGraphemeCount, bracketColumn - windowStartGrapheme),
          ),
        );
        boundaries.add(
          Math.max(
            0,
            Math.min(
              windowGraphemeCount,
              bracketColumn + 1 - windowStartGrapheme,
            ),
          ),
        );
      }
      const underlineColorOver = (
        absoluteStart: number,
        absoluteEnd: number,
      ): EditorDecorationColor | null => {
        for (const lineUnderline of lineUnderlines) {
          if (
            lineUnderline.startColumn < absoluteEnd &&
            lineUnderline.endColumn > absoluteStart
          ) {
            return lineUnderline.color;
          }
        }
        return null;
      };
      const orderedBoundaries = [...boundaries].sort(
        (first, second) => first - second,
      );
      for (
        let boundaryIndex = 0;
        boundaryIndex < orderedBoundaries.length - 1;
        boundaryIndex += 1
      ) {
        const segmentStart = orderedBoundaries[boundaryIndex]!;
        const segmentEnd = orderedBoundaries[boundaryIndex + 1]!;
        if (segmentEnd <= segmentStart) continue;
        const segmentText = windowText.slice(
          EditorCoordinates.Class.graphemeToU16(windowText, segmentStart),
          EditorCoordinates.Class.graphemeToU16(windowText, segmentEnd),
        );
        const findHighlighted = lineMatches.some(
          (match) =>
            match.startColumn < windowStartGrapheme + segmentEnd &&
            match.endColumn > windowStartGrapheme + segmentStart,
        );
        const bracketHighlighted = lineBracketColumns.some(
          (bracketColumn) =>
            bracketColumn >= windowStartGrapheme + segmentStart &&
            bracketColumn < windowStartGrapheme + segmentEnd,
        );
        const underlineColor = underlineColorOver(
          windowStartGrapheme + segmentStart,
          windowStartGrapheme + segmentEnd,
        );
        if (
          indentGuideGraphemes.has(segmentStart) &&
          segmentEnd - segmentStart === 1 &&
          underlineColor === null &&
          !findHighlighted
        ) {
          // Faint vertical guide in place of this leading-whitespace space — same one cell, in the
          // dedicated indentGuide role (today's `border` sits BELOW the editor bg — invisible as a glyph).
          codeChunks.push(fg(palette.indentGuide)(context.indentGuideGlyph));
          continue;
        }
        if (bracketHighlighted) {
          // Bracket match highlights the cursor's bracket + its partner by recolouring the FOREGROUND
          // (accent + bold) — a deliberate style choice (the classic matching-bracket look, e.g. Vim's
          // MatchParen), kept distinct from the find-match background so the two never read the same.
          codeChunks.push(bold(fg(palette.accent)(segmentText)));
        } else if (underlineColor !== null) {
          // A diagnostic range renders as a coloured UNDERLINE in the severity colour (red for errors) —
          // the terminal's "red squiggly": the text stays but is underlined and recoloured to signal it.
          const diagnosticChunk = underline(
            fg(decorationColor(underlineColor))(segmentText),
          );
          codeChunks.push(
            findHighlighted
              ? bg(palette.cursorLine)(diagnosticChunk)
              : diagnosticChunk,
          );
        } else if (windowSpans === null) {
          const textChunk = fg(palette.fg)(segmentText);
          codeChunks.push(
            findHighlighted ? bg(palette.cursorLine)(textChunk) : textChunk,
          );
        } else {
          for (const span of Highlighter.Class.sliceSpans(
            windowSpans,
            segmentStart,
            segmentEnd,
          )) {
            const syntaxChunk = fg(this.roleColor(span.role, palette))(
              span.text,
            );
            codeChunks.push(
              findHighlighted
                ? bg(palette.cursorLine)(syntaxChunk)
                : syntaxChunk,
            );
          }
        }
      }
    };
    if (editor.wordWrap.value) {
      // WRAP MODE: iterate VISUAL rows from the pure mapping layer — a long line contributes multiple
      // rows; the gutter numbers only a line's FIRST visual row (continuation rows are blank, VS
      // Code-style); each row's code is the segment's grapheme-safe slice. `top` is a VISUAL-row offset
      // in wrap mode, so the window can start MID-LINE. The walk is O(window) — never materialized.
      const wrapRowsWindow = EditorWrap.Class.visualRowsFromOffset(
        editor.document,
        top,
        editor.wrapWidth(),
        height,
      );
      // Token spans come from the FULL logical line, computed once per line and SLICED per visual
      // row — a continuation row inherits the roles its text has on the logical line (a wrapped
      // `// ...` comment stays comment-coloured past the first row). Consecutive rows of the same
      // line share the one tokenization.
      let tokenizedLineIndex = -1;
      let tokenizedLineSpans: Span[] = [];
      wrapRowsWindow.forEach((row, rowIndex) => {
        const isCurrentLine = row.lineIndex === currentLineIndex;
        if (row.firstOfLine) {
          const lineNumberText = String(row.lineIndex + 1).padStart(
            lineNumberWidth,
            ' ',
          );
          gutterChunks.push(
            fg(isCurrentLine ? palette.accent : palette.dim)(
              `${lineNumberText} `,
            ),
          );
          pushGutterMarker(row.lineIndex, isCurrentLine);
        } else {
          gutterChunks.push(fg(palette.dim)(' '.repeat(lineNumberWidth + 2)));
        }
        const lineText = editor.document.line(row.lineIndex);
        let segmentSpans: Span[] | null = null;
        if (!plainForeground) {
          if (row.lineIndex !== tokenizedLineIndex) {
            tokenizedLineSpans = Highlighter.Class.highlightLine(
              lineText,
              language,
            );
            tokenizedLineIndex = row.lineIndex;
          }
          segmentSpans = Highlighter.Class.sliceSpans(
            tokenizedLineSpans,
            row.segment.startGrapheme,
            row.segment.endGrapheme,
          );
        }
        pushCodeChunks(
          lineText.slice(
            EditorCoordinates.Class.graphemeToU16(
              lineText,
              row.segment.startGrapheme,
            ),
            EditorCoordinates.Class.graphemeToU16(
              lineText,
              row.segment.endGrapheme,
            ),
          ),
          row.lineIndex,
          row.segment.startGrapheme,
          segmentSpans,
        );
        if (rowIndex < wrapRowsWindow.length - 1) {
          gutterChunks.push(fg(palette.fg)('\n'));
          codeChunks.push(fg(palette.fg)('\n'));
        }
      });
      return {
        gutter: new StyledText(gutterChunks),
        code: new StyledText(codeChunks),
        wrapRowsWindow,
      };
    }
    // COLUMN virtualization (the horizontal twin of the line flyweight): each visible logical line is
    // tokenized once, then its spans and text are sliced to the same grapheme window. Tokenizing the
    // context-free visible text would lose any role established to its left (`//`, `/*`, a string
    // delimiter), while slicing the logical spans preserves that role through horizontal scroll.
    const scrollLeft = editor.viewport.scrollLeft.value;
    const viewportWidth = context.viewportWidth;
    visibleLines.forEach((text, visibleIndex) => {
      const lineNumber = top + visibleIndex;
      const isCurrentLine = lineNumber === currentLineIndex;
      const lineNumberText = String(lineNumber + 1).padStart(
        lineNumberWidth,
        ' ',
      );
      gutterChunks.push(
        fg(isCurrentLine ? palette.accent : palette.dim)(`${lineNumberText} `),
      );
      pushGutterMarker(lineNumber, isCurrentLine);
      let windowText = text;
      let windowStartGrapheme = 0;
      let windowEndGraphemeIndex = EditorCoordinates.Class.graphemeCount(text);
      if (scrollLeft > 0 || text.length > viewportWidth) {
        // O(1) test; a needless slice is harmless
        let startGrapheme = EditorCoordinates.Class.graphemeAtDisplayColumn(
          text,
          scrollLeft,
        );
        if (
          EditorCoordinates.Class.displayColumn(text, startGrapheme) <
          scrollLeft
        )
          startGrapheme += 1; // never split a straddling wide glyph
        const endGrapheme =
          EditorCoordinates.Class.graphemeAtDisplayColumn(
            text,
            scrollLeft + viewportWidth,
          ) + 1;
        windowStartGrapheme = startGrapheme;
        windowEndGraphemeIndex = endGrapheme;
        windowText = text.slice(
          EditorCoordinates.Class.graphemeToU16(text, startGrapheme),
          EditorCoordinates.Class.graphemeToU16(text, endGrapheme),
        );
      }
      const logicalLineSpans = plainForeground
        ? null
        : Highlighter.Class.highlightLine(text, language);
      const lineWindowSpans =
        logicalLineSpans === null
          ? null
          : Highlighter.Class.sliceSpans(
              logicalLineSpans,
              windowStartGrapheme,
              windowEndGraphemeIndex,
            );
      pushCodeChunks(
        windowText,
        lineNumber,
        windowStartGrapheme,
        lineWindowSpans,
      );
      if (visibleIndex < visibleLines.length - 1) {
        gutterChunks.push(fg(palette.fg)('\n'));
        codeChunks.push(fg(palette.fg)('\n'));
      }
    });
    return {
      gutter: new StyledText(gutterChunks),
      code: new StyledText(codeChunks),
      wrapRowsWindow: [],
    };
  }
}
export namespace EditorPaneRenderer {
  export const $Class = $EditorPaneRenderer;
  export const Class = Static($EditorPaneRenderer);
}
export interface EditorPaneRenderContext {
  workspace: Workspace.Instance;
  palette: Palette;
  viewportHeight: number;
  viewportWidth: number;
  /** The find engine for a document path (RootView prefixes the `source:` pane identifier). */
  findEngineFor: (documentPath: string) => FindInBuffer.Instance | null;
  /** Draw faint vertical indent guides down the leading whitespace of each line (settings-driven). */
  showIndentGuides: boolean;
  /** The guide glyph at the current glyph tier — box-drawing bar `│` degrading to ascii `|`. */
  indentGuideGlyph: string;
  /** Cells (line, grapheme column) to paint with the bracket-match background — the cursor's bracket
   *  and its balanced partner. Off-screen cells are never in a rendered line, so "highlight only when
   *  visible" is automatic. Empty/omitted when the cursor is not on a bracket. */
  bracketHighlights?: readonly BracketCell[];
}
export interface EditorPaneRender {
  gutter: StyledText;
  code: StyledText;
  /** Wrap-mode visual-row window (empty in no-wrap mode); RootView stores it for caret/hit-test. */
  wrapRowsWindow: VisualRow[];
}
