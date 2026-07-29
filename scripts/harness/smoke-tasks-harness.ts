#!/usr/bin/env bun
// A real-PTY drive of workspace tasks: configuration precedence, folder-open
// launch, terminal grouping, visible failures, the built-in fallback, and the
// independent native agent pane.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: One task source controls each workspace (src/modules/tasks/tasks.invariants.md)
// invariant: File sources report displaced built-ins (src/modules/tasks/tasks.invariants.md)
// invariant: Folder open starts declared tasks (src/modules/tasks/tasks.invariants.md)
// invariant: Each task owns one terminal (src/modules/tasks/tasks.invariants.md)
// invariant: Unsupported tasks fail visibly (src/modules/tasks/tasks.invariants.md)
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

interface DrivenTask {
  readonly label: string;
  readonly type: string;
  readonly command?: string;
  readonly args?: string[];
  readonly presentation?: {
    readonly group?: string;
    readonly panel?: string;
  };
  readonly runOptions?: {
    readonly runOn?: string;
  };
}

function taskConfiguration(tasks: readonly DrivenTask[]): string {
  return `${JSON.stringify(
    {
      version: '2.0.0',
      tasks,
    },
    null,
    2,
  )}\n`;
}

function shellTask(label: string, marker: string): DrivenTask {
  return {
    label,
    type: 'shell',
    command: '/bin/sh',
    args: [
      '-lc',
      `if [ "\${workspaceFolder}" = "$PWD" ]; then ` +
        `printf '${marker}:WORKSPACE_MATCH\\n'; ` +
        `else printf '${marker}:WORKSPACE_MISMATCH\\n'; fi; ` +
        'exec /bin/sh -i',
    ],
    presentation: {
      group: 'terminal-split',
      panel: 'dedicated',
    },
    runOptions: {
      runOn: 'folderOpen',
    },
  };
}

function taskIdentifiers(status: StatusSnapshot): string[] {
  const identifiers = status.panelCellIds;
  return Array.isArray(identifiers)
    ? identifiers.filter(
        (identifier): identifier is string =>
          typeof identifier === 'string' && identifier.startsWith('task:'),
      )
    : [];
}

function taskLabels(status: StatusSnapshot): string[] {
  return Array.isArray(status.panelContentLabels)
    ? status.panelContentLabels.filter(
        (label): label is string => typeof label === 'string',
      )
    : [];
}

function taskSource(status: StatusSnapshot): string | null {
  if (!Array.isArray(status.taskConfigurationSources)) return null;
  const firstSource = status.taskConfigurationSources[0];
  if (typeof firstSource !== 'object' || firstSource === null) return null;
  const source = (firstSource as { source?: unknown }).source;
  return typeof source === 'string' ? source : null;
}

async function createDriver(
  workspaceRoot: string,
  homeDirectory: string,
  environment: Record<string, string> = {},
): Promise<PtyTestDriver.Model> {
  return new PtyTestDriver.Class({
    workspaceRoot,
    columns: 132,
    rows: 42,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: join(homeDirectory, 'status.json'),
      INVAR_AGENT_BACKEND: 'echo',
      INVAR_TEST_SUPPRESS_BUILT_IN_TASK: '0',
      ...environment,
    },
  });
}

async function awaitTaskStatus(
  driver: PtyTestDriver.Model,
  homeDirectory: string,
  description: string,
  condition: (status: StatusSnapshot) => boolean,
): Promise<StatusSnapshot> {
  return HarnessSmoke.Class.awaitStatus(
    driver,
    join(homeDirectory, 'status.json'),
    description,
    condition,
    20_000,
  );
}

const workspaceRoot = mkdtempSync(
  join(tmpdir(), 'invar-tasks-harness-workspace-'),
);

const visualStudioCodeDirectory = join(workspaceRoot, '.vscode');

const invarDirectory = join(workspaceRoot, '.invar');

mkdirSync(visualStudioCodeDirectory);

mkdirSync(invarDirectory);

await Bun.write(join(workspaceRoot, 'small.txt'), 'small\n');

