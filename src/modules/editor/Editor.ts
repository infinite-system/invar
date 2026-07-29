import { Reactive } from 'ivue';
import { ref, shallowRef, type Ref } from 'vue';
import {
  TextViewport,
  type ViewportTargetPlacement,
} from '../text/TextViewport';
import { TextCoordinates } from '../text/TextCoordinates';
import { EditorIndent } from './EditorIndent';
import { TextEditing } from '../text/TextEditing';
import { EditorWrap } from './EditorWrap';
import { CodeFolding, type FoldRange } from './CodeFolding';
import { ReadOnlyTextBuffer } from './ReadOnlyTextBuffer';
import { UndoStore, type EditKind } from '../storage/UndoStore';
import { Files } from '../system/Files';
import { Clock } from '../system/Clock';
import { Clipboard } from '../system/Clipboard';
import type {
  LanguageCompletionItem,
  LanguageRange,
} from '../workspace/LanguageProvider.interface';
import { LanguageRegistry } from '../syntax/LanguageRegistry';
import type { EditorContributions } from './EditorContributions';
import type { DocumentFoldState } from '../text/DocumentFoldState.interface';
import type { SourceTextView } from '../workspace/SourceTextView.interface';

// The editor: owns a document, a cursor, and a viewport, and coordinates movement, selection,
// editing, and scroll.
//
// invariant: Data flows one way (project.invariants.md)
// invariant: Selection is an anchor plus the cursor and edits replace it (src/modules/editor/editor.invariants.md)
// invariant: The dirty marker is derived from content, never asserted (src/modules/text/text.invariants.md)
// invariant: Explicit jumps use one reading position (src/modules/text/text.invariants.md)
class $Editor extends ReadOnlyTextBuffer.$Class implements SourceTextView {
  // invariant: Construction goes through overridable seams (project.invariants.md)
  viewport = this.createViewport();
  protected undo = this.createUndo();
  protected disposeUndoDocumentListener: (() => void) | null = null;
  protected disposeEditorContributions: (() => void) | null = null;
  protected editorContributions: EditorContributions.Model | null = null;

  constructor() {
    super();
    this.disposeUndoDocumentListener = this.document.onLineChange((change) =>
      this.undo.recordChange(change),
    );
  }

  protected createViewport() {
    return new TextViewport.Class();
  }
  protected createUndo() {
    return new UndoStore.Class();
  }
  attachEditorContributions(contributions: EditorContributions.Model): void {
    this.disposeEditorContributions?.();
    this.editorContributions = contributions;
    this.disposeEditorContributions = contributions.attach(
      this as unknown as Editor.Model,
    );
  }

  get hasDocument() {
    return ref(false);
  }
  get readOnly() {
    return ref(false);
  }
  protected override get selectionAvailable(): boolean {
    return this.hasDocument.value;
  }
  // Word wrap is a VIEW MODE: when on, rendering/caret/selection route through the pure
  // logical↔visual mapping in editor.wrap.ts and horizontal scroll is inert. The document model
  // is untouched by the toggle. invariant: Word wrap is a pure view mapping (src/modules/editor/editor.invariants.md)
  // Word wrap is a GLOBAL view preference: EVERY editor instance reads the SAME settings.wordWrap ref
  // (attached via attachWordWrap), so the setting is the single source — the settings panel AND the
  // toggle command drive the identical ref, and switching tabs never desyncs the mode. Falls back to a
  // local ref only before a source is attached (bare unit tests).
  protected wordWrapSource: Ref<boolean> | null = null;
  protected codeFoldingSource: Ref<boolean> | null = null;
  attachWordWrap(source: Ref<boolean>): void {
    this.wordWrapSource = source;
  }
  get wordWrap(): Ref<boolean> {
    return this.wordWrapSource ?? this.localWordWrap;
  }
  get localWordWrap() {
    return ref(false);
  }
  attachCodeFolding(source: Ref<boolean>): void {
    this.codeFoldingSource = source;
  }
  get codeFoldingEnabled(): boolean {
    return this.codeFoldingSource?.value ?? true;
  }
  get foldState() {
    return shallowRef<DocumentFoldState>({
      collapsedLineStarts: new Set<number>(),
    });
  }
  get foldRevision() {
    return ref(0);
  }
  protected collapsedFoldRangesDocumentRevision = -1;
  protected collapsedFoldRangesFoldRevision = -1;
  protected collapsedFoldRangesValue: readonly FoldRange[] = [];

  attachFoldState(foldState: DocumentFoldState): void {
    this.foldState.value = foldState;
    this.foldRevision.value++;
  }

  foldRanges(): readonly FoldRange[] {
    if (!this.codeFoldingEnabled || !this.hasDocument.value) return [];
    return CodeFolding.Class.ranges(
      this.document,
      LanguageRegistry.Class.forPath(this.document.path),
    );
  }

