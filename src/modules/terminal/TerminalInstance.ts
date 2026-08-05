// The reactive terminal service: it composes a TerminalBackend with a TerminalEmulator and wires the
// two byte directions once, then exposes the screen reactively. Child bytes (backend.onData) feed the
// emulator; the emulator's replies (onReply) return to the child. Each ordinary parsed-write pulse
// bumps `renderRevision`; DEC 2026 holds those pulses and commits one final grid. An idle shell bumps
// nothing, so idle quiescence holds. Resize drives the emulator AND the backend together, so the cell
// grid and the child's SIGWINCH view never disagree.
//
// invariant: Terminal bytes cross exactly one backend seam (src/modules/terminal/terminal.invariants.md)
// invariant: The emulator is the single source of terminal screen state (src/modules/terminal/terminal.invariants.md)
// invariant: Agent terminal reads are redacted (src/modules/terminal/terminal.invariants.md)
// invariant: Child synchronized updates commit as one repaint (src/modules/terminal/terminal.invariants.md)
import { Reactive } from 'ivue';
import { ref } from 'vue';
import type { TerminalBackend } from './TerminalBackend.interface';
import { TerminalEmulator } from './TerminalEmulator';
import type { TerminalCell } from './TerminalEmulator';
import {
  TerminalCommandController,
  type TerminalCommandEvent,
  type TerminalCommandRequestResult,
} from './TerminalCommandController';
import { TerminalHeader } from './TerminalHeader';
import {
  TerminalObserver,
  type TerminalObservationEvent,
} from './TerminalObserver';
import type {
  TerminalScrollbackRequest,
  TerminalScrollbackSnapshot,
} from './TerminalEmulator';

