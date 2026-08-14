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
    return ['tasks', 'gates', 'lanes', 'fleet', 'rootDirectory'];
  }

  missMessage(walkedSegments: string[], deadNode: unknown): string {
    const deadPath = walkedSegments.join('.');
    const parentSegments = walkedSegments.slice(0, -1);
    let addressable: string[] = [];
    if (parentSegments.length === 0) {
      addressable = this.rootNamespace();
    } else if (deadNode !== null && typeof deadNode === 'object') {
      addressable = Object.keys(deadNode as Record<string, unknown>);
    }
    const hint =
      addressable.length > 0
        ? ` Addressable here: ${addressable.join(', ')}`
        : '';
    return `no node at '${deadPath}'.${hint}`;
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