  get collapsedFoldRanges(): readonly FoldRange[] {
    // openFile places the cursor before activating the freshly loaded document. That placement
    // consults folding so it can reveal a requested line, but a document-less projection is not a
    // valid revision snapshot and must not seed the cache used after activation.
    if (!this.codeFoldingEnabled || !this.hasDocument.value) return [];
    const documentRevision = this.document.revision.value;
    const foldRevision = this.foldRevision.value;
    if (
      this.collapsedFoldRangesDocumentRevision === documentRevision &&
      this.collapsedFoldRangesFoldRevision === foldRevision
    ) {
      return this.collapsedFoldRangesValue;
    }
    const collapsedLineStarts = this.foldState.value.collapsedLineStarts;
    if (collapsedLineStarts.size === 0) {
      this.collapsedFoldRangesValue = [];
      this.collapsedFoldRangesDocumentRevision = documentRevision;
      this.collapsedFoldRangesFoldRevision = foldRevision;
      return this.collapsedFoldRangesValue;
    }
    const foldRanges = [...collapsedLineStarts]
      .map((startLine) => this.foldRangeAtLine(startLine))
      .filter((range): range is FoldRange => range !== null)
      .sort(
        (firstRange, secondRange) =>
          firstRange.startLine - secondRange.startLine,
      );
    if (
      this.collapsedFoldRangesFoldRevision === foldRevision &&
      foldRanges.length === this.collapsedFoldRangesValue.length &&
      foldRanges.every(
        (range, rangeIndex) =>
          range === this.collapsedFoldRangesValue[rangeIndex],
      )
    ) {
      this.collapsedFoldRangesDocumentRevision = documentRevision;
      return this.collapsedFoldRangesValue;
    }
    this.collapsedFoldRangesValue = foldRanges;
    this.collapsedFoldRangesDocumentRevision = documentRevision;
    this.collapsedFoldRangesFoldRevision = foldRevision;
    return this.collapsedFoldRangesValue;
  }

  foldRangeAtLine(lineIndex: number): FoldRange | null {
    if (!this.codeFoldingEnabled || !this.hasDocument.value) return null;
    return CodeFolding.Class.rangeAtLine(
      this.document,
      LanguageRegistry.Class.forPath(this.document.path),
      lineIndex,
    );
  }

  foldStartsAtLine(lineIndex: number): boolean {
    if (!this.codeFoldingEnabled || !this.hasDocument.value) return false;
    return CodeFolding.Class.startsAtLine(
      this.document,
      LanguageRegistry.Class.forPath(this.document.path),
      lineIndex,
    );
  }

  toggleFoldAtLine(lineIndex: number): boolean {
    const range = this.foldRangeAtLine(lineIndex);
    if (!range) return false;
    const collapsedLineStarts = this.foldState.value.collapsedLineStarts;
    const previousTopmostRow = EditorWrap.Class.lineSegmentAtVisualRow(
      this.document,
      this.viewport.scrollTop.value,
      this.visualWrapWidth(),
      collapsedLineStarts.size === 0 ? [] : this.collapsedFoldRanges,
    );
    if (collapsedLineStarts.delete(lineIndex)) {
      this.foldRevision.value++;
      this.restoreFoldToggleViewportAnchor(previousTopmostRow);
      return true;
    }
    collapsedLineStarts.add(lineIndex);
    this.foldRevision.value++;
    if (
      this.cursor.line.value > range.startLine &&
      this.cursor.line.value <= range.endLine
    ) {
      this.cursor.clearSelection();
      this.placeCursor(
        range.startLine,
        TextCoordinates.Class.clampCol(
          this.document.line(range.startLine),
          this.cursor.col.value,
        ),
      );
    }
    this.restoreFoldToggleViewportAnchor(previousTopmostRow);
    return true;
  }

  protected restoreFoldToggleViewportAnchor(previousTopmostRow: {
    lineIndex: number;
    segmentIndex: number;
  }): void {
    const anchorVisualRow =
      EditorWrap.Class.visualRowOfLine(
        this.document,
        previousTopmostRow.lineIndex,
        this.visualWrapWidth(),
        this.collapsedFoldRanges,
      ) + previousTopmostRow.segmentIndex;
    const maximumScrollTop = Math.max(
      0,
      this.totalVisualRows() - this.viewport.height.value,
    );
    this.viewport.scrollTop.value = Math.max(
      0,
      Math.min(anchorVisualRow, maximumScrollTop),
    );
  }

  foldAtCursor(): void {
    const cursorLine = this.cursor.line.value;
    const range =
      this.foldRangeAtLine(cursorLine) ??
      [...this.foldRanges()]
        .reverse()
        .find(
          (candidate) =>
            candidate.startLine < cursorLine && candidate.endLine >= cursorLine,
        );
    if (!range) return;
    if (this.foldState.value.collapsedLineStarts.has(range.startLine)) return;
    this.toggleFoldAtLine(range.startLine);
  }

  unfoldAtCursor(): void {
    const cursorLine = this.cursor.line.value;
    const range = this.collapsedFoldRanges.find(
      (candidate) =>
        candidate.startLine === cursorLine ||
        (candidate.startLine < cursorLine && candidate.endLine >= cursorLine),
    );
    if (range) this.toggleFoldAtLine(range.startLine);
  }

  protected unfoldToRevealLine(lineIndex: number): void {
    const collapsedLineStarts = this.foldState.value.collapsedLineStarts;
    if (collapsedLineStarts.size === 0) return;
    let changed = false;
    for (const range of this.collapsedFoldRanges) {
      if (range.startLine < lineIndex && range.endLine >= lineIndex) {
        changed = collapsedLineStarts.delete(range.startLine) || changed;
      }
    }
    if (changed) this.foldRevision.value++;
  }

