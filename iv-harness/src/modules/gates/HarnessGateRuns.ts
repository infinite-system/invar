import { Static } from 'ivue/extras';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Reads the registered gate logs (one path per line in the registry
 * file) and extracts each log's GATE_EXIT sentinel. The verdict is
 * READ from the log, never inferred from anything else — the land.sh
 * law, applied at the graph layer.
 */
// invariant: A wrapped script keeps its logic in one place (iv-harness/iv-harness.invariants.md)
class $HarnessGateRuns {
  static readRegistry(registryPath: string): GateRun[] {
    if (!existsSync(registryPath)) return [];
    return readFileSync(registryPath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((logPath) => this.readGateLog(logPath));
  }

  static readGateLog(logPath: string): GateRun {
    if (!existsSync(logPath)) {
      return { log: logPath, exists: false, exit: null, verdict: 'missing' };
    }
    let text = '';
    try {
      text = readFileSync(logPath, 'utf8');
    } catch {
      return { log: logPath, exists: false, exit: null, verdict: 'missing' };
    }
    const sentinelMatches = [...text.matchAll(/GATE_EXIT=(\d+)/g)];
    const lastSentinel = sentinelMatches[sentinelMatches.length - 1];
    if (!lastSentinel)
      return { log: logPath, exists: true, exit: null, verdict: 'running' };
    const exit = Number(lastSentinel[1]);
    return {
      log: logPath,
      exists: true,
      exit,
      verdict: exit === 0 ? 'green' : 'red',
    };
  }
}

export namespace HarnessGateRuns {
  export const $Class = Static($HarnessGateRuns);
  export let Class = $Class;
}

export interface GateRun {
  log: string;
  exists: boolean;
  exit: number | null;
  verdict: 'green' | 'red' | 'running' | 'missing';
}
