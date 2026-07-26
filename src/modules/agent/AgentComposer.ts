import type { Ref } from 'vue';
import { WrapText } from '../ui/WrapText';
import {
  TextSelectionModel,
  type SelectionPoint,
  type SelectionSpanRange,
} from '../ui/TextSelectionModel';
import { EditorCoordinates } from '../editor/EditorCoordinates';
import { TextInputModel, type TextInputAction } from '../editor/TextInputModel';
import { Clipboard } from '../system/Clipboard';
import { AgentWordWrap, type AgentWordWrapSegment } from './AgentWordWrap';

// invariant: Editable text fields share one input model (project.invariants.md)
// invariant: Composer editing uses the input model (src/modules/agent/agent.invariants.md)
// invariant: Agent text wraps at word boundaries (src/modules/agent/agent.invariants.md)
// invariant: Agent skill invocations use the composer popup (src/modules/agent/agent.invariants.md)

class $AgentComposer {
  static get maxRows(): number {
    return 5;
  }

  static get gutterColumns(): number {
    return 2;
  }

  protected static get rightPaddingColumns(): number {
    return 2;
  }

  protected readonly input: TextInputModel.Model;
  protected readonly selection = new TextSelectionModel.Class();
  /** Last frame's wrap width + scroll offset — the coord space for caret / pointer / selection mapping. */
  protected lastWrapWidth = 1;
  protected scrollOffset = 0;
  /** Cached wrap segments for (buffer, width) — every geometry read derives from ONE segmentation. */
  protected cachedSegments: readonly AgentWordWrapSegment[] | null = null;
  protected cachedSegmentsText = '';
  protected cachedSegmentsWidth = 0;

  constructor() {
    this.input = this.createInput();
  }

  protected createInput(): TextInputModel.Model {
    return new TextInputModel.Class();
  }

  /** The reactive buffer text (the pane fuses its length into the render revision). */
  get text(): Ref<string> {
    return this.input.text;
  }
  get value(): string {
    return this.input.value;
  }
  get isEmpty(): boolean {
    return this.input.isEmpty;
  }
  /** The cursor's grapheme index (for tests / assertions). */
  get cursor(): number {
    return this.input.caret.value;
  }

  skillInvocation(): AgentSkillInvocation | null {
    const textBeforeCaret = this.input.value.slice(
      0,
      EditorCoordinates.Class.graphemeToU16(
        this.input.value,
        this.clampCursor(),
      ),
    );
    const match = /(?:^|\s)\/([A-Za-z0-9_-]*)$/.exec(textBeforeCaret);
    if (!match) return null;
    const prefix = match[1] ?? '';
    const slashUtf16Offset = textBeforeCaret.length - prefix.length - 1;
    return {
      prefix,
      start: EditorCoordinates.Class.graphemeCount(
        textBeforeCaret.slice(0, slashUtf16Offset),
      ),
      end: this.clampCursor(),
    };
  }

  replaceSkillInvocation(
    invocation: AgentSkillInvocation,
    skillName: string,
  ): void {
    const startUtf16Offset = EditorCoordinates.Class.graphemeToU16(
      this.input.value,
      invocation.start,
    );
    const endUtf16Offset = EditorCoordinates.Class.graphemeToU16(
      this.input.value,
      invocation.end,
    );
    const replacement = `/${skillName} `;
    this.input.setValue(
      this.input.value.slice(0, startUtf16Offset) +
        replacement +
        this.input.value.slice(endUtf16Offset),
    );
    this.input.caret.value =
      invocation.start + EditorCoordinates.Class.graphemeCount(replacement);
    this.selection.clear();
  }

  protected graphemeCount(): number {
    return this.input.graphemeCount;
  }
  protected clampCursor(): number {
    return Math.max(0, Math.min(this.input.caret.value, this.graphemeCount()));
  }

  // --- editing (all at the CURSOR; every edit clears the selection) ----------------------------------

  /** Insert typed text AT the cursor. Newlines flatten to spaces (the composer is one logical line that
   *  sends on Enter). The cursor advances past the inserted text. */
  insert(text: string): void {
    if (this.input.insert(text)) this.selection.clear();
  }
  /** Delete the grapheme BEFORE the cursor (Backspace). */
  backspace(): void {
    if (this.input.backspace()) this.selection.clear();
  }
  /** Delete the grapheme AT the cursor (Delete/forward-delete). */
  deleteForward(): void {
    if (this.input.deleteForward()) this.selection.clear();
  }
  /** Delete the WORD before the cursor (Alt/Option+Backspace) — cursor-aware via the shared seam. */
  deletePreviousWord(): void {
    if (this.input.deletePreviousWord()) this.selection.clear();
  }
  /** Delete through the next word boundary (Alt/Option+Delete). */
  deleteNextWord(): void {
    if (this.input.deleteNextWord()) this.selection.clear();
  }
  /** Clear the whole current logical line (Ctrl/Cmd+Backspace) — the composer is one logical line. */
  deleteLine(): void {
    if (this.input.deleteLine()) this.selection.clear();
  }
  /** Empty the buffer (after a send). */
  clear(): void {
    this.input.clear();
    this.selection.clear();
  }

