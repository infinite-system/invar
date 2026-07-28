import type { TaskDefinition } from './TaskConfiguration';

export interface TaskProcessLaunchContributor {
  contribute(context: TaskProcessLaunchContext): TaskProcessLaunchContribution;
}

export interface TaskProcessLaunchContext {
  readonly workspaceRoot: string;
  readonly task: TaskDefinition;
  readonly arguments: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
}

export interface TaskProcessLaunchContribution {
  readonly arguments?: readonly string[];
  readonly environment?: Readonly<Record<string, string>>;
}
