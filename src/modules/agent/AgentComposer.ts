import { Static } from 'ivue/extras';
import type { Ref } from 'vue';
import type {
  SelectionPoint,
  SelectionSpanRange,
} from '../ui/TextSelectionModel';
import { TextCoordinates } from '../text/TextCoordinates';
import { TextInputModel, type TextInputAction } from '../text/TextInputModel';
import { AgentWordWrap, type AgentWordWrapSegment } from './AgentWordWrap';

// invariant: Editable text fields share one input model (project.invariants.md)
// invariant: Composer editing uses the input model (src/modules/agent/agent.invariants.md)
// invariant: Agent text wraps at word boundaries (src/modules/agent/agent.invariants.md)
// invariant: Agent skill invocations use the composer popup (src/modules/agent/agent.invariants.md)

class $AgentComposer {
  static get MAX_ROWS(): number {
    return 5;
  }

  static get GUTTER_COLUMNS(): number {
    return 2;
  }

  protected static get RIGHT_PADDING_COLUMNS(): number {
    return 2;
  }
  constructor() {
    this.input = this.createInput();
  }

  protected readonly input: TextInputModel.Model;
  /** Last frame's wrap width + scroll offset — the coord space for caret / pointer / selection mapping. */
  protected lastWrapWidth = 1;
  protected scrollOffset = 0;
  /** Cached wrap segments for (buffer, width) — every geometry read derives from ONE segmentation. */
  protected cachedSegments: readonly AgentWordWrapSegment[] | null = null;
  protected cachedSegmentsText = '';
  protected cachedSegmentsWidth = 0;

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
      TextCoordinates.Class.graphemeToU16(this.input.value, this.clampCursor()),
    );
    const match = /(?:^|\s)\/([A-Za-z0-9_-]*)$/.exec(textBeforeCaret);
    if (!match) return null;
    const prefix = match[1] ?? '';
    const slashUtf16Offset = textBeforeCaret.length - prefix.length - 1;
    return {
      prefix,
      start: TextCoordinates.Class.graphemeCount(
        textBeforeCaret.slice(0, slashUtf16Offset),
      ),
      end: this.clampCursor(),
    };
  }

  replaceSkillInvocation(
    invocation: AgentSkillInvocation,
    skillName: string,
  ): void {
    const startUtf16Offset = TextCoordinates.Class.graphemeToU16(
      this.input.value,
      invocation.start,
    );
    const endUtf16Offset = TextCoordinates.Class.graphemeToU16(
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
      invocation.start + TextCoordinates.Class.graphemeCount(replacement);
  }

  protected graphemeCount(): number {
    return this.input.graphemeCount;
  }
  protected clampCursor(): number {
    return Math.max(0, Math.min(this.input.caret.value, this.graphemeCount()));
  }

  // --- editing (all through the shared input model) ---------------------------------------------------

  /** Insert typed text AT the cursor. Newlines flatten to spaces (the composer is one logical line that
   *  sends on Enter). The cursor advances past the inserted text. */
  insert(text: string): void {
    this.input.insert(text);
  }
  /** Delete the grapheme BEFORE the cursor (Backspace). */
  backspace(): void {
    this.input.backspace();
  }
  /** Delete the grapheme AT the cursor (Delete/forward-delete). */
  deleteForward(): void {
    this.input.deleteForward();
  }
  /** Delete the WORD before the cursor (Alt/Option+Backspace) — cursor-aware via the shared seam. */
  deletePreviousWord(): void {
    this.input.deletePreviousWord();
  }
  /** Delete through the next word boundary (Alt/Option+Delete). */
  deleteNextWord(): void {
    this.input.deleteNextWord();
  }
  /** Clear the whole current logical line (Ctrl/Cmd+Backspace) — the composer is one logical line. */
  deleteLine(): void {
    this.input.deleteLine();
  }
  /** Empty the buffer (after a send). */
  clear(): void {
    this.input.clear();
  }

  applyInputAction(action: TextInputAction): void {
    this.input.apply(action);
  }

  // --- cursor motion ----------------------------------------------------------------------------------

  moveLeft(): void {
    this.input.moveLeft();
  }
  moveRight(): void {
    this.input.moveRight();
  }
  moveWordLeft(): void {
    this.input.moveWordLeft();
  }
  moveWordRight(): void {
    this.input.moveWordRight();
  }
  moveHome(): void {
    this.input.moveHome();
  }
  moveEnd(): void {
    this.input.moveEnd();
  }
  /** Move the cursor UP one visual line at the same column. Returns false when already on the first
   *  visual line (the host then falls through to transcript scroll). */
  moveUp(): boolean {
    const caret = this.caretVisual();
    if (caret.line <= 0) return false;
    this.input.caret.value = this.positionAt(caret.line - 1, caret.column);
    this.input.clearSelection();
    return true;
  }
  /** Move the cursor DOWN one visual line. Returns false when already on the last visual line. */
  moveDown(): boolean {
    const caret = this.caretVisual();
    if (caret.line >= this.numVisualLines() - 1) return false;
    this.input.caret.value = this.positionAt(caret.line + 1, caret.column);
    this.input.clearSelection();
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
        agentComposerClass.GUTTER_COLUMNS -
        agentComposerClass.RIGHT_PADDING_COLUMNS,
    );
    const segments = this.segments();

    const totalLines = Math.max(1, segments.length);
    const rowCount = Math.max(
      1,
      Math.min(totalLines, agentComposerClass.MAX_ROWS),
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
        selection: segment ? this.selectionRangeForSegment(segment) : null,
      });
    }

    return {
      rows,
      rowCount,
      caretRow: Math.max(
        0,
        Math.min(caret.line - this.scrollOffset, rowCount - 1),
      ),
      caretColumn: agentComposerClass.GUTTER_COLUMNS + caret.column,
    };
  }

  // --- selection (reuses the shared model; the host maps screen cells → these composer coords) --------

  /** Map a composer-local cell (column already pane-relative, row within the visible composer rows) to a
   *  selection point in the composer's full visual-line space. */
  pointAt(localColumn: number, visibleRow: number): SelectionPoint {
    const agentComposerClass = this.constructor as typeof $AgentComposer;
    const line = this.scrollOffset + Math.max(0, visibleRow);
    const column = Math.max(0, localColumn - agentComposerClass.GUTTER_COLUMNS);
    return { line, column };
  }
  beginSelection(point: SelectionPoint): void {
    this.input.beginSelection(this.positionAt(point.line, point.column));
  }
  extendSelection(point: SelectionPoint): void {
    this.input.extendSelection(this.positionAt(point.line, point.column));
  }
  finishSelection(): void {
    this.input.finishSelection();
  }
  clearSelection(): boolean {
    return this.input.clearSelection();
  }
  hasSelection(): boolean {
    return this.input.hasSelection;
  }
  lineGraphemeCount(lineIndex: number): number {
    return this.visualLineLength(lineIndex);
  }
  /** Rows the composer currently occupies (for the host's screen-region check). */
  get rowCount(): number {
    const agentComposerClass = this.constructor as typeof $AgentComposer;
    return Math.max(
      1,
      Math.min(this.numVisualLines(), agentComposerClass.MAX_ROWS),
    );
  }

  selectedText(): string {
    return this.input.selectedText();
  }

  /** Copy the composer selection to the OS clipboard; resolves to the character count copied. */
  copySelection(): Promise<number> {
    return this.input.copySelection();
  }

  protected selectionRangeForSegment(
    segment: AgentWordWrapSegment,
  ): SelectionSpanRange | null {
    const selection = this.input.selectionRange();
    if (!selection) return null;
    const segmentEnd = segment.graphemeStart + segment.graphemeCount;
    const selectedStart = Math.max(selection.start, segment.graphemeStart);
    const selectedEnd = Math.min(selection.end, segmentEnd);
    if (selectedStart >= selectedEnd) return null;
    const sourceGraphemes = TextCoordinates.Class.graphemes(segment.sourceText);
    const start = TextCoordinates.Class.lineWidth(
      sourceGraphemes.slice(0, selectedStart - segment.graphemeStart).join(''),
    );
    const end = TextCoordinates.Class.lineWidth(
      sourceGraphemes.slice(0, selectedEnd - segment.graphemeStart).join(''),
    );
    const visibleStart = Math.min(segment.displayWidth, start);
    const visibleEnd = Math.min(segment.displayWidth, end);
    return visibleStart < visibleEnd
      ? { start: visibleStart, end: visibleEnd }
      : null;
  }
}

export namespace AgentComposer {
  export const $Class = Static($AgentComposer);
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
