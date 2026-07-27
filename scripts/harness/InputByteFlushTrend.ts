import { Static } from 'ivue/extras';

// invariant: Input byte latency uses a reviewed gate baseline (scripts/harness/harness.invariants.md)
class $InputByteFlushTrend {
  static detect(
    historySamples: readonly InputByteFlushHistorySample[],
    baseline: InputByteFlushBaseline,
  ): InputByteFlushTrendResult | null {
    const comparableSamples = historySamples.filter(
      (historySample) =>
        historySample.boundary === baseline.boundary &&
        Number.isFinite(historySample.p50Milliseconds),
    );
    if (comparableSamples.length < baseline.trendWindowSampleCount) {
      return null;
    }
    const trailingSamples = comparableSamples.slice(
      -baseline.trendWindowSampleCount,
    );
    const trailingMedianP50Milliseconds = this.median(
      trailingSamples.map((historySample) => historySample.p50Milliseconds),
    );
    const warningThresholdMilliseconds =
      baseline.p50Milliseconds * baseline.trendWarningMultiplier;
    if (trailingMedianP50Milliseconds <= warningThresholdMilliseconds) {
      return null;
    }
    const firstTrailingSample = trailingSamples[0];
    const lastTrailingSample = trailingSamples.at(-1);
    if (!firstTrailingSample || !lastTrailingSample) {
      throw new Error('The input-byte trend window is unexpectedly empty');
    }
    return {
      sampleCount: trailingSamples.length,
      firstTimestamp: firstTrailingSample.timestamp,
      lastTimestamp: lastTrailingSample.timestamp,
      baselineEraP50Milliseconds: baseline.p50Milliseconds,
      trailingMedianP50Milliseconds,
      shiftRatio: trailingMedianP50Milliseconds / baseline.p50Milliseconds,
      warningThresholdMilliseconds,
    };
  }

  static warningMessage(result: InputByteFlushTrendResult): string {
    return (
      `input-byte-flush-gate: TREND WARN sustained shift across ` +
      `${result.sampleCount} samples: trailing median p50 ` +
      `${result.trailingMedianP50Milliseconds.toFixed(3)} ms is ` +
      `${result.shiftRatio.toFixed(2)}x the reviewed baseline era ` +
      `p50 ${result.baselineEraP50Milliseconds.toFixed(3)} ms ` +
      `(trend threshold ${result.warningThresholdMilliseconds.toFixed(3)} ` +
      `ms; ${result.firstTimestamp} through ${result.lastTimestamp})`
    );
  }

  protected static median(samples: readonly number[]): number {
    if (samples.length === 0) {
      throw new Error('Cannot calculate a median without samples');
    }
    const sortedSamples = [...samples].sort(
      (firstSample, secondSample) => firstSample - secondSample,
    );
    const upperMiddleIndex = Math.floor(sortedSamples.length / 2);
    const upperMiddleSample = sortedSamples[upperMiddleIndex];
    if (upperMiddleSample === undefined) {
      throw new Error('The upper median sample is missing');
    }
    if (sortedSamples.length % 2 === 1) return upperMiddleSample;
    const lowerMiddleSample = sortedSamples[upperMiddleIndex - 1];
    if (lowerMiddleSample === undefined) {
      throw new Error('The lower median sample is missing');
    }
    return (lowerMiddleSample + upperMiddleSample) / 2;
  }
}

export namespace InputByteFlushTrend {
  export const $Class = Static($InputByteFlushTrend);
  export let Class = $Class;
}

export interface InputByteFlushBaseline {
  metric: 'input-byte-flush';
  p50Milliseconds: number;
  boundary: string;
  warningMultiplier: number;
  trendWindowSampleCount: number;
  trendWarningMultiplier: number;
  baselineChangePolicy: string;
}

export interface InputByteFlushHistorySample {
  sha: string;
  timestamp: string;
  p50Milliseconds: number;
  p95Milliseconds: number;
  boundary: string;
  ambientRetry?: boolean;
}

export interface InputByteFlushTrendResult {
  sampleCount: number;
  firstTimestamp: string;
  lastTimestamp: string;
  baselineEraP50Milliseconds: number;
  trailingMedianP50Milliseconds: number;
  shiftRatio: number;
  warningThresholdMilliseconds: number;
}
