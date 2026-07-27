// The terminal as a PaneContent — the adapter that makes a TerminalInstance a first-class occupant of
// the composable PanelHost. It is thin by design: render() delegates to TerminalPaneRenderer,
// handleKey() encodes the keystroke (TerminalKeys) and writes it through the instance's backend seam,
// onResize() maps the panel's cell region to a terminal resize, and renderRevision re-exposes the
// instance's paint signal. All terminal-specific knowledge lives below the seam; the host sees only a
// generic PaneContent.
//
// invariant: A focused panel routes keystrokes to its active pane content (src/modules/terminal/terminal.invariants.md)
// invariant: The panel renders exactly the visible pane content cells each frame (src/modules/terminal/terminal.invariants.md)
// invariant: Child terminal modes own wheel input (src/modules/terminal/terminal.invariants.md)
// invariant: Terminal follow obeys the live user mode (src/modules/agent/agent.invariants.md)
import type { StyledText } from '@opentui/core';
import type { KeyEvent } from '@opentui/core';
import type { Ref } from 'vue';
import { Momentum, type ScrollMomentum } from '../system/Momentum';
import type {
  PaneContent,
  PaneRenderContext,
  PaneScrollPort,
  PaneWheelContext,
} from '../ui/PaneContent.interface';
import {
  TextSelectionModel,
  type SelectionPoint,
} from '../ui/TextSelectionModel';
import { WrapText } from '../ui/WrapText';
import { Clipboard } from '../system/Clipboard';
import { TerminalPaneRenderer } from './TerminalPaneRenderer';
import { TerminalKeys } from './TerminalKeys';
import type { TerminalInstance } from './TerminalInstance';
import type {
  TerminalScrollbackRequest,
  TerminalScrollbackSnapshot,
} from './TerminalEmulator';
import type { TerminalObservationEvent } from './TerminalObserver';
import type {
  TerminalCommandEvent,
  TerminalCommandRequestResult,
} from './TerminalCommandController';

class $TerminalPaneContent implements PaneContent {
  // The terminal pane's gutter: a 2-column left/right margin and a 1-row top/bottom margin around the
  // emulator, so the shell doesn't hug the panel border. The emulator (and thus the child PTY) sizes to
  // the VISIBLE region inside the gutter; the caret and rendered cells shift by the same margin. Kept in
  // ONE place so render(), onResize(), and caret() agree — a mismatch would put the cursor off the text.
  protected static get PAD_COLUMNS(): number {
    return 2;
  }

  protected static get PAD_ROWS(): number {
    return 1;
  }

  readonly id: string;
  readonly kind = 'terminal';
  readonly instanceLabel: string;
  readonly icon = '❯'; // ❯
  protected readonly selection = new TextSelectionModel.Class();
  protected scrollPort: PaneScrollPort | null = null;
  protected observedOutputRevision = 0;
  protected verticalMomentum: ScrollMomentum = Momentum.Class.atRest;

  constructor(
    protected readonly instance: TerminalInstance.Instance,
    identity: TerminalPaneIdentity = {},
  ) {
    this.id = identity.identifier ?? 'terminal';
    this.instanceLabel = identity.label ?? 'Terminal';
  }

  protected get terminalPadColumns(): number {
    const terminalPaneContentClass = this
      .constructor as typeof $TerminalPaneContent;
    return terminalPaneContentClass.PAD_COLUMNS;
  }

  protected get terminalPadRows(): number {
    const terminalPaneContentClass = this
      .constructor as typeof $TerminalPaneContent;
    return terminalPaneContentClass.PAD_ROWS;
  }

  get title(): string {
    const liveTitle =
      this.id === 'terminal'
        ? this.instance.title
        : `${this.instanceLabel} · ${this.instance.title}`;
    return this.instance.exited.value ? `${liveTitle} (exited)` : liveTitle;
  }

  get renderRevision(): Ref<number> {
    return this.instance.renderRevision;
  }