  /** The display-column width visual rows wrap at (the laid-out code viewport width). */
  wrapWidth(): number {
    return Math.max(1, this.viewport.width.value);
  }

  visualWrapWidth(): number | null {
    return this.wordWrap.value ? this.wrapWidth() : null;
  }

  totalVisualRows(): number {
    return EditorWrap.Class.totalVisualRows(
      this.document,
      this.visualWrapWidth(),
      this.collapsedFoldRanges,
    );
  }

  /** The logical document line at the top of the current visual-row viewport. */
  lineAtViewportTop(): number {
    return EditorWrap.Class.lineSegmentAtVisualRow(
      this.document,
      this.viewport.scrollTop.value,
      this.visualWrapWidth(),
      this.collapsedFoldRanges,
    ).lineIndex;
  }

  /** Place a logical document line at the top of the visual-row viewport without moving the cursor. */
  scrollLineToViewportTop(lineIndex: number): void {
    this.viewport.haltScrollMomentum();
    const targetVisualRow = EditorWrap.Class.visualRowOfLine(
      this.document,
      lineIndex,
      this.visualWrapWidth(),
      this.collapsedFoldRanges,
    );
    const maximumScrollTop = Math.max(
      0,
      this.totalVisualRows() - this.viewport.height.value,
    );
    this.viewport.scrollTop.value = Math.max(
      0,
      Math.min(targetVisualRow, maximumScrollTop),
    );
  }

  toggleWordWrap(): void {
    this.wordWrap.value = !this.wordWrap.value;
    if (!this.hasDocument.value) return;
    if (this.wordWrap.value) {
      this.viewport.scrollLeft.value = 0; // horizontal scroll is inert in wrap mode
      this.revealCursorMapped();
    } else {
      // Restore the absolute display-column goal and the caret-following horizontal scroll.
      this.placeCursor(this.cursor.line.value, this.cursor.col.value);
      this.scrollLineIntoView(this.cursor.line.value);
    }
  }

  // Wrap-mode reveal: scrollTop is a VISUAL-row index in wrap mode (so it shares the momentum engine +
  // the scrollbar reads visual extent), so the reveal is the plain min/max on the cursor's ABSOLUTE
  // visual row = (first visual row of its line) + (its segment within the line). This is what makes the
  // scroll reach the true last visual row: no logical-line quantization.
  protected revealCursorMapped(
    placement: ViewportTargetPlacement = 'nearest',
  ): void {
    const wrapWidth = this.visualWrapWidth();
    const segments =
      wrapWidth === null
        ? [
            {
              startGrapheme: 0,
              endGrapheme: TextCoordinates.Class.graphemeCount(
                this.document.line(this.cursor.line.value),
              ),
              startDisplayColumn: 0,
            },
          ]
        : EditorWrap.Class.wrapLine(
            this.document.line(this.cursor.line.value),
            wrapWidth,
          );
    const segmentIndex = EditorWrap.Class.segmentIndexForCursor(
      segments,
      this.cursor.col.value,
    );
    const cursorVisualRow =
      EditorWrap.Class.firstVisualRowOfLine(
        this.document,
        this.cursor.line.value,
        wrapWidth,
        this.collapsedFoldRanges,
      ) + segmentIndex;
    this.viewport.scrollTop.value = TextViewport.Class.scrollTopForTarget(
      cursorVisualRow,
      this.viewport.scrollTop.value,
      this.viewport.height.value,
      this.totalVisualRows(),
      placement,
    );
  }

  /** Reveal through the shared visual-row projection in both wrap modes. */
  protected scrollLineIntoView(line: number): void {
    void line;
    this.revealCursorMapped();
  }

  /**
   * Re-anchor the scroll on the cursor for the CURRENT wrap mode — called when word wrap is toggled (by
   * the command OR the settings panel), where viewport.scrollTop switches units (logical lines ↔ visual
   * rows). Revealing the cursor sets a valid scrollTop in the new units without a fragile unit
   * conversion, so the cursor stays on screen across the toggle.
   */
  revealCursor(): void {
    if (!this.hasDocument.value) return;
    this.revealCursorMapped('reading');
  }

  openFile(path: string): void {
    this.recordOrdinaryEdit();
    this.document.loadFromFile(path);
    this.placeCursor(0, 0);
    this.cursor.clearSelection();
    this.viewport.scrollTop.value = 0;
    this.hasDocument.value = true;
    this.readOnly.value = this.document.binary.value;
    this.undo.clear();
  }

  // --- LiveBuffer surface (the OpenBufferSet flyweight drives these) --------
  // A clean tab outside the bounded recently-active set is dehydrated to a light position handle and
  // its document/undo/syntax are released; reactivation recreates the buffer and restores the handle.
  // A DIRTY tab is never dehydrated, so its unsaved edits survive.

  /** Dirty = the document's content differs from the last saved/loaded content (drives the tab's
   *  dirty dot + the never-dehydrate rule). Content-derived on EVERY path: no mutator asserts it, so
   *  an edit sequence that cancels out — type then backspace, delete a line and retype it, cut then
   *  paste back — reads as clean with no undo involved. */
  get dirty(): boolean {
    return this.document.dirty;
  }

