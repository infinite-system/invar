import { ref, type Ref } from 'vue';
import {
  TerminalEmulator,
  type TerminalLineFeedEvent,
  type TerminalShellIntegrationEvent,
} from './TerminalEmulator';
import { TerminalHeader } from './TerminalHeader';

// invariant: Observation never writes to the PTY (src/modules/terminal/terminal.invariants.md)
// invariant: Observation payloads are bounded and self describing (src/modules/terminal/terminal.invariants.md)

class $TerminalObserver {
  protected readonly revisionValue = ref(0);
  protected readonly bufferedEntries: TerminalObservationBufferEntry[] = [];
  protected readonly textEncoder = new TextEncoder();
  protected readonly maximumEventCount: number;
  protected readonly maximumBufferBytes: number;
  protected readonly headLineCount: number;
  protected readonly tailLineCount: number;
  protected readonly outputByteCap: number;
  protected readonly now: () => number;
  protected readonly stopCellsChangedObservation: () => void;
  protected readonly stopLineFeedObservation: () => void;
  protected readonly stopShellIntegrationObservation: () => void;
  protected activeCommand: TerminalObservedCommand | null = null;
  protected pendingHeuristicCommand = '';
  protected pendingHeuristicCurrentWorkingDirectory = '';
  protected bufferedByteCountValue = 0;
  protected disposed = false;

  constructor(
    protected readonly emulator: TerminalEmulator.Model,
    options: TerminalObserverOptions = {},
  ) {
    const terminalObserverClass = this.constructor as typeof $TerminalObserver;
    this.maximumEventCount = this.positiveInteger(
      options.maximumEventCount,
      terminalObserverClass.defaultMaximumEventCount,
    );
    this.maximumBufferBytes = this.positiveInteger(
      options.maximumBufferBytes,
      terminalObserverClass.defaultMaximumBufferBytes,
    );
    this.headLineCount = this.nonnegativeInteger(
      options.headLineCount,
      terminalObserverClass.defaultHeadLineCount,
    );
    this.tailLineCount = this.nonnegativeInteger(
      options.tailLineCount,
      terminalObserverClass.defaultTailLineCount,
    );
    this.outputByteCap = this.positiveInteger(
      options.outputByteCap,
      terminalObserverClass.defaultOutputByteCap,
    );
    this.now = options.now ?? Date.now;
    this.stopCellsChangedObservation = this.emulator.onCellsChanged(
      () => this.observeParsedCells(),
    );
    this.stopLineFeedObservation = this.emulator.onLineFeed(
      (event) => this.observeLineFeed(event),
    );
    this.stopShellIntegrationObservation = this.emulator.onShellIntegrationEvent(
      (event) => this.observeShellIntegrationEvent(event),
    );
  }

  protected static get defaultMaximumEventCount(): number {
    return 100;
  }

  protected static get defaultMaximumBufferBytes(): number {
    return 256 * 1024;
  }

  protected static get defaultHeadLineCount(): number {
    return 20;
  }

  protected static get defaultTailLineCount(): number {
    return 20;
  }

  protected static get defaultOutputByteCap(): number {
    return 8192;
  }

  get revision(): Ref<number> {
    return this.revisionValue;
  }

  get eventCount(): number {
    return this.bufferedEntries.length;
  }

  get bufferedByteCount(): number {
    return this.bufferedByteCountValue;
  }

  snapshot(maximumEventCount = this.maximumEventCount): readonly TerminalObservationEvent[] {
    const safeMaximumEventCount = this.nonnegativeInteger(maximumEventCount, 0);
    const firstEventIndex = Math.max(0, this.bufferedEntries.length - safeMaximumEventCount);
    return this.bufferedEntries
      .slice(firstEventIndex)
      .map((entry) => entry.event);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopCellsChangedObservation();
    this.stopLineFeedObservation();
    this.stopShellIntegrationObservation();
    this.activeCommand = null;
  }

