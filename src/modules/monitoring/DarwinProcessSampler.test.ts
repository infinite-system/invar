import { expect, test } from 'bun:test';
import { DarwinProcessSampler } from './DarwinProcessSampler';

test('a ps table line parses into resident bytes and processor microseconds', () => {
  const sampler = new DarwinProcessSampler.Class({
    nowMilliseconds: () => 1234,
    readProcessTable: () => ' 135424  1:02.34',
  });

  const sample = sampler.sample(42);

  expect(sample).toEqual({
    processId: 42,
    atMilliseconds: 1234,
    processorMicroseconds: 62_340_000,
    residentSetBytes: 135424 * 1024,
  });
});

test('day and hour cputime forms parse; malformed lines and gone processes report null', () => {
  const sampler = (line: string | null) =>
    new DarwinProcessSampler.Class({ readProcessTable: () => line });

  expect(sampler('1024 2-03:04:05')!.sample(1)!.processorMicroseconds).toBe(
    ((2 * 24 + 3) * 3600 + 4 * 60 + 5) * 1_000_000,
  );
  expect(sampler('1024 03:04:05')!.sample(1)!.processorMicroseconds).toBe(
    (3 * 3600 + 4 * 60 + 5) * 1_000_000,
  );
  expect(sampler(null).sample(1)).toBeNull(); // gone, not idle
  expect(sampler('garbage').sample(1)).toBeNull();
  expect(sampler('12 not-a-time').sample(1)).toBeNull();
});

test('a real process samples through the real ps (cross-platform)', () => {
  const sampler = new DarwinProcessSampler.Class();

  const sample = sampler.sample(process.pid);

  expect(sample).not.toBeNull();
  expect(sample!.residentSetBytes).toBeGreaterThan(1024 * 1024);
  expect(sample!.processorMicroseconds).toBeGreaterThanOrEqual(0);
  // A pid that cannot exist reports gone.
  expect(sampler.sample(2 ** 30)).toBeNull();
});
