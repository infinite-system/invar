#!/usr/bin/env bun
// The merge-gate latency check aggregates independent process sessions, persists every result, and
// compares only against the reviewed baseline embedded in project.performance-baselines.md.
//
// invariant: Latency measurements name their observation boundary (scripts/harness/harness.invariants.md)
// invariant: Input byte latency uses a reviewed gate baseline (scripts/harness/harness.invariants.md)
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  InputByteFlushTrend,
  type InputByteFlushBaseline,
  type InputByteFlushHistorySample,
} from './InputByteFlushTrend';
import { InputByteFlushVerdict } from './InputByteFlushVerdict';

interface SessionMeasurement {
  p50Milliseconds: number;
  p95Milliseconds: number;
  boundary: string;
}

const repositoryRoot = process.cwd();

const measurementSessionCount = Number(process.env.LATENCY_SESSION_COUNT ?? 5);

if (measurementSessionCount !== 5) {
  throw new Error(
    `The merge-gate contract requires exactly 5 sessions, received ${measurementSessionCount}`,
  );
}

const baseline = readBaseline(
  join(repositoryRoot, 'project.performance-baselines.md'),
);

const effectiveBaselineP50Milliseconds =
  process.env.INPUT_BYTE_FLUSH_BASELINE_P50_MILLISECONDS === undefined
    ? baseline.p50Milliseconds
    : Number(process.env.INPUT_BYTE_FLUSH_BASELINE_P50_MILLISECONDS);

if (!Number.isFinite(effectiveBaselineP50Milliseconds)) {
  throw new Error('Input-byte-flush baseline override must be a finite number');
}

function measureFiveSessionMedians(passLabel: string): {
  p50Milliseconds: number;
  p95Milliseconds: number;
} {
  const sessionMeasurements: SessionMeasurement[] = [];
  for (
    let sessionNumber = 1;
    sessionNumber <= measurementSessionCount;
    sessionNumber++
  ) {
    const measurementResult = Bun.spawnSync(
      [process.execPath, 'scripts/harness/measure-input-byte-flush.ts'],
      {
        cwd: repositoryRoot,
        stdout: 'pipe',
        stderr: 'pipe',
        env: Object.fromEntries(
          Object.entries(process.env).filter(
            ([environmentName, environmentValue]) =>
              environmentValue !== undefined &&
              !environmentName.startsWith('GIT_'),
          ),
        ) as Record<string, string>,
      },
    );
    const standardOutput = new TextDecoder().decode(measurementResult.stdout);
    const standardError = new TextDecoder().decode(measurementResult.stderr);
    if (measurementResult.exitCode !== 0) {
      throw new Error(
        InputByteFlushVerdict.Class.sessionFailureMessage(
          sessionNumber,
          measurementResult.exitCode,
          standardOutput,
          standardError,
        ),
      );
    }
    const sessionMeasurement = parseSessionMeasurement(standardOutput);
    if (sessionMeasurement.boundary !== baseline.boundary) {
      throw new Error(
        `Measurement boundary ${sessionMeasurement.boundary} does not match reviewed baseline ` +
          baseline.boundary,
      );
    }
    sessionMeasurements.push(sessionMeasurement);
    console.log(
      `  ${passLabel}session ${sessionNumber}/5: ` +
        `p50 ${sessionMeasurement.p50Milliseconds.toFixed(3)} ms, ` +
        `p95 ${sessionMeasurement.p95Milliseconds.toFixed(3)} ms`,
    );
  }
  return {
    p50Milliseconds: median(
      sessionMeasurements.map((measurement) => measurement.p50Milliseconds),
    ),
    p95Milliseconds: median(
      sessionMeasurements.map((measurement) => measurement.p95Milliseconds),
    ),
  };
}

const { p50Milliseconds, p95Milliseconds } = measureFiveSessionMedians('');

const warningThresholdMilliseconds =
  effectiveBaselineP50Milliseconds * baseline.warningMultiplier;

const commitSha = gitHeadSha(repositoryRoot);

const historyPath = join(
  repositoryRoot,
  '.perf-history',
  'input-byte-flush.ndjson',
);

mkdirSync(dirname(historyPath), { recursive: true });

appendFileSync(
  historyPath,
  `${JSON.stringify({
    sha: commitSha,
    timestamp: new Date().toISOString(),
    p50Milliseconds,
    p95Milliseconds,
    boundary: baseline.boundary,
  })}\n`,
);

console.log(
  `input-byte-flush-gate: p50 ${p50Milliseconds.toFixed(3)} ms, ` +
    `p95 ${p95Milliseconds.toFixed(3)} ms, boundary ${baseline.boundary}`,
);

console.log(
  `  reviewed baseline p50 ${effectiveBaselineP50Milliseconds.toFixed(3)} ms; ` +
    `WARN > ${warningThresholdMilliseconds.toFixed(3)} ms ` +
    `(report-only)`,
);

console.log(
  `  history appended: .perf-history/input-byte-flush.ndjson (${commitSha})`,
);

reportHistoryTrend(historyPath, baseline);

