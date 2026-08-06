// The terminal as a PaneContent — the adapter that makes a TerminalInstance a first-class occupant of
// the composable PanelHost. It is thin by design: render() delegates to TerminalPaneRenderer,
// handleKey() encodes the keystroke (TerminalKeys) and writes it through the instance's backend seam,
// onResize() maps the panel's cell region to a terminal resize, and renderRevision re-exposes the
// instance's paint signal. All terminal-specific knowledge lives below the seam; the host sees only a
// generic PaneContent.
//
// invariant: A focused panel routes keystrokes to its active pane content (src/modules/ui/ui.invariants.md)
// invariant: The panel renders exactly the visible pane content cells each frame (src/modules/ui/ui.invariants.md)
// invariant: Pane identity is separate from presentation (src/modules/ui/ui.invariants.md)
// invariant: Pane chrome and child cells keep separate authority (src/modules/terminal/terminal.invariants.md)
// invariant: Child terminal modes own wheel input (src/modules/terminal/terminal.invariants.md)
// invariant: Terminal follow obeys the live user mode (src/modules/agent/agent.invariants.md)
import { Static } from 'ivue/extras';
import type { StyledText } from '@opentui/core';
import type { KeyEvent } from '@opentui/core';
import type { Ref } from 'vue';
import { Momentum, type ScrollMomentum } from '../system/Momentum';
import type {
  PaneContent,
  PanePointerContext,
  PaneRenderContext,
  PaneScrollPort,
  PaneTaskMetadata,
  PaneWheelContext,
} from '../ui/PaneContent.interface';
import {
  TextSelectionModel,
  type SelectionPoint,
} from '../ui/TextSelectionModel';
import { WrapText } from '../ui/WrapText';
import { Clipboard } from '../system/Clipboard';
import { TerminalCommandNote } from './TerminalCommandNote';
import { TerminalPaneRenderer } from './TerminalPaneRenderer';
import { TerminalKeys } from './TerminalKeys';
import { TerminalMouse } from './TerminalMouse';
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
  // The terminal pane keeps a two-column horizontal gutter. Its frame supplies the header row, so the
  // emulator starts on the next row without another vertical pad. The emulator (and thus the child PTY)
  // sizes to the VISIBLE region inside this gutter; the caret and rendered cells shift by the same margin.
  protected static get PAD_COLUMNS(): number {
    return 2;
  }

  protected static get PAD_ROWS(): number {
    return 0;
  }
  constructor(
    protected readonly instance: TerminalInstance.Instance,
    identity: TerminalPaneIdentity = {},
  ) {
    this.id = identity.identifier ?? 'terminal';
    this.kind = identity.kind ?? 'terminal';
    this.instanceLabel = identity.label ?? 'Terminal';
    this.task = identity.task;
    this.heading = identity.heading ?? null;
  }

  readonly id: string;
  readonly kind: string;
  readonly instanceLabel: string;
  readonly task?: PaneTaskMetadata;
  readonly frameHeaderRows = 1;
  readonly icon = '❯'; // ❯
  // invariant: Bracketed paste survives stream chunking (src/modules/ui/ui.invariants.md)
  readonly acceptsDroppedPathPaste = true;
  // The pane owns the `terminal` keybinding context while the panel focuses it, so the host resolves
  // its bindings generically instead of testing for this class.
  readonly keybindingContext = 'terminal';
  protected readonly selection = new TextSelectionModel.Class();
  protected scrollPort: PaneScrollPort | null = null;
  protected observedOutputRevision = 0;
  protected verticalMomentum: ScrollMomentum = Momentum.Class.AT_REST;
  protected forwardedPointerButton: number | null = null;
  protected readonly heading: string | null;

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
      this.heading ??
      (this.instanceLabel === 'Terminal'
        ? this.instance.title
        : `${this.instanceLabel} · ${this.instance.title}`);
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

  moveWordLeft(): void {
    this.instance.sendUserInput('\x1bb');
  }

  moveWordRight(): void {
    this.instance.sendUserInput('\x1bf');
  }

  deletePreviousWord(): void {
    this.instance.sendUserInput('\x1b\x7f');
  }

  /** A paste while the terminal is focused: deliver the text to the child as raw input — the same
   *  bytes as if the user had typed the pasted/dictated text. */
  handlePaste(text: string): boolean {
    if (!text) return false;
    this.instance.pasteUserInput(text);
    return true;
  }

  onWheel(rowDelta: number, context?: PaneWheelContext): boolean {
    if (this.instance.forwardsWheelToChild) {
      const coordinates = this.childCoordinates(
        context?.column ?? this.terminalPadColumns,
        context?.row ?? this.terminalPadRows,
      );
      this.instance.sendInput(
        TerminalMouse.Class.encode({
          kind: 'wheel',
          wheelDirection: rowDelta < 0 ? 'up' : 'down',
          ...coordinates,
          modifiers: context?.modifiers ?? {
            alt: false,
            shift: false,
            ctrl: false,
          },
          trackingMode:
            this.instance.mouseTrackingMode === 'none'
              ? 'vt200'
              : this.instance.mouseTrackingMode,
          sgrEncoding:
            this.instance.isSgrMouseEncodingEnabled ||
            this.instance.mouseTrackingMode === 'none',
        }),
      );
      return true;
    }
    Momentum.Class.queueImpulse(this.verticalMomentum, rowDelta);
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

  /** The named ports this pane publishes. `terminal-commands` is the agent's read/stage/replace/run
   *  surface, `terminal-observation` its command-boundary stream, and `text-selection` the shared
   *  copy surface — each already satisfied structurally by this class, so a consumer resolves a port
   *  without importing the terminal module. */
  capability<Port>(identifier: string): Port | null {
    switch (identifier) {
      case 'terminal-commands':
      case 'terminal-observation':
      case 'text-selection':
        return this as unknown as Port;
      default:
        return null;
    }
  }

  /** A terminal selection owns copy; with no selection the same chord must fall through to the child
   *  as SIGINT, so the pane declines the action rather than the host special-casing it. */
  claimsContextAction(action: string): boolean {
    return action === 'terminal.copy' ? this.hasSelection() : true;
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

  /** The pane's own activity, already worded, for a host to relay. The listener never sees a
   *  terminal command event — only the finished note. */
  onSystemNote(listener: (note: string) => void): () => void {
    let subscribed = true;
    this.instance.onTerminalCommandEvent((event) => {
      if (subscribed) listener(TerminalCommandNote.Class.textFor(event));
    });
    return () => {
      subscribed = false;
    };
  }

  onPointerMove(
    column: number,
    row: number,
    context?: PanePointerContext,
  ): boolean {
    if (
      context?.modifiers.shift ||
      this.instance.mouseTrackingMode !== 'any' ||
      !this.isChildCell(column, row)
    ) {
      return false;
    }
    this.sendPointerEvent('motion', column, row, context, null);
    return true;
  }

  // invariant: Shift at pointer down reserves the drag for the host (src/modules/terminal/terminal.invariants.md)
  onPointerDown(
    column: number,
    row: number,
    context?: PanePointerContext,
  ): boolean {
    if (
      !context?.modifiers.shift &&
      this.instance.mouseTrackingMode !== 'none' &&
      this.isChildCell(column, row)
    ) {
      this.forwardedPointerButton = context?.button ?? 0;
      this.sendPointerEvent(
        'press',
        column,
        row,
        context,
        this.forwardedPointerButton,
      );
      return true;
    }
    this.selection.begin(this.selectionPoint(column, row));
    this.instance.renderRevision.value += 1;
    return true;
  }

  onPointerDrag(
    column: number,
    row: number,
    context?: PanePointerContext,
  ): boolean {
    if (
      this.forwardedPointerButton !== null &&
      this.instance.mouseTrackingMode !== 'none'
    ) {
      this.sendPointerEvent(
        'motion',
        column,
        row,
        context,
        this.forwardedPointerButton,
      );
      return true;
    }
    const point = this.selectionPoint(column, row);
    this.selection.extend({ line: point.line, column: point.column + 1 });
    this.instance.renderRevision.value += 1;
    return true;
  }

  onPointerUp(
    column: number,
    row: number,
    context?: PanePointerContext,
  ): boolean {
    if (this.forwardedPointerButton !== null) {
      if (this.instance.mouseTrackingMode !== 'none') {
        this.sendPointerEvent(
          'release',
          column,
          row,
          context,
          this.forwardedPointerButton,
        );
      }
      this.forwardedPointerButton = null;
      return true;
    }
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

  protected isChildCell(column: number, row: number): boolean {
    return (
      column >= this.terminalPadColumns &&
      column < this.terminalPadColumns + this.instance.columns &&
      row >= this.terminalPadRows &&
      row < this.terminalPadRows + this.instance.rows
    );
  }

  protected childCoordinates(
    column: number,
    row: number,
  ): { column: number; row: number } {
    return {
      column: Math.max(
        1,
        Math.min(this.instance.columns, column - this.terminalPadColumns + 1),
      ),
      row: Math.max(
        1,
        Math.min(this.instance.rows, row - this.terminalPadRows + 1),
      ),
    };
  }

  protected sendPointerEvent(
    kind: 'press' | 'release' | 'motion',
    column: number,
    row: number,
    context: PanePointerContext | undefined,
    button: number | null,
  ): void {
    this.instance.sendInput(
      TerminalMouse.Class.encode({
        kind,
        button: button ?? undefined,
        ...this.childCoordinates(column, row),
        modifiers: context?.modifiers ?? {
          alt: false,
          shift: false,
          ctrl: false,
        },
        trackingMode: this.instance.mouseTrackingMode,
        sgrEncoding: this.instance.isSgrMouseEncodingEnabled,
      }),
    );
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
  export const $Class = Static($TerminalPaneContent);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface TerminalPaneIdentity {
  identifier?: string;
  label?: string;
  kind?: string;
  heading?: string;
  task?: PaneTaskMetadata;
}
