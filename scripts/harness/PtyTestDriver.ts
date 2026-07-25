// The harness is the terminal: it gives the unmodified Invar entrypoint a real PTY slave, feeds the
// returned master bytes into the production emulator, and snapshots only after OpenTUI closes a
// synchronized-output frame.
//
// invariant: One openpty allocator serves both PTY roles (src/modules/terminal/terminal.invariants.md)
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Synchronized end markers bound complete frames (scripts/harness/harness.invariants.md)
// invariant: Latency measurements name their observation boundary (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Harness output history stays bounded (scripts/harness/harness.invariants.md)
import { OpenPty } from '../../src/modules/terminal/OpenPty';
import { TerminalEmulator } from '../../src/modules/terminal/TerminalEmulator';
import { HarnessInput, type HarnessMouseEvent } from './HarnessInput';
import { HarnessSnapshot, type HarnessSnapshotCell } from './HarnessSnapshot';
import {
  TerminalOutputAudit,
  type ClipboardEmission,
} from './TerminalOutputAudit';
import {
  SynchronizedOutputQuiescence,
  type CompletedSynchronizedFrame,
} from './SynchronizedOutputQuiescence';

export interface PtyTestDriverOptions {
  workspaceRoot: string;
  repositoryRoot?: string;
  columns?: number;
  rows?: number;
  homeDirectory?: string;
  environment?: Record<string, string | undefined>;
  command?: string[];
  retainFullOutput?: boolean;
}

export interface InputFrameByteArrivalMeasurement {
  inputWrittenTimestampMilliseconds: number;
  firstCompletedFrame: CompletedSynchronizedFrame;
  completedFrame: CompletedSynchronizedFrame;
  completedFramesUntilCondition: number;
  inputToFirstFrameByteArrivalMilliseconds: number;
  inputToFrameByteArrivalMilliseconds: number;
}

export interface InputGridConditionByteArrivalMeasurement extends InputFrameByteArrivalMeasurement {
  snapshot: HarnessSnapshot.Model;
}

export interface HarnessGridRegion {
  startRow: number;
  endRowExclusive: number;
  startColumn: number;
  endColumnExclusive: number;
}

class $PtyTestDriver {
  /** How many trailing recorded characters accompany an unexpected-exit failure. Long enough to hold
   *  a runtime's uncaught-exception dump with its stack, short enough to stay readable in a gate log. */
  protected static get exitEvidenceTailLength(): number {
    return 2000;
  }

  protected static get retainedOutputLengthLimit(): number {
    return 4 * 1024 * 1024;
  }

  private readonly openPty: OpenPty.Model;
  private readonly emulator: TerminalEmulator.Model;
  private readonly quiescence = new SynchronizedOutputQuiescence.Class();
  private readonly terminalOutputAudit = new TerminalOutputAudit.Class();
  private readonly child: ReturnType<typeof Bun.spawn>;
  private readonly outputDecoder = new TextDecoder();
  private readonly outputSequenceCounters = new Map<
    string,
    {
      count: number;
      carriedOutput: string;
      nextEligibleMatchOffset: number;
    }
  >();
  private observedOutput = '';
  private discardedOutputLength = 0;
  private outputOverflowed = false;
  private frameExpectationPredecessor:
    CompletedSynchronizedFrame | null | undefined = null;
  private disposalPromise: Promise<void> | null = null;
  private disposed = false;

