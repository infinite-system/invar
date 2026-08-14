import { Reactive } from 'ivue';
import {
  HarnessTaskRecords,
  type TaskNode,
} from '../tasks/HarnessTaskRecords.ts';
import { HarnessGateRuns, type GateRun } from '../gates/HarnessGateRuns.ts';
import { HarnessLanes, type LaneNode } from '../lanes/HarnessLanes.ts';
import {
  HarnessHeartbeat,
  type HeartbeatNode,
} from '../fleet/HarnessHeartbeat.ts';
import {
  HarnessTaskReports,
  type TaskReportMetrics,
} from '../reports/HarnessTaskReports.ts';
import { HarnessDrift, type DriftNode } from '../drift/HarnessDrift.ts';
import {
  HarnessVerbs,
  type VerbListing,
  type VerbEvent,
} from '../verbs/HarnessVerbs.ts';

/**
 * The process-graph root: the development process (tasks, gates,
 * lanes, fleet) addressable by dotted path, mirroring the app's
 * GraphChannel semantics. Every getter re-derives from disk — the
 * graph holds no state a crash could lose.
 */
// invariant: The harness graph never imports from the app (iv-harness/iv-harness.invariants.md)
class $HarnessGraph {
  constructor(public options: HarnessGraphOptions) {}

  get rootDirectory(): string {
    return this.options.rootDirectory;
  }

  get gatesRegistryPath(): string {
    return this.options.gatesRegistryPath ?? '/tmp/fleet-watch-gates';
  }

  get heartbeatPath(): string {
    return this.options.heartbeatPath ?? '/tmp/fleet-watch.heartbeat';
  }

  // --- tasks domain ---

  get tasks(): {
    all: TaskNode[];
    counts: Record<string, number>;
    active: TaskNode[];
    inProgress: TaskNode[];
    byNumber: Record<string, TaskNode>;
  } {
    const all = HarnessTaskRecords.Class.listTasks(this.rootDirectory);
    const counts: Record<string, number> = {};
    for (const state of HarnessTaskRecords.$Class.TASK_STATES)
      counts[state] = 0;
    const byNumber: Record<string, TaskNode> = {};
    for (const task of all) {
      counts[task.state] = (counts[task.state] ?? 0) + 1;
      byNumber[String(task.number)] = task;
    }
    return {
      all,
      counts,
      active: all.filter((task) => task.state === 'active'),
      inProgress: all.filter((task) => task.state === 'in-progress'),
      byNumber,
    };
  }

  // --- gates domain ---

  get gates(): {
    registered: GateRun[];
    green: GateRun[];
    red: GateRun[];
    running: GateRun[];
    last: GateRun | null;
  } {
    const registered = HarnessGateRuns.Class.readRegistry(
      this.gatesRegistryPath,
    );
    return {
      registered,
      green: registered.filter((gateRun) => gateRun.verdict === 'green'),
      red: registered.filter((gateRun) => gateRun.verdict === 'red'),
      running: registered.filter((gateRun) => gateRun.verdict === 'running'),
      last: registered[registered.length - 1] ?? null,
    };
  }

  // --- lanes domain ---

  get lanes(): { all: LaneNode[]; fleet: LaneNode[]; dirty: LaneNode[] } {
    const all = HarnessLanes.Class.listLanes(this.rootDirectory);
    return {
      all,
      fleet: all.filter((lane) => lane.taskNumber !== null),
      dirty: all.filter((lane) => lane.dirty === true),
    };
  }

  // --- reports domain (worker-as-sensor metrics) ---

  get metrics(): TaskReportMetrics {
    return HarnessTaskReports.Class.aggregateMetrics(this.tasks.all);
  }

  // --- drift domain (wrapped tasks-status output) ---

  get drift(): DriftNode {
    return HarnessDrift.Class.read(this.rootDirectory);
  }

  // --- verbs domain (the run channel's registry and its typed ledger) ---

  get verbs(): VerbListing[] {
    return HarnessVerbs.Class.availableVerbs(this.rootDirectory);
  }

  get events(): VerbEvent[] {
    return HarnessVerbs.Class.readEvents(this.rootDirectory);
  }

