import { Static } from 'ivue/extras';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export interface LaneNode {
  worktree: string;
  branch: string | null;
  head: string | null;
  taskNumber: number | null;
  dirty: boolean | null;
  commitsAheadOfMain: number | null;
}

/**
 * Reads the fleet's lanes from git itself: `git worktree list
 * --porcelain` plus per-worktree status and commit counts. Git is the
 * store; this class only projects it.
 */
// invariant: Disk is the store and the graph is a projection (iv-harness/iv-harness.invariants.md)
class $HarnessLanes {
  static git(rootDirectory: string, gitArguments: string[]): string | null {
    try {
      return execFileSync('git', ['-C', rootDirectory, ...gitArguments], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return null;
    }
  }

  static listLanes(rootDirectory: string): LaneNode[] {
    const porcelain = this.git(rootDirectory, [
      'worktree',
      'list',
      '--porcelain',
    ]);
    if (porcelain === null) return [];
    const lanes: LaneNode[] = [];
    for (const block of porcelain.split('\n\n')) {
      const worktreeLine = block.match(/^worktree (.+)$/m);
      if (!worktreeLine || !worktreeLine[1]) continue;
      const worktree = worktreeLine[1];
      const branchLine = block.match(/^branch refs\/heads\/(.+)$/m);
      const headLine = block.match(/^HEAD ([0-9a-f]+)$/m);
      const branch = branchLine?.[1] ?? null;
      const taskMatch = branch?.match(/^fleet\/(\d+)-/);
      lanes.push({
        worktree,
        branch,
        head: headLine?.[1]?.slice(0, 8) ?? null,
        taskNumber: taskMatch?.[1] ? Number(taskMatch[1]) : null,
        dirty: this.isDirty(worktree),
        commitsAheadOfMain: this.commitsAheadOfMain(worktree),
      });
    }
    return lanes;
  }

  static isDirty(worktreeDirectory: string): boolean | null {
    if (!existsSync(worktreeDirectory)) return null;
    const status = this.git(worktreeDirectory, ['status', '--porcelain']);
    return status === null ? null : status.length > 0;
  }

  static commitsAheadOfMain(worktreeDirectory: string): number | null {
    if (!existsSync(worktreeDirectory)) return null;
    const count = this.git(worktreeDirectory, [
      'rev-list',
      '--count',
      'main..HEAD',
    ]);
    return count === null ? null : Number(count);
  }
}

export namespace HarnessLanes {
  export const $Class = Static($HarnessLanes);
  export let Class = $Class;
}
