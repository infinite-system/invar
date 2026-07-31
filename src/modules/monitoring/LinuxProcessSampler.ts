import { readFileSync } from 'node:fs';
import { Static } from 'ivue/extras';
import type {
  ProcessResourceSample,
  ProcessSampler,
} from './ProcessSampler.interface';

// invariant: A runtime reading is a delta over a named window (src/modules/monitoring/monitoring.invariants.md)
class $LinuxProcessSampler implements ProcessSampler {
  /** Field index of `utime`, counting from the field after the parenthesized command name. */
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

  protected static get MICROSECONDS_PER_SECOND(): number {
    return 1_000_000;
  }

  protected clockTicksPerSecondValue: number | null = null;
  protected pageBytesValue: number | null = null;

  constructor(protected readonly options: LinuxProcessSamplerOptions = {}) {}

  protected get clockTicksPerSecond(): number {
    if (this.options.clockTicksPerSecond !== undefined)
      return this.options.clockTicksPerSecond;
    this.clockTicksPerSecondValue ??= this.readSystemNumber('CLK_TCK', 100);
    return this.clockTicksPerSecondValue;
  }

  protected get pageBytes(): number {
    if (this.options.pageBytes !== undefined) return this.options.pageBytes;
    this.pageBytesValue ??= this.readSystemNumber('PAGESIZE', 4096);
    return this.pageBytesValue;
  }

  sample(processId: number): ProcessResourceSample | null {
    let statisticsLine: string;
    try {
      statisticsLine = this.options.readStatistics
        ? this.options.readStatistics(processId)
        : readFileSync(`/proc/${processId}/stat`, 'utf8');
    } catch {
      return null;
    }
    const commandEnd = statisticsLine.lastIndexOf(')');
    if (commandEnd < 0) return null;
    const fields = statisticsLine
      .slice(commandEnd + 2)
      .trim()
      .split(/\s+/);
    const userTicks = Number(
      fields[$LinuxProcessSampler.LINUX_STAT_USER_TIME_INDEX],
    );
    const systemTicks = Number(
      fields[$LinuxProcessSampler.LINUX_STAT_SYSTEM_TIME_INDEX],
    );
    const residentPages = Number(
      fields[$LinuxProcessSampler.LINUX_STAT_RESIDENT_PAGES_INDEX],
    );
    if (
      !Number.isFinite(userTicks) ||
      !Number.isFinite(systemTicks) ||
      !Number.isFinite(residentPages)
    ) {
      return null;
    }
    return {
      processId,
      atMilliseconds: this.options.nowMilliseconds?.() ?? performance.now(),
      processorMicroseconds:
        ((userTicks + systemTicks) / this.clockTicksPerSecond) *
        $LinuxProcessSampler.MICROSECONDS_PER_SECOND,
      residentSetBytes: residentPages * this.pageBytes,
    };
  }

  protected readSystemNumber(name: string, fallback: number): number {
    try {
      const result = Bun.spawnSync(['getconf', name], {
        stdout: 'pipe',
        stderr: 'ignore',
      });
      const value = Number(new TextDecoder().decode(result.stdout).trim());
      return result.exitCode === 0 && Number.isFinite(value) && value > 0
        ? value
        : fallback;
    } catch {
      return fallback;
    }
  }
}

export namespace LinuxProcessSampler {
  export const $Class = Static($LinuxProcessSampler);
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface LinuxProcessSamplerOptions {
  readonly clockTicksPerSecond?: number;
  readonly pageBytes?: number;
  readonly nowMilliseconds?: () => number;
  readonly readStatistics?: (processId: number) => string;
}
