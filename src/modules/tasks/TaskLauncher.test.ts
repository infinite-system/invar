import { expect, test } from 'bun:test';
import type {
  TaskConfigurationIssue,
  TaskDefinition,
} from './TaskConfiguration';
import { TaskLauncher, type TaskTerminalLaunchRequest } from './TaskLauncher';

function task(
  configurationIndex: number,
  label: string,
  overrides: Partial<TaskDefinition> = {},
): TaskDefinition {
  return {
    configurationIndex,
    label,
    command: 'program',
    arguments: ['configured'],
    runOnFolderOpen: true,
    ...overrides,
  };
}

function launcherFixture() {
  const requests: TaskTerminalLaunchRequest[] = [];
  const presentations: {
    identifiers: string[];
    transferFocus: boolean;
  }[] = [];
  const removedIdentifiers: string[] = [];
  const launcher = new TaskLauncher.Class({
    port: {
      launch: (request) => requests.push(request),
      present: (identifiers, transferFocus) =>
        presentations.push({
          identifiers: [...identifiers],
          transferFocus,
        }),
      has: (identifier) =>
        requests.some((request) => request.identifier === identifier),
      remove: (identifier) => removedIdentifiers.push(identifier),
    },
  });
  return {
    launcher,
    requests,
    presentations,
    removedIdentifiers,
  };
}

test('task launcher publishes its plain construction seam', () => {
  expect(TaskLauncher.Class).toBe(TaskLauncher.$Class);
});

test('folder-open tasks launch and matching groups present as one split', () => {
  const fixture = launcherFixture();
  const tasks = [
    task(0, 'Left', { presentationGroup: 'split' }),
    task(1, 'Right', { presentationGroup: 'split' }),
    task(2, 'Manual', { runOnFolderOpen: false }),
  ];

  fixture.launcher.launchFolderOpen('/workspace', tasks, []);

  expect(fixture.requests.map((request) => request.label)).toEqual([
    'Left',
    'Right',
  ]);
  expect(fixture.presentations).toHaveLength(1);
  expect(fixture.presentations[0]!.identifiers).toHaveLength(2);
  expect(new Set(fixture.presentations[0]!.identifiers).size).toBe(2);
  expect(fixture.presentations[0]!.transferFocus).toBe(false);
});

test('an ungrouped manual rerun presents only its own terminal', () => {
  const fixture = launcherFixture();
  const tasks = [task(0, 'First'), task(1, 'Second')];
  fixture.launcher.launchFolderOpen('/workspace', tasks, []);

  fixture.launcher.launchAndPresent('/workspace', tasks[1]!, tasks);

  expect(fixture.presentations.at(-1)).toEqual({
    identifiers: [fixture.requests.at(-1)!.identifier],
    transferFocus: true,
  });
});

test('the future MCP injection point contributes environment and arguments', () => {
  const requests: TaskTerminalLaunchRequest[] = [];
  const launcher = new TaskLauncher.Class({
    processLaunchContributors: [
      {
        contribute: (context) => {
          expect(context.arguments).toEqual(['configured']);
          expect(context.environment).toEqual({});
          return {
            arguments: ['--bridge-endpoint', 'invar://workspace'],
            environment: { INVAR_MCP_TOKEN: 'capability' },
          };
        },
      },
    ],
    port: {
      launch: (request) => requests.push(request),
      present: () => {},
      has: () => false,
      remove: () => {},
    },
  });

  launcher.launchFolderOpen('/workspace', [task(0, 'Agent')], []);

  expect(requests[0]?.arguments).toEqual([
    'configured',
    '--bridge-endpoint',
    'invar://workspace',
  ]);
  expect(requests[0]?.environment).toEqual({
    INVAR_MCP_TOKEN: 'capability',
  });
});

test('configuration issues launch legible dedicated error terminals', () => {
  const fixture = launcherFixture();
  const issues: TaskConfigurationIssue[] = [
    {
      configurationIndex: 2,
      label: 'Unsupported',
      message: 'unsupported type "process"',
    },
  ];

  fixture.launcher.launchFolderOpen('/workspace', [], issues);

  expect(fixture.requests[0]).toMatchObject({
    label: 'Unsupported',
    command: 'printf',
    arguments: ['%s\n', 'Invar tasks: unsupported type "process"'],
    presentationPanel: 'dedicated',
  });
  expect(fixture.presentations[0]).toEqual({
    identifiers: [fixture.requests[0]!.identifier],
    transferFocus: false,
  });
});

test('reports remain discoverable without hiding the first task group', () => {
  const fixture = launcherFixture();
  const tasks = [
    task(0, 'Left', { presentationGroup: 'split' }),
    task(1, 'Right', { presentationGroup: 'split' }),
  ];
  const issues: TaskConfigurationIssue[] = [
    {
      configurationIndex: 2,
      label: 'Displaced: Built In',
      severity: 'warning',
      message: 'file source displaces built-in task: "Built In"',
    },
  ];

  fixture.launcher.launchFolderOpen('/workspace', tasks, issues);

  expect(fixture.requests.map((request) => request.label)).toEqual([
    'Left',
    'Right',
    'Displaced: Built In',
  ]);
  expect(fixture.presentations).toEqual([
    {
      identifiers: [
        fixture.requests[0]!.identifier,
        fixture.requests[1]!.identifier,
      ],
      transferFocus: false,
    },
  ]);
});

test('disposing a workspace removes every terminal it launched', () => {
  const fixture = launcherFixture();
  fixture.launcher.launchFolderOpen(
    '/workspace',
    [task(0, 'One'), task(1, 'Two')],
    [],
  );

  fixture.launcher.disposeWorkspace('/workspace');

  expect(fixture.removedIdentifiers).toEqual(
    fixture.requests.map((request) => request.identifier),
  );
});