  /** Capture the resumable cursor + scroll position so this buffer can be dehydrated. */
  snapshotPosition(): {
    cursorLine: number;
    cursorColumn: number;
    scrollTop: number;
    scrollLeft: number;
  } {
    return {
      cursorLine: this.cursor.line.value,
      cursorColumn: this.cursor.col.value,
      scrollTop: this.viewport.scrollTop.value,
      scrollLeft: this.viewport.scrollLeft.value,
    };
  }

  /** Restore a snapshot after rehydration (the file was just reloaded into a fresh document). */
  restorePosition(position: {
    cursorLine: number;
    cursorColumn: number;
    scrollTop: number;
    scrollLeft: number;
  }): void {
    if (!this.hasDocument.value) return;
    this.placeCursor(position.cursorLine, position.cursorColumn);
    this.viewport.scrollTop.value = position.scrollTop;
    this.viewport.scrollLeft.value = position.scrollLeft;
  }

  /** Release the owned document text + undo history so a closed/dehydrated tab frees memory promptly
   *  (the Editor holds no external listeners/timers, so dropping these + the reference is complete). */
  override dispose(): void {
    this.disposeUndoDocumentListener?.();
    this.disposeUndoDocumentListener = null;
    this.disposeEditorContributions?.();
    this.disposeEditorContributions = null;
    this.editorContributions = null;
    this.undo.clear();
    super.dispose();
    this.hasDocument.value = false;
  }

  /** Open a VIRTUAL read-only diff document (git panel drill-in). */
  openDiff(displayPath: string, diffText: string): void {
    this.openText(`${displayPath}.diff`, diffText);
    this.viewport.scrollTop.value = 0;
    this.viewport.scrollLeft.value = 0;
    this.hasDocument.value = true;
    this.readOnly.value = true; // a diff is a VIEW; editing happens in the real file
    this.undo.clear();
  }

  // --- selection ------------------------------------------------------------

  /** Delete from the cursor to the LINE START (text to the right of the cursor stays). With an active
   *  selection, delete the selection instead. Cmd/Ctrl+Backspace. */
  deleteToLineStart(): void {
    if (!this.hasDocument.value) return;
    this.recordOrdinaryEdit();
    if (this.hasSelection) {
      this.captureBefore('delete');
      this.removeSelection();
      this.scrollLineIntoView(this.cursor.line.value);
      return;
    }
    const line = this.cursor.line.value;
    const column = this.cursor.col.value;
    if (column === 0) return; // already at line start — nothing to the left on this line
    this.captureBefore('delete');
    this.document.deleteRange({ line, col: 0 }, { line, col: column });
    this.placeCursor(line, 0);
    this.scrollLineIntoView(line);
  }

  /** Delete the active selection (no undo capture — caller captures). Returns whether it removed. */
  protected removeSelection(): boolean {
    const range = this.cursor.selectionRange();
    if (!range) return false;
    const position = this.document.deleteRange(range.start, range.end);
    this.placeCursor(position.line, position.col);
    this.cursor.clearSelection();
    return true;
  }

  /**
   * Place the cursor at a grapheme column, recording the matching DISPLAY column as the goal.
   * Wrap mode: the goal is the visual column WITHIN the cursor's wrapped row, horizontal scroll
   * stays inert, and the reveal moves by visual rows.
   */
  override placeCursor(line: number, column: number): void {
    this.viewport.haltScrollMomentum(); // precise cursor move adopts authority, stops wheel glide
    this.unfoldToRevealLine(line);
    const lineText = this.document.line(line);
    const absoluteDisplayColumn = TextCoordinates.Class.displayColumn(
      lineText,
      column,
    );
    if (this.wordWrap.value) {
      const segments = EditorWrap.Class.wrapLine(lineText, this.wrapWidth());
      const segment =
        segments[EditorWrap.Class.segmentIndexForCursor(segments, column)];
      this.cursor.set(
        line,
        column,
        absoluteDisplayColumn - (segment?.startDisplayColumn ?? 0),
      );
      this.revealCursorMapped();
      return;
    }
    this.cursor.set(line, column, absoluteDisplayColumn);
    this.viewport.scrollToColumn(absoluteDisplayColumn); // keep the caret horizontally visible
  }

  /** Set/extend the anchor for a movement (extend) or drop the selection (plain move). */
  protected beginMove(extend: boolean): void {
    if (extend) {
      if (!this.cursor.anchor.value) this.cursor.setAnchorHere();
    } else {
      this.cursor.clearSelection();
    }
  }

  // --- editing --------------------------------------------------------------

  protected captureBefore(kind: EditKind): void {
    const now = Clock.Class.now();
    this.undo.begin(
      {
        beforeCursor: {
          line: this.cursor.line.value,
          col: this.cursor.col.value,
        },
        kind,
        at: now,
      },
      now,
    );
  }

  protected recordOrdinaryEdit(): void {
    this.editorContributions?.recordOrdinaryEdit(
      this as unknown as Editor.Model,
    );
  }

  protected recordTyping(
    firstEditedLine: number,
    lastEditedLine: number,
  ): void {
    this.editorContributions?.recordTyping(
      this as unknown as Editor.Model,
      firstEditedLine,
      lastEditedLine,
    );
  }

