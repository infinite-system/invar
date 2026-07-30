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
// invariant: Stable regions stay byte-identical across actions (scripts/harness/harness.invariants.md)
// invariant: Harness output history stays bounded (scripts/harness/harness.invariants.md)
// invariant: Harness app homes are complete and isolated (scripts/harness/harness.invariants.md)
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { OpenPty } from '../../src/modules/terminal/OpenPty';
import { TerminalEmulator } from '../../src/modules/terminal/TerminalEmulator';
import {
  HarnessInput,
  type HarnessMouseClick,
  type HarnessMouseEvent,
} from './HarnessInput';
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

export interface CompletedFrameObservation {
  completedFrame: CompletedSynchronizedFrame;
  snapshot: HarnessSnapshot.Model;
}

export interface HarnessGridRegion {
  startRow: number;
  endRowExclusive: number;
  startColumn: number;
  endColumnExclusive: number;
}

export interface ContentInvarianceOptions {
  invariantRegion: HarnessGridRegion;
  changedRegion: HarnessGridRegion;
  actionDescription: string;
  performAction: () => void | Promise<void>;
}

export interface FrameObservationOptions {
  conditionDescription: string;
  condition: (snapshot: HarnessSnapshot.Model) => boolean;
  performAction: () => void | Promise<void>;
  observeFrame?: (observation: CompletedFrameObservation) => void;
  timeoutMilliseconds?: number;
}

interface ScreenChangeBaseline {
  completedFrameCount: number;
  snapshotSignature: string;
}

class $PtyTestDriver {
  /** How many trailing recorded characters accompany an unexpected-exit failure. Long enough to hold
   *  a runtime's uncaught-exception dump with its stack, short enough to stay readable in a gate log. */
  protected static get OUTPUT_CONDITION_POLL_INTERVAL_MILLISECONDS(): number {
    return 10;
  }

