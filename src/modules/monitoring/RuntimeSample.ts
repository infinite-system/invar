// The one runtime-measurement generator: how much processor time and memory a process is using
// RIGHT NOW, measured correctly.
//
// CORRECT means DELTA. `ps` prints lifetime average processor use, which reports a long-lived idle
// editor as busy forever because of one heavy boot. Every reading here is a pair of samples with the
// interval between them, so the answer describes the window the reader asked about.
//
// This class is the shared generator for two consumers: the Invar Monitoring pane inside the app,
// and the `instances:watch` command-line lens for other Invar processes. Only the process
// identifier differs, so both call the same two members: `sample` and `processorPercentBetween`.
//
// COST. `sample` costs under a tenth of a millisecond, so a one-second cadence is free. `census`
// costs about 30 milliseconds on a 200 MB heap because it stops the world, sweeps, and then walks
// every live object. It is therefore an EXPLICIT reader action, never a tick. The pane names both
// costs on screen.
//
// invariant: Cost tracks the actively observed set (project.invariants.md)
// invariant: A runtime reading is a delta over a named window (src/modules/monitoring/monitoring.invariants.md)
// invariant: The monitor names its own cost and pays it only when observed (src/modules/monitoring/monitoring.invariants.md)
import { readFileSync } from 'node:fs';
import { Static } from 'ivue/extras';

class $RuntimeSample {
  /** Microseconds of processor time in one second. The unit `process.cpuUsage()` reports. */
  protected static get PROCESSOR_MICROSECONDS_PER_SECOND(): number {
    return 1_000_000;
  }

  /** Linux publishes process times in clock ticks. `getconf CLK_TCK` is 100 on every supported host. */
  protected static get LINUX_CLOCK_TICKS_PER_SECOND(): number {
    return 100;
  }

  /** Field index of `utime` in `/proc/<pid>/stat`, counting from the field after the command name. */
  protected static get LINUX_STAT_USER_TIME_INDEX(): number {
    return 11;
  }

  protected static get LINUX_STAT_SYSTEM_TIME_INDEX(): number {
    return 12;
  }

  /** Field index of `rss`, in pages. */
  protected static get LINUX_STAT_RESIDENT_PAGES_INDEX(): number {
    return 21;
  }

  protected static get LINUX_PAGE_BYTES(): number {
    return 4096;
  }

  /** Sample this process. Two syscall-free reads plus one `/proc` read for nothing. Under 0.1 ms. */
  static sample(): RuntimeProcessSample {
    const processorTime = process.cpuUsage();
    const memory = process.memoryUsage();
    return {
      processId: process.pid,
      atMilliseconds: performance.now(),
      processorMicroseconds: processorTime.user + processorTime.system,
      residentSetBytes: memory.rss,
      // JSC refreshes this at collection time, so it is the live heap AS OF THE LAST COLLECTION —
      // not a running total. Between collections it under-reports, which is exactly why the
      // resident set is shown beside it and why `census` exists.
      heapUsedBytes: memory.heapUsed,
      heapTotalBytes: memory.heapTotal,
      externalBytes: memory.external,
      arrayBufferBytes: memory.arrayBuffers,
    };
  }

  /**
   * Sample ANOTHER process by identifier, through `/proc/<pid>/stat`. Returns null when the process
   * is gone or the platform has no `/proc`. This is the member the `instances:watch` lens uses; it
   * pairs with the same `processorPercentBetween` as the in-process sample.
   */
  static sampleProcess(processId: number): RuntimeProcessSample | null {
    const statistics = this.readProcessStatistics(processId);
    if (statistics === null) return null;
    return {
      processId,
      atMilliseconds: performance.now(),
      processorMicroseconds: statistics.processorMicroseconds,
      residentSetBytes: statistics.residentSetBytes,
      // Another process's heap is not readable from here. Its resident set is.
      heapUsedBytes: 0,
      heapTotalBytes: 0,
      externalBytes: 0,
      arrayBufferBytes: 0,
    };
  }