  applyInputAction(action: TextInputAction): void {
    switch (action) {
      case 'moveLeft':
        this.moveLeft();
        return;
      case 'moveRight':
        this.moveRight();
        return;
      case 'moveWordLeft':
        this.moveWordLeft();
        return;
      case 'moveWordRight':
        this.moveWordRight();
        return;
      case 'moveHome':
        this.moveHome();
        return;
      case 'moveEnd':
        this.moveEnd();
        return;
      case 'backspace':
        this.backspace();
        return;
      case 'deleteForward':
        this.deleteForward();
        return;
      case 'deletePreviousWord':
        this.deletePreviousWord();
        return;
      case 'deleteNextWord':
        this.deleteNextWord();
        return;
      case 'deleteLine':
        this.deleteLine();
    }
  }

  // --- cursor motion (all clear the selection) -------------------------------------------------------

  moveLeft(): void {
    this.input.moveLeft();
    this.selection.clear();
  }
  moveRight(): void {
    this.input.moveRight();
    this.selection.clear();
  }
  moveWordLeft(): void {
    this.input.moveWordLeft();
    this.selection.clear();
  }
  moveWordRight(): void {
    this.input.moveWordRight();
    this.selection.clear();
  }
  moveHome(): void {
    this.input.moveHome();
    this.selection.clear();
  }
  moveEnd(): void {
    this.input.moveEnd();
    this.selection.clear();
  }
  /** Move the cursor UP one visual line at the same column. Returns false when already on the first
   *  visual line (the host then falls through to transcript scroll). */
  moveUp(): boolean {
    const caret = this.caretVisual();
    if (caret.line <= 0) return false;
    this.input.caret.value = this.positionAt(caret.line - 1, caret.column);
    this.selection.clear();
    return true;
  }
  /** Move the cursor DOWN one visual line. Returns false when already on the last visual line. */
  moveDown(): boolean {
    const caret = this.caretVisual();
    if (caret.line >= this.numVisualLines() - 1) return false;
    this.input.caret.value = this.positionAt(caret.line + 1, caret.column);
    this.selection.clear();
    return true;
  }

  // --- visual geometry (cursor ↔ wrapped row/DISPLAY-cell column, through the WrapText seam) ---------
  // The buffer is one logical line (newlines flatten on insert), so buffer grapheme indices align 1:1
  // with the seam's whole-text offsets. All geometry derives from ONE segments() call per state — the
  // uniform-width index/width math this replaces disagreed with rendered rows on wide/combining text
  // (the reviewed éx caret divergence).

  /** The wrapped segments for the CURRENT buffer at the last layout width (cached per state). */
  protected segments(): readonly AgentWordWrapSegment[] {
    if (
      this.cachedSegments === null ||
      this.cachedSegmentsText !== this.input.value ||
      this.cachedSegmentsWidth !== this.lastWrapWidth
    ) {
      this.cachedSegments = AgentWordWrap.Class.segments(
        this.input.value,
        Math.max(1, this.lastWrapWidth),
      );
      this.cachedSegmentsText = this.input.value;
      this.cachedSegmentsWidth = this.lastWrapWidth;
    }
    return this.cachedSegments;
  }
  protected numVisualLines(): number {
    return Math.max(1, this.segments().length);
  }
  /** DISPLAY-cell width of a visual row. */
  protected visualLineLength(lineIndex: number): number {
    return this.segments()[lineIndex]?.displayWidth ?? 0;
  }
  /** The cursor's visual (row, DISPLAY-cell column) in the wrapped composer. */
  protected caretVisual(): { line: number; column: number } {
    return AgentWordWrap.Class.visualPositionOf(
      this.segments(),
      this.clampCursor(),
    );
  }
  /** The grapheme index at a visual (row, DISPLAY-cell column), snapped to a cluster start. */
  protected positionAt(lineIndex: number, column: number): number {
    return Math.min(
      this.graphemeCount(),
      AgentWordWrap.Class.graphemeAtVisualPosition(
        this.segments(),
        lineIndex,
        column,
      ),
    );
  }