  insertText(text: string): void {
    if (this.readOnly.value || !this.hasDocument.value) return;
    const firstEditedLine =
      this.cursor.selectionRange()?.start.line ?? this.cursor.line.value;
    this.captureBefore('insert');
    this.removeSelection();
    const column = this.document.insertInline(
      this.cursor.line.value,
      this.cursor.col.value,
      text,
    );
    this.placeCursor(this.cursor.line.value, column);
    this.scrollLineIntoView(this.cursor.line.value);
    this.recordTyping(firstEditedLine, this.cursor.line.value);
  }

  applyCompletion(
    item: LanguageCompletionItem,
    fallbackRange: LanguageRange,
  ): void {
    if (this.readOnly.value || !this.hasDocument.value) return;
    this.recordOrdinaryEdit();
    const edit = item.textEdit ?? {
      range: fallbackRange,
      newText: item.insertText ?? item.label,
    };
    this.captureBefore('other');
    this.cursor.clearSelection();
    const position = this.document.replaceRange(
      {
        line: edit.range.start.line,
        col: edit.range.start.column,
      },
      {
        line: edit.range.end.line,
        col: edit.range.end.column,
      },
      edit.newText,
    );
    this.placeCursor(position.line, position.col);
    this.scrollLineIntoView(position.line);
  }

  insertNewline(): void {
    if (this.readOnly.value || !this.hasDocument.value) return;
    const firstEditedLine =
      this.cursor.selectionRange()?.start.line ?? this.cursor.line.value;
    this.captureBefore('newline');
    this.removeSelection();
    // Auto-indent: copy leading whitespace of the current line.
    const currentLine = this.document.line(this.cursor.line.value);
    const indent = currentLine.match(/^\s*/)?.[0] ?? '';
    const position = this.document.splitLine(
      this.cursor.line.value,
      this.cursor.col.value,
    );
    if (indent) {
      const column = this.document.insertInline(position.line, 0, indent);
      this.placeCursor(position.line, column);
    } else {
      this.placeCursor(position.line, position.col);
    }
    this.scrollLineIntoView(this.cursor.line.value);
    this.recordTyping(firstEditedLine, this.cursor.line.value);
  }

  backspace(): void {
    if (this.readOnly.value || !this.hasDocument.value) return;
    this.recordOrdinaryEdit();
    this.captureBefore('delete');
    if (this.removeSelection()) {
      this.scrollLineIntoView(this.cursor.line.value);
      return;
    }
    const position = this.document.deleteBackward(
      this.cursor.line.value,
      this.cursor.col.value,
    );
    this.placeCursor(position.line, position.col);
    this.scrollLineIntoView(position.line);
  }

  deleteChar(): void {
    if (this.readOnly.value || !this.hasDocument.value) return;
    this.recordOrdinaryEdit();
    this.captureBefore('delete');
    if (this.removeSelection()) return;
    this.document.deleteForward(this.cursor.line.value, this.cursor.col.value);
  }

  /** Delete exactly [wordLeft(cursor), cursor], or the active selection, as one undo step. */
  deletePreviousWord(): void {
    if (this.readOnly.value || !this.hasDocument.value) return;
    this.recordOrdinaryEdit();
    if (this.hasSelection) {
      this.captureBefore('delete');
      this.removeSelection();
      this.scrollLineIntoView(this.cursor.line.value);
      return;
    }

    const deletionStart = this.previousWordPosition(true);
    if (
      deletionStart.line === this.cursor.line.value &&
      deletionStart.col === this.cursor.col.value
    ) {
      return;
    }

    this.captureBefore('delete');
    this.document.deleteRange(deletionStart, {
      line: this.cursor.line.value,
      col: this.cursor.col.value,
    });
    this.placeCursor(deletionStart.line, deletionStart.col);
    this.scrollLineIntoView(deletionStart.line);
  }

  // --- structural line edits (move / duplicate) -----------------------------
  // Each is ONE atomic undo step: captureBefore snapshots the whole document + cursor once, then the
  // mutation runs; performUndo restores that snapshot, so a single undo reverts the move/dup. Kind
  // 'other' never coalesces with a neighbouring edit, so a move is never merged into a typing run.
  // v1 SCOPE: these act on the CURSOR line only. Moving a multi-line SELECTION block as a unit (the VS
  // Code behaviour) is a flagged follow-up; a selection is dropped and the cursor line moves.
  // invariant: A structural line edit is one atomic undo step that keeps the cursor on the moved line (src/modules/editor/editor.invariants.md)

  /** Swap the cursor's line with the one above, keeping the cursor on the moved line. No-op at the top. */
  moveLineUp(): void {
    if (this.readOnly.value || !this.hasDocument.value) return;
    this.recordOrdinaryEdit();
    const line = this.cursor.line.value;
    if (line <= 0) return; // top edge: nothing above to swap with
    this.captureBefore('other');
    const above = this.document.line(line - 1);
    const moved = this.document.line(line);
    this.document.setLine(line - 1, moved);
    this.document.setLine(line, above);
    this.placeCursor(
      line - 1,
      TextCoordinates.Class.clampCol(moved, this.cursor.col.value),
    );
    this.cursor.clearSelection();
    this.scrollLineIntoView(line - 1);
  }