  attachViewportScrollPort(scrollPort: PaneScrollPort): void {
    this.scrollPort = scrollPort;
    this.observedOutputRevision = this.instance.outputRevision.value;
  }

  render(context: PaneRenderContext): StyledText {
    if (this.observedOutputRevision !== this.instance.outputRevision.value) {
      this.observedOutputRevision = this.instance.outputRevision.value;
      this.haltScrollMomentum();
    }
    return TerminalPaneRenderer.Class.render({
      instance: this.instance,
      palette: context.palette,
      width: context.width,
      height: context.height,
      padColumns: this.terminalPadColumns,
      padRows: this.terminalPadRows,
      selectionRanges: Array.from(
        { length: this.instance.rows },
        (_unused, rowIndex) =>
          this.selection.rangeForLine(
            rowIndex,
            WrapText.Class.displayWidth(
              this.instance.visibleLineText(rowIndex),
            ),
          ),
      ),
    });
  }

  handleKey(key: KeyEvent): boolean {
    const bytes = TerminalKeys.Class.encode(key);
    if (!bytes) return false;
    this.instance.sendUserInput(bytes);
    return true;
  }

  /** A paste while the terminal is focused: deliver the text to the child as raw input — the same
   *  bytes as if the user had typed the pasted/dictated text. */
  handlePaste(text: string): boolean {
    if (!text) return false;
    this.instance.sendUserInput(text);
    return true;
  }

  onWheel(rowDelta: number, context?: PaneWheelContext): boolean {
    if (this.instance.forwardsWheelToChild) {
      this.instance.sendInput(this.sgrWheelSequence(rowDelta, context));
      return true;
    }
    this.verticalMomentum = Momentum.Class.addImpulse(
      this.verticalMomentum,
      rowDelta,
      this.scrollPort?.momentumOptions() ?? Momentum.Class.verticalOptions,
    );
    this.scrollPort?.requestRender();
    return true;
  }

  tickScroll(deltaSeconds: number): boolean {
    const options =
      this.scrollPort?.momentumOptions() ?? Momentum.Class.verticalOptions;
    const stepped = Momentum.Class.stepMomentum(
      this.verticalMomentum,
      deltaSeconds,
      options,
    );
    this.verticalMomentum = stepped.momentum;
    if (stepped.rows !== 0) {
      this.instance.scrollToLine(this.instance.scrollTop + stepped.rows);
    }
    return Momentum.Class.isMoving(this.verticalMomentum);
  }

  haltScrollMomentum(): void {
    this.verticalMomentum = Momentum.Class.halt();
  }

  stageTerminalCommand(command: string): Promise<TerminalCommandRequestResult> {
    return this.instance.stageTerminalCommand(command);
  }

  runTerminalCommand(command: string): Promise<TerminalCommandRequestResult> {
    return this.instance.runTerminalCommand(command);
  }

  replaceTerminalInput(command: string): Promise<TerminalCommandRequestResult> {
    return this.instance.replaceTerminalInput(command);
  }

  readTerminalInput(): {
    currentInputLine: string | null;
    recentOutputLines: readonly string[];
  } {
    return this.instance.readTerminalInput();
  }

  readTerminalScrollback(
    request: TerminalScrollbackRequest = {},
  ): TerminalScrollbackSnapshot {
    return this.instance.readTerminalScrollback(request);
  }

  onTerminalObservation(
    callback: (event: TerminalObservationEvent) => void,
  ): () => void {
    return this.instance.onTerminalObservation(callback);
  }

  get observedEventCount(): number {
    return this.instance.observedEventCount;
  }

  get terminalExited(): boolean {
    return this.instance.exited.value;
  }

  get terminalExitCode(): number | null {
    return this.instance.exitCode.value;
  }

  get lastObservedBoundarySource(): 'osc133' | 'heuristic' | null {
    return this.instance.lastObservedBoundarySource;
  }

  get scrollTop(): number {
    return this.instance.scrollTop;
  }