  constructor(private readonly options: PtyTestDriverOptions) {
    const columns = options.columns ?? 120;
    const rows = options.rows ?? 40;
    const repositoryRoot = options.repositoryRoot ?? process.cwd();
    this.openPty = new OpenPty.Class(columns, rows);
    this.emulator = new TerminalEmulator.Class(columns, rows);
    this.emulator.onReply((data) => this.openPty.write(data));
    this.openPty.onData((bytes) => {
      this.recordOutput(this.outputDecoder.decode(bytes, { stream: true }));
      this.quiescence.observe(bytes);
      this.emulator.write(bytes);
    });

    const applicationCommand = options.command ?? [
      process.execPath,
      'run',
      'src/main.ts',
      options.workspaceRoot,
    ];
    const childCommand =
      process.platform === 'linux'
        ? ['setsid', '--ctty', ...applicationCommand]
        : applicationCommand;
    this.child = Bun.spawn(childCommand, {
      cwd: repositoryRoot,
      stdio: [
        this.openPty.slaveFileDescriptor,
        this.openPty.slaveFileDescriptor,
        this.openPty.slaveFileDescriptor,
      ],
      env: this.childEnvironment(options),
    });
    this.openPty.releaseSlaveFileDescriptor();
    void this.child.exited.then((exitCode) => {
      if (this.disposed) return;
      // The child's stdout AND STDERR are the PTY slave, so an uncaught exception's dump is already
      // in the RETAINED tail — the old message threw that evidence away and reported only the exit
      // code, which is how an app crash inside a full gate run (2026-07-25) produced no diagnosable
      // reason at all. The bounded tail is exactly what a crash report needs: the last bytes.
      this.quiescence.fail(
        new Error(
          `Invar exited before the awaited frame (exit ${exitCode}); output tail: ` +
            JSON.stringify(
              this.observedOutput.slice(-$PtyTestDriver.exitEvidenceTailLength),
            ),
        ),
      );
    });
  }

  sendKeys(...keyNames: string[]): void {
    this.markFrameExpected();
    this.openPty.write(
      keyNames.map((keyName) => HarnessInput.Class.key(keyName)).join(''),
    );
  }

  sendKeysWithoutFrameExpectation(...keyNames: string[]): void {
    this.openPty.write(
      keyNames.map((keyName) => HarnessInput.Class.key(keyName)).join(''),
    );
  }

  async sendKeysAndAwaitFrameByteArrival(
    keyNames: readonly string[],
    timeoutMilliseconds = 30_000,
  ): Promise<InputFrameByteArrivalMeasurement> {
    this.markFrameExpected();
    const completedFramePromise =
      this.quiescence.awaitNextCompletedFrame(timeoutMilliseconds);
    const inputWrittenTimestampMilliseconds = performance.now();
    this.openPty.write(
      keyNames.map((keyName) => HarnessInput.Class.key(keyName)).join(''),
    );
    const completedFrame = await completedFramePromise;
    this.frameExpectationPredecessor = undefined;
    return {
      inputWrittenTimestampMilliseconds,
      firstCompletedFrame: completedFrame,
      completedFrame,
      completedFramesUntilCondition: 1,
      inputToFirstFrameByteArrivalMilliseconds:
        completedFrame.byteArrivalTimestampMilliseconds -
        inputWrittenTimestampMilliseconds,
      inputToFrameByteArrivalMilliseconds:
        completedFrame.byteArrivalTimestampMilliseconds -
        inputWrittenTimestampMilliseconds,
    };
  }

  async sendKeysAndAwaitGridConditionByteArrival(
    keyNames: readonly string[],
    predicateDescription: string,
    predicate: (snapshot: HarnessSnapshot.Model) => boolean,
    timeoutMilliseconds = 10_000,
  ): Promise<InputGridConditionByteArrivalMeasurement> {
    this.markFrameExpected();
    const deadline = performance.now() + timeoutMilliseconds;
    let completedFramePromise =
      this.quiescence.awaitNextCompletedFrame(timeoutMilliseconds);
    const inputWrittenTimestampMilliseconds = performance.now();
    this.openPty.write(
      keyNames.map((keyName) => HarnessInput.Class.key(keyName)).join(''),
    );
    let firstCompletedFrame: CompletedSynchronizedFrame | null = null;
    let completedFramesUntilCondition = 0;
    while (true) {
      const completedFrame = await completedFramePromise;
      firstCompletedFrame ??= completedFrame;
      completedFramesUntilCondition++;
      await this.emulator.flush();
      const snapshot = this.snapshot();
      if (predicate(snapshot)) {
        this.frameExpectationPredecessor = undefined;
        return {
          inputWrittenTimestampMilliseconds,
          firstCompletedFrame,
          completedFrame,
          completedFramesUntilCondition,
          inputToFirstFrameByteArrivalMilliseconds:
            firstCompletedFrame.byteArrivalTimestampMilliseconds -
            inputWrittenTimestampMilliseconds,
          inputToFrameByteArrivalMilliseconds:
            completedFrame.byteArrivalTimestampMilliseconds -
            inputWrittenTimestampMilliseconds,
          snapshot,
        };
      }
      const remainingMilliseconds = deadline - performance.now();
      if (remainingMilliseconds <= 0) {
        this.frameExpectationPredecessor = undefined;
        throw this.gridConditionTimeoutError(predicateDescription, snapshot);
      }
      completedFramePromise = this.quiescence.awaitNextCompletedFrame(
        remainingMilliseconds,
      );
    }
  }

