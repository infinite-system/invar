import { TerminalCommandSanitizer } from './TerminalCommandSanitizer';
import { TerminalCommandTyping } from './TerminalCommandTyping';

// invariant: Seams are drawn at the shared generator (project.invariants.md)
// invariant: Animated agent commands stay visible and inert (src/modules/terminal/terminal.invariants.md)
// invariant: Terminal replacement preserves human execution (src/modules/terminal/terminal.invariants.md)
class $TerminalCommandController {
  protected readonly pendingRequests: TerminalCommandRequest[] = [];
  protected activeRequest: TerminalCommandRequest | null = null;
  protected activeTimer: unknown = null;
  protected activeResolve:
    ((outcome: TerminalCommandTypingOutcome) => void) | null = null;
  protected typedCharacterCount = 0;
  protected activeGraphemes: readonly string[] = [];
  protected stagedCommand: string | null = null;
  protected eventCallback: ((event: TerminalCommandEvent) => void) | null =
    null;
  protected disposed = false;

  constructor(protected readonly options: TerminalCommandControllerOptions) {}

  onEvent(callback: (event: TerminalCommandEvent) => void): void {
    this.eventCallback = callback;
  }

  async stageTerminalCommand(
    command: string,
  ): Promise<TerminalCommandRequestResult> {
    return this.request('stage', command);
  }

  async runTerminalCommand(
    command: string,
  ): Promise<TerminalCommandRequestResult> {
    return this.request('run', command);
  }

  async replaceTerminalInput(
    command: string,
  ): Promise<TerminalCommandRequestResult> {
    const replacedCommand = this.options.currentInputLine() ?? '';
    this.options.write('\x15');
    return this.request('stage', command, replacedCommand);
  }

  notifyTerminalChanged(): void {
    if (
      this.activeRequest ||
      this.pendingRequests.length === 0 ||
      !this.options.isPromptIdle()
    ) {
      return;
    }
    const nextRequest = this.pendingRequests.shift();
    if (nextRequest) void this.typeRequest(nextRequest);
  }

  handleUserInput(bytes: string): boolean {
    if (this.activeRequest && (bytes === '\r' || bytes === '\n')) {
      const activeExecution = this.activeRequest.execution;
      const activeCommand = this.activeRequest.command;
      this.completeActiveTypingImmediately();
      // Run mode already submitted through its authorized tool boundary. Stage mode now has a
      // complete staged buffer, so record the human grant and forward its Enter exactly once.
      if (activeExecution === 'run') return true;
      this.stagedCommand = null;
      this.emit({ kind: 'user-executed', command: activeCommand });
      return false;
    }

    if (this.activeRequest) {
      const interruptedCommand = this.activeRequest.command;
      this.cancelActiveTimer();
      this.activeRequest = null;
      this.typedCharacterCount = 0;
      this.activeGraphemes = [];
      this.resolveActiveTyping('aborted');
      this.emit({ kind: 'aborted', command: interruptedCommand });
      if (bytes === '\x03') {
        this.stagedCommand = null;
        this.options.write(bytes);
        return true;
      }
    }

    if (bytes === '\x03' && this.stagedCommand !== null) {
      const command = this.stagedCommand;
      this.stagedCommand = null;
      this.emit({ kind: 'rejected', command });
      return false;
    }

    if ((bytes === '\r' || bytes === '\n') && this.stagedCommand !== null) {
      const stagedCommand = this.stagedCommand;
      const executedCommand = this.options.currentInputLine() ?? stagedCommand;
      this.stagedCommand = null;
      this.emit(
        executedCommand === stagedCommand
          ? { kind: 'user-executed', command: stagedCommand }
          : {
              kind: 'user-edited-then-executed',
              command: stagedCommand,
              executedCommand,
            },
      );
    }
    return false;
  }

  dispose(): void {
    this.disposed = true;
    this.cancelActiveTimer();
    this.pendingRequests.length = 0;
    this.activeRequest = null;
    this.typedCharacterCount = 0;
    this.activeGraphemes = [];
    this.resolveActiveTyping('aborted');
    this.eventCallback = null;
  }

  protected async request(
    execution: TerminalCommandExecution,
    command: string,
    replacedCommand?: string,
  ): Promise<TerminalCommandRequestResult> {
    const sanitizedCommand = TerminalCommandSanitizer.Class.sanitize(command);
    if (!sanitizedCommand)
      return { state: 'rejected-empty', command: sanitizedCommand };
    const request = { execution, command: sanitizedCommand, replacedCommand };
    if (this.activeRequest || !this.options.isPromptIdle()) {
      this.pendingRequests.push(request);
      this.emit({
        kind: 'pending',
        command: sanitizedCommand,
        execution,
        currentWorkingDirectory: this.options.currentWorkingDirectory(),
      });
      return { state: 'queued', command: sanitizedCommand };
    }
    const outcome = await this.typeRequest(request);
    if (outcome === 'aborted') {
      return { state: 'aborted', command: sanitizedCommand };
    }
    return {
      state: execution === 'stage' ? 'staged' : 'executed',
      command: sanitizedCommand,
    };
  }