class $TerminalInstance {
  constructor(
    protected readonly backend: TerminalBackend,
    protected readonly emulator: TerminalEmulator.Model,
    commandOptions: TerminalInstanceCommandOptions = {},
  ) {
    this.synchronizedUpdateTimeoutMilliseconds =
      commandOptions.synchronizedOutputTimeoutMilliseconds ?? 1_000;
    this.plainTitleFallback = this.backend.title ?? 'Terminal';
    this.lastKnownWorkingDirectory = this.backend.cwd ?? '';
    this.terminalCommandController = new TerminalCommandController.Class({
      write: (data) => this.sendInput(data),
      submit: () => this.submitAgentCommand(),
      isPromptIdle: () =>
        !this.userInputAwaitingParse && this.emulator.isPromptIdle,
      currentInputLine: () => this.emulator.currentPromptInputLine(),
      currentWorkingDirectory: () => this.currentWorkingDirectory,
      typingSpeed: commandOptions.typingSpeed ?? (() => 40),
      reducedMotion: commandOptions.reducedMotion ?? (() => false),
      random: Math.random,
      scheduler: {
        setTimeout: (callback, milliseconds) =>
          setTimeout(callback, milliseconds),
        clearTimeout: (handle) =>
          clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
    });
    this.terminalObserver = this.createTerminalObserver();
    // PTY → emulator; emulator replies → PTY; parsed pulse → one repaint; child exit → repaint.
    this.backend.onData((bytes) => this.emulator.write(bytes));
    this.emulator.onReply((data) => this.backend.write(data));
    this.emulator.onCellsChanged(() => this.observeCellsChanged());
    this.emulator.onMetadataChanged(() => {
      this.updateHeaderMetadata();
      if (this.holdSynchronizedUpdate()) return;
      this.renderRevision.value++;
    });
    this.backend.onExit((exitCode) => {
      this.clearSynchronizedUpdateTimeout();
      this.exited.value = true;
      this.exitCode.value = exitCode;
      this.renderRevision.value++;
    });
  }

  protected readonly terminalCommandController: TerminalCommandController.Model;
  protected readonly terminalObserver: TerminalObserver.Model;
  protected userInputAwaitingParse = false;
  protected lastKnownIdentity = '';
  protected lastKnownWorkingDirectory = '';
  protected plainTitleFallback = '';
  protected synchronizedUpdatePending = false;
  protected synchronizedUpdateTimedOut = false;
  protected synchronizedUpdateTimeoutHandle: ReturnType<
    typeof setTimeout
  > | null = null;
  protected readonly synchronizedUpdateTimeoutMilliseconds: number;

  /** Bumped on every ordinary parsed pulse, each synchronized commit, and exit. */
  get renderRevision() {
    return ref(0);
  }

  /** Child-output-only pulse. The pane uses it to halt an in-flight scrollback glide when fresh
   *  output returns the emulator viewport to the live bottom. */
  get outputRevision() {
    return ref(0);
  }

  get exited() {
    return ref(false);
  }

  get exitCode() {
    return ref<number | null>(null);
  }

  get title(): string {
    if (this.lastKnownIdentity && this.lastKnownWorkingDirectory) {
      return `${this.lastKnownIdentity}:${this.lastKnownWorkingDirectory}`;
    }
    return this.plainTitleFallback;
  }

  get currentWorkingDirectory(): string {
    return this.lastKnownWorkingDirectory || this.backend.cwd || '';
  }

  /** Send raw bytes to the child (already-encoded keystrokes, or pasted text). No-op once exited. */
  sendInput(bytes: string): void {
    if (this.exited.value || !bytes) return;
    this.backend.write(bytes);
  }

  sendUserInput(bytes: string): void {
    if (this.exited.value || !bytes) return;
    if (this.terminalCommandController.handleUserInput(bytes)) return;
    this.userInputAwaitingParse = true;
    if (bytes === '\r' || bytes === '\n' || bytes === '\x03') {
      this.emulator.markPromptSubmitted();
    }
    this.backend.write(bytes);
  }

  stageTerminalCommand(command: string): Promise<TerminalCommandRequestResult> {
    return this.terminalCommandController.stageTerminalCommand(command);
  }

  runTerminalCommand(command: string): Promise<TerminalCommandRequestResult> {
    return this.terminalCommandController.runTerminalCommand(command);
  }

  replaceTerminalInput(command: string): Promise<TerminalCommandRequestResult> {
    return this.terminalCommandController.replaceTerminalInput(command);
  }

  readTerminalInput(): TerminalInputSnapshot {
    return {
      currentInputLine: this.redactedCurrentInputLine(),
      recentOutputLines: this.terminalObserver.redactTextLines(
        this.emulator.recentTextLines(),
      ),
    };
  }

  readTerminalScrollback(
    request: TerminalScrollbackRequest = {},
  ): TerminalScrollbackSnapshot {
    const snapshot = this.emulator.scrollbackText(request);
    return {
      ...snapshot,
      lines: this.terminalObserver.redactTextLines(snapshot.lines),
    };
  }

  onTerminalObservation(
    callback: (event: TerminalObservationEvent) => void,
  ): () => void {
    return this.terminalObserver.onObservation(callback);
  }

  get observedEventCount(): number {
    return this.terminalObserver.eventCount;
  }

  get lastObservedBoundarySource(): 'osc133' | 'heuristic' | null {
    return this.terminalObserver.snapshot(1)[0]?.boundarySource ?? null;
  }

  onTerminalCommandEvent(
    callback: (event: TerminalCommandEvent) => void,
  ): void {
    this.terminalCommandController.onEvent(callback);
  }

  /** Resize BOTH the emulator grid and the child's tty in lockstep. */
  resize(columns: number, rows: number): void {
    if (this.exited.value) return;
    this.emulator.resize(columns, rows);
    this.backend.resize(columns, rows);
  }

  /** Resolve once pending emulator writes are parsed (deterministic reads in tests). */
  flush(): Promise<void> {
    return this.emulator.flush();
  }

  get columns(): number {
    return this.emulator.columns;
  }

  get rows(): number {
    return this.emulator.rows;
  }

  get cursorColumn(): number {
    return this.emulator.cursorColumn;
  }

  get cursorRow(): number {
    return this.emulator.cursorRow;
  }

  get scrollTop(): number {
    return this.emulator.scrollTop;
  }

  get scrollContentRows(): number {
    return this.emulator.scrollContentRows;
  }

  get scrollViewportRows(): number {
    return this.emulator.scrollViewportRows;
  }

  get isScrolledToBottom(): boolean {
    return this.emulator.isScrolledToBottom;
  }

  get forwardsWheelToChild(): boolean {
    return (
      this.emulator.mouseTrackingMode !== 'none' ||
      this.emulator.isAlternateScreenActive
    );
  }

  get mouseTrackingMode(): 'none' | 'x10' | 'vt200' | 'drag' | 'any' {
    return this.emulator.mouseTrackingMode;
  }

  get isSgrMouseEncodingEnabled(): boolean {
    return this.emulator.isSgrMouseEncodingEnabled;
  }

  scrollToLine(line: number): void {
    this.emulator.scrollToLine(line);
    this.renderRevision.value++;
  }

  /** Pull one visible cell for the renderer (viewport-pull; no per-cell state held here). */
  cell(row: number, column: number): TerminalCell | null {
    return this.emulator.cell(row, column);
  }

  visibleLineText(row: number): string {
    return this.emulator.visibleLineText(row);
  }

  paletteOverride(index: number): string | null {
    return this.emulator.paletteOverride(index);
  }

  dispose(): void {
    this.clearSynchronizedUpdateTimeout();
    this.terminalCommandController.dispose();
    this.terminalObserver.dispose();
    this.backend.kill();
    this.emulator.dispose();
  }

  protected createTerminalObserver(): TerminalObserver.Model {
    return new TerminalObserver.Class(this.emulator);
  }

  protected observeCellsChanged(): void {
    this.userInputAwaitingParse = false;
    if (this.holdSynchronizedUpdate()) return;
    if (!this.emulator.isSynchronizedOutputEnabled) {
      this.synchronizedUpdateTimedOut = false;
      this.clearSynchronizedUpdateTimeout();
    }
    this.commitChildOutput();
  }

  protected holdSynchronizedUpdate(): boolean {
    if (
      !this.emulator.isSynchronizedOutputEnabled ||
      this.synchronizedUpdateTimedOut
    ) {
      return false;
    }
    this.synchronizedUpdatePending = true;
    if (this.synchronizedUpdateTimeoutHandle === null) {
      this.synchronizedUpdateTimeoutHandle = setTimeout(
        () => this.releaseTimedOutSynchronizedUpdate(),
        this.synchronizedUpdateTimeoutMilliseconds,
      );
    }
    return true;
  }

  protected releaseTimedOutSynchronizedUpdate(): void {
    this.synchronizedUpdateTimeoutHandle = null;
    if (!this.synchronizedUpdatePending) return;
    this.synchronizedUpdatePending = false;
    this.synchronizedUpdateTimedOut = true;
    this.commitChildOutput();
  }

  protected clearSynchronizedUpdateTimeout(): void {
    if (this.synchronizedUpdateTimeoutHandle !== null) {
      clearTimeout(this.synchronizedUpdateTimeoutHandle);
      this.synchronizedUpdateTimeoutHandle = null;
    }
    this.synchronizedUpdatePending = false;
  }

  protected commitChildOutput(): void {
    this.emulator.scrollToBottom();
    this.outputRevision.value++;
    this.renderRevision.value++;
    this.terminalCommandController.notifyTerminalChanged();
  }

  protected redactedCurrentInputLine(): string | null {
    const currentInputLine = this.emulator.currentPromptInputLine();
    return currentInputLine === null
      ? null
      : this.terminalObserver.redactTextLine(currentInputLine);
  }

  protected submitAgentCommand(): void {
    this.emulator.markPromptSubmitted();
    this.backend.write('\r');
  }

  protected updateHeaderMetadata(): void {
    const titleIdentityAndPath = TerminalHeader.Class.identityAndPath(
      this.emulator.title,
    );
    if (titleIdentityAndPath) {
      this.lastKnownIdentity = titleIdentityAndPath.identity;
      this.lastKnownWorkingDirectory = titleIdentityAndPath.path;
      return;
    }
    if (this.emulator.title) this.plainTitleFallback = this.emulator.title;
    const workingDirectory = TerminalHeader.Class.workingDirectory(
      this.emulator.currentWorkingDirectory,
    );
    if (workingDirectory)
      this.lastKnownWorkingDirectory = workingDirectory.path;
  }
}

export namespace TerminalInstance {
  export const $Class = $TerminalInstance;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
  export type Model = InstanceType<typeof Class>;
}

export interface TerminalInstanceCommandOptions {
  typingSpeed?: () => number;
  reducedMotion?: () => boolean;
  synchronizedOutputTimeoutMilliseconds?: number;
}

export interface TerminalInputSnapshot {
  currentInputLine: string | null;
  recentOutputLines: readonly string[];
}
