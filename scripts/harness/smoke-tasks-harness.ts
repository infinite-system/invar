#!/usr/bin/env bun
// A real-PTY drive of workspace tasks: configuration precedence, folder-open
// launch, terminal grouping, nested interactive login shells, shell variable
// handoff, visible failures, the built-in fallback, and the independent native
// agent pane.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: One task source controls each workspace (src/modules/tasks/tasks.invariants.md)
// invariant: File sources report displaced built-ins (src/modules/tasks/tasks.invariants.md)
// invariant: Folder open starts declared tasks (src/modules/tasks/tasks.invariants.md)
// invariant: Each task owns one terminal (src/modules/tasks/tasks.invariants.md)
// invariant: Task variables resolve pass through or refuse (src/modules/tasks/tasks.invariants.md)
// invariant: Unsupported tasks fail visibly (src/modules/tasks/tasks.invariants.md)
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
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
        `if [ "\${workspaceFolderBasename}" = "$(basename "$PWD")" ] && ` +
        `[ "\${cwd}" = "$PWD" ] && [ "\${pathSeparator}" = "/" ] && ` +
        `[ "\${userHome}" = "$HOME" ] && ` +
        `[ "\${env:INVAR_TASK_DEFINED}" = "defined-environment" ] && ` +
        `[ -z "\${env:INVAR_TASK_UNDEFINED}" ]; then ` +
        `printf '${marker}:VARIABLES_MATCH\\n'; ` +
        `else printf '${marker}:VARIABLES_MISMATCH\\n'; fi; ` +
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
  const identifiers = status.panelContentIds;
  return Array.isArray(identifiers)
    ? identifiers.filter(
        (identifier): identifier is string =>
          typeof identifier === 'string' &&
          identifier.startsWith('task:') &&
          !identifier.endsWith(':notice'),
      )
    : [];
}