  protected observeShellIntegrationEvent(event: TerminalShellIntegrationEvent): void {
    if (this.disposed) return;
    if (this.activeCommand?.boundarySource === 'heuristic') this.activeCommand = null;
    if (event.kind === 'output-start') {
      const command = event.command ?? this.pendingHeuristicCommand;
      if (!command) return;
      this.activeCommand = this.createActiveCommand(
        command,
        event.currentWorkingDirectory,
        'osc133',
        event.cursorColumn,
      );
      return;
    }
    if (event.kind === 'command-end' && this.activeCommand?.boundarySource === 'osc133') {
      this.completeActiveCommand(event.exitCode, event.currentLine);
    }
  }

  protected observeLineFeed(event: TerminalLineFeedEvent): void {
    if (this.disposed) return;
    if (this.activeCommand) {
      this.recordOutputLine(event.line);
      this.activeCommand.completedLineFeedCount += 1;
      return;
    }
    if (this.emulator.hasShellIntegrationMarkers) return;
    const command = this.promptCommandFromLine(event.line);
    if (!command) return;
    this.pendingHeuristicCommand = command;
    this.activeCommand = this.createActiveCommand(
      command,
      this.emulator.currentWorkingDirectory,
      'heuristic',
      0,
    );
  }

  protected observeParsedCells(): void {
    if (this.disposed || this.emulator.hasShellIntegrationMarkers) return;
    const promptInputLine = this.emulator.currentPromptInputLine();
    if (promptInputLine !== null && promptInputLine !== '') {
      this.pendingHeuristicCommand = promptInputLine;
      this.pendingHeuristicCurrentWorkingDirectory = this.emulator.currentWorkingDirectory;
    }
    if (this.activeCommand?.boundarySource === 'heuristic' && promptInputLine === '') {
      this.completeActiveCommand(null, '');
    }
  }

  protected createActiveCommand(
    command: string,
    currentWorkingDirectory: string,
    boundarySource: TerminalObservationBoundarySource,
    firstOutputColumn: number,
  ): TerminalObservedCommand {
    return {
      command: this.redactLine(command),
      currentWorkingDirectory:
        currentWorkingDirectory || this.pendingHeuristicCurrentWorkingDirectory,
      boundarySource,
      startedAtMilliseconds: this.now(),
      firstOutputColumn: Math.max(0, firstOutputColumn),
      completedLineFeedCount: 0,
      totalLineCount: 0,
      observedByteCount: 0,
      headCandidateByteCount: 0,
      headCandidates: [],
      tailCandidates: [],
    };
  }

  protected completeActiveCommand(exitCode: number | null, currentLine: string): void {
    const activeCommand = this.activeCommand;
    if (!activeCommand) return;
    const currentOutputLine = activeCommand.completedLineFeedCount === 0
      ? currentLine.slice(activeCommand.firstOutputColumn)
      : currentLine;
    if (currentOutputLine !== '') this.recordOutputLine(currentOutputLine);
    const completedAtMilliseconds = this.now();
    const output = this.buildOutput(activeCommand);
    const workingDirectory = TerminalHeader.Class.workingDirectory(
      activeCommand.currentWorkingDirectory,
    );
    const event: TerminalObservationEvent = Object.freeze({
      kind: 'command-completed',
      command: activeCommand.command,
      cwd: workingDirectory?.path ?? activeCommand.currentWorkingDirectory,
      exitCode: activeCommand.boundarySource === 'heuristic' ? null : exitCode,
      durationMs: Math.max(
        0,
        Math.round(completedAtMilliseconds - activeCommand.startedAtMilliseconds),
      ),
      output,
      boundarySource: activeCommand.boundarySource,
      timestamp: new Date(completedAtMilliseconds).toISOString(),
    });
    this.activeCommand = null;
    this.pendingHeuristicCommand = '';
    this.pendingHeuristicCurrentWorkingDirectory = '';
    this.appendBounded(event);
  }

