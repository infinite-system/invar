import { Static } from 'ivue/extras';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Wrap rung 1 for the drift detector: the LOGIC stays in
 * scripts/tasks/tasks-status.ts (the one-place record governs); this
 * class only runs it and parses the DRIFT section of its OUTPUT into
 * structured findings. A repo without the script has no drift
 * capability — absent, never an error.
 */
// invariant: A wrapped script keeps its logic in one place (iv-harness/iv-harness.invariants.md)
class $HarnessDrift {
  static get DRIFT_SCRIPT_RELATIVE_PATH(): string {
    return 'scripts/tasks/tasks-status.ts';
  }

  static read(rootDirectory: string): DriftNode {
    const scriptPath = join(rootDirectory, this.DRIFT_SCRIPT_RELATIVE_PATH);
    if (!existsSync(scriptPath)) {
      return { available: false, findings: [], totalsBySignal: {} };
    }
    let output: string;
    try {
      output = execFileSync('bun', [scriptPath], {
        cwd: rootDirectory,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch (error) {
      // The script exits nonzero when drift exists; its stdout still carries the findings.
      output = String((error as { stdout?: string }).stdout ?? '');
    }
    return this.parseDriftSection(output);
  }

  static parseDriftSection(output: string): DriftNode {
    const findings: DriftFinding[] = [];
    const totalsBySignal: Record<string, number> = {};
    const driftStart = output.indexOf('DRIFT');
    if (driftStart === -1) return { available: true, findings, totalsBySignal };
    let currentSignal: string | null = null;
    for (const line of output.slice(driftStart).split('\n')) {
      const signalHeader = line.match(/^ {2}([A-Z][A-Z-]+) \((\d+)\)/);
      if (signalHeader) {
        currentSignal = signalHeader[1]!;
        totalsBySignal[currentSignal] = Number(signalHeader[2]);
        continue;
      }
      const finding = line.match(/^ {4}#(\d+) (\S+) — (.+)$/);
      if (finding && currentSignal) {
        findings.push({
          signal: currentSignal,
          taskNumber: Number(finding[1]),
          folder: finding[2]!,
          reason: finding[3]!,
        });
      }
    }
    return { available: true, findings, totalsBySignal };
  }
}

export namespace HarnessDrift {
  export const $Class = Static($HarnessDrift);
  export let Class = $Class;
}

export interface DriftFinding {
  signal: string;
  taskNumber: number;
  folder: string;
  reason: string;
}

export interface DriftNode {
  available: boolean;
  findings: DriftFinding[];
  totalsBySignal: Record<string, number>;
}