  protected static get EXIT_EVIDENCE_TAIL_LENGTH(): number {
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
  private expectedScreenChangeBaseline: ScreenChangeBaseline | undefined;
  private emulatorObservationChain: Promise<void> = Promise.resolve();
  private readonly completedFrameObservationsValue: CompletedFrameObservation[] =
    [];
  private readonly completedFrameObservers = new Set<
    (observation: CompletedFrameObservation) => void
  >();
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
      const observedByteCountBeforeChunk = this.quiescence.observedByteCount;
      const completedFrames = this.quiescence.observe(bytes);
      let chunkOffset = 0;
      for (const completedFrame of completedFrames) {
        const completedFrameChunkEndOffset =
          completedFrame.observedByteCount - observedByteCountBeforeChunk;
        this.enqueueEmulatorBytes(
          bytes.slice(chunkOffset, completedFrameChunkEndOffset),
          completedFrame,
        );
        chunkOffset = completedFrameChunkEndOffset;
      }
      if (chunkOffset < bytes.length) {
        this.enqueueEmulatorBytes(bytes.slice(chunkOffset));
      }
    });
    this.expectedScreenChangeBaseline = {
      completedFrameCount: 0,
      snapshotSignature: this.snapshotSignature(this.snapshot()),
    };

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
    void this.child.exited.then(async (exitCode) => {
      if (this.disposed) return;
      // DRAIN BEFORE REPORTING. The exit event can win the race against the first read
      // completing, in which case the tail is EMPTY and the report says "output tail:
      // \"\"" — which reads as "the application wrote nothing" when it may only mean
      // "we never got to look". That is the least useful message in exactly the case
      // that needs it most, and it is what this instrumentation produced when the crash
      // class it was built for finally reproduced (2026-07-25, under gate contention).
      // One event-loop turn is enough for pending PTY reads to land.
      await new Promise((resolveDrain) => setTimeout(resolveDrain, 0));
      if (this.disposed) return;
      // The child's stdout AND STDERR are the PTY slave, so an uncaught exception's dump is already
      // in the RETAINED tail — the old message threw that evidence away and reported only the exit
      // code, which is how an app crash inside a full gate run (2026-07-25) produced no diagnosable
      // reason at all. The bounded tail is exactly what a crash report needs: the last bytes.
      this.quiescence.fail(
        new Error(
          `Invar exited before the awaited frame (exit ${exitCode}); ` +
            `${this.observedOutput.length} byte(s) observed` +
            (this.discardedOutputLength > 0
              ? `, ${this.discardedOutputLength} discarded`
              : '') +
            `; output tail: ` +
            JSON.stringify(
              this.observedOutput.slice(
                -$PtyTestDriver.EXIT_EVIDENCE_TAIL_LENGTH,
              ),
            ) +
            (this.observedOutput.length === 0
              ? ' — NO bytes reached the harness at all, so the failure is before or' +
                ' during process startup (PTY allocation, interpreter start, or an' +
                ' immediate exec failure), not a crash inside a rendered frame'
              : ''),
        ),
      );
    });
  }

  /** Process identifier of the real app launched behind the PTY. Instruments use
   *  it for external process facts such as peak resident memory. */
  get processId(): number {
    return this.child.pid;
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

  async sendKeysAndAwaitGridConditionByteArrival(
    keyNames: readonly string[],
    predicateDescription: string,
    predicate: (snapshot: HarnessSnapshot.Model) => boolean,
    timeoutMilliseconds = 10_000,
  ): Promise<InputGridConditionByteArrivalMeasurement> {
    await this.flushObservedOutput();
    const initialSnapshot = this.snapshot();
    if (predicate(initialSnapshot)) {
      throw new Error(
        `Cannot measure grid condition already satisfied before input: ` +
          predicateDescription,
      );
    }
    this.quiescence.throwIfFailed();
    const deadline = performance.now() + timeoutMilliseconds;
    const firstObservationIndex = this.completedFrameObservationCount;
    const inputWrittenTimestampMilliseconds = performance.now();
    this.openPty.write(
      keyNames.map((keyName) => HarnessInput.Class.key(keyName)).join(''),
    );
    while (true) {
      await this.flushObservedOutput();
      const completedFrameObservations = this.completedFrameObservationsSince(
        firstObservationIndex,
      );
      const matchingObservationIndex = completedFrameObservations.findIndex(
        (observation) => predicate(observation.snapshot),
      );
      if (matchingObservationIndex >= 0) {
        const firstObservation = completedFrameObservations[0];
        const matchingObservation =
          completedFrameObservations[matchingObservationIndex];
        if (!firstObservation || !matchingObservation) {
          throw new Error('Completed-frame observation history changed');
        }
        this.expectedScreenChangeBaseline = undefined;
        return {
          inputWrittenTimestampMilliseconds,
          firstCompletedFrame: firstObservation.completedFrame,
          completedFrame: matchingObservation.completedFrame,
          completedFramesUntilCondition: matchingObservationIndex + 1,
          inputToFirstFrameByteArrivalMilliseconds:
            firstObservation.completedFrame.byteArrivalTimestampMilliseconds -
            inputWrittenTimestampMilliseconds,
          inputToFrameByteArrivalMilliseconds:
            matchingObservation.completedFrame
              .byteArrivalTimestampMilliseconds -
            inputWrittenTimestampMilliseconds,
          snapshot: matchingObservation.snapshot,
        };
      }
      const remainingMilliseconds = deadline - performance.now();
      if (remainingMilliseconds <= 0) {
        this.expectedScreenChangeBaseline = undefined;
        throw this.gridConditionTimeoutError(
          predicateDescription,
          this.snapshot(),
        );
      }
      this.quiescence.throwIfFailed();
      await Bun.sleep(Math.min(10, remainingMilliseconds));
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

  sendMouseClick(click: HarnessMouseClick): void {
    this.markFrameExpected();
    this.openPty.write(HarnessInput.Class.mouseClick(click));
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

  async awaitScreenChange(timeoutMilliseconds = 30_000): Promise<void> {
    const expectedScreenChangeBaseline = this.expectedScreenChangeBaseline;
    if (expectedScreenChangeBaseline === undefined) {
      await this.flushObservedOutput();
      return;
    }
    await this.awaitGridCondition(
      'the driven input produces an observed screen or native caret change',
      () =>
        this.completedFrameObservationsValue.some(
          (observation) =>
            observation.completedFrame.completedFrameCount >
              expectedScreenChangeBaseline.completedFrameCount &&
            this.snapshotSignature(observation.snapshot) !==
              expectedScreenChangeBaseline.snapshotSignature,
        ),
      timeoutMilliseconds,
    );
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
    await this.flushObservedOutput();
    while (true) {
      const snapshot = this.snapshot();
      if (predicate(snapshot)) {
        this.expectedScreenChangeBaseline = undefined;
        return snapshot;
      }
      const remainingMilliseconds = deadline - performance.now();
      if (remainingMilliseconds <= 0) {
        this.expectedScreenChangeBaseline = undefined;
        throw this.gridConditionTimeoutError(
          predicateDescription,
          snapshot,
          diagnosticRegion,
        );
      }
      this.quiescence.throwIfFailed();
      await Bun.sleep(Math.min(10, remainingMilliseconds));
      await this.flushObservedOutput();
    }
  }

  /**
   * Await a predicate over OBSERVED RAW OUTPUT rather than the grid. Terminal graphics
   * protocols (kitty, sixel) are byte streams that are not necessarily bounded by a
   * synchronized frame, so `awaitGridCondition` cannot see them arrive and smokes reached
   * for a bare `Bun.sleep` before asserting on `outputSequenceCount` — which is a wait with
   * no predicate, adequate or not depending on the machine, and the reason
   * smoke-pixel-preview took timeout retries under load.
   *
   * The sleep below is this wait's POLL INTERVAL, which the harness wait invariant permits;
   * what it forbids is a bare sleep standing between a drive and the assertion that
   * verifies it, which is exactly what this method exists to replace.
   */
  async awaitOutputCondition(
    predicateDescription: string,
    predicate: () => boolean,
    timeoutMilliseconds = 15_000,
  ): Promise<void> {
    const deadline = performance.now() + timeoutMilliseconds;
    while (true) {
      if (predicate()) return;
      if (performance.now() >= deadline) {
        throw new Error(
          `Timed out waiting for output condition: ${predicateDescription}`,
        );
      }
      await Bun.sleep(
        $PtyTestDriver.OUTPUT_CONDITION_POLL_INTERVAL_MILLISECONDS,
      );
    }
  }

  async assertContentInvariantAcrossAction(
    options: ContentInvarianceOptions,
  ): Promise<HarnessSnapshot.Model> {
    await this.flushObservedOutput();
    const initialSnapshot = this.snapshot();
    const initialInvariantContent = this.serializedRegionContent(
      initialSnapshot,
      options.invariantRegion,
    );
    const initialChangedContent = this.serializedRegionContent(
      initialSnapshot,
      options.changedRegion,
    );

    await options.performAction();
    const completedSnapshot = await this.awaitGridCondition(
      `${options.actionDescription} changes its expected region`,
      (candidateSnapshot) =>
        this.serializedRegionContent(
          candidateSnapshot,
          options.changedRegion,
        ) !== initialChangedContent,
      undefined,
      options.changedRegion,
    );
    const completedInvariantContent = this.serializedRegionContent(
      completedSnapshot,
      options.invariantRegion,
    );
    if (completedInvariantContent !== initialInvariantContent) {
      throw new Error(
        `Expected byte-identical invariant region while ${options.actionDescription}; ` +
          `rows ${options.invariantRegion.startRow}-` +
          `${options.invariantRegion.endRowExclusive - 1}, columns ` +
          `${options.invariantRegion.startColumn}-` +
          `${options.invariantRegion.endColumnExclusive - 1} changed`,
      );
    }
    return completedSnapshot;
  }

  async collectCompletedFrameObservationsUntil(
    options: FrameObservationOptions,
  ): Promise<readonly CompletedFrameObservation[]> {
    await this.flushObservedOutput();
    const initialSnapshot = this.snapshot();
    if (options.condition(initialSnapshot)) {
      throw new Error(
        `Cannot collect frames for a condition already satisfied before the action: ` +
          options.conditionDescription,
      );
    }
    const firstObservationIndex = this.completedFrameObservationCount;
    if (options.observeFrame) {
      this.completedFrameObservers.add(options.observeFrame);
    }
    try {
      await options.performAction();
      await this.awaitGridCondition(
        options.conditionDescription,
        options.condition,
        options.timeoutMilliseconds,
      );
      await this.flushObservedOutput();
    } finally {
      if (options.observeFrame) {
        this.completedFrameObservers.delete(options.observeFrame);
      }
    }
    const completedFrameObservations = this.completedFrameObservationsSince(
      firstObservationIndex,
    );
    if (completedFrameObservations.length === 0) {
      throw new Error(
        `Condition became true without an observable completed frame: ` +
          options.conditionDescription,
      );
    }
    return completedFrameObservations;
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

  get lastCompletedFrame(): CompletedSynchronizedFrame | null {
    return this.quiescence.lastCompletedFrame;
  }

  get completedFrameObservationCount(): number {
    return this.completedFrameObservationsValue.length;
  }

  completedFrameObservationsSince(
    observationIndex: number,
  ): readonly CompletedFrameObservation[] {
    if (!Number.isInteger(observationIndex) || observationIndex < 0) {
      throw new Error(
        `Invalid completed-frame observation index ${observationIndex}`,
      );
    }
    return this.completedFrameObservationsValue.slice(observationIndex);
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
    await this.emulatorObservationChain.catch(() => undefined);
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
    this.expectedScreenChangeBaseline = {
      completedFrameCount: this.quiescence.completedFrameCount,
      snapshotSignature: this.snapshotSignature(this.snapshot()),
    };
  }

  private enqueueEmulatorBytes(
    bytes: Uint8Array,
    completedFrame?: CompletedSynchronizedFrame,
  ): void {
    if (bytes.length === 0) return;
    this.emulatorObservationChain = this.emulatorObservationChain
      .then(async () => {
        this.emulator.write(bytes);
        await this.emulator.flush();
        if (completedFrame) {
          const observation = {
            completedFrame,
            snapshot: this.snapshot(),
          };
          this.completedFrameObservationsValue.push(observation);
          for (const observer of this.completedFrameObservers) {
            observer(observation);
          }
        }
      })
      .catch((error) => {
        const observationError =
          error instanceof Error ? error : new Error(String(error));
        this.quiescence.fail(observationError);
        throw observationError;
      });
  }

  private async flushObservedOutput(): Promise<void> {
    await this.emulatorObservationChain;
    await this.emulator.flush();
  }

  private snapshotSignature(snapshot: HarnessSnapshot.Model): string {
    return JSON.stringify({
      columns: snapshot.columns,
      rows: snapshot.rows,
      cursorColumn: snapshot.cursorColumn,
      cursorRow: snapshot.cursorRow,
      cells: Array.from({ length: snapshot.rows }, (_unused, row) =>
        snapshot.rowCells(row),
      ),
    });
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

  private serializedRegionContent(
    snapshot: HarnessSnapshot.Model,
    region: HarnessGridRegion,
  ): string {
    if (
      !Number.isInteger(region.startRow) ||
      !Number.isInteger(region.endRowExclusive) ||
      !Number.isInteger(region.startColumn) ||
      !Number.isInteger(region.endColumnExclusive) ||
      region.startRow < 0 ||
      region.startColumn < 0 ||
      region.endRowExclusive > snapshot.rows ||
      region.endColumnExclusive > snapshot.columns ||
      region.startRow >= region.endRowExclusive ||
      region.startColumn >= region.endColumnExclusive
    ) {
      throw new Error(
        `Invalid grid region rows ${region.startRow}-${region.endRowExclusive - 1}, ` +
          `columns ${region.startColumn}-${region.endColumnExclusive - 1} ` +
          `for ${snapshot.rows}x${snapshot.columns} snapshot`,
      );
    }
    const regionRows: string[] = [];
    for (let row = region.startRow; row < region.endRowExclusive; row++) {
      regionRows.push(
        snapshot
          .rowCells(row)
          .slice(region.startColumn, region.endColumnExclusive)
          .map((cell) => cell.characters)
          .join(''),
      );
    }
    return JSON.stringify(regionRows);
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
    environment.INVAR_TEST_SUPPRESS_BUILT_IN_TASK = '1';
    environment.INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS = '1';
    // invariant: Harness teardown bypasses product quit confirmation only when declared (scripts/harness/harness.invariants.md)
    environment.INVAR_HARNESS_DIRECT_QUIT = '1';
    if (options.homeDirectory) {
      const configHome = join(options.homeDirectory, '.config');
      const dataHome = join(options.homeDirectory, '.local', 'share');
      const stateHome = join(options.homeDirectory, '.local', 'state');
      const cacheHome = join(options.homeDirectory, '.cache');
      for (const directoryPath of [
        join(configHome, 'invar'),
        join(dataHome, 'invar'),
        stateHome,
        cacheHome,
      ]) {
        mkdirSync(directoryPath, { recursive: true });
      }
      environment.HOME = options.homeDirectory;
      environment.XDG_CONFIG_HOME = configHome;
      environment.XDG_DATA_HOME = dataHome;
      environment.XDG_STATE_HOME = stateHome;
      environment.XDG_CACHE_HOME = cacheHome;
    }
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