  /** Swap the cursor's line with the one below, keeping the cursor on the moved line. No-op at the bottom. */
  moveLineDown(): void {
    if (this.readOnly.value || !this.hasDocument.value) return;
    this.recordOrdinaryEdit();
    const line = this.cursor.line.value;
    if (line >= this.document.lineCount - 1) return; // bottom edge: nothing below to swap with
    this.captureBefore('other');
    const below = this.document.line(line + 1);
    const moved = this.document.line(line);
    this.document.setLine(line + 1, moved);
    this.document.setLine(line, below);
    this.placeCursor(
      line + 1,
      TextCoordinates.Class.clampCol(moved, this.cursor.col.value),
    );
    this.cursor.clearSelection();
    this.scrollLineIntoView(line + 1);
  }

  /** Copy the cursor's line and insert the copy directly below; the cursor follows onto the copy. */
  duplicateLine(): void {
    if (this.readOnly.value || !this.hasDocument.value) return;
    this.recordOrdinaryEdit();
    this.captureBefore('other');
    const line = this.cursor.line.value;
    const text = this.document.line(line);
    this.document.insertLine(line + 1, text);
    this.placeCursor(
      line + 1,
      TextCoordinates.Class.clampCol(text, this.cursor.col.value),
    );
    this.cursor.clearSelection();
    this.scrollLineIntoView(line + 1);
  }

  // --- indentation ----------------------------------------------------------
  // Tab indents and Shift+Tab outdents because the EDITOR holds focus and Tab is content here — the
  // key is not the host's to spend. Each gesture is ONE atomic undo step (kind 'other' never
  // coalesces with a neighbouring typing run), and the indent unit is read from the document so the
  // editor never fights a file's existing style.
  // invariant: Focus owns the keystroke (src/modules/keybindings/keybindings.invariants.md)

  /** The indent unit this document uses (a tab, or the file's own space step). */
  protected detectIndentUnit(): string {
    return EditorIndent.Class.detectIndentUnit(
      this.document.slice(0, EditorIndent.Class.DETECTION_LINE_LIMIT),
    );
  }

  /**
   * Add one indent unit: to every line of the selection, or at the caret when there is none.
   * Inserting AT THE CARET (rather than at column 0) is what makes Tab usable mid-line for alignment,
   * and matches every IDE.
   */
  indent(): void {
    if (this.readOnly.value || !this.hasDocument.value) return;
    this.recordOrdinaryEdit();
    const indentUnit = this.detectIndentUnit();
    const selectionRange = this.cursor.selectionRange();
    this.captureBefore('other');
    if (!selectionRange) {
      const line = this.cursor.line.value;
      const column = this.document.insertInline(
        line,
        this.cursor.col.value,
        indentUnit,
      );
      this.placeCursor(line, column);
      this.scrollLineIntoView(line);
      return;
    }
    this.shiftLineRange(
      selectionRange.start.line,
      selectionRange.end.line,
      indentUnit,
      'indent',
    );
  }

  /** Remove at most one indent unit from every selected line, or from the caret's line. */
  outdent(): void {
    if (this.readOnly.value || !this.hasDocument.value) return;
    this.recordOrdinaryEdit();
    const indentUnit = this.detectIndentUnit();
    const selectionRange = this.cursor.selectionRange();
    this.captureBefore('other');
    const firstLine = selectionRange
      ? selectionRange.start.line
      : this.cursor.line.value;
    const lastLine = selectionRange
      ? selectionRange.end.line
      : this.cursor.line.value;
    this.shiftLineRange(firstLine, lastLine, indentUnit, 'outdent');
  }

  /**
   * Re-indent every line in `[firstLine, lastLine]`, then move the cursor and the selection anchor by
   * the SAME per-line character delta, so the selection keeps covering exactly the lines it did (the
   * gesture is repeatable: Tab Tab Tab keeps indenting the same block). Fully empty lines are left
   * alone so indenting a block never plants trailing whitespace.
   */
  protected shiftLineRange(
    firstLine: number,
    lastLine: number,
    indentUnit: string,
    direction: 'indent' | 'outdent',
  ): void {
    const columnDeltaByLine = new Map<number, number>();
    for (let line = firstLine; line <= lastLine; line += 1) {
      const lineText = this.document.line(line);
      if (direction === 'indent' && lineText.length === 0) continue;
      const shiftedText =
        direction === 'indent'
          ? EditorIndent.Class.indentLine(lineText, indentUnit)
          : EditorIndent.Class.outdentLine(lineText, indentUnit);
      if (shiftedText === lineText) continue;
      this.document.setLine(line, shiftedText);
      columnDeltaByLine.set(line, shiftedText.length - lineText.length);
    }
    const anchorPosition = this.cursor.anchor.value;
    if (anchorPosition) {
      const anchorDelta = columnDeltaByLine.get(anchorPosition.line) ?? 0;
      this.cursor.anchor.value = {
        line: anchorPosition.line,
        col: Math.max(0, anchorPosition.col + anchorDelta),
      };
    }
    const cursorLine = this.cursor.line.value;
    const cursorDelta = columnDeltaByLine.get(cursorLine) ?? 0;
    this.placeCursor(
      cursorLine,
      TextCoordinates.Class.clampCol(
        this.document.line(cursorLine),
        Math.max(0, this.cursor.col.value + cursorDelta),
      ),
    );
    this.scrollLineIntoView(cursorLine);
  }

