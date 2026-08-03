// The editor pane controller: owns the code body's behaviour — the wrap-mode visual-row window, the
// document⇄cell coordinate mapping, the model→native selection sync, the selection-drag behaviour,
// Ctrl/Cmd+click go-to-definition, and the wheel scroll. It also drives the pane RENDER by delegating
// to EditorPaneRenderer and storing the returned wrap window (the caret block, applySelection, and
// the hit-test all read it — so it is the one source of truth, kept here).
//
// RootView still constructs + mounts the renderables and owns the editor viewport geometry (it is in
// RootView's public interface) and the diff/markdown mount; those come in as accessors.
import type {
  BoxRenderable,
  CliRenderer,
  StyledText,
  TextRenderable,
} from '@opentui/core';
import { Reactive } from 'ivue';
import { TextCoordinates } from '../text/TextCoordinates';
import type { EditorFrameAttribution } from '../text/EditorFrameAttribution';
import { EditorWrap, type VisualRow } from '../text/EditorWrap';
import { EditorPaneRenderer } from './EditorPaneRenderer';
import { BracketMatch } from './BracketMatch';
import { ScrollGesture } from '../ui/ScrollGesture';
import { SelectionDragBehavior } from '../ui/SelectionDragBehavior';
import { SelectableText } from '../ui/SelectableText';
import { Logging } from '../system/Logging';
import type { Palette } from '../theme/ThemePalettes';
import type { WorkspaceSet } from '../workspace/WorkspaceSet';
import type { FindBar } from '../search/FindBar';
import type { Settings } from '../settings/Settings';
import type { Theme } from '../theme/Theme';

