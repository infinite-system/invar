import { describe, expect, test } from 'bun:test';
import { RuntimeSample, type RuntimeProcessSample } from './RuntimeSample';

function sampleAt(
  atMilliseconds: number,
  processorMicroseconds: number,
): RuntimeProcessSample {
  return {
    processId: 1,
    atMilliseconds,
    processorMicroseconds,
    residentSetBytes: 0,
    heapUsedBytes: 0,
    heapTotalBytes: 0,
    externalBytes: 0,
    arrayBufferBytes: 0,
  };
}

describe('RuntimeSample', () => {
  test('a sample of this process reports its own identifier and a positive resident set', () => {
    const sample = RuntimeSample.Class.sample();
    expect(sample.processId).toBe(process.pid);
    expect(sample.residentSetBytes).toBeGreaterThan(0);
    expect(sample.processorMicroseconds).toBeGreaterThan(0);
  });

  test('two samples of this process advance the monotonic clock', () => {
    const first = RuntimeSample.Class.sample();
    let accumulator = 0;
    for (let index = 0; index < 200_000; index += 1) accumulator += index;
    const second = RuntimeSample.Class.sample();
    expect(accumulator).toBeGreaterThan(0);
    expect(second.atMilliseconds).toBeGreaterThanOrEqual(first.atMilliseconds);
    expect(second.processorMicroseconds).toBeGreaterThanOrEqual(
      first.processorMicroseconds,
    );
  });

  test('processor use is a delta over the window, not a lifetime average', () => {
    // Half a core over a one-second window: 500,000 microseconds used in 1,000 milliseconds.
    const percent = RuntimeSample.Class.processorPercentBetween(
      sampleAt(1_000, 10_000_000),
      sampleAt(2_000, 10_500_000),
    );
    expect(percent).toBeCloseTo(50, 5);
  });

  test('a long-idle process reads as idle however busy its lifetime was', () => {
    // The lifetime total is enormous, but nothing was spent in this window.
    const percent = RuntimeSample.Class.processorPercentBetween(
      sampleAt(1_000, 900_000_000),
      sampleAt(6_000, 900_000_000),
    );
    expect(percent).toBe(0);
  });

  test('a window with no width reports zero rather than an infinity', () => {
    expect(
      RuntimeSample.Class.processorPercentBetween(
        sampleAt(1_000, 10_000),
        sampleAt(1_000, 20_000),
      ),
    ).toBe(0);
  });

  test('sampling another process by identifier reads its resident set', () => {
    const sample = RuntimeSample.Class.sampleProcess(process.pid);
    expect(sample).not.toBeNull();
    expect(sample?.processId).toBe(process.pid);
    expect(sample?.residentSetBytes).toBeGreaterThan(0);
    expect(sample?.processorMicroseconds).toBeGreaterThanOrEqual(0);
  });

  test('sampling a process that does not exist reports absence, never a fabricated zero row', () => {
    // Process identifier 0 is never a readable /proc entry.
    expect(RuntimeSample.Class.sampleProcess(0)).toBeNull();
  });

  test('a census reports what survived a full collection, and what it cost', async () => {
    const retained: object[] = [];
    for (let index = 0; index < 50_000; index += 1) {
      retained.push({ index, label: `retained-${index}` });
    }
    const census = await RuntimeSample.Class.census();
    expect(retained.length).toBe(50_000);
    expect(census.liveHeapBytes).toBeGreaterThan(0);
    expect(census.heapCapacityBytes).toBeGreaterThanOrEqual(
      census.liveHeapBytes,
    );
    expect(census.liveObjectCount).toBeGreaterThan(50_000);
    expect(census.residentSetBeforeBytes).toBeGreaterThan(0);
    expect(census.residentSetAfterBytes).toBeGreaterThan(0);
    // The monitor must name its own price, so the cost is measured, not assumed.
    expect(census.costMilliseconds).toBeGreaterThan(0);
  });
});
