import type { CommandRegistry } from '../commands/CommandRegistry';
import type { StatusSnapshot } from '../system/StatusChannel';
import type { Workspace } from '../workspace/Workspace';
import type {
  WorkspaceContribution,
  WorkspaceContributor,
} from '../workspace/WorkspaceContributor.interface';
import {
  TaskConfiguration,
  type TaskConfigurationResult,
} from './TaskConfiguration';
import type { TaskLauncher } from './TaskLauncher';

class $Tasks implements WorkspaceContributor {
  protected readonly workspaceStates = new Map<
    Workspace.Model,
    TaskWorkspaceState
  >();

  constructor(protected readonly options: TasksOptions) {}

  attachWorkspace(workspace: Workspace.Model): WorkspaceContribution {
    const state: TaskWorkspaceState = {
      workspaceRoot: '',
      source: null,
      configuredLabels: [],
      launchedLabels: [],
      errors: [],
      commandDisposers: [],
    };
    this.workspaceStates.set(workspace, state);
    return {
      opened: (root) => this.opened(state, root),
      suspended: () => {},
      resumed: () => {},
      disposed: () => this.disposed(workspace, state),
    };
  }

  statusSnapshot(): Partial<StatusSnapshot> {
    return {
      taskConfigurationSources: [...this.workspaceStates.values()]
        .filter((state) => state.source !== null)
        .map((state) => ({
          workspaceRoot: state.workspaceRoot,
          source: state.source,
        })),
      taskConfiguredLabels: [...this.workspaceStates.values()].flatMap(
        (state) => state.configuredLabels,
      ),
      taskLaunchedLabels: [...this.workspaceStates.values()].flatMap(
        (state) => state.launchedLabels,
      ),
      taskErrors: [...this.workspaceStates.values()].flatMap(
        (state) => state.errors,
      ),
    };
  }

  protected opened(state: TaskWorkspaceState, root: string): void {
    // invariant: Folder open starts declared tasks (src/modules/tasks/tasks.invariants.md)
    this.clearWorkspaceState(state);
    state.workspaceRoot = root;
    const resolvedConfiguration = this.options.resolveConfiguration
      ? this.options.resolveConfiguration(root)
      : TaskConfiguration.Class.resolve(root);
    const configuration =
      this.options.builtInDefaultEnabled === false &&
      resolvedConfiguration.source === 'built-in'
        ? { ...resolvedConfiguration, tasks: [] }
        : resolvedConfiguration;
    state.source = configuration.source;
    state.configuredLabels = configuration.tasks.map((task) => task.label);
    state.errors = configuration.issues.map((issue) => issue.message);
    for (const task of configuration.tasks) {
      state.commandDisposers.push(
        this.options.commands.register({
          id:
            `tasks.run.${encodeURIComponent(root)}.` +
            String(task.configurationIndex),
          title: `Tasks: Run ${task.label}`,
          category: 'Tasks',
          run: () => {
            this.options.launcher.launchAndPresent(
              root,
              task,
              configuration.tasks,
            );
            if (!state.launchedLabels.includes(task.label)) {
              state.launchedLabels = [...state.launchedLabels, task.label];
            }
          },
        }),
      );
    }
    this.options.launcher.launchFolderOpen(
      root,
      configuration.tasks,
      configuration.issues,
    );
    state.launchedLabels = configuration.tasks
      .filter((task) => task.runOnFolderOpen)
      .map((task) => task.label);
  }

  protected disposed(
    workspace: Workspace.Model,
    state: TaskWorkspaceState,
  ): void {
    this.clearWorkspaceState(state);
    this.workspaceStates.delete(workspace);
  }

  protected clearWorkspaceState(state: TaskWorkspaceState): void {
    for (
      let disposerIndex = state.commandDisposers.length - 1;
      disposerIndex >= 0;
      disposerIndex -= 1
    ) {
      state.commandDisposers[disposerIndex]?.();
    }
    state.commandDisposers = [];
    if (state.workspaceRoot) {
      this.options.launcher.disposeWorkspace(state.workspaceRoot);
    }
    state.source = null;
    state.configuredLabels = [];
    state.launchedLabels = [];
    state.errors = [];
  }
}

export namespace Tasks {
  export const $Class = $Tasks;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface TasksOptions {
  readonly commands: CommandRegistry.Instance;
  readonly launcher: TaskLauncher.Model;
  readonly builtInDefaultEnabled?: boolean;
  readonly resolveConfiguration?: (
    workspaceRoot: string,
  ) => TaskConfigurationResult;
}

interface TaskWorkspaceState {
  workspaceRoot: string;
  source: TaskConfigurationResult['source'] | null;
  configuredLabels: string[];
  launchedLabels: string[];
  errors: string[];
  commandDisposers: (() => void)[];
}
