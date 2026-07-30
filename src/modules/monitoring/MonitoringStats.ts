// The monitoring model: the app watching itself, and paying for the watch only while somebody is
// looking.
//
// WHAT IT HOLDS. One delta processor reading, one memory reading, the document ledger across every
// open workspace, and the per-plugin render-request load the host attributes at the contribution
// boundary. Every number is either a delta over a named window or a direct count. Nothing here is a
// lifetime average.
//
// WHAT IT COSTS. Hidden, it owns no timer and takes no sample, so a closed monitor costs exactly
// nothing. Visible, it takes one cheap sample per cadence tick and names that cost on screen. The
// heap census is expensive, so it is never on a tick; the reader asks for it.
//
// LOGGING. Off, the log path allocates nothing and writes nothing. On, each sample appends one JSON
// line to the contributed path and joins a bounded in-memory ring, so a long watch cannot grow
// without bound.
//
// invariant: Cost tracks the actively observed set (project.invariants.md)
// invariant: A runtime reading is a delta over a named window (src/modules/monitoring/monitoring.invariants.md)
// invariant: The monitor names its own cost and pays it only when observed (src/modules/monitoring/monitoring.invariants.md)
// invariant: Retained document bytes come from the buffer set (src/modules/monitoring/monitoring.invariants.md)
import { appendFileSync } from 'node:fs';
import { Reactive } from 'ivue';
import { ref, shallowRef } from 'vue';
import {
  RenderLoadLedger,
  type RenderLoadEntry,
} from '../system/RenderLoadLedger';
import { RuntimeSample } from './RuntimeSample';
import type { RuntimeHeapCensus, RuntimeProcessSample } from './RuntimeSample';
import type { RetainedDocumentRow } from '../workspace/OpenBufferSet';

class $MonitoringStats {
  /** Two bytes per UTF-16 unit is what a JavaScript string costs for text in the Latin range. */
  protected static get BYTES_PER_TEXT_UNIT(): number {
    return 2;
  }

  /** The in-memory log ring. Bounded, so a monitor left running overnight holds a fixed cost. */
  protected static get MAXIMUM_LOG_ENTRIES(): number {
    return 200;
  }

  /** Samples retained for the sparkline of recent resident-set movement. */
  protected static get MAXIMUM_RETAINED_SAMPLES(): number {
    return 120;
  }

  declare $watch: typeof import('vue').watch;
  declare $stopEffects: () => void;

  constructor(protected readonly dependencies: MonitoringStatsDependencies) {}

  protected sampleTimer: ReturnType<typeof setInterval> | null = null;
  protected observationStarted = false;
  protected quietBaselineMarked = false;
  protected previousSample: RuntimeProcessSample | null = null;
  protected logEntries: string[] = [];

  /** The most recent reading, or null before the first sample. */
  get sample() {
    return shallowRef<RuntimeProcessSample | null>(null);
  }
  /** Processor use over the last cadence window, as a percentage of one core. */
  get processorPercent() {
    return ref(0);
  }
  /** The last explicit heap census, or null while none has been taken this session. */
  get census() {
    return shallowRef<RuntimeHeapCensus | null>(null);
  }
  /** How many censuses the reader has asked for. A second census is otherwise indistinguishable. */
  get censusCount() {
    return ref(0);
  }
  get documentRows() {
    return shallowRef<readonly MonitoredDocumentRow[]>([]);
  }
  get renderLoadRows() {
    return shallowRef<readonly RenderLoadEntry[]>([]);
  }
  /** Milliseconds the last cadence sample itself consumed. The monitor's own price. */
  get sampleCostMilliseconds() {
    return ref(0);
  }
  /** Samples taken since this model was constructed. Zero while the pane has never been opened. */
  get sampleCount() {
    return ref(0);
  }
  /** Bumped on every change, so the pane observes one counter. */
  get version() {
    return ref(0);
  }
  get logging() {
    return ref(false);
  }
  /** Lines written to the log file since logging was last turned on. */
  get logLineCount() {
    return ref(0);
  }
  /** Recent resident-set readings, oldest first, for the movement strip. */
  get residentSetHistory() {
    return shallowRef<readonly number[]>([]);
  }