  // Typed bytes are written PLAIN, not bracketed-paste-wrapped: bash readline buffers a bracketed
  // paste and inserts it only at the closing marker, which makes animated typing invisible.
  // Inertness does not depend on the wrapper — the sanitizer strips CR/LF and all control/escape
  // bytes from the full payload before the first byte is written, so the payload cannot inject its
  // own submission. Plain echo also exposes prefixes before animation completes; an early human
  // Enter therefore fast-forwards the sanitized remainder before the one Enter reaches the PTY.
  protected typeRequest(
    request: TerminalCommandRequest,
  ): Promise<TerminalCommandTypingOutcome> {
    if (this.disposed) return Promise.resolve('aborted');
    this.activeRequest = request;
    this.typedCharacterCount = 0;
    const reducedMotion = this.options.reducedMotion();
    const typingSpeed = this.options.typingSpeed();
    const typingPlan = TerminalCommandTyping.Class.plan(
      request.command,
      typingSpeed,
      this.options.random,
    );
    this.activeGraphemes = typingPlan.graphemes;
    if (reducedMotion) {
      this.options.write(request.command);
      this.typedCharacterCount = this.activeGraphemes.length;
      this.finishRequest();
      return Promise.resolve('completed');
    }
    return new Promise((resolve) => {
      this.activeResolve = resolve;
      this.typeCharacter(0, typingPlan.graphemes, typingPlan.delays);
    });
  }

  protected typeCharacter(
    characterIndex: number,
    graphemes: readonly string[],
    delays: readonly number[],
  ): void {
    const request = this.activeRequest;
    if (!request || this.disposed) {
      this.resolveActiveTyping('aborted');
      return;
    }
    const grapheme = graphemes[characterIndex];
    if (grapheme === undefined) {
      this.finishRequest();
      return;
    }
    this.options.write(grapheme);
    this.typedCharacterCount = characterIndex + 1;
    const delayMilliseconds = delays[characterIndex] ?? 0;
    this.activeTimer = this.options.scheduler.setTimeout(() => {
      this.activeTimer = null;
      this.typeCharacter(characterIndex + 1, graphemes, delays);
    }, delayMilliseconds);
  }

  protected finishRequest(): void {
    const request = this.activeRequest;
    if (!request) return;
    this.cancelActiveTimer();
    this.activeRequest = null;
    this.typedCharacterCount = 0;
    const currentWorkingDirectory = this.options.currentWorkingDirectory();
    if (request.execution === 'run') {
      this.options.submit();
      this.emit({
        kind: 'agent-executed',
        command: request.command,
        currentWorkingDirectory,
      });
    } else if (request.replacedCommand !== undefined) {
      this.stagedCommand = request.command;
      this.emit({
        kind: 'replaced-then-staged',
        replacedCommand: request.replacedCommand,
        command: request.command,
        currentWorkingDirectory,
      });
    } else {
      this.stagedCommand = request.command;
      this.emit({
        kind: 'staged',
        command: request.command,
        currentWorkingDirectory,
      });
    }
    this.activeGraphemes = [];
    this.resolveActiveTyping('completed');
  }

  protected completeActiveTypingImmediately(): void {
    const request = this.activeRequest;
    if (!request) return;
    this.cancelActiveTimer();
    const remainingCommand = this.activeGraphemes
      .slice(this.typedCharacterCount)
      .join('');
    if (remainingCommand) this.options.write(remainingCommand);
    this.typedCharacterCount = this.activeGraphemes.length;
    this.finishRequest();
  }

  protected cancelActiveTimer(): void {
    if (this.activeTimer === null) return;
    this.options.scheduler.clearTimeout(this.activeTimer);
    this.activeTimer = null;
  }

  protected emit(event: TerminalCommandEvent): void {
    this.eventCallback?.(event);
  }

  protected resolveActiveTyping(outcome: TerminalCommandTypingOutcome): void {
    const resolve = this.activeResolve;
    this.activeResolve = null;
    resolve?.(outcome);
  }
}

export namespace TerminalCommandController {
  export const $Class = $TerminalCommandController;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export type TerminalCommandExecution = 'stage' | 'run';

export type TerminalCommandEvent =
  | {
      kind: 'pending';
      command: string;
      execution: TerminalCommandExecution;
      currentWorkingDirectory: string;
    }
  | { kind: 'staged'; command: string; currentWorkingDirectory: string }
  | {
      kind: 'replaced-then-staged';
      replacedCommand: string;
      command: string;
      currentWorkingDirectory: string;
    }
  | { kind: 'user-executed'; command: string }
  | {
      kind: 'user-edited-then-executed';
      command: string;
      executedCommand: string;
    }
  | { kind: 'agent-executed'; command: string; currentWorkingDirectory: string }
  | { kind: 'aborted'; command: string }
  | { kind: 'rejected'; command: string };

export type TerminalCommandRequestResult = {
  state: 'queued' | 'staged' | 'executed' | 'aborted' | 'rejected-empty';
  command: string;
};

export interface TerminalCommandScheduler {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface TerminalCommandControllerOptions {
  write(data: string): void;
  submit(): void;
  isPromptIdle(): boolean;
  currentInputLine(): string | null;
  currentWorkingDirectory(): string;
  typingSpeed(): number;
  reducedMotion(): boolean;
  random: () => number;
  scheduler: TerminalCommandScheduler;
}

type TerminalCommandRequest = {
  execution: TerminalCommandExecution;
  command: string;
  replacedCommand?: string;
};

type TerminalCommandTypingOutcome = 'completed' | 'aborted';