  // --- fleet domain ---

  get fleet(): { heartbeat: HeartbeatNode } {
    return { heartbeat: HarnessHeartbeat.Class.read(this.heartbeatPath) };
  }

  // --- path resolution (mirrors the app's GraphChannel: misses are teachers) ---

  resolve(path: string): unknown {
    if (path === '' || path === '.') return this.rootNamespace();
    let currentNode: unknown = this;
    const walkedSegments: string[] = [];
    for (const segment of path.split('.')) {
      walkedSegments.push(segment);
      if (
        currentNode === null ||
        currentNode === undefined ||
        typeof currentNode !== 'object'
      ) {
        throw new Error(this.missMessage(walkedSegments, currentNode));
      }
      const container = currentNode as Record<string, unknown>;
      if (!(segment in container)) {
        throw new Error(this.missMessage(walkedSegments, currentNode));
      }
      currentNode = container[segment];
    }
    return currentNode;
  }

  rootNamespace(): string[] {
    return [
      'tasks',
      'gates',
      'lanes',
      'fleet',
      'metrics',
      'drift',
      'verbs',
      'events',
      'rootDirectory',
    ];
  }

  missMessage(walkedSegments: string[], deadNode: unknown): string {
    const deadPath = walkedSegments.join('.');
    const parentSegments = walkedSegments.slice(0, -1);
    const failedSegment = walkedSegments[walkedSegments.length - 1] ?? '';
    let addressable: string[] = [];
    if (parentSegments.length === 0) {
      addressable = this.rootNamespace();
    } else if (deadNode !== null && typeof deadNode === 'object') {
      addressable = Object.keys(deadNode as Record<string, unknown>);
    }
    const suggestion = this.nearestKey(failedSegment, addressable);
    const didYouMean =
      suggestion === null
        ? ''
        : ` Did you mean '${[...parentSegments, suggestion].join('.')}'?`;
    const hint =
      addressable.length > 0
        ? ` Addressable here: ${addressable.join(', ')}`
        : '';
    return `no node at '${deadPath}'.${didYouMean}${hint}`;
  }

  /** The closest addressable key: prefix/containment first, then edit distance <= 2. */
  nearestKey(failedSegment: string, addressable: string[]): string | null {
    if (failedSegment.length === 0 || addressable.length === 0) return null;
    const lowerFailed = failedSegment.toLowerCase();
    const containmentMatch = addressable.find((key) => {
      const lowerKey = key.toLowerCase();
      return (
        lowerKey.startsWith(lowerFailed) || lowerFailed.startsWith(lowerKey)
      );
    });
    if (containmentMatch) return containmentMatch;
    let bestKey: string | null = null;
    let bestDistance = 3; // suggestions beyond distance 2 mislead more than help
    for (const key of addressable) {
      const distance = this.editDistance(lowerFailed, key.toLowerCase());
      if (distance < bestDistance) {
        bestDistance = distance;
        bestKey = key;
      }
    }
    return bestKey;
  }

  editDistance(first: string, second: string): number {
    const previousRow = Array.from(
      { length: second.length + 1 },
      (_, columnIndex) => columnIndex,
    );
    for (let rowIndex = 1; rowIndex <= first.length; rowIndex++) {
      let previousDiagonal = previousRow[0]!;
      previousRow[0] = rowIndex;
      for (let columnIndex = 1; columnIndex <= second.length; columnIndex++) {
        const savedCell = previousRow[columnIndex]!;
        previousRow[columnIndex] = Math.min(
          previousRow[columnIndex]! + 1,
          previousRow[columnIndex - 1]! + 1,
          previousDiagonal +
            (first[rowIndex - 1] === second[columnIndex - 1] ? 0 : 1),
        );
        previousDiagonal = savedCell;
      }
    }
    return previousRow[second.length]!;
  }
}

export namespace HarnessGraph {
  export const $Class = $HarnessGraph;
  export let Class = Reactive($Class);
  export type Instance = typeof Class.Instance;
}

export interface HarnessGraphOptions {
  rootDirectory: string;
  gatesRegistryPath?: string;
  heartbeatPath?: string;
}
