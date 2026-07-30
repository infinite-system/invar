import { expect, test } from 'bun:test';
import { CommandRegistry } from '../commands/CommandRegistry';
import type { Workspace } from '../workspace/Workspace';
import type {
  TaskConfigurationResult,
  TaskDefinition,
} from './TaskConfiguration';
import type { TaskLauncher } from './TaskLauncher';
import { Tasks } from './Tasks';

function configuredTask(
  configurationIndex: number,
  label: string,
  runOnFolderOpen: boolean,
): TaskDefinition {
  return {
    configurationIndex,
    label,
    command: 'program',
    arguments: [],
    runOnFolderOpen,
  };
}

test('tasks publishes its plain workspace contribution seam', () => {
  expect(Tasks.Class).toBe(Tasks.$Class);
});

test('workspace open launches folder tasks and registers manual reruns', () => {
  const commands = new CommandRegistry.Class();
  const folderOpenCalls: string[][] = [];
  const manualCalls: string[] = [];
  const disposedRoots: string[] = [];
  const configuredTasks = [
    configuredTask(0, 'Automatic', true),
    configuredTask(1, 'Manual', false),
  ];
  const configuration: TaskConfigurationResult = {
    source: '.invar/tasks.json',
    tasks: configuredTasks,
    issues: [],
  };
  const launcher = {
    launchFolderOpen: (
      _workspaceRoot: string,
      tasks: readonly TaskDefinition[],
    ) => {
      folderOpenCalls.push(tasks.map((task) => task.label));
    },
    launchAndPresent: (_workspaceRoot: string, task: TaskDefinition) => {
      manualCalls.push(task.label);
    },
    disposeWorkspace: (workspaceRoot: string) => {
      disposedRoots.push(workspaceRoot);
    },
  } as unknown as TaskLauncher.Model;
  const tasks = new Tasks.Class({
    commands,
    launcher,
    resolveConfiguration: () => configuration,
  });
  const workspace = {} as Workspace.Model;
  const contribution = tasks.attachWorkspace(workspace);

  contribution.opened('/workspace');

  expect(folderOpenCalls).toEqual([['Automatic', 'Manual']]);
  expect(tasks.statusSnapshot()).toMatchObject({
    taskConfiguredLabels: ['Automatic', 'Manual'],
    taskLaunchedLabels: ['Automatic'],
    taskErrors: [],
  });
  expect(commands.all().map((command) => command.title)).toEqual([
    'Tasks: Run Automatic',
    'Tasks: Run Manual',
  ]);

  commands.run(`tasks.run.${encodeURIComponent('/workspace')}.1`);
  expect(manualCalls).toEqual(['Manual']);
  expect(tasks.statusSnapshot().taskLaunchedLabels).toEqual([
    'Automatic',
    'Manual',
  ]);

  contribution.disposed();
  expect(disposedRoots).toEqual(['/workspace']);
  expect(commands.all()).toEqual([]);
});

test('an unrelated harness may suppress only the built-in convenience', () => {
  const launchedTaskLabels: string[][] = [];
  const launcher = {
    launchFolderOpen: (
      _workspaceRoot: string,
      tasks: readonly TaskDefinition[],
    ) => {
      launchedTaskLabels.push(tasks.map((task) => task.label));
    },
    disposeWorkspace: () => {},
  } as unknown as TaskLauncher.Model;
  const tasks = new Tasks.Class({
    commands: new CommandRegistry.Class(),
    launcher,
    builtInDefaultEnabled: false,
    resolveConfiguration: () => ({
      source: 'built-in',
      tasks: [configuredTask(0, 'Claude', true)],
      issues: [],
    }),
  });

  tasks.attachWorkspace({} as Workspace.Model).opened('/unrelated-harness');

  expect(launchedTaskLabels).toEqual([[]]);
  expect(tasks.statusSnapshot().taskConfiguredLabels).toEqual([]);
});

test('an unrelated harness keeps configured tasks inert and manually available', () => {
  const commands = new CommandRegistry.Class();
  const folderOpenCalls: string[][] = [];
  const manualCalls: string[] = [];
  const launcher = {
    launchFolderOpen: (
      _workspaceRoot: string,
      configuredTasks: readonly TaskDefinition[],
    ) => {
      folderOpenCalls.push(configuredTasks.map((task) => task.label));
    },
    launchAndPresent: (_workspaceRoot: string, task: TaskDefinition) => {
      manualCalls.push(task.label);
    },
    disposeWorkspace: () => {},
  } as unknown as TaskLauncher.Model;
  const tasks = new Tasks.Class({
    commands,
    launcher,
    folderOpenTaskLaunchEnabled: false,
    resolveConfiguration: () => ({
      source: '.invar/tasks.json',
      tasks: [configuredTask(0, 'Repository Task', true)],
      issues: [],
    }),
  });

  tasks.attachWorkspace({} as Workspace.Model).opened('/unrelated-harness');

  expect(folderOpenCalls).toEqual([]);
  expect(tasks.statusSnapshot()).toMatchObject({
    taskConfiguredLabels: ['Repository Task'],
    taskLaunchedLabels: [],
  });
  expect(commands.all().map((command) => command.title)).toEqual([
    'Tasks: Run Repository Task',
  ]);

  commands.run(`tasks.run.${encodeURIComponent('/unrelated-harness')}.0`);
  expect(manualCalls).toEqual(['Repository Task']);
  expect(tasks.statusSnapshot().taskLaunchedLabels).toEqual([
    'Repository Task',
  ]);
});