  /** Start the observation-priced clock. The timer exists only while the pane is on screen. */
  startObservation(): void {
    if (this.observationStarted) return;
    this.observationStarted = true;
    this.$watch(
      () => this.dependencies.isObserved(),
      (isObserved) => this.onObservationChanged(isObserved),
      { immediate: true, flush: 'sync' },
    );
  }

  protected onObservationChanged(isObserved: boolean): void {
    this.stopSampleTimer();
    if (!isObserved) {
      // A hidden monitor keeps its last reading on screen for the next open, but it stops
      // measuring. The next sample re-anchors the delta window rather than spanning the gap.
      this.previousSample = null;
      return;
    }
    // The baseline is marked ONCE, at the first open. Re-marking on every re-show would erase the
    // load a plugin raised while the pane was hidden, which is precisely the load a stray plugin
    // raises: the reader opens the monitor, looks at the editor, and comes back to a reset counter.
    if (!this.quietBaselineMarked) {
      this.quietBaselineMarked = true;
      RenderLoadLedger.Class.markQuietBaseline();
    }
    this.takeSample();
    this.sampleTimer = setInterval(
      () => this.onSampleTick(),
      Math.max(1, this.dependencies.sampleIntervalSeconds()) * 1000,
    );
  }

  protected onSampleTick(): void {
    if (!this.dependencies.isObserved()) {
      this.stopSampleTimer();
      return;
    }
    this.takeSample();
    this.dependencies.requestRender();
  }

  protected stopSampleTimer(): void {
    if (this.sampleTimer !== null) clearInterval(this.sampleTimer);
    this.sampleTimer = null;
  }

  /** True while no sampling clock is armed. The quiescence claim the idle contract asserts. */
  samplingAtRest(): boolean {
    return this.sampleTimer === null;
  }

  /** Take one cheap reading and rebuild every derived row. Public so a test can drive one tick. */
  takeSample(): void {
    const startedAtMilliseconds = performance.now();
    const current = RuntimeSample.Class.sample();
    const previous = this.previousSample;
    this.processorPercent.value =
      previous === null
        ? 0
        : RuntimeSample.Class.processorPercentBetween(previous, current);
    this.previousSample = current;
    this.sample.value = current;
    this.documentRows.value = this.readDocumentRows();
    this.renderLoadRows.value = RenderLoadLedger.Class.counts();
    this.residentSetHistory.value = [
      ...this.residentSetHistory.value,
      current.residentSetBytes,
    ].slice(-$MonitoringStats.MAXIMUM_RETAINED_SAMPLES);
    this.sampleCount.value += 1;
    this.sampleCostMilliseconds.value =
      performance.now() - startedAtMilliseconds;
    this.version.value += 1;
    if (this.logging.value) this.appendLogEntry();
  }

  protected readDocumentRows(): readonly MonitoredDocumentRow[] {
    const rows: MonitoredDocumentRow[] = [];
    for (const workspace of this.dependencies.workspaceLedgers()) {
      for (const row of workspace.rows) {
        rows.push({
          ...row,
          workspaceRoot: workspace.root,
          retainedBytes:
            row.retainedTextUnits * $MonitoringStats.BYTES_PER_TEXT_UNIT,
        });
      }
    }
    return rows;
  }

  /** Bytes held by documents that are hydrated right now. What closing every tab would release. */
  get retainedDocumentBytes(): number {
    return this.documentRows.value.reduce(
      (total, row) => total + row.retainedBytes,
      0,
    );
  }

  /** Open tabs that hold no document. The bounded-cache claim, made countable. */
  get dehydratedDocumentCount(): number {
    return this.documentRows.value.filter((row) => !row.hydrated).length;
  }

  get hydratedDocumentCount(): number {
    return this.documentRows.value.filter((row) => row.hydrated).length;
  }

  /** Render requests raised by every plugin since the monitor was last opened. */
  get renderRequestsSinceOpen(): number {
    return RenderLoadLedger.Class.totalSinceQuietBaseline();
  }

