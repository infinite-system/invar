// The one runtime-measurement generator: how much processor time and memory a process is using
// RIGHT NOW, measured correctly.
//
// CORRECT means DELTA. `ps` prints lifetime average processor use, which reports a long-lived idle
// editor as busy forever because of one heavy boot. Every reading here is a pair of samples with the
// interval between them, so the answer describes the window the reader asked about.
//
// This class owns the shared delta calculation for the app process and sampled child processes.
// The child read goes through `ProcessSampler`, so the rate math does not depend on `/proc`.
//
// COST. `sample` costs under a tenth of a millisecond, so a one-second cadence is free. `census`
// costs about 30 milliseconds on a 200 MB heap because it stops the world, sweeps, and then walks
// every live object. It is therefore an EXPLICIT reader action, never a tick. The pane names both
// costs on screen.
//
// invariant: Cost tracks the actively observed set (project.invariants.md)
// invariant: A runtime reading is a delta over a named window (src/modules/monitoring/monitoring.invariants.md)
// invariant: The monitor names its own cost and pays it only when observed (src/modules/monitoring/monitoring.invariants.md)
import { Static } from 'ivue/extras';
import { LinuxProcessSampler } from './LinuxProcessSampler';
import type {
  ProcessResourceSample,
  ProcessSampler,
} from './ProcessSampler.interface';

class $RuntimeSample {
  /** Microseconds of processor time in one second. The unit `process.cpuUsage()` reports. */
  protected static get PROCESSOR_MICROSECONDS_PER_SECOND(): number {
    return 1_000_000;
  }

  protected static get $processSampler(): ProcessSampler {
    return new LinuxProcessSampler.Class();
  }

  /** Sample this process through runtime counters. No `/proc` read is needed. */
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

  /** Sample another process through the platform adapter. Null means the process is absent. */
  static sampleProcess(processId: number): RuntimeProcessSample | null {
    const sample = this.$processSampler.sample(processId);
    if (sample === null) return null;
    return {
      ...sample,
      heapUsedBytes: 0,
      heapTotalBytes: 0,
      externalBytes: 0,
      arrayBufferBytes: 0,
    };
  }

  /**
   * Processor use over the window between two samples, as a percentage of one core. Returns 0 when
   * the window has no width, so a caller that samples twice in the same millisecond gets a number
   * rather than an infinity.
   */
  static processorPercentBetween(
    previous: ProcessResourceSample,
    current: ProcessResourceSample,
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
export interface RuntimeProcessSample extends ProcessResourceSample {
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