  sendText(text: string): void {
    if (!text) return;
    this.markFrameExpected();
    this.openPty.write(text);
  }

  sendRawInput(inputBytes: string): void {
    if (!inputBytes) return;
    this.markFrameExpected();
    this.openPty.write(inputBytes);
  }

  sendRawInputWithoutFrameExpectation(inputBytes: string): void {
    if (!inputBytes) return;
    this.openPty.write(inputBytes);
  }

  sendRawInputBytesWithoutFrameExpectation(inputBytes: Uint8Array): void {
    if (inputBytes.length === 0) return;
    this.openPty.write(inputBytes);
  }

  sendMouse(event: HarnessMouseEvent): void {
    this.markFrameExpected();
    this.openPty.write(HarnessInput.Class.mouse(event));
  }

  sendMouseWithoutFrameExpectation(event: HarnessMouseEvent): void {
    this.openPty.write(HarnessInput.Class.mouse(event));
  }

  sendPaste(text: string): void {
    this.markFrameExpected();
    this.openPty.write(HarnessInput.Class.paste(text));
  }

  resize(columns: number, rows: number): void {
    this.markFrameExpected();
    this.emulator.resize(columns, rows);
    this.openPty.resize(columns, rows);
  }

  async awaitQuiescence(timeoutMilliseconds = 30_000): Promise<void> {
    if (
      this.frameExpectationPredecessor !== undefined &&
      this.quiescence.lastCompletedFrame === this.frameExpectationPredecessor
    ) {
      await this.quiescence.awaitNextCompletedFrame(timeoutMilliseconds);
    }
    await this.emulator.flush();
    this.frameExpectationPredecessor = undefined;
  }

  /** Await the next synchronized frame and snapshot the emulator immediately after its bytes parse.
   *  Diagnostic streams use this to inspect every emitted frame without identifying it by ordinal. */
  async awaitNextCompletedFrameSnapshot(timeoutMilliseconds = 10_000): Promise<{
    completedFrame: CompletedSynchronizedFrame;
    snapshot: HarnessSnapshot.Model;
  }> {
    const completedFrame =
      await this.quiescence.awaitNextCompletedFrame(timeoutMilliseconds);
    await this.emulator.flush();
    return { completedFrame, snapshot: this.snapshot() };
  }

  async assertNoCompleteFrameEmittedFor(
    durationMilliseconds: number,
  ): Promise<void> {
    await this.quiescence.assertNoCompletedFrameFor(durationMilliseconds);
  }

  async assertAtMostOneCompleteFrameEmittedFor(
    durationMilliseconds: number,
  ): Promise<void> {
    const initialCompletedFrameCount = this.quiescence.completedFrameCount;
    const deadline = performance.now() + durationMilliseconds;
    try {
      await this.assertNoCompleteFrameEmittedFor(durationMilliseconds);
      return;
    } catch (firstFrameError) {
      if (
        this.quiescence.completedFrameCount - initialCompletedFrameCount >
        1
      ) {
        throw firstFrameError;
      }
      const remainingMilliseconds = deadline - performance.now();
      if (remainingMilliseconds > 0) {
        await this.assertNoCompleteFrameEmittedFor(remainingMilliseconds);
      }
      if (
        this.quiescence.completedFrameCount - initialCompletedFrameCount >
        1
      ) {
        throw new Error(
          `Expected at most one complete synchronized frame for ${durationMilliseconds} ms`,
        );
      }
    }
  }

  async awaitSnapshot(
    predicate: (snapshot: HarnessSnapshot.Model) => boolean,
    timeoutMilliseconds = 30_000,
  ): Promise<HarnessSnapshot.Model> {
    return this.awaitGridCondition(
      `the harness snapshot satisfies ${predicate.toString()}`,
      predicate,
      timeoutMilliseconds,
    );
  }