  /** Lay the composer out for `paneWidth` columns: wrap, cap the row count, scroll to keep the CURSOR
   *  line visible, mark selection spans, and place the caret at the cursor's visual cell. */
  layout(paneWidth: number): ComposerLayout {
    const agentComposerClass = this.constructor as typeof $AgentComposer;
    this.lastWrapWidth = Math.max(
      1,
      paneWidth -
        agentComposerClass.gutterColumns -
        agentComposerClass.rightPaddingColumns,
    );
    const segments = this.segments();

    const totalLines = Math.max(1, segments.length);
    const rowCount = Math.max(
      1,
      Math.min(totalLines, agentComposerClass.maxRows),
    );
    const caret = this.caretVisual();

    // Scroll minimally to keep the caret line visible (persisted between frames — natural scrolling).
    const maximumOffset = Math.max(0, totalLines - rowCount);
    if (caret.line < this.scrollOffset) this.scrollOffset = caret.line;
    else if (caret.line > this.scrollOffset + rowCount - 1)
      this.scrollOffset = caret.line - rowCount + 1;
    this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maximumOffset));

    const rows: ComposerRow[] = [];
    for (let visibleIndex = 0; visibleIndex < rowCount; visibleIndex += 1) {
      const absoluteLine = this.scrollOffset + visibleIndex;
      const segment = segments[absoluteLine];
      rows.push({
        absoluteLine,
        isFirstLine: absoluteLine === 0,
        text: segment?.text ?? '',
        selection: this.selection.rangeForLine(
          absoluteLine,
          segment?.displayWidth ?? 0,
        ),
      });
    }

    return {
      rows,
      rowCount,
      caretRow: Math.max(
        0,
        Math.min(caret.line - this.scrollOffset, rowCount - 1),
      ),
      caretColumn: agentComposerClass.gutterColumns + caret.column,
    };
  }

  // --- selection (reuses the shared model; the host maps screen cells → these composer coords) --------

  /** Map a composer-local cell (column already pane-relative, row within the visible composer rows) to a
   *  selection point in the composer's full visual-line space. */
  pointAt(localColumn: number, visibleRow: number): SelectionPoint {
    const agentComposerClass = this.constructor as typeof $AgentComposer;
    const line = this.scrollOffset + Math.max(0, visibleRow);
    const column = Math.max(0, localColumn - agentComposerClass.gutterColumns);
    return { line, column };
  }
  beginSelection(point: SelectionPoint): void {
    this.selection.begin(point);
  }
  extendSelection(point: SelectionPoint): void {
    this.selection.extend(point);
  }
  finishSelection(): void {
    this.selection.finish();
  }
  clearSelection(): boolean {
    return this.selection.clear();
  }
  hasSelection(): boolean {
    return this.selection.hasSelection();
  }
  lineGraphemeCount(lineIndex: number): number {
    return this.visualLineLength(lineIndex);
  }
  /** Rows the composer currently occupies (for the host's screen-region check). */
  get rowCount(): number {
    const agentComposerClass = this.constructor as typeof $AgentComposer;
    return Math.max(
      1,
      Math.min(this.numVisualLines(), agentComposerClass.maxRows),
    );
  }

  /** The selected buffer text — through the SEAM's resolver-based reconstruction (the composer no
   *  longer suppresses the shared selectedText): each covered row slices grapheme-safely by DISPLAY
   *  cells, and rows join with '' because composer wraps concatenate (no phantom newlines). */
  selectedText(): string {
    const segments = this.segments();
    return this.selection.selectedText((line, startCell, endCell) => {
      const segment = segments[line];
      if (!segment) return null;
      const selectedVisibleText = WrapText.Class.sliceByDisplayCells(
        segment.text,
        startCell,
        endCell ?? Number.MAX_SAFE_INTEGER,
      );
      if (endCell !== null) return selectedVisibleText;
      const displayedGraphemeCount = EditorCoordinates.Class.graphemeCount(
        segment.text,
      );
      const sourceGraphemes = EditorCoordinates.Class.graphemes(
        segment.sourceText,
      );
      return (
        selectedVisibleText +
        sourceGraphemes.slice(displayedGraphemeCount).join('')
      );
    }, '');
  }

  /** Copy the composer selection to the OS clipboard; resolves to the character count copied. */
  async copySelection(): Promise<number> {
    const text = this.selectedText();
    if (!text) return 0;
    await Clipboard.Class.copy(text);
    return text.length;
  }
}

export namespace AgentComposer {
  export const $Class = $AgentComposer;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface ComposerRow {
  readonly absoluteLine: number;
  readonly isFirstLine: boolean;
  readonly text: string;
  readonly selection: SelectionSpanRange | null;
}

export interface ComposerLayout {
  readonly rows: ComposerRow[];
  readonly rowCount: number;
  readonly caretRow: number;
  readonly caretColumn: number;
}

export interface AgentSkillInvocation {
  readonly prefix: string;
  readonly start: number;
  readonly end: number;
}
