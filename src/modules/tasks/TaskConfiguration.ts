import { Static } from 'ivue/extras';
import { Files } from '../system/Files';

class $TaskConfiguration {
  protected static get Files() {
    return Files.Class;
  }

  static resolve(workspaceRoot: string): TaskConfigurationResult {
    // invariant: One task source controls each workspace (src/modules/tasks/tasks.invariants.md)
    const builtInConfiguration = this.builtInConfiguration();
    const invarPath = this.Files.join(workspaceRoot, '.invar', 'tasks.json');
    const visualStudioCodePath = this.Files.join(
      workspaceRoot,
      '.vscode',
      'tasks.json',
    );
    if (this.Files.exists(invarPath)) {
      return this.reportDisplacedBuiltIns(
        this.readConfiguration(workspaceRoot, invarPath, '.invar/tasks.json'),
        builtInConfiguration.tasks,
      );
    }
    if (this.Files.exists(visualStudioCodePath)) {
      return this.reportDisplacedBuiltIns(
        this.readConfiguration(
          workspaceRoot,
          visualStudioCodePath,
          '.vscode/tasks.json',
        ),
        builtInConfiguration.tasks,
      );
    }
    return builtInConfiguration;
  }

  protected static builtInConfiguration(): TaskConfigurationResult {
    return {
      source: 'built-in',
      tasks: [
        {
          configurationIndex: 0,
          label: 'Claude',
          command:
            'claude --dangerously-skip-permissions --continue || ' +
            'claude --dangerously-skip-permissions',
          arguments: [],
          presentationPanel: 'dedicated',
          runOnFolderOpen: true,
        },
      ],
      issues: [],
    };
  }

  protected static reportDisplacedBuiltIns(
    configuration: TaskConfigurationResult,
    builtInTasks: readonly TaskDefinition[],
  ): TaskConfigurationResult {
    // invariant: File sources report displaced built-ins (src/modules/tasks/tasks.invariants.md)
    if (builtInTasks.length === 0) return configuration;

    const configurationIndex =
      configuration.tasks.length + configuration.issues.length;
    const displacedLabels = builtInTasks
      .map((task) => JSON.stringify(task.label))
      .join(', ');
    const displacedTaskNames = builtInTasks
      .map((task) => task.label)
      .join(', ');
    const taskNoun = builtInTasks.length === 1 ? 'task' : 'tasks';
    return {
      ...configuration,
      issues: [
        ...configuration.issues,
        {
          configurationIndex,
          label: `Displaced: ${displacedTaskNames}`,
          severity: 'warning',
          message:
            `${configuration.source} displaces built-in ${taskNoun}: ` +
            displacedLabels,
        },
      ],
    };
  }

  protected static readConfiguration(
    workspaceRoot: string,
    configurationPath: string,
    source: TaskConfigurationSource,
  ): TaskConfigurationResult {
    let configuration: unknown;
    try {
      configuration = Bun.JSONC.parse(this.Files.read(configurationPath));
    } catch (error) {
      return {
        source,
        tasks: [],
        issues: [
          {
            configurationIndex: 0,
            label: 'Tasks',
            message:
              `Cannot read ${source}: ` +
              String((error as Error)?.message ?? error),
          },
        ],
      };
    }
    if (
      typeof configuration !== 'object' ||
      configuration === null ||
      !Array.isArray((configuration as TaskConfigurationFile).tasks)
    ) {
      return {
        source,
        tasks: [],
        issues: [
          {
            configurationIndex: 0,
            label: 'Tasks',
            message: `${source} must contain a tasks array`,
          },
        ],
      };
    }

    const tasks: TaskDefinition[] = [];
    const issues: TaskConfigurationIssue[] = [];
    const rawTasks = (configuration as TaskConfigurationFile).tasks;
    for (
      let configurationIndex = 0;
      configurationIndex < rawTasks.length;
      configurationIndex += 1
    ) {
      const taskResult = this.normalizeTask(
        workspaceRoot,
        configurationIndex,
        rawTasks[configurationIndex],
      );
      if ('message' in taskResult) issues.push(taskResult);
      else tasks.push(taskResult);
    }
    return { source, tasks, issues };
  }