function taskNoticeIdentifiers(status: StatusSnapshot): string[] {
  const identifiers = status.panelContentIds;
  return Array.isArray(identifiers)
    ? identifiers.filter(
        (identifier): identifier is string =>
          typeof identifier === 'string' && identifier.endsWith(':notice'),
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
      INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS: '0',
      INVAR_TASK_DEFINED: 'defined-environment',
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

const secondaryWorkspaceRoot = `${workspaceRoot}-secondary`;

mkdirSync(secondaryWorkspaceRoot);

await Bun.write(
  join(secondaryWorkspaceRoot, 'secondary.txt'),
  'secondary workspace\n',
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

async function nextDriver(
  environment: Record<string, string> = {},
  prepareHomeDirectory?: (homeDirectory: string) => Promise<void>,
): Promise<{
  driver: PtyTestDriver.Model;
  homeDirectory: string;
}> {
  if (driver) await driver.dispose();
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'invar-tasks-harness-home-'),
  );
  homeDirectories.push(homeDirectory);
  await prepareHomeDirectory?.(homeDirectory);
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
    'both VS Code task processes are visible',
    (snapshot) =>
      snapshot.findText('VSCODE_LEFT:WORKSPACE_MATCH') !== null &&
      snapshot.findText('VSCODE_LEFT:VARIABLES_MATCH') !== null &&
      snapshot.findText('VSCODE_RIGHT:WORKSPACE_MATCH') !== null &&
      snapshot.findText('VSCODE_RIGHT:VARIABLES_MATCH') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    new Set(taskIdentifiers(status)).size === 2,
    'panel: dedicated gives each configured task its own visible terminal',
  );
  HarnessSmoke.Class.requireCondition(
    taskLabels(status).includes('VS Code Left') &&
      taskLabels(status).includes('VS Code Right') &&
      taskLabels(status).includes('Displaced: Claude'),
    'task labels and the named displacement report remain observable',
  );
  HarnessSmoke.Class.requireCondition(
    Array.isArray(status.panelCellColumns) &&
      status.panelCellColumns.length === 2,
    'the shared presentation group is visibly split side by side',
  );
  HarnessSmoke.Class.pass(
    'workspace, environment, and context-free predefined variables resolve before each shell',
  );

  console.log(
    '== harness tasks: restored pin closes a derived notice without touching task terminals ==',
  );
  driven = await nextDriver({}, async (homeDirectory) => {
    const configurationDirectory = join(homeDirectory, '.config', 'invar');
    mkdirSync(configurationDirectory, { recursive: true });
    await Bun.write(
      join(configurationDirectory, 'settings.json'),
      `${JSON.stringify({
        panelWorkspaceStates: {
          [workspaceRoot]: {
            spaces: [
              {
                kind: 'terminal',
                label: 'Terminal',
                groups: [[{ kind: 'terminal', label: 'Restored Terminal' }]],
                activeGroupIndex: 0,
              },
            ],
            activeSpaceIndex: 0,
            panelListExpanded: true,
            panelListWidth: 24,
            visible: true,
          },
        },
      })}\n`,
    );
  });
  status = await awaitTaskStatus(
    driven.driver,
    driven.homeDirectory,
    'restored state keeps its list pinned beside two live task terminals and one derived notice',
    (candidate) =>
      taskIdentifiers(candidate).length === 2 &&
      taskNoticeIdentifiers(candidate).length === 1 &&
      candidate.panelListVisible === true,
  );
  await HarnessSmoke.Class.closePanelContentsListRow(
    driven.driver,
    join(driven.homeDirectory, 'status.json'),
    'Displaced',
  );
  status = HarnessSmoke.Class.readStatus(
    join(driven.homeDirectory, 'status.json'),
  );
  HarnessSmoke.Class.requireCondition(
    taskIdentifiers(status).length === 2 &&
      taskNoticeIdentifiers(status).length === 0 &&
      status.panelListVisible === true,
    'the restored hover-close removes only the notice and keeps the list pinned',
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
    'the winning Invar task is visible',
    (snapshot) => snapshot.findText('INVAR_WINS:WORKSPACE_MATCH') !== null,
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
    '== harness tasks: closing and reopening one root stays silent in the app session ==',
  );
  const launchRecordPath = join(workspaceRoot, 'folder-open-launches.txt');
  await Bun.write(
    join(invarDirectory, 'tasks.json'),
    taskConfiguration([
      {
        label: 'Once Per Root',
        type: 'shell',
        command: '/bin/sh',
        args: [
          '-lc',
          `printf 'launch\\n' >> ${JSON.stringify(launchRecordPath)}; ` +
            `printf 'ONCE_PER_ROOT_READY\\n'; exec /bin/sh -i`,
        ],
        runOptions: { runOn: 'folderOpen' },
      },
    ]),
  );
  driven = await nextDriver({
    INVAR_TEST_SUPPRESS_BUILT_IN_TASK: '1',
  });
  status = await awaitTaskStatus(
    driven.driver,
    driven.homeDirectory,
    'the first folder open launches the declared task',
    (candidate) =>
      Array.isArray(candidate.taskLaunchedLabels) &&
      candidate.taskLaunchedLabels.includes('Once Per Root') &&
      taskIdentifiers(candidate).length === 1,
  );
  await driven.driver.awaitGridCondition(
    'the first folder-open task reaches its real shell',
    (snapshot) => snapshot.findText('ONCE_PER_ROOT_READY') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    readFileSync(launchRecordPath, 'utf8') === 'launch\n',
    'the present arm records exactly one process launch',
  );

  driven.driver.sendKeys('Control+Shift+o');
  await driven.driver.awaitGridCondition(
    'the workspace picker opens at the task root parent',
    (snapshot) => snapshot.findText(`+ ${dirname(workspaceRoot)}/`) !== null,
  );
  driven.driver.sendText(basename(secondaryWorkspaceRoot));
  await awaitTaskStatus(
    driven.driver,
    driven.homeDirectory,
    'the picker contains the secondary workspace path',
    (candidate) => candidate.quickOpenQuery === secondaryWorkspaceRoot,
  );
  driven.driver.sendKeys('Enter');
  await awaitTaskStatus(
    driven.driver,
    driven.homeDirectory,
    'the secondary workspace is open',
    (candidate) =>
      candidate.workspaceCount === 2 &&
      candidate.activeWorkspaceRoot === secondaryWorkspaceRoot,
  );
  driven.driver.sendKeys('Control+Shift+PageUp');
  await awaitTaskStatus(
    driven.driver,
    driven.homeDirectory,
    'the task workspace is active before close',
    (candidate) => candidate.activeWorkspaceRoot === workspaceRoot,
  );
  driven.driver.sendKeys('Control+Shift+w');
  await awaitTaskStatus(
    driven.driver,
    driven.homeDirectory,
    'closing the task workspace returns to the secondary workspace',
    (candidate) =>
      candidate.workspaceCount === 1 &&
      candidate.activeWorkspaceRoot === secondaryWorkspaceRoot,
  );
  driven.driver.sendKeys('Control+Shift+o');
  await driven.driver.awaitGridCondition(
    'the workspace picker reopens at the shared parent',
    (snapshot) =>
      snapshot.findText(`+ ${dirname(secondaryWorkspaceRoot)}/`) !== null,
  );
  driven.driver.sendText(basename(workspaceRoot));
  await awaitTaskStatus(
    driven.driver,
    driven.homeDirectory,
    'the picker contains the original task workspace path',
    (candidate) => candidate.quickOpenQuery === workspaceRoot,
  );
  driven.driver.sendKeys('Enter');
  status = await awaitTaskStatus(
    driven.driver,
    driven.homeDirectory,
    'the reopened root reports no new automatic task launch',
    (candidate) =>
      candidate.workspaceCount === 2 &&
      candidate.activeWorkspaceRoot === workspaceRoot &&
      Array.isArray(candidate.taskLaunchedLabels) &&
      candidate.taskLaunchedLabels.length === 0,
  );
  HarnessSmoke.Class.requireCondition(
    taskIdentifiers(status).length === 0,
    'the reopened panel world contains no replacement task terminal',
  );
  HarnessSmoke.Class.requireCondition(
    readFileSync(launchRecordPath, 'utf8') === 'launch\n',
    'the absent arm records no second process launch',
  );
  HarnessSmoke.Class.pass(
    'folder-open tasks launch once per root while the app session lives',
  );

  console.log(
    '== harness tasks: nested interactive zsh commands load in two panes ==',
  );
  const exactShapeFakeBinaryDirectory = join(
    workspaceRoot,
    'exact-shape-fake-bin',
  );
  mkdirSync(exactShapeFakeBinaryDirectory);
  const exactShapeFakeAwsVaultPath = join(
    exactShapeFakeBinaryDirectory,
    'aws-vault',
  );
  await Bun.write(
    exactShapeFakeAwsVaultPath,
    [
      '#!/bin/sh',
      'while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do shift; done',
      'if [ "$#" -eq 0 ]; then exit 64; fi',
      'shift',
      'exec "$@"',
      '',
    ].join('\n'),
  );
  chmodSync(exactShapeFakeAwsVaultPath, 0o755);
  await Bun.write(
    join(invarDirectory, 'tasks.json'),
    taskConfiguration([
      {
        label: 'Claude',
        type: 'shell',
        command: '/usr/bin/zsh',
        args: [
          '-lc',
          `cd "\${workspaceFolder}" && source ~/.profile_env && ` +
            `echo EXACT_CLAUDE_OUTER:$PWD && ` +
            `aws-vault exec harmless --duration 12h -- zsh -ic ` +
            `'echo EXACT_CLAUDE_INNER; while true; do sleep 60; done'`,
        ],
        presentation: {
          group: 'terminal-split',
          panel: 'dedicated',
        },
        runOptions: {
          runOn: 'folderOpen',
        },
      },
      {
        label: 'Terminal',
        type: 'shell',
        command: '/usr/bin/zsh',
        args: [
          '-lc',
          `cd "\${workspaceFolder}" && source ~/.profile_env && ` +
            `aws-vault exec harmless --duration 12h -- zsh -ic ` +
            `'echo EXACT_TERMINAL_INNER; while true; do sleep 60; done'`,
        ],
        presentation: {
          group: 'terminal-split',
          panel: 'dedicated',
        },
        runOptions: {
          runOn: 'folderOpen',
        },
      },
    ]),
  );
  driven = await nextDriver(
    {
      PATH: `${exactShapeFakeBinaryDirectory}:${process.env.PATH ?? ''}`,
    },
    async (homeDirectory) => {
      await Bun.write(
        join(homeDirectory, '.profile_env'),
        `export PATH=${JSON.stringify(exactShapeFakeBinaryDirectory)}:$PATH\n`,
      );
      await Bun.write(
        join(homeDirectory, '.zshrc'),
        '# harmless task smoke shell\n',
      );
      const configurationDirectory = join(homeDirectory, '.config', 'invar');
      mkdirSync(configurationDirectory, { recursive: true });
      await Bun.write(
        join(configurationDirectory, 'settings.json'),
        `${JSON.stringify({
          panelContentOrder: [
            `task:${encodeURIComponent(workspaceRoot)}:2:notice`,
            'agent',
            'terminal',
          ],
          panelWorkspaceStates: {
            [workspaceRoot]: {
              spaces: [
                {
                  kind: 'terminal',
                  label: 'Terminal',
                  groups: [
                    [
                      {
                        kind: 'terminal',
                        label: 'Restored Terminal',
                      },
                    ],
                    [
                      {
                        identifier: `task:${encodeURIComponent(workspaceRoot)}:2:notice`,
                        kind: 'terminal',
                        label: 'Displaced: Claude',
                      },
                    ],
                    [
                      {
                        identifier: 'database',
                        kind: 'database',
                        label: 'Database',
                      },
                    ],
                  ],
                  activeGroupIndex: 0,
                },
              ],
              activeSpaceIndex: 0,
              panelListExpanded: true,
              panelListWidth: 35,
              visible: true,
            },
          },
        })}\n`,
      );
    },
  );
  status = await awaitTaskStatus(
    driven.driver,
    driven.homeDirectory,
    'both reported-shape tasks own separate visible split cells',
    (candidate) =>
      taskSource(candidate) === '.invar/tasks.json' &&
      Array.isArray(candidate.taskLaunchedLabels) &&
      candidate.taskLaunchedLabels.includes('Claude') &&
      candidate.taskLaunchedLabels.includes('Terminal') &&
      taskIdentifiers(candidate).length === 2 &&
      taskNoticeIdentifiers(candidate).length === 0 &&
      !taskLabels(candidate).includes('Displaced: Claude') &&
      taskLabels(candidate).includes('Claude') &&
      taskLabels(candidate).includes('Terminal') &&
      Array.isArray(candidate.panelActiveSpacePaneIds) &&
      !candidate.panelActiveSpacePaneIds.includes('database') &&
      Array.isArray(candidate.panelCellColumns) &&
      candidate.panelCellColumns.length === 2,
  );
  await driven.driver.awaitGridCondition(
    'both nested interactive shells print inside their own panes',
    (snapshot) =>
      snapshot.findText('EXACT_CLAUDE_INNER') !== null &&
      snapshot.findText('EXACT_TERMINAL_INNER') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    new Set(taskIdentifiers(status)).size === 2,
    'the nested login-shell tasks own two unique terminal panes',
  );
  HarnessSmoke.Class.requireCondition(
    Array.isArray(status.panelCellColumns) &&
      status.panelCellColumns.length === 2 &&
      status.panelCellColumns.every(
        (columnCount) => typeof columnCount === 'number' && columnCount > 0,
      ),
    'both nested login-shell task panes receive a live split width',
  );
  HarnessSmoke.Class.requireCondition(
    !taskLabels(status).includes('Displaced: Claude') &&
      taskNoticeIdentifiers(status).length === 0 &&
      taskLabels(status).includes('Claude') &&
      taskLabels(status).includes('Terminal') &&
      Array.isArray(status.panelActiveSpacePaneIds) &&
      !status.panelActiveSpacePaneIds.includes('database'),
    'a planted notice and mismatched Database pane do not restore beside the explicit Claude override',
  );
  HarnessSmoke.Class.requireCondition(
    status.panelListVisible === true,
    'the planted restored list pin remains open after folder tasks adopt their identifiers',
  );
  HarnessSmoke.Class.pass(
    'command, args, login shell, credentials wrapper, and inner TTY all reached both panes',
  );

  console.log(
    '== harness tasks: unknown task variables reach the real shell unchanged ==',
  );
  await Bun.write(
    join(invarDirectory, 'tasks.json'),
    taskConfiguration([
      {
        label: 'Shell Expansion',
        type: 'shell',
        command: '/bin/sh',
        args: [
          '-lc',
          `printf 'SHELL_EXPANDED=%s\\n' ` +
            '"${LOCAL_DIR#/some/prefix}"; exec /bin/sh -i',
        ],
        runOptions: { runOn: 'folderOpen' },
      },
    ]),
  );
  driven = await nextDriver({
    LOCAL_DIR: '/some/prefix/realized',
  });
  status = await awaitTaskStatus(
    driven.driver,
    driven.homeDirectory,
    'the task with shell parameter expansion launched without a variable error',
    (candidate) =>
      Array.isArray(candidate.taskLaunchedLabels) &&
      candidate.taskLaunchedLabels.includes('Shell Expansion') &&
      Array.isArray(candidate.taskErrors) &&
      !candidate.taskErrors.some((message) =>
        String(message).includes('${LOCAL_DIR#/some/prefix}'),
      ),
  );
  await driven.driver.awaitGridCondition(
    'the real shell expanded the unchanged task expression',
    (snapshot) => snapshot.findText('SHELL_EXPANDED=/realized') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    taskIdentifiers(status).length === 1,
    'the shell expansion task owns one running terminal',
  );
  HarnessSmoke.Class.pass(
    'unknown task syntax passed through unchanged and the real shell expanded it',
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
        ...shellTask('Missing File Context', 'UNREACHABLE'),
        args: ['-lc', 'printf "${file}"'],
      },
      {
        ...shellTask('Unsupported Input', 'UNREACHABLE'),
        args: ['-lc', 'printf "${input:target}"'],
      },
      {
        ...shellTask('Unsupported Command', 'UNREACHABLE'),
        args: ['-lc', 'printf "${command:target}"'],
      },
    ]),
  );
  driven = await nextDriver();
  status = await awaitTaskStatus(
    driven.driver,
    driven.homeDirectory,
    'four planted unsupported definitions publish their exact errors',
    (candidate) =>
      Array.isArray(candidate.taskErrors) &&
      candidate.taskErrors.some((message) =>
        String(message).includes('unsupported type "process"'),
      ) &&
      candidate.taskErrors.some((message) =>
        String(message).includes('${file} requires an active document'),
      ) &&
      candidate.taskErrors.some((message) =>
        String(message).includes('${input:target}'),
      ) &&
      candidate.taskErrors.some((message) =>
        String(message).includes('${command:target}'),
      ) &&
      taskNoticeIdentifiers(candidate).length === 5 &&
      Array.isArray(candidate.panelCellIds) &&
      candidate.panelCellIds.length === 4,
  );
  await driven.driver.awaitGridCondition(
    'unsupported labels, severity, and messages are legible in task-owned notices',
    (snapshot) => {
      const paintedRows = snapshot.textRows();
      return (
        paintedRows.some((row) => row.split('Error').length - 1 === 4) &&
        snapshot.findText('Unsupported Proce') !== null &&
        snapshot.findText('Missing File Cont') !== null &&
        snapshot.findText('Unsupported Input') !== null &&
        snapshot.findText('Unsupported Comm') !== null &&
        snapshot.findText('Task variable ${f') !== null
      );
    },
  );
  HarnessSmoke.Class.requireCondition(
    taskIdentifiers(status).length === 0 &&
      taskNoticeIdentifiers(status).length === 5 &&
      Array.isArray(status.panelContentKinds) &&
      status.panelContentKinds.filter((kind) => kind === 'task-notice')
        .length === 5,
    'the positive control rendered four errors, one warning, and no pseudo-terminals',
  );
  const instancesToggle = (
    status.panelSeparatorGeometry as
      | {
          instancesToggle: {
            startColumn: number;
            endColumnExclusive: number;
          } | null;
        }
      | undefined
  )?.instancesToggle;
  if (!instancesToggle) {
    throw new Error('The four-pane space did not publish its instances chip');
  }
  HarnessSmoke.Class.pass(
    'the four-pane management case publishes its instances count chip',
  );
  HarnessSmoke.Class.pass(
    'missing file context and refused variable classes were observed RED by users',
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
    'the native agent pane opens as a full-width group while the task stays live',
    (candidate) =>
      Array.isArray(candidate.panelCellIds) &&
      candidate.panelCellKinds.join(',') === 'agent' &&
      candidate.panelActiveContentKind === 'agent',
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
  await HarnessSmoke.Class.removeTemporaryDirectory(secondaryWorkspaceRoot);
  for (const homeDirectory of homeDirectories) {
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}
