import { readFileSync } from 'node:fs';
import type {
  ProcessResourceSample,
  ProcessSampler,
} from './ProcessSampler.interface';

// invariant: A runtime reading is a delta over a named window (src/modules/monitoring/monitoring.invariants.md)
class $LinuxProcessSampler implements ProcessSampler {
  constructor(protected readonly options: LinuxProcessSamplerOptions = {}) {}

  /** Field index of `utime`, counting from the field after the parenthesized command name. */
  protected readonly linuxStatUserTimeIndex = 11;

  protected readonly linuxStatSystemTimeIndex = 12;

  /** Field index of `rss`, in pages. */
  protected readonly linuxStatResidentPagesIndex = 21;

  protected readonly microsecondsPerSecond = 1_000_000;

  protected clockTicksPerSecondValue: number | null = null;
  protected pageBytesValue: number | null = null;

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
    const userTicks = Number(fields[this.linuxStatUserTimeIndex]);
    const systemTicks = Number(fields[this.linuxStatSystemTimeIndex]);
    const residentPages = Number(fields[this.linuxStatResidentPagesIndex]);
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
        this.microsecondsPerSecond,
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
  export const $Class = $LinuxProcessSampler;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface LinuxProcessSamplerOptions {
  readonly clockTicksPerSecond?: number;
  readonly pageBytes?: number;
  readonly nowMilliseconds?: () => number;
  readonly readStatistics?: (processId: number) => string;
}