  protected static readProcessStatistics(
    processId: number,
  ): { processorMicroseconds: number; residentSetBytes: number } | null {
    let statLine: string;
    try {
      statLine = readFileSync(`/proc/${processId}/stat`, 'utf8');
    } catch {
      return null;
    }
    // The command name is parenthesised and may itself contain spaces, so split AFTER it.
    const commandEnd = statLine.lastIndexOf(')');
    if (commandEnd < 0) return null;
    const fields = statLine
      .slice(commandEnd + 2)
      .trim()
      .split(/\s+/);
    const userTicks = Number(fields[this.LINUX_STAT_USER_TIME_INDEX]);
    const systemTicks = Number(fields[this.LINUX_STAT_SYSTEM_TIME_INDEX]);
    const residentPages = Number(fields[this.LINUX_STAT_RESIDENT_PAGES_INDEX]);
    if (
      !Number.isFinite(userTicks) ||
      !Number.isFinite(systemTicks) ||
      !Number.isFinite(residentPages)
    ) {
      return null;
    }
    return {
      processorMicroseconds:
        ((userTicks + systemTicks) / this.LINUX_CLOCK_TICKS_PER_SECOND) *
        this.PROCESSOR_MICROSECONDS_PER_SECOND,
      residentSetBytes: residentPages * this.LINUX_PAGE_BYTES,
    };
  }

  /**
   * Processor use over the window between two samples, as a percentage of one core. Returns 0 when
   * the window has no width, so a caller that samples twice in the same millisecond gets a number
   * rather than an infinity.
   */
  static processorPercentBetween(
    previous: RuntimeProcessSample,
    current: RuntimeProcessSample,
  ): number {
    const windowMilliseconds = current.atMilliseconds - previous.atMilliseconds;
    if (windowMilliseconds <= 0) return 0;
    const usedMicroseconds =
      current.processorMicroseconds - previous.processorMicroseconds;
    if (usedMicroseconds <= 0) return 0;
    return (usedMicroseconds / (windowMilliseconds * 1000)) * 100;
  }

  /**
   * The EXPENSIVE reading, and the only one that answers "is this memory retained or is it
   * garbage waiting to be collected?". It collects first, then walks the heap, so the numbers
   * describe what SURVIVED a full collection. About 30 milliseconds on a 200 MB heap.
   *
   * The resident set is read before and after, because the gap between "live heap after a
   * collection" and "resident set" IS the allocator high-water mark the reader is asking about.
   *
   * invariant: A live heap figure is only true just after a collection (src/modules/monitoring/monitoring.invariants.md)
   */
  static async census(): Promise<RuntimeHeapCensus> {
    const runtimeJavaScriptCore = await import('bun:jsc');
    const residentSetBeforeBytes = process.memoryUsage.rss();
    const startedAtMilliseconds = performance.now();
    runtimeJavaScriptCore.gcAndSweep();
    const heapStatistics = runtimeJavaScriptCore.heapStats();
    const residentSetAfterBytes = process.memoryUsage.rss();
    return {
      liveHeapBytes: heapStatistics.heapSize,
      heapCapacityBytes: heapStatistics.heapCapacity,
      externalHeapBytes: heapStatistics.extraMemorySize,
      liveObjectCount: heapStatistics.objectCount,
      residentSetBeforeBytes,
      residentSetAfterBytes,
      costMilliseconds: performance.now() - startedAtMilliseconds,
    };
  }
}

export namespace RuntimeSample {
  export const $Class = Static($RuntimeSample);
  export let Class = $Class;
}

/** One process reading. Two of these plus their interval make a rate. */
export interface RuntimeProcessSample {
  readonly processId: number;
  /** A monotonic clock reading, so a wall-clock jump cannot make a rate negative. */
  readonly atMilliseconds: number;
  /** User plus system processor time consumed since the process started. */
  readonly processorMicroseconds: number;
  readonly residentSetBytes: number;
  /** Live JavaScript heap as of the last collection. Zero for a process sampled through `/proc`. */
  readonly heapUsedBytes: number;
  readonly heapTotalBytes: number;
  readonly externalBytes: number;
  readonly arrayBufferBytes: number;
}

/** What survived a full collection, and what the allocator still holds above it. */
export interface RuntimeHeapCensus {
  readonly liveHeapBytes: number;
  readonly heapCapacityBytes: number;
  readonly externalHeapBytes: number;
  readonly liveObjectCount: number;
  readonly residentSetBeforeBytes: number;
  readonly residentSetAfterBytes: number;
  /** What this census cost to take. The monitor names its own price. */
  readonly costMilliseconds: number;
}