  async awaitGridCondition(
    predicateDescription: string,
    predicate: (snapshot: HarnessSnapshot.Model) => boolean,
    timeoutMilliseconds = 30_000,
    diagnosticRegion?: Partial<HarnessGridRegion>,
  ): Promise<HarnessSnapshot.Model> {
    const deadline = performance.now() + timeoutMilliseconds;
    await this.emulator.flush();
    while (true) {
      const snapshot = this.snapshot();
      if (predicate(snapshot)) {
        this.frameExpectationPredecessor = undefined;
        return snapshot;
      }
      const remainingMilliseconds = deadline - performance.now();
      if (remainingMilliseconds <= 0) {
        this.frameExpectationPredecessor = undefined;
        throw this.gridConditionTimeoutError(
          predicateDescription,
          snapshot,
          diagnosticRegion,
        );
      }
      try {
        await this.quiescence.awaitNextCompletedFrame(remainingMilliseconds);
      } catch (error) {
        const isCompletedFrameTimeout =
          error instanceof Error &&
          error.message.startsWith(
            'Timed out waiting for the next complete synchronized frame',
          );
        if (!isCompletedFrameTimeout && performance.now() < deadline)
          throw error;
        await this.emulator.flush();
        this.frameExpectationPredecessor = undefined;
        throw this.gridConditionTimeoutError(
          predicateDescription,
          this.snapshot(),
          diagnosticRegion,
        );
      }
      await this.emulator.flush();
    }
  }

  snapshot(): HarnessSnapshot.Model {
    const copiedCells: HarnessSnapshotCell[] = [];
    for (let row = 0; row < this.emulator.rows; row++) {
      for (let column = 0; column < this.emulator.columns; column++) {
        const cell = this.emulator.cell(row, column);
        if (!cell)
          throw new Error(
            `Emulator cell missing at row ${row}, column ${column}`,
          );
        copiedCells.push({ ...cell, row, column });
      }
    }
    return new HarnessSnapshot.Class(
      this.emulator.columns,
      this.emulator.rows,
      this.emulator.cursorColumn,
      this.emulator.cursorRow,
      copiedCells,
    );
  }

  outputSequenceCount(sequence: string): number {
    if (!sequence) return 0;
    const registeredCounter = this.outputSequenceCounters.get(sequence);
    if (registeredCounter) return registeredCounter.count;
    if (this.outputOverflowed) {
      throw new Error(
        `Cannot count output sequence ${JSON.stringify(sequence)} after the retained output ` +
          'buffer overflowed; query the sequence before the buffer overflows so its count can ' +
          'be accumulated incrementally.',
      );
    }

    let sequenceCount = 0;
    let searchOffset = 0;
    let nextEligibleMatchOffset = 0;
    while (searchOffset < this.observedOutput.length) {
      const sequenceOffset = this.observedOutput.indexOf(
        sequence,
        searchOffset,
      );
      if (sequenceOffset < 0) break;
      sequenceCount++;
      nextEligibleMatchOffset = sequenceOffset + sequence.length;
      searchOffset = nextEligibleMatchOffset;
    }
    this.outputSequenceCounters.set(sequence, {
      count: sequenceCount,
      carriedOutput:
        sequence.length > 1
          ? this.observedOutput.slice(-(sequence.length - 1))
          : '',
      nextEligibleMatchOffset,
    });
    return sequenceCount;
  }

  clipboardEmissions(): readonly ClipboardEmission[] {
    return this.terminalOutputAudit.emissions;
  }

  /** Returns the retained output tail, or the full stream when retainFullOutput is enabled. */
  recordedOutput(): string {
    return this.observedOutput;
  }

  async exitCode(): Promise<number> {
    return this.child.exited;
  }

  dispose(): Promise<void> {
    if (this.disposalPromise) return this.disposalPromise;
    this.disposed = true;
    this.disposalPromise = this.finishDisposal();
    return this.disposalPromise;
  }

  private async finishDisposal(): Promise<void> {
    try {
      this.child.kill();
    } catch {
      // The app already exited.
    }
    await this.child.exited;
    this.openPty.close();
    this.emulator.dispose();
  }