  protected recordOutputLine(line: string): void {
    const activeCommand = this.activeCommand;
    if (!activeCommand) return;
    const redactedLine = this.redactLine(line);
    const lineByteCount = this.byteLength(redactedLine);
    activeCommand.totalLineCount += 1;
    activeCommand.observedByteCount += lineByteCount;
    if (activeCommand.totalLineCount <= this.headLineCount) {
      const remainingHeadBytes = Math.max(
        0,
        this.outputByteCap - activeCommand.headCandidateByteCount,
      );
      const boundedLine = this.utf8Prefix(redactedLine, remainingHeadBytes);
      if (boundedLine !== '' || redactedLine === '') {
        activeCommand.headCandidates.push(boundedLine);
        activeCommand.headCandidateByteCount += this.byteLength(boundedLine);
      }
      return;
    }
    activeCommand.tailCandidates.push(this.utf8Suffix(redactedLine, this.outputByteCap));
    if (activeCommand.tailCandidates.length > this.tailLineCount) {
      activeCommand.tailCandidates.shift();
    }
    activeCommand.tailCandidates = this.fitTailLines(
      activeCommand.tailCandidates,
      this.outputByteCap,
    );
  }

  protected buildOutput(activeCommand: TerminalObservedCommand): TerminalObservationOutput {
    const hasTail = activeCommand.tailCandidates.length > 0;
    const headByteBudget = hasTail ? Math.floor(this.outputByteCap / 2) : this.outputByteCap;
    const headLines = this.fitHeadLines(activeCommand.headCandidates, headByteBudget);
    const headByteCount = this.linesByteLength(headLines);
    const tailByteBudget = this.outputByteCap - headByteCount;
    const tailLines = hasTail
      ? this.fitTailLines(activeCommand.tailCandidates, tailByteBudget)
      : [];
    const deliveredByteCount = headByteCount + this.linesByteLength(tailLines);
    return Object.freeze({
      headLines: Object.freeze(headLines),
      tailLines: Object.freeze(tailLines),
      totalLines: activeCommand.totalLineCount,
      truncated:
        activeCommand.totalLineCount > headLines.length + tailLines.length
        || activeCommand.observedByteCount > deliveredByteCount,
      byteCap: this.outputByteCap,
    });
  }

  protected fitHeadLines(lines: readonly string[], byteBudget: number): string[] {
    const fittedLines: string[] = [];
    let remainingBytes = Math.max(0, byteBudget);
    for (const line of lines) {
      const fittedLine = this.utf8Prefix(line, remainingBytes);
      if (fittedLine === '' && line !== '') break;
      fittedLines.push(fittedLine);
      remainingBytes -= this.byteLength(fittedLine);
      if (fittedLine !== line) break;
    }
    return fittedLines;
  }

  protected fitTailLines(lines: readonly string[], byteBudget: number): string[] {
    const fittedLines: string[] = [];
    let remainingBytes = Math.max(0, byteBudget);
    for (let lineIndex = lines.length - 1; lineIndex >= 0; lineIndex -= 1) {
      const line = lines[lineIndex]!;
      const fittedLine = this.utf8Suffix(line, remainingBytes);
      if (fittedLine === '' && line !== '') break;
      fittedLines.unshift(fittedLine);
      remainingBytes -= this.byteLength(fittedLine);
      if (fittedLine !== line) break;
    }
    return fittedLines;
  }

  protected appendBounded(event: TerminalObservationEvent): void {
    const byteLength = this.byteLength(JSON.stringify(event));
    this.bufferedEntries.push({ event, byteLength });
    this.bufferedByteCountValue += byteLength;
    while (
      this.bufferedEntries.length > this.maximumEventCount
      || this.bufferedByteCountValue > this.maximumBufferBytes
    ) {
      const evictedEntry = this.bufferedEntries.shift();
      if (!evictedEntry) break;
      this.bufferedByteCountValue -= evictedEntry.byteLength;
    }
    this.revisionValue.value += 1;
  }

