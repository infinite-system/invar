import type {
  TaskConfigurationIssue,
  TaskDefinition,
} from './TaskConfiguration';
import type {
  TaskProcessLaunchContext,
  TaskProcessLaunchContributor,
} from './TaskProcessLaunchContributor.interface';
import type { PaneTaskMetadata } from '../ui/PaneContent.interface';

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
  ): readonly string[] {
    // invariant: Folder open starts declared tasks (src/modules/tasks/tasks.invariants.md)
    const launchedGroups = new Map<string, string[]>();
    const launchedLabels: string[] = [];
    for (const task of tasks) {
      if (!task.runOnFolderOpen) continue;
      const identifier = this.identifierFor(
        workspaceRoot,
        task.configurationIndex,
      );
      let launchedNow = false;
      if (!this.wasLaunched(workspaceRoot, identifier)) {
        if (this.options.port.has(identifier)) {
          this.rememberIdentifier(workspaceRoot, identifier);
        } else {
          this.launch(workspaceRoot, task);
          launchedNow = true;
          launchedLabels.push(task.label);
        }
      }
      if (!launchedNow || !this.options.port.has(identifier)) continue;
      const group = task.presentationGroup ?? identifier;
      const identifiers = launchedGroups.get(group) ?? [];
      identifiers.push(identifier);
      launchedGroups.set(group, identifiers);
    }

    const firstGroup =
      (launchedGroups.values().next().value as string[] | undefined) ?? [];
    const issueReports = issues.flatMap((issue) => {
      const identifier = this.noticeIdentifierFor(
        workspaceRoot,
        issue.configurationIndex,
      );
      if (this.options.port.has(identifier)) return [];
      this.options.port.notice({
        identifier,
        label: issue.label,
        message: issue.message,
        severity: issue.severity ?? 'error',
      });
      if (!this.options.port.has(identifier)) {
        return [];
      }
      return [{ identifier, severity: issue.severity }];
    });
    const errorIssueIdentifiers = issueReports
      .filter((report) => report.severity !== 'warning')
      .map((report) => report.identifier);
    const allIssueIdentifiers = issueReports.map((report) => report.identifier);
    // invariant: File sources report displaced built-ins (src/modules/tasks/tasks.invariants.md)
    if (firstGroup.length > 0) {
      this.options.port.present(firstGroup, false);
    } else if (errorIssueIdentifiers.length > 0) {
      this.options.port.present(errorIssueIdentifiers, false);
    } else if (allIssueIdentifiers.length > 0) {
      this.options.port.present(allIssueIdentifiers, false);
    }
    return launchedLabels;
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
      true,
    );
  }

  disposeWorkspace(workspaceRoot: string): void {
    const identifiers =
      this.launchedIdentifiersByWorkspace.get(workspaceRoot) ?? new Set();
    for (const identifier of identifiers) {
      this.options.port.remove(identifier);
    }
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
      task: {
        label: task.label,
        workspaceRoot,
        sourcePath: task.sourcePath ?? null,
      },
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

  protected identifierFor(
    workspaceRoot: string,
    configurationIndex: number,
  ): string {
    return (
      `task:${encodeURIComponent(workspaceRoot)}:` + String(configurationIndex)
    );
  }

  persistedTaskIdentifier(
    identifier: string | undefined,
    kind: string,
  ): string | null {
    if (identifier?.startsWith('task:')) return identifier;
    return kind.startsWith('task:') ? kind : null;
  }

  protected noticeIdentifierFor(
    workspaceRoot: string,
    configurationIndex: number,
  ): string {
    return `${this.identifierFor(workspaceRoot, configurationIndex)}:notice`;
  }

  protected wasLaunched(workspaceRoot: string, identifier: string): boolean {
    return (
      this.launchedIdentifiersByWorkspace.get(workspaceRoot)?.has(identifier) ??
      false
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
  notice(request: TaskPanelNoticeRequest): void;
  present(identifiers: readonly string[], transferFocus: boolean): void;
  has(identifier: string): boolean;
  remove(identifier: string): void;
}

export interface TaskPanelNoticeRequest {
  readonly identifier: string;
  readonly label: string;
  readonly message: string;
  readonly severity: 'warning' | 'error';
}

export interface TaskTerminalLaunchRequest {
  readonly identifier: string;
  readonly label: string;
  readonly task: PaneTaskMetadata;
  readonly workspaceRoot: string;
  readonly command: string;
  readonly arguments: readonly string[];
  readonly environment: Readonly<Record<string, string>>;
  readonly presentationGroup?: string;
  readonly presentationPanel?: string;
}