  // --- clipboard ------------------------------------------------------------

  async cutSelection(): Promise<void> {
    if (this.readOnly.value || !this.hasDocument.value) return;
    const text = this.selectionText();
    if (!text) return;
    this.recordOrdinaryEdit();
    await Clipboard.Class.copy(text);
    this.captureBefore('delete');
    this.removeSelection();
    this.scrollLineIntoView(this.cursor.line.value);
  }

  async pasteClipboard(): Promise<void> {
    this.pasteText(await Clipboard.Class.paste());
  }

  /** Insert bulk text at the caret as ONE paste edit (replacing any selection, multiline-aware). Shared
   *  by clipboard paste and terminal bracketed-paste (dictation / Ctrl+V), so both coalesce identically
   *  under undo. */
  pasteText(text: string): void {
    if (this.readOnly.value || !this.hasDocument.value || !text) return;
    const firstEditedLine =
      this.cursor.selectionRange()?.start.line ?? this.cursor.line.value;
    this.captureBefore('paste');
    this.removeSelection();
    const position = this.document.insertMultiline(
      this.cursor.line.value,
      this.cursor.col.value,
      text,
    );
    this.placeCursor(position.line, position.col);
    this.scrollLineIntoView(position.line);
    this.recordTyping(firstEditedLine, position.line);
  }

  // --- undo/redo ------------------------------------------------------------

  performUndo(): void {
    this.recordOrdinaryEdit();
    const target = this.undo.undo({
      line: this.cursor.line.value,
      col: this.cursor.col.value,
    });
    if (!target) return;
    for (
      let changeIndex = target.changes.length - 1;
      changeIndex >= 0;
      changeIndex--
    ) {
      const change = target.changes[changeIndex];
      if (!change) continue;
      this.document.applyLineChange(
        change.startLineIndex,
        change.insertedLines.length,
        change.deletedLines,
      );
    }
    this.placeCursor(target.beforeCursor.line, target.beforeCursor.col);
    this.cursor.clearSelection();
    this.scrollLineIntoView(target.beforeCursor.line);
  }

  performRedo(): void {
    this.recordOrdinaryEdit();
    const target = this.undo.redo();
    if (!target) return;
    for (const change of target.changes) {
      this.document.applyLineChange(
        change.startLineIndex,
        change.deletedLines.length,
        change.insertedLines,
      );
    }
    const afterCursor = target.afterCursor ?? target.beforeCursor;
    this.placeCursor(afterCursor.line, afterCursor.col);
    this.cursor.clearSelection();
    this.scrollLineIntoView(afterCursor.line);
  }

  replaceRangeAsUndoStep(range: LanguageRange, replacementText: string): void {
    if (this.readOnly.value || !this.hasDocument.value) return;
    this.recordOrdinaryEdit();
    this.captureBefore('other');
    this.cursor.clearSelection();
    const position = this.document.replaceRange(
      {
        line: range.start.line,
        col: range.start.column,
      },
      {
        line: range.end.line,
        col: range.end.column,
      },
      replacementText,
    );
    this.placeCursor(position.line, position.col);
    this.scrollLineIntoView(position.line);
  }

  save(): boolean {
    if (!this.hasDocument.value || !this.document.path) return false;
    Files.Class.write(this.document.path, this.document.text);
    this.document.markSaved();
    return true;
  }

  get title(): string {
    if (!this.hasDocument.value) return 'Editor';
    const name = this.document.path
      ? Files.Class.basename(this.document.path)
      : 'untitled';
    return this.document.dirty ? `${name} ●` : name;
  }

  // --- movement (extend = shift-select) -------------------------------------

  protected currentLineLength(): number {
    return TextCoordinates.Class.graphemeCount(
      this.document.line(this.cursor.line.value),
    );
  }

  moveVertical(delta: number, extend = false): void {
    this.beginMove(extend);
    const target = EditorWrap.Class.moveByVisualRows(
      this.document,
      { line: this.cursor.line.value, col: this.cursor.col.value },
      this.cursor.goalColumn.value,
      delta,
      this.visualWrapWidth(),
      this.collapsedFoldRanges,
    );
    this.cursor.moveToLineKeepingGoal(target.line, target.col);
    this.viewport.scrollToColumn(
      TextCoordinates.Class.displayColumn(
        this.document.line(target.line),
        target.col,
      ),
    );
    this.scrollLineIntoView(target.line);
  }

  moveHorizontal(delta: number, extend = false): void {
    this.beginMove(extend);
    let line = this.cursor.line.value;
    let column = this.cursor.col.value + delta;
    if (column < 0) {
      if (line > 0) {
        line = this.previousVisibleLine(line);
        column = TextCoordinates.Class.graphemeCount(this.document.line(line));
      } else {
        column = 0;
      }
    } else if (column > this.currentLineLength()) {
      if (line < this.document.lineCount - 1) {
        line = this.nextVisibleLine(line);
        column = 0;
      } else {
        column = this.currentLineLength();
      }
    }
    this.placeCursor(line, column);
    this.scrollLineIntoView(line);
  }