class $EditorPane {
  // View geometry of the last-rendered frame in both wrap modes: the visual rows the window showed,
  // written by renderEditor and read by the caret block, applySelection, and the mouse hit-test — so
  // all consumers agree on what is where.
  protected visualRowsWindow: VisualRow[] = [];
  protected gutterHoverLabelsByRow: readonly (readonly string[])[] = [];
  protected readonly drag: SelectionDragBehavior.Model;
  // Multi-click selection state: successive clicks at the same spot within the window escalate
  // single → double (word) → triple (line).
  protected lastClickTimeMs = 0;
  protected lastClickLine = -1;
  protected lastClickColumn = -1;
  protected clickCount = 0;
  constructor(protected readonly deps: EditorPaneDeps) {
    this.drag = this.buildDragBehavior();
    this.wireHandlers();
  }
  /** Render the editor window (delegates to EditorPaneRenderer); stores the wrap window. Returns null
   *  for the empty state (diff shown / no document), leaving the stored window untouched. */
  renderEditor(): {
    gutter: StyledText;
    code: StyledText;
  } | null {
    const {
      workspaceSet,
      readPalette,
      editorViewportHeight,
      editorViewportWidth,
      findBar,
      settings,
      theme,
    } = this.deps;
    const workspace = workspaceSet.active;
    const editor = workspace.editor;
    // Bracket match: computed ONCE per frame here (reading cursor + document makes the frame effect
    // track them, so it recomputes on a move/edit and clears when the cursor leaves a bracket). The
    // renderer paints only the cells that fall in a visible line.
    const bracketMatch =
      editor.hasDocument.value &&
      workspace.editorSurfaces.activeDocumentIsPresented
        ? BracketMatch.Class.findInDocument(
            editor.document,
            editor.cursor.line.value,
            editor.cursor.col.value,
            workspace.documentSyntax,
            this.deps.frameAttribution,
          )
        : null;
    const result = EditorPaneRenderer.Class.render({
      workspace,
      palette: readPalette(),
      viewportHeight: editorViewportHeight(),
      viewportWidth: editorViewportWidth(),
      findEngineFor: (documentPath) =>
        findBar.engineFor(`source:${documentPath}`),
      showIndentGuides: settings.showIndentGuides.value,
      codeFoldingEnabled: editor.codeFoldingEnabled,
      // Box-drawing bar in nerd/unicode tiers; plain pipe where only ascii glyphs render.
      indentGuideGlyph: theme.glyphLevel.value === 'ascii' ? '|' : '│',
      foldOpenGlyph: theme.glyph('foldOpen'),
      foldClosedGlyph: theme.glyph('foldClosed'),
      frameAttribution: this.deps.frameAttribution,
      bracketHighlights: bracketMatch
        ? [bracketMatch.bracket, bracketMatch.match]
        : [],
    });
    if (!result) return null;
    this.visualRowsWindow = result.visualRowsWindow;
    this.gutterHoverLabelsByRow = result.gutterHoverLabelsByRow;
    return { gutter: result.gutter, code: result.code };
  }
  /** Advance the selection-drag auto-scroll; true while it still needs frames. */
  tickDrag(deltaTimeSeconds: number): boolean {
    return this.drag.tick(deltaTimeSeconds);
  }
  // Map a document (line, column) to its viewport cell (row within the shared window + local display
  // column), or 'before'/'after' when it is off the window on that side. Public: the caret block in
  // RootView's update() reads it too, to place the native terminal cursor in either wrap mode.
  visualPosition(
    line: number,
    column: number,
  ):
    | {
        rowIndex: number;
        column: number;
      }
    | 'before'
    | 'after' {
    const editor = this.deps.workspaceSet.activeEditor;
    const firstRow = this.visualRowsWindow[0];
    const lastRow = this.visualRowsWindow[this.visualRowsWindow.length - 1];
    if (!firstRow || !lastRow) return 'before';
    const lineText = this.deps.frameAttribution.documentLine(
      editor.document,
      line,
    );
    this.deps.frameAttribution.recordWrapProjectionLookup();
    const segments = editor.wordWrap.value
      ? EditorWrap.Class.wrapLine(lineText, editor.wrapWidth())
      : [
          {
            startGrapheme: 0,
            endGrapheme: TextCoordinates.Class.graphemeCount(lineText),
            startDisplayColumn: 0,
          },
        ];
    const segmentIndex = EditorWrap.Class.segmentIndexForCursor(
      segments,
      column,
    );
    if (
      line < firstRow.lineIndex ||
      (line === firstRow.lineIndex && segmentIndex < firstRow.segmentIndex)
    )
      return 'before';
    if (
      line > lastRow.lineIndex ||
      (line === lastRow.lineIndex && segmentIndex > lastRow.segmentIndex)
    )
      return 'after';
    const rowIndex = this.visualRowsWindow.findIndex(
      (row) => row.lineIndex === line && row.segmentIndex === segmentIndex,
    );
    if (rowIndex < 0) return 'after';
    const segment = segments[segmentIndex];
    return {
      rowIndex,
      column:
        TextCoordinates.Class.displayColumn(lineText, column) -
        (segment?.startDisplayColumn ?? 0) -
        (editor.wordWrap.value ? 0 : editor.viewport.scrollLeft.value),
    };
  }
  // Drive OpenTUI's native selection on the code renderable from the model selection, mapped into
  // code-local coords (x = display column, y = visible-line index). Clamps to the visible window.
  // invariant: The selected range renders with a background (src/modules/ui/ui.invariants.md)
  applySelection(): void {
    const { workspaceSet, codeBody, editorViewportWidth } = this.deps;
    const editor = workspaceSet.activeEditor;
    const selection = editor.hasDocument.value
      ? editor.cursor.selectionRange()
      : null;
    // Selection coordinates are viewport-local VISUAL rows in both wrap modes. Folding can remove
    // logical rows in either mode, so the old line-minus-scrollTop shortcut is never authoritative.
    if (!selection || this.visualRowsWindow.length === 0) {
      codeBody.clearSelectionRange();
      return;
    }
    const startPosition = this.visualPosition(
      selection.start.line,
      selection.start.col,
    );
    const endPosition = this.visualPosition(
      selection.end.line,
      selection.end.col,
    );
    if (startPosition === 'after' || endPosition === 'before') {
      codeBody.clearSelectionRange();
      return;
    }
    const anchorCell =
      startPosition === 'before' ? { rowIndex: 0, column: 0 } : startPosition;
    const focusCell =
      endPosition === 'after'
        ? {
            rowIndex: this.visualRowsWindow.length - 1,
            column: editorViewportWidth(),
          }
        : endPosition;
    codeBody.setSelectionRange(
      Math.max(0, anchorCell.column),
      anchorCell.rowIndex,
      Math.max(0, focusCell.column),
      focusCell.rowIndex,
    );
  }
  // Public so RootView/HoverCard can map a screen cell to a document position (mirrors wrapVisualPosition).
  documentPositionAtCell(
    cellX: number,
    cellY: number,
  ): {
    line: number;
    column: number;
  } | null {
    const { workspaceSet, codeBody } = this.deps;
    const editor = workspaceSet.activeEditor;
    if (!editor.hasDocument.value) return null;
    if (this.visualRowsWindow.length === 0) return null;
    const rowIndex = Math.max(
      0,
      Math.min(cellY - codeBody.y, this.visualRowsWindow.length - 1),
    );
    const row = this.visualRowsWindow[rowIndex];
    if (!row) return null;
    const lineText = this.deps.frameAttribution.documentLine(
      editor.document,
      row.lineIndex,
    );
    this.deps.frameAttribution.recordWrapProjectionLookup();
    const segments = editor.wordWrap.value
      ? EditorWrap.Class.wrapLine(lineText, editor.wrapWidth())
      : [row.segment];
    const lastSegmentOfLine = row.segmentIndex === segments.length - 1;
    const hitColumn = TextCoordinates.Class.graphemeAtDisplayColumn(
      lineText,
      row.segment.startDisplayColumn +
        Math.max(0, cellX - codeBody.x) +
        (editor.wordWrap.value ? 0 : editor.viewport.scrollLeft.value),
    );
    const maxColumn = lastSegmentOfLine
      ? row.segment.endGrapheme
      : Math.max(row.segment.startGrapheme, row.segment.endGrapheme - 1);
    return {
      line: row.lineIndex,
      column: Math.max(
        row.segment.startGrapheme,
        Math.min(hitColumn, maxColumn),
      ),
    };
  }
  // True when the pointer cell sits on an actual text glyph (not the clamped-past-end position
  // documentPositionAtCell returns for empty space, and not inter-token whitespace). Gates hover
  // arming so moving off a symbol into blank space idles the shown card out instead of re-dwelling.
  protected pointerIsOverText(
    cellX: number,
    cellY: number,
    position: {
      line: number;
      column: number;
    },
  ): boolean {
    const editor = this.deps.workspaceSet.activeEditor;
    const lineText = this.deps.frameAttribution.documentLine(
      editor.document,
      position.line,
    );
    if (!editor.wordWrap.value) {
      const displayColumn =
        editor.viewport.scrollLeft.value + (cellX - this.deps.codeBody.x);
      if (
        displayColumn < 0 ||
        displayColumn >= TextCoordinates.Class.lineWidth(lineText)
      )
        return false;
    }
    const grapheme = Array.from(lineText)[position.column];
    return grapheme != null && grapheme.trim().length > 0;
  }
  protected scrollEditorVertically(delta: number): void {
    const editor = this.deps.workspaceSet.activeEditor;
    const editorViewport = editor.viewport;
    const maxTop = Math.max(
      0,
      editor.totalVisualRows() - editorViewport.height.value,
    );
    editorViewport.scrollTop.value = Math.max(
      0,
      Math.min(editorViewport.scrollTop.value + delta, maxTop),
    );
  }
  // One shared drag/autoscroll behavior serves this editor and DiffView. The hosts differ only in
  // coordinate mapping and scroll storage; pointer lifecycle, edge zones, rate, and re-extension are
  // identical. invariant: One writer per scroll regime per frame (src/modules/ui/ui.invariants.md)
  protected buildDragBehavior(): SelectionDragBehavior.Model {
    const {
      workspaceSet,
      codeBody,
      editorViewportHeight,
      editorViewportWidth,
    } = this.deps;
    return new SelectionDragBehavior.Class({
      viewportRectangle: () => ({
        leftColumn: codeBody.x,
        rightColumn: codeBody.x + Math.max(1, editorViewportWidth()) - 1,
        topRow: codeBody.y,
        bottomRow: codeBody.y + Math.max(1, editorViewportHeight()) - 1,
      }),
      positionAtCell: (cellX, cellY) =>
        this.documentPositionAtCell(cellX, cellY),
      horizontalScrollPosition: () =>
        workspaceSet.activeEditor.viewport.scrollLeft.value,
      horizontalScrollingEnabled: () =>
        !workspaceSet.activeEditor.wordWrap.value,
      lineGraphemeCount: (lineIndex) =>
        TextCoordinates.Class.graphemeCount(
          this.deps.frameAttribution.documentLine(
            workspaceSet.activeEditor.document,
            lineIndex,
          ),
        ),
      beginSelection: (position) => {
        const workspace = workspaceSet.active;
        workspace.focusEditor();
        workspace.editor.placeCursor(position.line, position.column);
        workspace.editor.cursor.setAnchorHere();
      },
      extendSelection: (position, pointerDisplayColumn) => {
        // Direct Cursor.set preserves the pointer's display-column goal while short lines clamp the
        // landing column; placeCursor would reveal/yank the viewport during a diagonal drag.
        workspaceSet.activeEditor.cursor.set(
          position.line,
          position.column,
          pointerDisplayColumn,
        );
      },
      finishSelection: () => {
        const editor = workspaceSet.activeEditor;
        if (!editor.cursor.hasSelection) editor.cursor.clearSelection();
      },
      scrollColumns: (columnDelta) => {
        const editor = workspaceSet.activeEditor;
        editor.viewport.scrollByColumns(
          columnDelta,
          editor.document.maximumLineWidth,
        );
      },
      scrollRows: (delta) => this.scrollEditorVertically(delta),
      haltCompetingScroll: () =>
        workspaceSet.activeEditor.viewport.haltScrollMomentum(),
    });
  }
  protected wireHandlers(): void {
    const {
      editorArea,
      gutterBody,
      codeBody,
      workspaceSet,
      settings,
      focusSourceEditor,
      hover,
      tooltip,
    } = this.deps;
    editorArea.onMouseScroll = (event) => {
      const workspace = workspaceSet.active;
      const editor = workspace.editor;
      if (!editor.hasDocument.value) return;
      focusSourceEditor();
      // Scrolling the DOCUMENT dismisses any open hover card — its anchored symbol is moving away; a
      // new dwell on the newly-hovered symbol re-shows one. (A wheel over the card's OWN box scrolls
      // the card instead — that handler lives on the box, which sits above the editor.)
      hover.clear();
      // Horizontal scroll arrives by SEVERAL terminal-dependent encodings; route them ALL to columns.
      const direction = event.scroll?.direction;
      const step = ScrollGesture.Class.wheelStep(event, settings);
      if (editor.wordWrap.value) {
        // Wrap mode: ONE scroll axis (horizontal gestures route to the vertical window), fed through the
        // SAME momentum engine as non-wrap so a wheel notch GLIDES then decays.
        const backward = direction === 'left' || direction === 'up';
        workspace.impulseEditorVerticalScroll((backward ? -1 : 1) * step);
      } else {
        const modifierHorizontal = ScrollGesture.Class.modifierHeld(
          event,
          settings.horizontalScrollModifier.value,
        );
        const horizontal =
          direction === 'left' || direction === 'right' || modifierHorizontal;
        if (horizontal) {
          const backward = direction === 'left' || direction === 'up';
          workspace.impulseEditorHorizontalScroll((backward ? -1 : 1) * step);
        } else {
          workspace.impulseEditorVerticalScroll(
            (direction === 'up' ? -1 : 1) * step,
          );
        }
      }
    };
    codeBody.onMouseDown = (event) => {
      const workspace = workspaceSet.active;
      focusSourceEditor();
      if (process.env.TUI_DEBUG_MOUSE === '1') {
        Logging.Class.info(
          `mouseDown (${event.x},${event.y}) hit=${JSON.stringify(this.documentPositionAtCell(event.x, event.y))}`,
        );
      }
      // Ctrl/Cmd+click on a symbol = go to definition (VS Code style). OpenTUI exposes terminal
      // Meta/Super mouse modifiers through the SGR alt bit, so ctrl OR alt covers Ctrl-click and
      // terminal Cmd/Meta-click without a second path. The event is consumed here — never a select begin.
      // invariant: Plugin boundaries grant one authority (project.invariants.md)
      if (event.button === 0 && (event.modifiers.ctrl || event.modifiers.alt)) {
        const definitionPosition = this.documentPositionAtCell(
          event.x,
          event.y,
        );
        if (definitionPosition) {
          workspace.focusEditor();
          void workspace.goToDefinition(definitionPosition);
          return;
        }
      }
      // Multi-click selection (VS Code): a second click on the same spot selects the WORD, a third
      // selects the whole LINE. A single click falls through to a normal drag-select begin.
      const clickPosition =
        event.button === 0
          ? this.documentPositionAtCell(event.x, event.y)
          : null;
      if (clickPosition) {
        const nowMs = Date.now();
        const sameSpot =
          clickPosition.line === this.lastClickLine &&
          Math.abs(clickPosition.column - this.lastClickColumn) <= 1;
        this.clickCount =
          sameSpot && nowMs - this.lastClickTimeMs < 450
            ? this.clickCount + 1
            : 1;
        this.lastClickTimeMs = nowMs;
        this.lastClickLine = clickPosition.line;
        this.lastClickColumn = clickPosition.column;
        if (this.clickCount === 2) {
          workspace.focusEditor();
          workspace.editor.selectWord(clickPosition.line, clickPosition.column);
          return;
        }
        if (this.clickCount >= 3) {
          workspace.focusEditor();
          workspace.editor.selectLine(clickPosition.line);
          return;
        }
      }
      this.drag.begin(event.x, event.y);
    };
    codeBody.onMouseDrag = (event) => {
      if (process.env.TUI_DEBUG_MOUSE === '1') {
        Logging.Class.info(
          `mouseDrag (${event.x},${event.y}) hit=${JSON.stringify(this.documentPositionAtCell(event.x, event.y))}`,
        );
      }
      this.drag.drag(event.x, event.y);
    };
    codeBody.onMouseUp = () => this.drag.end();
    codeBody.onMouseDragEnd = () => this.drag.end();
    // Mouse-move over a code cell arms the LSP hover card for the symbol there (a >0.5s dwell shows
    // the language server's type/docs). Moving off any document, or over an empty cell, clears it.
    // invariant: A hover card reflects the language server type at the pointed symbol (src/modules/ui/ui.invariants.md)
    codeBody.onMouseMove = (event) => {
      if (!workspaceSet.activeEditor.hasDocument.value) {
        hover.clear();
        return;
      }
      const position = this.documentPositionAtCell(event.x, event.y);
      // documentPositionAtCell CLAMPS past the line end, so it returns a position even over empty
      // space — arm the dwell only when the pointer is truly over a text glyph, or moving from a
      // symbol into the whitespace beside it would read as a NEW symbol and hide the shown card.
      if (position && this.pointerIsOverText(event.x, event.y, position)) {
        hover.pointAt(position, event.x, event.y);
      } else {
        hover.pointerOffSymbol(); // off the symbol (empty/whitespace cell): a shown card idles out
      }
    };
    // Pointer leaves the code pane entirely (to the sidebar, a tab, etc.): also a "left the symbol"
    // signal — a shown card idles out rather than hanging around, but is not hard-killed mid-move.
    codeBody.onMouseOut = () => hover.pointerOffSymbol();
    gutterBody.onMouseDown = (event) => {
      const workspace = workspaceSet.active;
      const editor = workspace.editor;
      if (event.button !== 0 || !editor.hasDocument.value) return;
      const lineNumberWidth = String(editor.document.lineCount).length + 1;
      const foldControlColumn = Number(gutterBody.x) + lineNumberWidth;
      if (event.x !== foldControlColumn) return;
      const visibleRowIndex = event.y - Number(gutterBody.y);
      const row = this.visualRowsWindow[visibleRowIndex];
      if (!row?.firstOfLine) return;
      if (editor.toggleFoldAtLine(row.lineIndex)) {
        workspace.focusEditor();
        tooltip.clear();
      }
    };
    gutterBody.onMouseMove = (event) => {
      const visibleRowIndex = event.y - Number(gutterBody.y);
      const hoverLabels = this.gutterHoverLabelsByRow[visibleRowIndex] ?? [];
      if (hoverLabels.length > 0) {
        tooltip.point(hoverLabels.join(' · '), event.x, event.y);
      } else {
        tooltip.clear();
      }
    };
    gutterBody.onMouseOut = () => tooltip.clear();
  }
}

export namespace EditorPane {
  export const $Class = $EditorPane;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface EditorPaneDeps {
  renderer: CliRenderer;
  editorArea: BoxRenderable;
  gutterBody: TextRenderable;
  codeBody: SelectableText.Model;
  workspaceSet: WorkspaceSet.Instance;
  findBar: FindBar.Instance;
  settings: Settings.Instance;
  theme: Theme.Instance;
  frameAttribution: EditorFrameAttribution.Model;
  tooltip: import('../ui/Tooltip').Tooltip.Instance;
  readPalette: () => Palette;
  editorViewportHeight: () => number;
  editorViewportWidth: () => number;
  /** Hand the keyboard back to the source editor — a click in the source pane while a contributed
   *  surface's own pane holds it (no-op when no surface is mounted). */
  focusSourceEditor: () => void;
  /** The LSP hover-card handle: a mouse-move over a symbol points it; leaving the code clears it. */
  hover: {
    pointAt(
      position: {
        line: number;
        column: number;
      },
      screenX: number,
      screenY: number,
    ): void;
    clear(): void;
    pointerOffSymbol(): void;
  };
}