  get scrollContentRows(): number {
    return this.instance.scrollContentRows;
  }

  get scrollViewportRows(): number {
    return this.instance.scrollViewportRows;
  }

  get forwardsWheelToChild(): boolean {
    return this.instance.forwardsWheelToChild;
  }

  get scrollbarRowOffset(): number {
    return this.terminalPadRows;
  }

  scrollToLine(line: number): void {
    this.instance.scrollToLine(line);
  }

  onTerminalCommandEvent(
    callback: (event: TerminalCommandEvent) => void,
  ): void {
    this.instance.onTerminalCommandEvent(callback);
  }

  onPointerDown(column: number, row: number): boolean {
    this.selection.begin(this.selectionPoint(column, row));
    this.instance.renderRevision.value += 1;
    return true;
  }

  onPointerDrag(column: number, row: number): boolean {
    const point = this.selectionPoint(column, row);
    this.selection.extend({ line: point.line, column: point.column + 1 });
    this.instance.renderRevision.value += 1;
    return true;
  }

  onPointerUp(): boolean {
    this.selection.finish();
    this.instance.renderRevision.value += 1;
    return true;
  }

  hasSelection(): boolean {
    return this.selection.hasSelection();
  }

  async copySelection(): Promise<number> {
    const text = this.selection.selectedText(
      (line, startCell, endCell) =>
        WrapText.Class.sliceByDisplayCells(
          this.instance.visibleLineText(line),
          startCell,
          endCell ?? Number.MAX_SAFE_INTEGER,
        ),
      '\n',
    );
    if (!text) return 0;
    await Clipboard.Class.copy(text);
    return text.length;
  }

  protected selectionPoint(column: number, row: number): SelectionPoint {
    return {
      line: Math.max(
        0,
        Math.min(this.instance.rows - 1, row - this.terminalPadRows),
      ),
      column: Math.max(0, column - this.terminalPadColumns),
    };
  }

  protected sgrWheelSequence(
    rowDelta: number,
    context?: PaneWheelContext,
  ): string {
    const modifiers =
      (context?.modifiers.shift ? 4 : 0) +
      (context?.modifiers.alt ? 8 : 0) +
      (context?.modifiers.ctrl ? 16 : 0);
    const button = (rowDelta < 0 ? 64 : 65) + modifiers;
    const column = Math.max(
      1,
      Math.min(
        this.instance.columns,
        (context?.column ?? this.terminalPadColumns) -
          this.terminalPadColumns +
          1,
      ),
    );
    const row = Math.max(
      1,
      Math.min(
        this.instance.rows,
        (context?.row ?? this.terminalPadRows) - this.terminalPadRows + 1,
      ),
    );
    return `\x1b[<${button};${column};${row}M`;
  }

  caret(): { column: number; row: number } | null {
    if (this.instance.exited.value || !this.instance.isScrolledToBottom) {
      return null;
    }
    // Shift by the gutter so the block cursor lands on the padded cell, not the pane origin.
    return {
      column: this.instance.cursorColumn + this.terminalPadColumns,
      row: this.instance.cursorRow + this.terminalPadRows,
    };
  }

  onResize(columns: number, rows: number): void {
    // Size the emulator (and the child PTY) to the VISIBLE region inside the gutter, so `stty size`
    // reports the padded dimensions and no cell is drawn under the margin.
    this.instance.resize(
      Math.max(1, columns - 2 * this.terminalPadColumns),
      Math.max(1, rows - 2 * this.terminalPadRows),
    );
  }

  onFocus(): void {
    /* the terminal has no focus-specific state for tier S; the caret follows the emulator */
  }

  onBlur(): void {
    /* no-op */
  }

  dispose(): void {
    this.instance.dispose();
  }
}

export namespace TerminalPaneContent {
  export const $Class = $TerminalPaneContent;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface TerminalPaneIdentity {
  identifier?: string;
  label?: string;
}
