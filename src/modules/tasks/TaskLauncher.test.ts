import { expect, test } from 'bun:test';
import type {
  TaskConfigurationIssue,
  TaskDefinition,
} from './TaskConfiguration';
import {
  TaskLauncher,
  type TaskPanelNoticeRequest,
  type TaskTerminalLaunchRequest,
} from './TaskLauncher';

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

function launcherFixture(initialIdentifiers: readonly string[] = []) {
  const requests: TaskTerminalLaunchRequest[] = [];
  const notices: TaskPanelNoticeRequest[] = [];
  const availableIdentifiers = new Set(initialIdentifiers);
  const presentations: {
    identifiers: string[];
    transferFocus: boolean;
  }[] = [];
  const removedIdentifiers: string[] = [];
  const launcher = new TaskLauncher.Class({
    port: {
      launch: (request) => {
        requests.push(request);
        availableIdentifiers.add(request.identifier);
      },
      notice: (request) => {
        notices.push(request);
        availableIdentifiers.add(request.identifier);
      },
      present: (identifiers, transferFocus) =>
        presentations.push({
          identifiers: [...identifiers],
          transferFocus,
        }),
      has: (identifier) => availableIdentifiers.has(identifier),
      remove: (identifier) => {
        removedIdentifiers.push(identifier);
        availableIdentifiers.delete(identifier);
      },
    },
  });
  return {
    launcher,
    requests,
    notices,
    presentations,
    removedIdentifiers,
  };
}

test('task launcher publishes its plain construction seam', () => {
  expect(TaskLauncher.Class).toBe(TaskLauncher.$Class);
});

test('task identity recognition stays behind the task launch seam', () => {
  const fixture = launcherFixture();
  expect(
    fixture.launcher.persistedTaskIdentifier('task:workspace:0', 'terminal'),
  ).toBe('task:workspace:0');
  expect(
    fixture.launcher.persistedTaskIdentifier(undefined, 'task:workspace:0'),
  ).toBe('task:workspace:0');
  expect(
    fixture.launcher.persistedTaskIdentifier('pane-instance-1', 'terminal'),
  ).toBeNull();
});

test('folder-open tasks launch and matching groups present as one split', () => {
  const fixture = launcherFixture();
  const tasks = [
    task(0, 'Left', {
      presentationGroup: 'split',
      sourcePath: '/workspace/.invar/tasks.json',
    }),
    task(1, 'Right', { presentationGroup: 'split' }),
    task(2, 'Manual', { runOnFolderOpen: false }),
  ];

  fixture.launcher.launchFolderOpen('/workspace', tasks, []);

  expect(fixture.requests.map((request) => request.label)).toEqual([
    'Left',
    'Right',
  ]);
  expect(fixture.requests[0]?.task).toEqual({
    label: 'Left',
    workspaceRoot: '/workspace',
    sourcePath: '/workspace/.invar/tasks.json',
  });
  expect(fixture.presentations).toHaveLength(1);
  expect(fixture.presentations[0]!.identifiers).toHaveLength(2);
  expect(new Set(fixture.presentations[0]!.identifiers).size).toBe(2);
  expect(fixture.presentations[0]!.transferFocus).toBe(false);
});

test('folder-open tasks start once per workspace root in one app session', () => {
  const fixture = launcherFixture();
  const tasks = [task(0, 'Left'), task(1, 'Right')];

  expect(fixture.launcher.launchFolderOpen('/workspace', tasks, [])).toEqual([
    'Left',
    'Right',
  ]);
  expect(fixture.launcher.launchFolderOpen('/workspace', tasks, [])).toEqual(
    [],
  );

  expect(fixture.requests).toHaveLength(2);
  expect(fixture.presentations).toHaveLength(1);
});

test('a live task identifier suppresses another folder-open launch', () => {
  const liveIdentifier = `task:${encodeURIComponent('/workspace')}:0`;
  const fixture = launcherFixture([liveIdentifier]);

  expect(
    fixture.launcher.launchFolderOpen('/workspace', [task(0, 'Live')], []),
  ).toEqual([]);

  expect(fixture.requests).toEqual([]);
  expect(fixture.presentations).toEqual([]);
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
      notice: () => {},
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

test('configuration issues publish legible panel notices', () => {
  const fixture = launcherFixture();
  const issues: TaskConfigurationIssue[] = [
    {
      configurationIndex: 2,
      label: 'Unsupported',
      message: 'unsupported type "process"',
    },
  ];

  fixture.launcher.launchFolderOpen('/workspace', [], issues);

  expect(fixture.requests).toEqual([]);
  expect(fixture.notices[0]).toEqual({
    identifier: `task:${encodeURIComponent('/workspace')}:2:notice`,
    label: 'Unsupported',
    message: 'unsupported type "process"',
    severity: 'error',
  });
  expect(fixture.presentations[0]).toEqual({
    identifiers: [fixture.notices[0]!.identifier],
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
  ]);
  expect(fixture.notices.map((notice) => notice.label)).toEqual([
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

test('reopening a disposed root stays silent for the rest of the app session', () => {
  const fixture = launcherFixture();
  const tasks = [task(0, 'One')];
  fixture.launcher.launchFolderOpen('/workspace', tasks, []);

  fixture.launcher.disposeWorkspace('/workspace');
  expect(fixture.launcher.launchFolderOpen('/workspace', tasks, [])).toEqual(
    [],
  );

  expect(fixture.requests).toHaveLength(1);
  expect(fixture.presentations).toHaveLength(1);
});
