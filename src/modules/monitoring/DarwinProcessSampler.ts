// The macOS process sampler: `/proc` does not exist on darwin, so per-process CPU time and
// resident memory come from one `ps` invocation (`rss=` in kilobytes, `cputime=` as
// [[dd-]hh:]mm:ss.cc). `ps` is POSIX and the field parse is shared with Linux `ps`, so the
// colocated test drives a real process on any platform the gate runs on. A sampler spawn per
// reading is heavier than a `/proc` read; the monitoring pane samples on a seconds cadence, so
// the cost is invisible next to what it measures.
//
// invariant: A missing process is gone not idle (src/modules/monitoring/monitoring.invariants.md)
import type {
  ProcessResourceSample,
  ProcessSampler,
} from './ProcessSampler.interface';

class $DarwinProcessSampler implements ProcessSampler {
  constructor(protected readonly options: DarwinProcessSamplerOptions = {}) {}

  sample(processId: number): ProcessResourceSample | null {
    const tableLine = this.options.readProcessTable
      ? this.options.readProcessTable(processId)
      : this.readProcessTable(processId);
    if (tableLine === null) return null;
    const columns = tableLine.trim().split(/\s+/);
    if (columns.length < 2) return null;
    const residentKilobytes = Number.parseInt(columns[0]!, 10);
    const processorMicroseconds = this.parseCpuTimeMicroseconds(columns[1]!);
    if (!Number.isFinite(residentKilobytes) || processorMicroseconds === null) {
      return null;
    }
    const nowMilliseconds = this.options.nowMilliseconds ?? (() => Date.now());
    return {
      processId,
      atMilliseconds: nowMilliseconds(),
      processorMicroseconds,
      residentSetBytes: residentKilobytes * 1024,
    };
  }

  /** One `ps` call for both fields; a missing or unreadable process reports null (gone, not idle). */
  protected readProcessTable(processId: number): string | null {
    const result = Bun.spawnSync(
      ['ps', '-o', 'rss=,cputime=', '-p', String(processId)],
      { stdout: 'pipe', stderr: 'ignore' },
    );
    if (result.exitCode !== 0) return null;
    const text = result.stdout.toString().trim();
    return text.length > 0 ? text : null;
  }

  /** Parse `ps` cputime — `[[dd-]hh:]mm:ss[.cc]` — into microseconds. */
  protected parseCpuTimeMicroseconds(cpuTime: string): number | null {
    const match =
      /^(?:(?<days>\d+)-)?(?:(?<hours>\d+):)?(?<minutes>\d+):(?<seconds>\d+(?:\.\d+)?)$/.exec(
        cpuTime,
      );
    if (!match?.groups) return null;
    const days = Number.parseInt(match.groups.days ?? '0', 10);
    const hours = Number.parseInt(match.groups.hours ?? '0', 10);
    const minutes = Number.parseInt(match.groups.minutes!, 10);
    const seconds = Number.parseFloat(match.groups.seconds!);
    const totalSeconds = ((days * 24 + hours) * 60 + minutes) * 60 + seconds;
    return Math.round(totalSeconds * 1_000_000);
  }
}

export namespace DarwinProcessSampler {
  export const $Class = $DarwinProcessSampler;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface DarwinProcessSamplerOptions {
  readonly nowMilliseconds?: () => number;
  readonly readProcessTable?: (processId: number) => string | null;
}
