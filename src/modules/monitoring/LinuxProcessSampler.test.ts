import { describe, expect, test } from 'bun:test';
import { LinuxProcessSampler } from './LinuxProcessSampler';

class $LinuxStatFixture {
  static line(userTicks: number, systemTicks: number, residentPages: number) {
    const fields = Array.from({ length: 22 }, () => '0');
    fields[11] = String(userTicks);
    fields[12] = String(systemTicks);
    fields[21] = String(residentPages);
    return `77 (server name with spaces) ${fields.join(' ')}`;
  }
}

describe('LinuxProcessSampler', () => {
  test('it scales processor ticks by the host clock rate and resident pages by the page size', () => {
    const sampler = new LinuxProcessSampler.Class({
      clockTicksPerSecond: 250,
      pageBytes: 8192,
      nowMilliseconds: () => 12_345,
      readStatistics: () => $LinuxStatFixture.line(375, 125, 30),
    });

    expect(sampler.sample(77)).toEqual({
      processId: 77,
      atMilliseconds: 12_345,
      processorMicroseconds: 2_000_000,
      residentSetBytes: 245_760,
    });
  });

  test('a missing process reports absence instead of a fabricated zero reading', () => {
    const sampler = new LinuxProcessSampler.Class({
      clockTicksPerSecond: 100,
      pageBytes: 4096,
      readStatistics: () => {
        throw new Error('gone');
      },
    });

    expect(sampler.sample(88)).toBeNull();
  });
});