  protected static normalizeTask(
    workspaceRoot: string,
    configurationIndex: number,
    rawTask: unknown,
  ): TaskDefinition | TaskConfigurationIssue {
    if (typeof rawTask !== 'object' || rawTask === null) {
      return {
        configurationIndex,
        label: `Task ${configurationIndex + 1}`,
        message: `Task ${configurationIndex + 1} must be an object`,
      };
    }
    const task = rawTask as RawTaskDefinition;
    const label =
      typeof task.label === 'string' && task.label.trim()
        ? task.label
        : `Task ${configurationIndex + 1}`;
    if (task.dependsOn !== undefined) {
      // invariant: Unsupported tasks fail visibly (src/modules/tasks/tasks.invariants.md)
      return {
        configurationIndex,
        label,
        message: `Task "${label}" uses unsupported dependsOn`,
      };
    }
    if (task.type !== 'shell') {
      // invariant: Unsupported tasks fail visibly (src/modules/tasks/tasks.invariants.md)
      return {
        configurationIndex,
        label,
        message:
          `Task "${label}" uses unsupported type ` +
          `"${String(task.type ?? 'missing')}"`,
      };
    }
    if (typeof task.command !== 'string' || !task.command.trim()) {
      return {
        configurationIndex,
        label,
        message: `Task "${label}" must declare a shell command`,
      };
    }
    if (
      task.args !== undefined &&
      (!Array.isArray(task.args) ||
        task.args.some((argument) => typeof argument !== 'string'))
    ) {
      return {
        configurationIndex,
        label,
        message: `Task "${label}" args must be strings`,
      };
    }

    try {
      const command = this.substituteWorkspaceFolder(
        task.command,
        workspaceRoot,
      );
      const argumentsList = (task.args ?? []).map((argument) =>
        this.substituteWorkspaceFolder(argument, workspaceRoot),
      );
      // problemMatcher is deliberately accepted and ignored. It is a
      // diagnostics parser contract, not a process-launch contract.
      void task.problemMatcher;
      return {
        configurationIndex,
        label,
        command,
        arguments: argumentsList,
        presentationGroup:
          typeof task.presentation?.group === 'string'
            ? task.presentation.group
            : undefined,
        presentationPanel:
          typeof task.presentation?.panel === 'string'
            ? task.presentation.panel
            : undefined,
        runOnFolderOpen: task.runOptions?.runOn === 'folderOpen',
      };
    } catch (error) {
      return {
        configurationIndex,
        label,
        message: String((error as Error)?.message ?? error),
      };
    }
  }

  protected static substituteWorkspaceFolder(
    value: string,
    workspaceRoot: string,
  ): string {
    return value.replace(/\$\{([^}]+)\}/g, (_match, variableName: string) => {
      if (variableName === 'workspaceFolder') return workspaceRoot;
      // invariant: Unsupported variables fail before the shell (src/modules/tasks/tasks.invariants.md)
      throw new Error(`Unsupported task variable: \${${variableName}}`);
    });
  }
}

export namespace TaskConfiguration {
  export const $Class = Static($TaskConfiguration);
  export let Class = $Class;
}

export type TaskConfigurationSource =
  '.invar/tasks.json' | '.vscode/tasks.json' | 'built-in';

export interface TaskConfigurationResult {
  source: TaskConfigurationSource;
  tasks: TaskDefinition[];
  issues: TaskConfigurationIssue[];
}

export interface TaskDefinition {
  configurationIndex: number;
  label: string;
  command: string;
  arguments: string[];
  presentationGroup?: string;
  presentationPanel?: string;
  runOnFolderOpen: boolean;
}

export interface TaskConfigurationIssue {
  configurationIndex: number;
  label: string;
  severity?: 'warning';
  message: string;
}

interface TaskConfigurationFile {
  tasks: unknown[];
}

interface RawTaskDefinition {
  label?: unknown;
  type?: unknown;
  command?: unknown;
  args?: unknown;
  dependsOn?: unknown;
  problemMatcher?: unknown;
  presentation?: {
    group?: unknown;
    panel?: unknown;
  };
  runOptions?: {
    runOn?: unknown;
  };
}
