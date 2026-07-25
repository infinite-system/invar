// The reactive terminal service: it composes a TerminalBackend with a TerminalEmulator and wires the
// two byte directions once, then exposes the screen reactively. Child bytes (backend.onData) feed the
// emulator; the emulator's replies (onReply) return to the child; each parsed-write pulse bumps
// `renderRevision` so the single coarse frame effect repaints WITHOUT a keypress (an idle shell bumps
// nothing → idle quiescence holds). Resize drives the emulator AND the backend together, so the cell
// grid and the child's SIGWINCH view never disagree.
//
// invariant: Terminal bytes cross exactly one backend seam (src/modules/terminal/terminal.invariants.md)
// invariant: The emulator is the single source of terminal screen state (src/modules/terminal/terminal.invariants.md)
import { Reactive } from 'ivue';
import { ref } from 'vue';
import type { TerminalBackend } from './TerminalBackend';
import { TerminalEmulator } from './TerminalEmulator';
import type { TerminalCell } from './TerminalEmulator';
import {
  TerminalCommandController,
  type TerminalCommandEvent,
  type TerminalCommandRequestResult,
} from './TerminalCommandController';
import { TerminalHeader } from './TerminalHeader';

class $TerminalInstance {
  protected readonly terminalCommandController: TerminalCommandController.Model;
  protected userInputAwaitingParse = false;
  protected lastKnownIdentity = '';
  protected lastKnownWorkingDirectory = '';
  protected plainTitleFallback = '';

  constructor(
    protected readonly backend: TerminalBackend,
    protected readonly emulator: TerminalEmulator.Model,
    commandOptions: TerminalInstanceCommandOptions = {},
  ) {
    this.plainTitleFallback = this.backend.title ?? 'Terminal';
    this.lastKnownWorkingDirectory = this.backend.cwd ?? '';
    this.terminalCommandController = new TerminalCommandController.Class({
      write: (data) => this.sendInput(data),
      submit: () => this.submitAgentCommand(),
      isPromptIdle: () => !this.userInputAwaitingParse && this.emulator.isPromptIdle,
      currentInputLine: () => this.emulator.currentPromptInputLine(),
      currentWorkingDirectory: () => this.currentWorkingDirectory,
      typingSpeed: commandOptions.typingSpeed ?? (() => 40),
      reducedMotion: commandOptions.reducedMotion ?? (() => false),
      random: Math.random,
      scheduler: {
        setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds),
        clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
    });
    // PTY → emulator; emulator replies → PTY; parsed pulse → one repaint; child exit → repaint.
    this.backend.onData((bytes) => this.emulator.write(bytes));
    this.emulator.onReply((data) => this.backend.write(data));
    this.emulator.onCellsChanged(() => {
      this.userInputAwaitingParse = false;
      this.renderRevision.value++;
      this.terminalCommandController.notifyTerminalChanged();
    });
    this.emulator.onMetadataChanged(() => {
      this.updateHeaderMetadata();
      this.renderRevision.value++;
    });
    this.backend.onExit((exitCode) => {
      this.exited.value = true;
      this.exitCode.value = exitCode;
      this.renderRevision.value++;
    });
  }

  /** Bumped on every parsed emulator pulse and on exit — the reactive paint signal the frame effect
   *  observes so async PTY output repaints on its own. */
  get renderRevision() {
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
      currentInputLine: this.emulator.currentPromptInputLine(),
      recentOutputLines: this.emulator.recentTextLines(40),
    };
  }

  onTerminalCommandEvent(callback: (event: TerminalCommandEvent) => void): void {
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

  /** Pull one visible cell for the renderer (viewport-pull; no per-cell state held here). */
  cell(row: number, column: number): TerminalCell | null {
    return this.emulator.cell(row, column);
  }

  visibleLineText(row: number): string {
    return this.emulator.visibleLineText(row);
  }

  dispose(): void {
    this.terminalCommandController.dispose();
    this.backend.kill();
    this.emulator.dispose();
  }

  protected submitAgentCommand(): void {
    this.emulator.markPromptSubmitted();
    this.backend.write('\r');
  }

  protected updateHeaderMetadata(): void {
    const titleIdentityAndPath = TerminalHeader.Class.identityAndPath(this.emulator.title);
    if (titleIdentityAndPath) {
      this.lastKnownIdentity = titleIdentityAndPath.identity;
      this.lastKnownWorkingDirectory = titleIdentityAndPath.path;
      return;
    }
    if (this.emulator.title) this.plainTitleFallback = this.emulator.title;
    const workingDirectory = TerminalHeader.Class.workingDirectory(
      this.emulator.currentWorkingDirectory,
    );
    if (workingDirectory) this.lastKnownWorkingDirectory = workingDirectory.path;
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
}

export interface TerminalInputSnapshot {
  currentInputLine: string | null;
  recentOutputLines: readonly string[];
}
