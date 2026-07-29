import { Static } from 'ivue/extras';

// invariant: Seams are drawn at the shared generator (project.invariants.md)
// invariant: Capability classes are stateless and Static wrapped (src/modules/system/system.invariants.md)
class $TaskStatePath {
  protected static get TASK_STATE_PATH_PATTERN(): RegExp {
    return /^(?<prefix>.*(?:^|\/))\.invar\/tasks\/(?<state>active|in-progress|completed|retired)\/(?<taskFolderName>[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*)\/(?<taskRelativePath>.+)$/;
  }

  protected static get STATES(): readonly TaskState[] {
    return Object.freeze(['active', 'in-progress', 'completed', 'retired']);
  }

  static match(path: string): TaskStatePathMatch | null {
    const normalizedPath = path.replaceAll('\\', '/');
    const match = this.TASK_STATE_PATH_PATTERN.exec(normalizedPath);
    const prefix = match?.groups?.prefix;
    const state = match?.groups?.state as TaskState | undefined;
    const taskFolderName = match?.groups?.taskFolderName;
    const taskRelativePath = match?.groups?.taskRelativePath;
    if (
      prefix === undefined ||
      state === undefined ||
      taskFolderName === undefined ||
      taskRelativePath === undefined
    ) {
      return null;
    }
    return {
      prefix,
      state,
      taskFolderName,
      taskRelativePath,
    };
  }

  static alternateStatePaths(path: string): string[] {
    const match = this.match(path);
    if (match === null) return [];
    return this.STATES.filter((state) => state !== match.state).map(
      (state) =>
        `${match.prefix}.invar/tasks/${state}/${match.taskFolderName}/${match.taskRelativePath}`,
    );
  }
}

export namespace TaskStatePath {
  export const $Class = Static($TaskStatePath);
  export let Class = $Class;
}

export type TaskState = 'active' | 'in-progress' | 'completed' | 'retired';

export interface TaskStatePathMatch {
  prefix: string;
  state: TaskState;
  taskFolderName: string;
  taskRelativePath: string;
}