if (p50Milliseconds > warningThresholdMilliseconds) {
  console.warn(
    `input-byte-flush-gate: WARN p50 ${p50Milliseconds.toFixed(3)} ms exceeds ` +
      `baseline×${baseline.warningMultiplier} (non-blocking)`,
  );
} else {
  console.log('input-byte-flush-gate: PASS');
}

function readBaseline(baselinePath: string): InputByteFlushBaseline {
  const baselineDocument = readFileSync(baselinePath, 'utf8');
  const baselineMatch = baselineDocument.match(
    /<!-- input-byte-flush-baseline:begin -->\s*```json\s*([\s\S]*?)\s*```\s*<!-- input-byte-flush-baseline:end -->/,
  );
  if (!baselineMatch?.[1]) {
    throw new Error(
      `Machine-readable input-byte-flush baseline block is missing from ${baselinePath}`,
    );
  }
  const parsedBaseline = JSON.parse(baselineMatch[1]) as InputByteFlushBaseline;
  if (
    parsedBaseline.metric !== 'input-byte-flush' ||
    !Number.isFinite(parsedBaseline.p50Milliseconds) ||
    !Number.isFinite(parsedBaseline.warningMultiplier) ||
    !Number.isInteger(parsedBaseline.trendWindowSampleCount) ||
    parsedBaseline.trendWindowSampleCount < 2 ||
    !Number.isFinite(parsedBaseline.trendWarningMultiplier) ||
    parsedBaseline.trendWarningMultiplier <= 1 ||
    !parsedBaseline.boundary ||
    !parsedBaseline.baselineChangePolicy
  ) {
    throw new Error(
      'Machine-readable input-byte-flush baseline block is incomplete',
    );
  }
  return parsedBaseline;
}

function reportHistoryTrend(
  historyPath: string,
  baseline: InputByteFlushBaseline,
): void {
  try {
    const historySamples = readHistorySamples(historyPath);
    const trendResult = InputByteFlushTrend.Class.detect(
      historySamples,
      baseline,
    );
    if (trendResult) {
      console.warn(InputByteFlushTrend.Class.warningMessage(trendResult));
      return;
    }
    const comparableSampleCount = historySamples.filter(
      (historySample) => historySample.boundary === baseline.boundary,
    ).length;
    if (comparableSampleCount < baseline.trendWindowSampleCount) {
      console.log(
        `input-byte-flush-gate: trend history collecting ` +
          `${comparableSampleCount}/${baseline.trendWindowSampleCount} ` +
          `comparable samples`,
      );
      return;
    }
    console.log(`input-byte-flush-gate: no sustained trailing-window shift`);
  } catch (error) {
    console.warn(
      `input-byte-flush-gate: TREND WARN history could not be ` +
        `evaluated: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function readHistorySamples(
  historyPath: string,
): InputByteFlushHistorySample[] {
  return readFileSync(historyPath, 'utf8')
    .split('\n')
    .filter((historyLine) => historyLine.trim().length > 0)
    .map((historyLine, historyLineIndex) => {
      const parsedSample = JSON.parse(
        historyLine,
      ) as InputByteFlushHistorySample;
      if (
        typeof parsedSample.sha !== 'string' ||
        typeof parsedSample.timestamp !== 'string' ||
        !Number.isFinite(parsedSample.p50Milliseconds) ||
        !Number.isFinite(parsedSample.p95Milliseconds) ||
        typeof parsedSample.boundary !== 'string'
      ) {
        throw new Error(`history line ${historyLineIndex + 1} is incomplete`);
      }
      return parsedSample;
    });
}

function parseSessionMeasurement(standardOutput: string): SessionMeasurement {
  const summaryLine = standardOutput
    .split('\n')
    .find((line) => line.startsWith('input-byte-flush '));
  const measurementMatch = summaryLine?.match(
    /byte-arrival-p50=([0-9.]+)ms .*byte-arrival-p95=([0-9.]+)ms .*boundary=(\S+)/,
  );
  if (!measurementMatch?.[1] || !measurementMatch[2] || !measurementMatch[3]) {
    throw new Error(
      `Could not parse input-byte-flush output:\n${standardOutput}`,
    );
  }
  return {
    p50Milliseconds: Number(measurementMatch[1]),
    p95Milliseconds: Number(measurementMatch[2]),
    boundary: measurementMatch[3],
  };
}

function median(samples: readonly number[]): number {
  if (samples.length === 0)
    throw new Error('Cannot calculate a median without samples');
  const sortedSamples = [...samples].sort(
    (firstSample, secondSample) => firstSample - secondSample,
  );
  const medianSample = sortedSamples[Math.floor(sortedSamples.length / 2)];
  if (medianSample === undefined) throw new Error('Median sample is missing');
  return medianSample;
}

function gitHeadSha(workingDirectory: string): string {
  const result = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], {
    cwd: workingDirectory,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `git rev-parse HEAD failed: ${new TextDecoder().decode(result.stderr)}`,
    );
  }
  return new TextDecoder().decode(result.stdout).trim();
}