  /**
   * The heaviest OTHER plugin since the monitor was opened, or null when nobody else has asked for
   * a frame. The monitor excludes ITSELF here, because its own cadence repaints would otherwise sit
   * at the top of its own suspect list and hide the plugin the reader is hunting. Its own load is
   * not hidden: it stays in `renderLoadRows`, and the pane prints its sample cost every paint.
   *
   * invariant: The monitor excludes itself from its own verdict (src/modules/monitoring/monitoring.invariants.md)
   */
  strayCandidate(): RenderLoadEntry | null {
    const ownIdentifier = this.dependencies.ownIdentifier();
    const [heaviest] = RenderLoadLedger.Class.sinceQuietBaseline().filter(
      (entry) => entry.ownerIdentifier !== ownIdentifier,
    );
    return heaviest ?? null;
  }

  /** Render requests the monitor raised for itself since it was opened. Its own price, named. */
  get ownRenderRequestsSinceOpen(): number {
    const ownIdentifier = this.dependencies.ownIdentifier();
    return (
      RenderLoadLedger.Class.counts().find(
        (entry) => entry.ownerIdentifier === ownIdentifier,
      )?.requestCountSinceBaseline ?? 0
    );
  }

  /** Take the expensive census on the reader's explicit request, and record what it cost. */
  async takeCensus(): Promise<void> {
    this.census.value = await RuntimeSample.Class.census();
    this.censusCount.value += 1;
    this.version.value += 1;
    this.dependencies.requestRender();
  }

  toggleLogging(): void {
    this.logging.value = !this.logging.value;
    if (this.logging.value) {
      this.logEntries = [];
      this.logLineCount.value = 0;
    }
    this.version.value += 1;
    this.dependencies.requestRender();
  }

  /** The bounded in-memory ring, oldest first. Empty while logging is off. */
  get logLines(): readonly string[] {
    return this.logEntries;
  }

  protected appendLogEntry(): void {
    const current = this.sample.value;
    if (current === null) return;
    const line = JSON.stringify({
      atMilliseconds: Math.round(current.atMilliseconds),
      processorPercent: Number(this.processorPercent.value.toFixed(2)),
      residentSetBytes: current.residentSetBytes,
      heapUsedBytes: current.heapUsedBytes,
      retainedDocumentBytes: this.retainedDocumentBytes,
      hydratedDocumentCount: this.hydratedDocumentCount,
      openDocumentCount: this.documentRows.value.length,
      renderRequestsSinceOpen: this.renderRequestsSinceOpen,
    });
    this.logEntries = [...this.logEntries, line].slice(
      -$MonitoringStats.MAXIMUM_LOG_ENTRIES,
    );
    this.writeLogLine(line);
  }

  /** Overridable seam: the test double captures lines instead of touching the file system. */
  protected writeLogLine(line: string): void {
    const logFilePath = this.dependencies.logFilePath();
    if (logFilePath === null) return;
    try {
      appendFileSync(logFilePath, `${line}\n`);
      this.logLineCount.value += 1;
    } catch {
      // Observability never crashes the app it observes.
    }
  }

  dispose(): void {
    this.stopSampleTimer();
    this.previousSample = null;
    this.logEntries = [];
    this.quietBaselineMarked = false;
    if (this.observationStarted) this.$stopEffects();
  }
}

export namespace MonitoringStats {
  export const $Class = $MonitoringStats;
  export let Class = Reactive($Class);
  export type Model = InstanceType<typeof Class>;
  export type Instance = typeof Class.Instance;
}

/** One workspace's retained-document rows, tagged with the root they belong to. */
export interface MonitoredWorkspaceLedger {
  readonly root: string;
  readonly rows: readonly RetainedDocumentRow[];
}

export interface MonitoredDocumentRow extends RetainedDocumentRow {
  readonly workspaceRoot: string;
  /** `retainedTextUnits` converted to bytes at two bytes per UTF-16 unit. */
  readonly retainedBytes: number;
}

export interface MonitoringStatsDependencies {
  /** True while the monitoring pane is on screen. False means no timer and no sample. */
  isObserved: () => boolean;
  requestRender: () => void;
  /** The contributed cadence, seconds between samples while the pane is observed. */
  sampleIntervalSeconds: () => number;
  /** The retained-document rows of every open workspace, read from each buffer set. */
  workspaceLedgers: () => readonly MonitoredWorkspaceLedger[];
  /** Where a log line lands while logging is on. Null disables the file half of logging. */
  logFilePath: () => string | null;
  /** The monitor's own contributor identifier, so it can exclude itself from its suspect list. */
  ownIdentifier: () => string;
}