  protected previousVisibleLine(lineIndex: number): number {
    let candidate = Math.max(0, lineIndex - 1);
    for (const range of this.collapsedFoldRanges) {
      if (range.startLine < lineIndex && range.endLine >= candidate) {
        candidate = range.startLine;
      }
    }
    return candidate;
  }

  protected nextVisibleLine(lineIndex: number): number {
    const foldedRange = this.collapsedFoldRanges.find(
      (range) => range.startLine === lineIndex,
    );
    return Math.min(
      this.document.lineCount - 1,
      foldedRange ? foldedRange.endLine + 1 : lineIndex + 1,
    );
  }

  /** Ctrl+Left/Right: jump to the previous/next word start (grapheme-safe). */
  moveWordHorizontal(direction: -1 | 1, extend = false): void {
    if (!this.hasDocument.value) return;
    this.beginMove(extend);
    if (direction < 0) {
      const target = this.previousWordPosition(false);
      this.placeCursor(target.line, target.col);
      this.scrollLineIntoView(target.line);
      return;
    }

    const isWordCharacter = (cluster: string): boolean =>
      /[\p{L}\p{N}_]/u.test(cluster);
    let line = this.cursor.line.value;
    let column = this.cursor.col.value;
    const clusters = () =>
      TextCoordinates.Class.graphemes(this.document.line(line));
    let lineClusters = clusters();
    if (column >= lineClusters.length) {
      if (line >= this.document.lineCount - 1) return;
      line = this.nextVisibleLine(line);
      column = 0;
      lineClusters = clusters();
    } else {
      while (
        column < lineClusters.length &&
        isWordCharacter(lineClusters[column] ?? '')
      )
        column += 1;
    }
    while (
      column < lineClusters.length &&
      !isWordCharacter(lineClusters[column] ?? '')
    )
      column += 1;
    this.placeCursor(line, column);
    this.scrollLineIntoView(line);
  }

  /**
   * Convert the shared string boundary back into an editor line/grapheme position. The local text
   * window includes only the preceding line and current prefix: enough to represent the newline
   * boundary without materializing the document, so cost is independent of document length.
   */
  protected previousWordPosition(useDeletionRange: boolean): {
    line: number;
    col: number;
  } {
    const currentLineIndex = this.cursor.line.value;
    const currentLineText = this.document.line(currentLineIndex);
    const currentPrefixEndUtf16Offset = TextCoordinates.Class.graphemeToU16(
      currentLineText,
      this.cursor.col.value,
    );
    const currentPrefix = currentLineText.slice(0, currentPrefixEndUtf16Offset);
    const previousLineIndex =
      currentLineIndex > 0
        ? this.previousVisibleLine(currentLineIndex)
        : currentLineIndex;
    const previousLineText =
      currentLineIndex > 0 ? this.document.line(previousLineIndex) : '';
    const currentLineStart =
      currentLineIndex > 0
        ? TextCoordinates.Class.graphemeCount(previousLineText) + 1
        : 0;
    const localText =
      currentLineIndex > 0
        ? `${previousLineText}\n${currentPrefix}`
        : currentPrefix;
    const localCursor = TextCoordinates.Class.graphemeCount(localText);
    const localStart = useDeletionRange
      ? TextEditing.Class.deletePreviousWord(localText, localCursor).start
      : TextEditing.Class.wordLeft(localText, localCursor);

    if (currentLineIndex > 0 && localStart < currentLineStart) {
      return { line: previousLineIndex, col: localStart };
    }
    return { line: currentLineIndex, col: localStart - currentLineStart };
  }

  /** Ctrl+Home / Ctrl+End: jump to the document start/end. */
  moveDocumentStart(extend = false): void {
    if (!this.hasDocument.value) return;
    this.beginMove(extend);
    this.placeCursor(0, 0);
    this.scrollLineIntoView(0);
  }
  moveDocumentEnd(extend = false): void {
    if (!this.hasDocument.value) return;
    this.beginMove(extend);
    const lastLine = this.document.lineCount - 1;
    this.placeCursor(
      lastLine,
      TextCoordinates.Class.graphemeCount(this.document.line(lastLine)),
    );
    this.scrollLineIntoView(lastLine);
  }

  moveToLineStart(extend = false): void {
    this.beginMove(extend);
    this.placeCursor(this.cursor.line.value, 0);
  }
  moveToLineEnd(extend = false): void {
    this.beginMove(extend);
    this.placeCursor(this.cursor.line.value, this.currentLineLength());
  }
  pageDown(extend = false): void {
    this.moveVertical(this.viewport.height.value - 1, extend);
  }
  pageUp(extend = false): void {
    this.moveVertical(-(this.viewport.height.value - 1), extend);
  }
  gotoTop(extend = false): void {
    this.beginMove(extend);
    this.placeCursor(0, 0);
    this.scrollLineIntoView(0);
  }
  gotoBottom(extend = false): void {
    this.beginMove(extend);
    const last = this.document.lineCount - 1;
    this.placeCursor(last, 0);
    this.scrollLineIntoView(last);
  }
}

export namespace Editor {
  export const $Class = $Editor;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}