await Bun.write(
  join(visualStudioCodeDirectory, 'tasks.json'),
  taskConfiguration([
    shellTask('VS Code Left', 'VSCODE_LEFT'),
    shellTask('VS Code Right', 'VSCODE_RIGHT'),
  ]),
);

const homeDirectories: string[] = [];

let driver: PtyTestDriver.Model | null = null;

async function nextDriver(environment: Record<string, string> = {}): Promise<{
  driver: PtyTestDriver.Model;
  homeDirectory: string;
}> {
  if (driver) await driver.dispose();
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'invar-tasks-harness-home-'),
  );
  homeDirectories.push(homeDirectory);
  driver = await createDriver(workspaceRoot, homeDirectory, environment);
  return { driver, homeDirectory };
}

try {
  console.log(
    '== harness tasks: .vscode fallback starts a dedicated grouped split ==',
  );
  let driven = await nextDriver();
  let status = await awaitTaskStatus(
    driven.driver,
    driven.homeDirectory,
    'the VS Code source launched two tasks and reported the displaced built-in',
    (candidate) =>
      taskSource(candidate) === '.vscode/tasks.json' &&
      taskIdentifiers(candidate).length === 2 &&
      Array.isArray(candidate.taskErrors) &&
      candidate.taskErrors.includes(
        '.vscode/tasks.json displaces built-in task: "Claude"',
      ) &&
      Array.isArray(candidate.panelCellColumns) &&
      candidate.panelCellColumns.length === 2,
  );
  await driven.driver.awaitGridCondition(
    'both VS Code task processes and the displaced built-in report are visible',
    (snapshot) =>
      snapshot.findText('VSCODE_LEFT:WORKSPACE_MATCH') !== null &&
      snapshot.findText('VSCODE_RIGHT:WORKSPACE_MATCH') !== null &&
      snapshot.findText('Displaced: Claude') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    new Set(taskIdentifiers(status)).size === 2,
    'panel: dedicated gives each configured task its own visible terminal',
  );
  HarnessSmoke.Class.requireCondition(
    taskLabels(status).includes('VS Code Left') &&
      taskLabels(status).includes('VS Code Right') &&
      taskLabels(status).includes('Displaced: Claude'),
    'task headings remain visible beside the named displacement report',
  );
  HarnessSmoke.Class.requireCondition(
    Array.isArray(status.panelCellColumns) &&
      status.panelCellColumns.length === 2,
    'the shared presentation group is visibly split side by side',
  );
  HarnessSmoke.Class.pass(
    '${workspaceFolder} resolves before each task reaches its shell',
  );

  console.log(
    '== harness tasks: .invar wins outright over the existing VS Code file ==',
  );
  await Bun.write(
    join(invarDirectory, 'tasks.json'),
    taskConfiguration([shellTask('Invar Wins', 'INVAR_WINS')]),
  );
  driven = await nextDriver();
  status = await awaitTaskStatus(
    driven.driver,
    driven.homeDirectory,
    'the Invar task source replaced the VS Code source',
    (candidate) =>
      taskSource(candidate) === '.invar/tasks.json' &&
      taskLabels(candidate).includes('Invar Wins') &&
      Array.isArray(candidate.taskErrors) &&
      candidate.taskErrors.includes(
        '.invar/tasks.json displaces built-in task: "Claude"',
      ),
  );
  await driven.driver.awaitGridCondition(
    'the winning Invar task and displaced built-in report are visible',
    (snapshot) =>
      snapshot.findText('INVAR_WINS:WORKSPACE_MATCH') !== null &&
      snapshot.findText('Displaced: Claude') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    !taskLabels(status).includes('VS Code Left') &&
      !taskLabels(status).includes('VS Code Right'),
    '.invar/tasks.json replaces rather than unions .vscode/tasks.json',
  );
  HarnessSmoke.Class.pass(
    'file adoption names the displaced Claude built-in without merging it',
  );

  console.log(
    '== harness tasks positive control: unsupported inputs report visibly ==',
  );
  await Bun.write(
    join(invarDirectory, 'tasks.json'),
    taskConfiguration([
      {
        label: 'Unsupported Process',
        type: 'process',
        command: '/bin/true',
        runOptions: { runOn: 'folderOpen' },
      },
      {
        ...shellTask('Unsupported Variable', 'UNREACHABLE'),
        args: ['-lc', 'printf "${workspaceRoot}"'],
      },
    ]),
  );
  driven = await nextDriver();
  status = await awaitTaskStatus(
    driven.driver,
    driven.homeDirectory,
    'both planted unsupported definitions publish their exact errors',
    (candidate) =>
      Array.isArray(candidate.taskErrors) &&
      candidate.taskErrors.some((message) =>
        String(message).includes('unsupported type "process"'),
      ) &&
      candidate.taskErrors.some((message) =>
        String(message).includes('${workspaceRoot}'),
      ),
  );
  await driven.driver.awaitGridCondition(
    'unsupported errors are legible inside task-owned terminals',
    (snapshot) =>
      snapshot.findText('uses unsupported typ') !== null &&
      snapshot.findText('variable: ${workspaceRoot}') !== null &&
      snapshot.findText('Displaced: Claude') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    taskIdentifiers(status).length === 2,
    'the positive control rendered both planted errors',
  );
  HarnessSmoke.Class.pass(
    'unsupported type and variable checks were observed RED by users',
  );

  console.log(
    '== harness tasks: no configuration uses continue-or-fresh default ==',
  );
  rmSync(join(invarDirectory, 'tasks.json'));
  rmSync(join(visualStudioCodeDirectory, 'tasks.json'));
  const fakeBinaryDirectory = join(workspaceRoot, 'fake-bin');
  mkdirSync(fakeBinaryDirectory);
  const fakeClaudePath = join(fakeBinaryDirectory, 'claude');
  await Bun.write(
    fakeClaudePath,
    [
      '#!/bin/sh',
      'if [ "$2" = "--continue" ]; then',
      "  printf 'BUILTIN_CONTINUE_FAILED\\n'",
      '  exit 1',
      'fi',
      'printf \'BUILTIN_FRESH:%s\\n\' "$PWD"',
      'exec /bin/sh -i',
      '',
    ].join('\n'),
  );
  chmodSync(fakeClaudePath, 0o755);
  driven = await nextDriver({
    PATH: `${fakeBinaryDirectory}:${process.env.PATH ?? ''}`,
  });
  await awaitTaskStatus(
    driven.driver,
    driven.homeDirectory,
    'the built-in Claude task launched on folder open',
    (candidate) =>
      taskSource(candidate) === 'built-in' &&
      taskLabels(candidate).includes('Claude'),
  );
  await driven.driver.awaitGridCondition(
    'continue failure falls through to a fresh Claude process',
    (snapshot) =>
      snapshot.findText('BUILTIN_CONTINUE_FAILED') !== null &&
      snapshot.findText(`BUILTIN_FRESH:${workspaceRoot}`) !== null,
  );
  HarnessSmoke.Class.pass(
    'the default uses ||: failed resume starts the fresh fallback',
  );

  console.log(
    '== harness tasks: the native power-user agent pane still coexists ==',
  );
  driven.driver.sendRawInput('\x1b[27;6;97~');
  await awaitTaskStatus(
    driven.driver,
    driven.homeDirectory,
    'the native agent pane opens beside the running task terminal',
    (candidate) =>
      candidate.agentTitle === 'Claude' &&
      taskIdentifiers(candidate).length === 1 &&
      Array.isArray(candidate.panelCellIds) &&
      candidate.panelCellIds.includes('agent'),
  );
  await driven.driver.awaitGridCondition(
    'the native agent composer remains visible and usable',
    (snapshot) =>
      snapshot.findText('Ask Claude') !== null &&
      snapshot.findText('❯') !== null,
  );
  HarnessSmoke.Class.pass(
    'the native agent pane remains independent of terminal tasks',
  );

  driven.driver.sendKeys('Control+q');
  console.log('smoke-tasks-harness: ALL-PASS');
} finally {
  const activeDriver = driver as PtyTestDriver.Model | null;
  if (activeDriver) await activeDriver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(workspaceRoot);
  for (const homeDirectory of homeDirectories) {
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}
