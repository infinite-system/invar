#!/usr/bin/env bun
// invariant: Latency measurements name their observation boundary (scripts/harness/harness.invariants.md)
// invariant: Blocking gate verdicts use ordering and counts (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InputByteFlushVerdict } from './InputByteFlushVerdict';
import { PtyTestDriver } from './PtyTestDriver';

const repositoryRoot = process.cwd();
const latencySampleCount = Number(process.env.LATENCY_SAMPLE_COUNT ?? 20);
const measurementRoot = mkdtempSync(join(tmpdir(), 'invar-byte-flush-'));
const isolatedHomeDirectory = join(measurementRoot, 'home');
const isolatedWorkspaceRoot = join(measurementRoot, 'workspace');
mkdirSync(isolatedHomeDirectory, { recursive: true });
mkdirSync(isolatedWorkspaceRoot, { recursive: true });
await Bun.write(
  join(isolatedWorkspaceRoot, 'latency.txt'),
  'abcdefghijklmnopqrstuvwxyz\n',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: isolatedWorkspaceRoot,
  repositoryRoot,
  columns: 120,
  rows: 40,
  homeDirectory: isolatedHomeDirectory,
});

try {
  await driver.awaitSnapshot(
    (snapshot) => snapshot.text().includes('latency.txt'),
    15_000,
  );
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.text().includes('abcdefghijklmnopqrstuvwxyz'),
    10_000,
  );

  for (let warmupPressNumber = 1; warmupPressNumber <= 3; warmupPressNumber++) {
    driver.sendKeys('Right');
    await driver.awaitQuiescence();
  }

  const initialPrefix = 'abc';
  const initialSuffix = 'defghijklmnopqrstuvwxyz';
  const byteArrivalLatencySamples: number[] = [];
  const snapshotReadyLatencySamples: number[] = [];
  const postArrivalOracleLatencySamples: number[] = [];
  const frameByteCounts: number[] = [];
  let previousCompletedFrameObservedByteCount: number | null = null;

  for (let pressNumber = 1; pressNumber <= latencySampleCount; pressNumber++) {
    const expectedLine =
      initialPrefix + 'x'.repeat(pressNumber) + initialSuffix;
    const measurement = await driver.sendKeysAndAwaitGridConditionByteArrival(
      ['x'],
      `inserted glyph ${pressNumber} to appear in the editor`,
      (snapshot) => snapshot.text().includes(expectedLine),
      3_000,
    );
    const orderingFailure =
      InputByteFlushVerdict.Class.firstFrameOrderingFailure(
        measurement.completedFramesUntilCondition,
      );
    if (orderingFailure) {
      throw new Error(
        InputByteFlushVerdict.Class.drivenBehaviourFailureMessage(
          orderingFailure,
        ),
      );
    }
    await driver.awaitQuiescence(3_000);
    if (!driver.snapshot().text().includes(expectedLine)) {
      throw new Error(
        InputByteFlushVerdict.Class.drivenBehaviourFailureMessage(
          `Measured glyph ${pressNumber} was absent after quiescence`,
        ),
      );
    }
    const snapshotReadyTimestampMilliseconds = performance.now();

    byteArrivalLatencySamples.push(
      measurement.inputToFrameByteArrivalMilliseconds,
    );
    snapshotReadyLatencySamples.push(
      snapshotReadyTimestampMilliseconds -
        measurement.inputWrittenTimestampMilliseconds,
    );
    postArrivalOracleLatencySamples.push(
      snapshotReadyTimestampMilliseconds -
        measurement.completedFrame.byteArrivalTimestampMilliseconds,
    );
    if (previousCompletedFrameObservedByteCount !== null) {
      frameByteCounts.push(
        measurement.completedFrame.observedByteCount -
          previousCompletedFrameObservedByteCount,
      );
    }
    previousCompletedFrameObservedByteCount =
      measurement.completedFrame.observedByteCount;
    await Bun.sleep(100);
  }

  const byteArrivalPercentiles = percentiles(byteArrivalLatencySamples);
  const snapshotReadyPercentiles = percentiles(snapshotReadyLatencySamples);
  const postArrivalOraclePercentiles = percentiles(
    postArrivalOracleLatencySamples,
  );
  const medianFrameByteCount = percentile(frameByteCounts, 0.5);

  console.log('Input latency measurement boundaries');
  console.log(
    `  input write start -> DEC 2026 end-marker byte arrival: ` +
      `p50 ${byteArrivalPercentiles.p50.toFixed(3)} ms, ` +
      `p95 ${byteArrivalPercentiles.p95.toFixed(3)} ms`,
  );
  console.log(
    `  input write start -> settled TerminalEmulator snapshot: ` +
      `p50 ${snapshotReadyPercentiles.p50.toFixed(3)} ms, ` +
      `p95 ${snapshotReadyPercentiles.p95.toFixed(3)} ms`,
  );
  console.log(
    `  marker byte arrival -> settled TerminalEmulator snapshot: ` +
      `p50 ${postArrivalOraclePercentiles.p50.toFixed(3)} ms, ` +
      `p95 ${postArrivalOraclePercentiles.p95.toFixed(3)} ms`,
  );
  console.log(
    `input-byte-flush samples=${latencySampleCount} ` +
      `glyph-first-frame=${latencySampleCount}/${latencySampleCount} ` +
      `byte-arrival-p50=${byteArrivalPercentiles.p50.toFixed(3)}ms ` +
      `byte-arrival-p95=${byteArrivalPercentiles.p95.toFixed(3)}ms ` +
      `snapshot-ready-p50=${snapshotReadyPercentiles.p50.toFixed(3)}ms ` +
      `post-arrival-oracle-p50=${postArrivalOraclePercentiles.p50.toFixed(3)}ms ` +
      `median-frame-bytes=${medianFrameByteCount} ` +
      `boundary=input-write→DEC-2026-end-marker-byte-arrival`,
  );
} catch (error) {
  const failureDetails = error instanceof Error ? error.message : String(error);
  console.error(
    InputByteFlushVerdict.Class.measurementFailureMessage(failureDetails),
  );
  process.exitCode = 1;
} finally {
  await driver.dispose();
  await Promise.race([driver.exitCode(), Bun.sleep(1_000)]);
  rmSync(measurementRoot, { recursive: true, force: true });
}

function percentiles(samples: readonly number[]): { p50: number; p95: number } {
  return {
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
  };
}

function percentile(samples: readonly number[], fraction: number): number {
  if (samples.length === 0)
    throw new Error('Cannot calculate a percentile without samples');
  const sortedSamples = [...samples].sort(
    (firstSample, secondSample) => firstSample - secondSample,
  );
  const sampleIndex = Math.max(
    0,
    Math.min(
      sortedSamples.length - 1,
      Math.ceil(sortedSamples.length * fraction) - 1,
    ),
  );
  const sample = sortedSamples[sampleIndex];
  if (sample === undefined)
    throw new Error(`Missing percentile sample at index ${sampleIndex}`);
  return sample;
}