  private recordOutput(outputChunk: string): void {
    if (!outputChunk) return;
    this.terminalOutputAudit.consume(outputChunk);
    this.updateOutputSequenceCounters(outputChunk);
    this.observedOutput += outputChunk;
    if (this.options.retainFullOutput) return;

    const ptyTestDriverClass = this.constructor as typeof $PtyTestDriver;
    const excessOutputLength =
      this.observedOutput.length - ptyTestDriverClass.retainedOutputLengthLimit;
    if (excessOutputLength <= 0) return;
    this.observedOutput = this.observedOutput.slice(excessOutputLength);
    this.discardedOutputLength += excessOutputLength;
    this.outputOverflowed = true;
  }

  private updateOutputSequenceCounters(outputChunk: string): void {
    const outputLengthBeforeChunk =
      this.discardedOutputLength + this.observedOutput.length;
    for (const [sequence, outputSequenceCounter] of this
      .outputSequenceCounters) {
      const searchableOutput =
        outputSequenceCounter.carriedOutput + outputChunk;
      const searchableOutputStartOffset =
        outputLengthBeforeChunk - outputSequenceCounter.carriedOutput.length;
      let searchOffset = Math.max(
        0,
        outputSequenceCounter.nextEligibleMatchOffset -
          searchableOutputStartOffset,
      );
      while (searchOffset < searchableOutput.length) {
        const sequenceOffset = searchableOutput.indexOf(sequence, searchOffset);
        if (sequenceOffset < 0) break;
        outputSequenceCounter.count++;
        outputSequenceCounter.nextEligibleMatchOffset =
          searchableOutputStartOffset + sequenceOffset + sequence.length;
        searchOffset = sequenceOffset + sequence.length;
      }
      outputSequenceCounter.carriedOutput =
        sequence.length > 1
          ? searchableOutput.slice(-(sequence.length - 1))
          : '';
    }
  }

  private markFrameExpected(): void {
    if (
      this.frameExpectationPredecessor === undefined ||
      this.frameExpectationPredecessor !== this.quiescence.lastCompletedFrame
    ) {
      this.frameExpectationPredecessor = this.quiescence.lastCompletedFrame;
    }
  }

  private gridConditionTimeoutError(
    predicateDescription: string,
    snapshot: HarnessSnapshot.Model,
    diagnosticRegion?: Partial<HarnessGridRegion>,
  ): Error {
    const startRow = Math.max(0, diagnosticRegion?.startRow ?? 0);
    const endRowExclusive = Math.min(
      snapshot.rows,
      diagnosticRegion?.endRowExclusive ?? snapshot.rows,
    );
    const startColumn = Math.max(0, diagnosticRegion?.startColumn ?? 0);
    const endColumnExclusive = Math.min(
      snapshot.columns,
      diagnosticRegion?.endColumnExclusive ?? snapshot.columns,
    );
    const regionText = snapshot
      .textRows()
      .slice(startRow, endRowExclusive)
      .map((rowText) => rowText.slice(startColumn, endColumnExclusive))
      .join('\n');
    return new Error(
      `Timed out waiting for grid condition: ${predicateDescription}\n` +
        `Final grid region rows ${startRow}-${endRowExclusive - 1}, ` +
        `columns ${startColumn}-${endColumnExclusive - 1}:\n` +
        regionText,
    );
  }

  private childEnvironment(
    options: PtyTestDriverOptions,
  ): Record<string, string> {
    const environment: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value === undefined || key.startsWith('GIT_')) continue;
      if (
        [
          'TUI_STATUS_PATH',
          'TUI_FRAME_PATH',
          'TUI_FRAME_DUMP',
          'TUI_OBSERVE',
        ].includes(key)
      ) {
        continue;
      }
      environment[key] = value;
    }
    environment.TERM = 'xterm-256color';
    environment.COLORTERM = 'truecolor';
    if (options.homeDirectory) environment.HOME = options.homeDirectory;
    for (const [key, value] of Object.entries(options.environment ?? {})) {
      if (value === undefined) delete environment[key];
      else environment[key] = value;
    }
    return environment;
  }
}

export namespace PtyTestDriver {
  export const $Class = $PtyTestDriver;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}
