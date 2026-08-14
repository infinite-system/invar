import { Static } from 'ivue/extras';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Structured task reports — the worker-as-sensor schema. Builders
 * write `report-meta.json` beside the prose report; this class parses
 * it and aggregates fleet metrics (steering density, invariant-verdict
 * tallies). The exported TaskReportMeta type IS the schema authority.
 */
// invariant: Disk is the store and the graph is a projection (iv-harness/iv-harness.invariants.md)
class $HarnessTaskReports {
  static get REPORT_META_FILE_NAME(): string {
    return 'report-meta.json';
  }

  static readReportMeta(
    taskDirectory: string,
    files: string[],
  ): TaskReportMeta | null {
    if (!files.includes(this.REPORT_META_FILE_NAME)) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(
        readFileSync(join(taskDirectory, this.REPORT_META_FILE_NAME), 'utf8'),
      );
    } catch {
      return null;
    }
    if (parsed === null || typeof parsed !== 'object') return null;
    const candidate = parsed as Record<string, unknown>;
    const stringArray = (value: unknown): string[] =>
      Array.isArray(value) ? value.map((item) => String(item)) : [];
    const verdicts = (candidate['invariants'] ?? {}) as Record<string, unknown>;
    const steering = (candidate['steering'] ?? {}) as Record<string, unknown>;
    return {
      touchedDomains: stringArray(candidate['touchedDomains']),
      unexpectedDomains: stringArray(candidate['unexpectedDomains']),
      invariants: {
        upheld: stringArray(verdicts['upheld']),
        stressed: stringArray(verdicts['stressed']),
        violated: stringArray(verdicts['violated']),
        discovered: stringArray(verdicts['discovered']),
        refined: stringArray(verdicts['refined']),
      },
      bycatchCount: Number(candidate['bycatchCount'] ?? 0),
      steering: {
        needed: steering['needed'] === true,
        cause:
          steering['cause'] === undefined ? null : String(steering['cause']),
      },
      evidence: stringArray(candidate['evidence']),
    };
  }

  /** Fleet metrics over every task node that carries report meta. */
  static aggregateMetrics(
    tasks: {
      state: string;
      meta: unknown;
      reportMeta: TaskReportMeta | null;
    }[],
  ): TaskReportMetrics {
    const withMeta = tasks.filter((task) => task.reportMeta !== null);
    const completed = tasks.filter((task) => task.state === 'completed');
    const verdictTallies = {
      upheld: 0,
      stressed: 0,
      violated: 0,
      discovered: 0,
      refined: 0,
    };
    let steeringNeeded = 0;
    let bycatchTotal = 0;
    const touchedDomainCounts: Record<string, number> = {};
    for (const task of withMeta) {
      const reportMeta = task.reportMeta!;
      for (const verdict of Object.keys(verdictTallies) as VerdictName[]) {
        verdictTallies[verdict] += reportMeta.invariants[verdict].length;
      }
      if (reportMeta.steering.needed) steeringNeeded++;
      bycatchTotal += reportMeta.bycatchCount;
      for (const domain of reportMeta.touchedDomains) {
        touchedDomainCounts[domain] = (touchedDomainCounts[domain] ?? 0) + 1;
      }
    }
    return {
      tasksWithReportMeta: withMeta.length,
      completedTasks: completed.length,
      reportCoverage:
        completed.length === 0
          ? 0
          : withMeta.filter((task) => task.state === 'completed').length /
            completed.length,
      steeringNeeded,
      steeringDensity:
        withMeta.length === 0 ? 0 : steeringNeeded / withMeta.length,
      bycatchTotal,
      invariantVerdicts: verdictTallies,
      touchedDomainCounts,
    };
  }
}

export namespace HarnessTaskReports {
  export const $Class = Static($HarnessTaskReports);
  export let Class = $Class;
}

export interface TaskReportMeta {
  touchedDomains: string[];
  unexpectedDomains: string[];
  invariants: Record<VerdictName, string[]>;
  bycatchCount: number;
  steering: { needed: boolean; cause: string | null };
  evidence: string[];
}

export interface TaskReportMetrics {
  tasksWithReportMeta: number;
  completedTasks: number;
  reportCoverage: number;
  steeringNeeded: number;
  steeringDensity: number;
  bycatchTotal: number;
  invariantVerdicts: Record<VerdictName, number>;
  touchedDomainCounts: Record<string, number>;
}

export type VerdictName =
  'upheld' | 'stressed' | 'violated' | 'discovered' | 'refined';
