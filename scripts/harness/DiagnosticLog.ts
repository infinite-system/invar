import { Static } from 'ivue/extras';
// The harness side of the app diagnostic log — one reader seam with a provenance guard.
//
// The app writes diagnostic lines through `src/modules/system/Logging.ts`. Every line carries
// the writing instance identity. This seam reads ONE driven instance's log and returns only
// the lines that instance wrote. A line from a concurrent instance, and a line left by an
// earlier run, are both rejected. Without the guard a reader that tails the file accepts
// either one, which is a false verdict in both directions: a stale settled value can satisfy
// a wait that the live instance never satisfied, and a foreign unsettled value can hold a
// wait open until it times out.
//
// invariant: Harness app homes are complete and isolated (scripts/harness/harness.invariants.md)
import { readFileSync } from 'node:fs';

/** What the reader needs from a driven instance. `PtyTestDriver.Model` satisfies it. */
export interface DiagnosticLogSource {
  readonly diagnosticLogPath: string;
  readonly diagnosticLogInstance: string;
}

export interface DiagnosticLogReading {
  /** Lines this instance wrote, in write order. */
  readonly ownLines: readonly string[];
  /** Lines the guard rejected: another instance's, or an unstamped leftover. */
  readonly foreignLineCount: number;
}

class $DiagnosticLog {
  protected static instanceMarker(instance: string): string {
    return `[instance=${instance}]`;
  }

  /** Read the instance's log and separate its own lines from everything else. */
  static read(source: DiagnosticLogSource): DiagnosticLogReading {
    let logText: string;
    try {
      logText = readFileSync(source.diagnosticLogPath, 'utf8');
    } catch {
      return { ownLines: [], foreignLineCount: 0 };
    }
    const marker = this.instanceMarker(source.diagnosticLogInstance);
    const ownLines: string[] = [];
    let foreignLineCount = 0;
    for (const line of logText.split('\n')) {
      if (line.length === 0) continue;
      if (line.includes(marker)) ownLines.push(line);
      else foreignLineCount += 1;
    }
    return { ownLines, foreignLineCount };
  }

  /** Only this instance's lines. */
  static instanceLines(source: DiagnosticLogSource): readonly string[] {
    return this.read(source).ownLines;
  }

  /** The instance's most recent own line containing `needle`, or null when it wrote none. */
  static latestLineContaining(
    source: DiagnosticLogSource,
    needle: string,
  ): string | null {
    const matching = this.instanceLines(source).filter((line) =>
      line.includes(needle),
    );
    return matching.at(-1) ?? null;
  }
}

export namespace DiagnosticLog {
  export const $Class = Static($DiagnosticLog);
  export let Class = $Class;
}
