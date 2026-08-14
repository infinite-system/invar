import { Static } from 'ivue/extras';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface TaskNode {
  number: number;
  slug: string;
  state: string;
  priority: string | null;
  stateLine: string | null;
  engine: string | null;
  files: string[];
  hasReport: boolean;
  steerCount: number;
  lastSteer: string | null;
  meta: Record<string, unknown> | null;
}

/**
 * Reads the durable task record (.invar/tasks/<state>/<number>-<slug>/)
 * into structured nodes. Pure disk reads: the folders stay the truth.
 */
// invariant: Disk is the store and the graph is a projection (iv-harness/iv-harness.invariants.md)
class $HarnessTaskRecords {
  static get TASK_STATES(): readonly string[] {
    return ['active', 'in-progress', 'completed', 'retired', 'parked', 'draft'];
  }

  static tasksRoot(rootDirectory: string): string {
    return join(rootDirectory, '.invar', 'tasks');
  }

  static listTasks(rootDirectory: string): TaskNode[] {
    const tasksRoot = this.tasksRoot(rootDirectory);
    const nodes: TaskNode[] = [];
    for (const state of this.TASK_STATES) {
      const stateDirectory = join(tasksRoot, state);
      if (!existsSync(stateDirectory)) continue;
      for (const folderName of readdirSync(stateDirectory).sort()) {
        const node = this.readTask(
          join(stateDirectory, folderName),
          state,
          folderName,
        );
        if (node) nodes.push(node);
      }
    }
    return nodes;
  }

  static readTask(
    taskDirectory: string,
    state: string,
    folderName: string,
  ): TaskNode | null {
    const folderMatch = folderName.match(/^(\d+)-(.+)$/);
    if (!folderMatch) return null;
    const number = Number(folderMatch[1]);
    const slug = folderMatch[2] ?? '';
    let files: string[] = [];
    try {
      files = readdirSync(taskDirectory).sort();
    } catch {
      return null;
    }
    const taskFileName = files.find((fileName) => fileName.startsWith('task-'));
    const header = taskFileName
      ? this.readHeader(join(taskDirectory, taskFileName))
      : { priority: null, stateLine: null, engine: null };
    const steers = this.readSteers(taskDirectory, files);
    return {
      number,
      slug,
      state,
      priority: header.priority,
      stateLine: header.stateLine,
      engine: header.engine,
      files,
      hasReport: files.some((fileName) => fileName.startsWith('report-')),
      steerCount: steers.count,
      lastSteer: steers.last,
      meta: this.readMeta(taskDirectory, files),
    };
  }

  static readHeader(taskFilePath: string): {
    priority: string | null;
    stateLine: string | null;
    engine: string | null;
  } {
    let text = '';
    try {
      text = readFileSync(taskFilePath, 'utf8');
    } catch {
      return { priority: null, stateLine: null, engine: null };
    }
    const headerField = (fieldName: string): string | null => {
      const fieldMatch = text.match(new RegExp(`^${fieldName}:\\s*(.+)$`, 'm'));
      return fieldMatch?.[1]?.trim() ?? null;
    };
    return {
      priority: headerField('Priority'),
      stateLine: headerField('State'),
      engine: headerField('Engine'),
    };
  }

  static readSteers(
    taskDirectory: string,
    files: string[],
  ): { count: number; last: string | null } {
    if (!files.includes('steers.log')) return { count: 0, last: null };
    try {
      const lines = readFileSync(join(taskDirectory, 'steers.log'), 'utf8')
        .split('\n')
        .filter((line) => line.trim().length > 0);
      return { count: lines.length, last: lines[lines.length - 1] ?? null };
    } catch {
      return { count: 0, last: null };
    }
  }

  static readMeta(
    taskDirectory: string,
    files: string[],
  ): Record<string, unknown> | null {
    if (!files.includes('meta.json')) return null;
    try {
      return JSON.parse(readFileSync(join(taskDirectory, 'meta.json'), 'utf8'));
    } catch {
      return null;
    }
  }
}

export namespace HarnessTaskRecords {
  export const $Class = Static($HarnessTaskRecords);
  export let Class = $Class;
}
