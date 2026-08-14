import { Static } from 'ivue/extras';
import { readFileSync } from 'node:fs';
import { HarnessVerbs, type VerbEvent } from '../verbs/HarnessVerbs.ts';
import { HarnessGateRuns } from '../gates/HarnessGateRuns.ts';

/**
 * The night digest: what the conductor actually fought with, derived
 * from the event ledger and the registered gate logs — the morning
 * report becomes a query, not an essay the survivor writes. Prose is
 * commentary on top; this is the source of truth about what happened.
 */
// invariant: Disk is the store and the graph is a projection (iv-harness/iv-harness.invariants.md)
class $HarnessDigest {
  static build(rootDirectory: string, gatesRegistryPath: string): DigestNode {
    const events = HarnessVerbs.Class.readEvents(rootDirectory);
    return {
      timeByVerb: this.timeByVerb(events),
      fights: this.fights(events),
      gates: this.gateSeries(gatesRegistryPath),
      eventCount: events.length,
    };
  }

  /** Where the time went: totals and failure counts per verb. */
  static timeByVerb(events: VerbEvent[]): Record<string, VerbTimeSummary> {
    const summaries: Record<string, VerbTimeSummary> = {};
    for (const event of events) {
      const summary = (summaries[event.verb] ??= {
        runs: 0,
        failures: 0,
        totalDurationMilliseconds: 0,
      });
      summary.runs++;
      if (event.exitCode !== 0) summary.failures++;
      summary.totalDurationMilliseconds += event.durationMilliseconds;
    }
    return summaries;
  }

  /**
   * A fight: two or more consecutive failing runs of one verb+subject.
   * This is exactly what an outcome summary erases — the struggle that
   * resolved leaves no trace unless the series is kept.
   */
  static fights(events: VerbEvent[]): Fight[] {
    const fights: Fight[] = [];
    let current: Fight | null = null;
    for (const event of events) {
      const subject = `${event.verb} ${event.arguments.join(' ')}`.trim();
      if (event.exitCode !== 0) {
        if (current && current.subject === subject) {
          current.failingRuns++;
          current.lastAt = event.startedAt;
        } else {
          current = {
            subject,
            failingRuns: 1,
            firstAt: event.startedAt,
            lastAt: event.startedAt,
            resolved: false,
          };
          fights.push(current);
        }
      } else {
        if (current && current.subject === subject) {
          current.resolved = true;
        }
        current = null;
      }
    }
    return fights.filter((fight) => fight.failingRuns >= 2);
  }

  /** Every registered gate log as a verdict row, stamps included. */
  static gateSeries(gatesRegistryPath: string): GateDigestRow[] {
    return HarnessGateRuns.Class.readRegistry(gatesRegistryPath).map(
      (gateRun) => {
        let stampedTree: string | null = null;
        let stampedTip: string | null = null;
        if (gateRun.exists) {
          try {
            const text = readFileSync(gateRun.log, 'utf8');
            stampedTree = text.match(/^GATE_TREE=(.+)$/m)?.[1] ?? null;
            stampedTip = text.match(/^GATE_TREE_TIP=(.+)$/m)?.[1] ?? null;
          } catch {
            // unreadable log: stamps stay null, the verdict row survives
          }
        }
        return {
          log: gateRun.log,
          verdict: gateRun.verdict,
          stampedTree,
          stampedTip: stampedTip === null ? null : stampedTip.slice(0, 12),
        };
      },
    );
  }
}

export namespace HarnessDigest {
  export const $Class = Static($HarnessDigest);
  export let Class = $Class;
}

export interface VerbTimeSummary {
  runs: number;
  failures: number;
  totalDurationMilliseconds: number;
}

export interface Fight {
  subject: string;
  failingRuns: number;
  firstAt: string;
  lastAt: string;
  resolved: boolean;
}

export interface GateDigestRow {
  log: string;
  verdict: string;
  stampedTree: string | null;
  stampedTip: string | null;
}

export interface DigestNode {
  timeByVerb: Record<string, VerbTimeSummary>;
  fights: Fight[];
  gates: GateDigestRow[];
  eventCount: number;
}