  protected redactLine(line: string): string {
    const terminalObserverClass = this.constructor as typeof $TerminalObserver;
    if (
      terminalObserverClass.passwordPromptPattern.test(line)
      || terminalObserverClass.passphrasePromptPattern.test(line)
    ) {
      return '[REDACTED]';
    }
    return line.replace(
      terminalObserverClass.secretAssignmentPattern,
      (_assignment, prefix: string) => `${prefix}[REDACTED]`,
    );
  }

  protected static get passwordPromptPattern(): RegExp {
    return /password.*:/i;
  }

  protected static get passphrasePromptPattern(): RegExp {
    return /enter\s+passphrase/i;
  }

  protected static get secretAssignmentPattern(): RegExp {
    return /(\b(?:[a-z_][a-z0-9_]*_(?:token|secret|key)|[a-z_][a-z0-9_]*password[a-z0-9_]*|password[a-z0-9_]*)\s*=\s*)(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s]*)/gi;
  }

  protected promptCommandFromLine(line: string): string {
    const promptIndex = line.lastIndexOf('$ ');
    if (promptIndex < 0) return '';
    return line.slice(promptIndex + 2).trimEnd();
  }

  protected utf8Prefix(text: string, byteCap: number): string {
    if (byteCap <= 0 || text === '') return '';
    let result = '';
    let byteCount = 0;
    for (const character of text) {
      const characterByteCount = this.byteLength(character);
      if (byteCount + characterByteCount > byteCap) break;
      result += character;
      byteCount += characterByteCount;
    }
    return result;
  }

  protected utf8Suffix(text: string, byteCap: number): string {
    if (byteCap <= 0 || text === '') return '';
    const characters = Array.from(text);
    let result = '';
    let byteCount = 0;
    for (let characterIndex = characters.length - 1; characterIndex >= 0; characterIndex -= 1) {
      const character = characters[characterIndex]!;
      const characterByteCount = this.byteLength(character);
      if (byteCount + characterByteCount > byteCap) break;
      result = character + result;
      byteCount += characterByteCount;
    }
    return result;
  }

  protected byteLength(text: string): number {
    return this.textEncoder.encode(text).length;
  }

  protected linesByteLength(lines: readonly string[]): number {
    return lines.reduce((byteCount, line) => byteCount + this.byteLength(line), 0);
  }

  protected positiveInteger(value: number | undefined, fallback: number): number {
    if (value === undefined || !Number.isFinite(value)) return fallback;
    return Math.max(1, Math.floor(value));
  }

  protected nonnegativeInteger(value: number | undefined, fallback: number): number {
    if (value === undefined || !Number.isFinite(value)) return fallback;
    return Math.max(0, Math.floor(value));
  }
}

export namespace TerminalObserver {
  export const $Class = $TerminalObserver;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export type TerminalObservationBoundarySource = 'osc133' | 'heuristic';

export interface TerminalObservationOutput {
  readonly headLines: readonly string[];
  readonly tailLines: readonly string[];
  readonly totalLines: number;
  readonly truncated: boolean;
  readonly byteCap: number;
}

export interface TerminalObservationEvent {
  readonly kind: 'command-completed';
  readonly command: string;
  readonly cwd: string;
  readonly exitCode: number | null;
  readonly durationMs: number;
  readonly output: TerminalObservationOutput;
  readonly boundarySource: TerminalObservationBoundarySource;
  readonly timestamp: string;
}

export interface TerminalObserverOptions {
  maximumEventCount?: number;
  maximumBufferBytes?: number;
  headLineCount?: number;
  tailLineCount?: number;
  outputByteCap?: number;
  now?: () => number;
}

interface TerminalObservationBufferEntry {
  event: TerminalObservationEvent;
  byteLength: number;
}

interface TerminalObservedCommand {
  command: string;
  currentWorkingDirectory: string;
  boundarySource: TerminalObservationBoundarySource;
  startedAtMilliseconds: number;
  firstOutputColumn: number;
  completedLineFeedCount: number;
  totalLineCount: number;
  observedByteCount: number;
  headCandidateByteCount: number;
  headCandidates: string[];
  tailCandidates: string[];
}
