import { expect, test } from 'bun:test';
import {
  InputByteFlushTrend,
  type InputByteFlushBaseline,
  type InputByteFlushHistorySample,
} from './InputByteFlushTrend';

test('shifted history names the sustained input-byte trend', () => {
  const trendResult = InputByteFlushTrend.Class.detect(
    [
      historySample('2026-07-26T00:00:00.000Z', 4.9),
      historySample('2026-07-26T00:01:00.000Z', 5),
      historySample('2026-07-26T00:02:00.000Z', 6),
      historySample('2026-07-26T00:03:00.000Z', 6.1),
      historySample('2026-07-26T00:04:00.000Z', 6.2),
      historySample('2026-07-26T00:05:00.000Z', 6.3),
      historySample('2026-07-26T00:06:00.000Z', 6.4),
    ],
    baseline(),
  );

  expect(trendResult).not.toBeNull();
  expect(InputByteFlushTrend.Class.warningMessage(trendResult!)).toContain(
    'TREND WARN sustained shift across 5 samples',
  );
  expect(InputByteFlushTrend.Class.warningMessage(trendResult!)).toContain(
    '2026-07-26T00:02:00.000Z through 2026-07-26T00:06:00.000Z',
  );
});

test('one high sample does not make a sustained trend', () => {
  expect(
    InputByteFlushTrend.Class.detect(
      [
        historySample('2026-07-26T00:00:00.000Z', 4.8),
        historySample('2026-07-26T00:01:00.000Z', 4.9),
        historySample('2026-07-26T00:02:00.000Z', 8),
        historySample('2026-07-26T00:03:00.000Z', 4.9),
        historySample('2026-07-26T00:04:00.000Z', 5),
      ],
      baseline(),
    ),
  ).toBeNull();
});

test('an incomplete trailing window reports no trend', () => {
  expect(
    InputByteFlushTrend.Class.detect(
      [
        historySample('2026-07-26T00:00:00.000Z', 8),
        historySample('2026-07-26T00:01:00.000Z', 8),
      ],
      baseline(),
    ),
  ).toBeNull();
});

function baseline(): InputByteFlushBaseline {
  return {
    metric: 'input-byte-flush',
    p50Milliseconds: 4.928,
    boundary: 'input-write-to-frame-byte-arrival',
    warningMultiplier: 1.3,
    trendWindowSampleCount: 5,
    trendWarningMultiplier: 1.15,
    baselineChangePolicy: 'test',
  };
}

function historySample(
  timestamp: string,
  p50Milliseconds: number,
): InputByteFlushHistorySample {
  return {
    sha: 'positive-control',
    timestamp,
    p50Milliseconds,
    p95Milliseconds: p50Milliseconds,
    boundary: 'input-write-to-frame-byte-arrival',
  };
}
