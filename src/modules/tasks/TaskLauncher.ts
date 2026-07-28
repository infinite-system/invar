import type {
  TaskConfigurationIssue,
  TaskDefinition,
} from './TaskConfiguration';
import type {
  TaskProcessLaunchContext,
  TaskProcessLaunchContributor,
} from './TaskProcessLaunchContributor.interface';

class $TaskLauncher {
  protected readonly launchedIdentifiersByWorkspace = new Map<
    string,
    Set<string>
  >();

  constructor(protected readonly options: TaskLauncherOptions) {}

  launchFolderOpen(
    workspaceRoot: string,
    tasks: readonly TaskDefinition[],
    issues: readonly TaskConfigurationIssue[],
  ): void {
    // invariant: Folder open starts declared tasks (src/modules/tasks/tasks.invariants.md)
    const launchedGroups = new Map<string, string[]>();
    for (const task of tasks) {
      if (!task.runOnFolderOpen) continue;
      const identifier = this.launch(workspaceRoot, task);
      const group = task.presentationGroup ?? identifier;
      const identifiers = launchedGroups.get(group) ?? [];
      identifiers.push(identifier);
      launchedGroups.set(group, identifiers);
    }

    const firstGroup =
      (launchedGroups.values().next().value as string[] | undefined) ?? [];
    const issueReports = issues.map((issue) => ({
      identifier: this.report(workspaceRoot, issue),
      severity: issue.severity,
    }));
    const errorIssueIdentifiers = issueReports
      .filter((report) => report.severity !== 'warning')
      .map((report) => report.identifier);
    const allIssueIdentifiers = issueReports.map((report) => report.identifier);
    // invariant: File sources report displaced built-ins (src/modules/tasks/tasks.invariants.md)
    if (firstGroup.length > 0) {
      this.options.port.present(firstGroup);
    } else if (errorIssueIdentifiers.length > 0) {
      this.options.port.present(errorIssueIdentifiers);
    } else if (allIssueIdentifiers.length > 0) {
      this.options.port.present(allIssueIdentifiers);
    }
  }

  launchAndPresent(
    workspaceRoot: string,
    task: TaskDefinition,
    tasks: readonly TaskDefinition[],
  ): void {
    const identifier = this.launch(workspaceRoot, task);
    const matchingGroupIdentifiers = task.presentationGroup
      ? tasks
          .filter(
            (candidate) =>
              candidate.presentationGroup === task.presentationGroup,
          )
          .map((candidate) =>
            this.identifierFor(workspaceRoot, candidate.configurationIndex),
          )
          .filter((candidateIdentifier) =>
            this.options.port.has(candidateIdentifier),
          )
      : [identifier];
    this.options.port.present(
      matchingGroupIdentifiers.length > 0
        ? matchingGroupIdentifiers
        : [identifier],
    );
  }

  disposeWorkspace(workspaceRoot: string): void {
    const identifiers =
      this.launchedIdentifiersByWorkspace.get(workspaceRoot) ?? new Set();
    for (const identifier of identifiers) {
      this.options.port.remove(identifier);
    }
    this.launchedIdentifiersByWorkspace.delete(workspaceRoot);
  }

  protected launch(workspaceRoot: string, task: TaskDefinition): string {
    const identifier = this.identifierFor(
      workspaceRoot,
      task.configurationIndex,
    );
    let argumentsList = [...task.arguments];
    let environment: Record<string, string> = {};
    // invariant: Task launch accepts process contributions (src/modules/tasks/tasks.invariants.md)
    for (const contributor of this.options.processLaunchContributors ?? []) {
      const context: TaskProcessLaunchContext = {
        workspaceRoot,
        task,
        arguments: argumentsList,
        environment,
      };
      const contribution = contributor.contribute(context);
      argumentsList = [...argumentsList, ...(contribution.arguments ?? [])];
      environment = {
        ...environment,
        ...contribution.environment,
      };
    }
    this.options.port.launch({
      identifier,
      label: task.label,
      workspaceRoot,
      command: task.command,
      arguments: argumentsList,
      environment,
      presentationGroup: task.presentationGroup,
      presentationPanel: task.presentationPanel,
    });
    this.rememberIdentifier(workspaceRoot, identifier);
    return identifier;
  }

  protected report(
    workspaceRoot: string,
    issue: TaskConfigurationIssue,
  ): string {
    // invariant: Unsupported tasks fail visibly (src/modules/tasks/tasks.invariants.md)
    const identifier = `${this.identifierFor(
      workspaceRoot,
      issue.configurationIndex,
    )}:error`;
    this.options.port.launch({
      identifier,
      label: issue.label,
      workspaceRoot,
      command: 'printf',
      arguments: ['%s\n', `Invar tasks: ${issue.message}`],
      environment: {},
      presentationGroup: 'task-errors',
      presentationPanel: 'dedicated',
    });
    this.rememberIdentifier(workspaceRoot, identifier);
    return identifier;
  }

  protected identifierFor(
    workspaceRoot: string,
    configurationIndex: number,
  ): string {
    return (
      `task:${encodeURIComponent(workspaceRoot)}:` + String(configurationIndex)
    );
  }

  protected rememberIdentifier(
    workspaceRoot: string,
    identifier: string,
  ): void {
    const identifiers =
      this.launchedIdentifiersByWorkspace.get(workspaceRoot) ?? new Set();
    identifiers.add(identifier);
    this.launchedIdentifiersByWorkspace.set(workspaceRoot, identifiers);
  }
}

export namespace TaskLauncher {
  export const $Class = $TaskLauncher;
  export let Class = $Class;
  export type Model = InstanceType<typeof Class>;
}

export interface TaskLauncherOptions {
  readonly port: TaskTerminalLaunchPort;
  readonly processLaunchContributors?: readonly TaskProcessLaunchContributor[];
}

export interface TaskTerminalLaunchPort {
  launch(request: TaskTerminalLaunchRequest): void;
  present(identifiers: readonly string[]): void;
  has(identifier: string): boolean;
  remove(identifier: string): void;
}

export interface TaskTerminalLaunchRequest {
  readonly identifier: string;
  readonly label: string;
  readonly workspaceRoot: string;
  readonly command: string;
  readonly arguments: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
  readonly presentationGroup?: string;
  readonly presentationPanel?: string;
}
