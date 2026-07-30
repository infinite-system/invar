#!/usr/bin/env bun
// This probe measures dashboard processor use and work counters over a real-shaped task tree.
// Run: bun .invar/tasks/in-progress/393-idle-cpu-multiple-workspaces/393-dashboard-painted-cost-measurement.ts
// Each JSON row uses the app's Monitoring plugin through the real PTY. The monitor-only row is the
// baseline to subtract. Counter deltas show whether each hidden path is at rest and whether visible
// fleet probes scale with painted rows rather than all 250 task folders.

import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const taskCount = 250;
const inProgressTaskCount = 6;
const samplesPerArm = 3;

const fixtureRoot = mkdtempSync(
  join(tmpdir(), 'invar-393-dashboard-painted-cost-'),
);
const secondWorkspaceRoot = mkdtempSync(
  join(tmpdir(), 'invar-393-dashboard-painted-cost-second-'),
);
const homeDirectory = mkdtempSync(
  join(tmpdir(), 'invar-393-dashboard-painted-cost-home-'),
);
const fakeBinaryDirectory = join(fixtureRoot, 'fake-bin');
const fakeTmuxSessionListPath = join(fixtureRoot, 'fake-tmux-sessions.txt');
const statusPath = join(homeDirectory, 'status.json');
const settingsDirectory = join(homeDirectory, '.config', 'invar');
mkdirSync(settingsDirectory, { recursive: true });
writeFileSync(
  join(settingsDirectory, 'settings.json'),
  JSON.stringify({
    'monitoring.dockSide': 'left',
    'tasks.dockSide': 'right',
    'structure.dockSide': 'right',
  }),
);

function runFixtureCommand(command: string[], workingDirectory: string): void {
  const result = Bun.spawnSync(command, {
    cwd: workingDirectory,
    stdout: 'ignore',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `Fixture command failed: ${command.join(' ')}\n${result.stderr.toString()}`,
    );
  }
}

function writeTask(taskNumber: number, withWorktree: boolean): void {
  const folderName = `${taskNumber}-painted-cost-fixture`;
  const state = 'in-progress';
  const folderPath = join(fixtureRoot, '.invar', 'tasks', state, folderName);
  mkdirSync(folderPath, { recursive: true });
  writeFileSync(
    join(folderPath, `task-${folderName}.md`),
    [
      `# ${taskNumber} — painted cost fixture`,
      '',
      'State: IN-PROGRESS',
      'Engine: codex',
      '',
      '## Outline',
      '',
      'Real-shaped dashboard cost fixture.',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(folderPath, `brief-${taskNumber}-1-fixture.md`),
    'brief\n',
  );
  writeFileSync(join(folderPath, `report-${taskNumber}-fixture.md`), 'READY\n');
  writeFileSync(
    join(folderPath, 'meta.json'),
    JSON.stringify({
      startedAt: new Date(Date.now() - 600_000).toISOString(),
      round: 1,
      roundBriefedAtMs: Date.now() - 600_000,
      ...(withWorktree ? { tmuxSession: `invar/${folderName}` } : {}),
    }),
  );
  if (!withWorktree) return;
  const worktreePath = join(fixtureRoot, '.invar', 'worktrees', folderName);
  mkdirSync(join(worktreePath, 'src'), { recursive: true });
  runFixtureCommand(['git', 'init', '-q', '-b', 'main'], worktreePath);
  runFixtureCommand(['git', 'config', 'user.name', 'Fixture'], worktreePath);
  runFixtureCommand(
    ['git', 'config', 'user.email', 'fixture@example.invalid'],
    worktreePath,
  );
  writeFileSync(
    join(worktreePath, 'src', 'fixture.ts'),
    'export const value = 1;\n',
  );
  runFixtureCommand(['git', 'add', 'src/fixture.ts'], worktreePath);
  runFixtureCommand(['git', 'commit', '-qm', 'fixture'], worktreePath);
  writeFileSync(
    join(worktreePath, 'src', 'fixture.ts'),
    'export const value = 1;\nexport const changed = true;\n',
  );
}

for (let taskOffset = 0; taskOffset < taskCount; taskOffset += 1) {
  writeTask(1_000 + taskOffset, taskOffset >= taskCount - inProgressTaskCount);
}
writeFileSync(join(fixtureRoot, 'readme.txt'), 'dashboard cost fixture\n');
writeFileSync(join(secondWorkspaceRoot, 'readme.txt'), 'second workspace\n');

mkdirSync(fakeBinaryDirectory, { recursive: true });
writeFileSync(
  fakeTmuxSessionListPath,
  Array.from(
    { length: inProgressTaskCount },
    (_unused, taskOffset) => `invar/${1_000 + taskOffset}-painted-cost-fixture`,
  ).join('\n') + '\n',
);
writeFileSync(
  join(fakeBinaryDirectory, 'tmux'),
  [
    '#!/usr/bin/env bun',
    "if (Bun.argv[2] === 'list-sessions') {",
    '  process.stdout.write(await Bun.file(process.env.FAKE_TMUX_SESSION_LIST!).text());',
    '  process.exit(0);',
    '}',
    'process.exit(2);',
    '',
  ].join('\n'),
);
chmodSync(join(fakeBinaryDirectory, 'tmux'), 0o755);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 36,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_FLEET_REPOSITORY_ROOT: fixtureRoot,
    PATH: `${fakeBinaryDirectory}:${process.env.PATH ?? ''}`,
    FAKE_TMUX_SESSION_LIST: fakeTmuxSessionListPath,
  },
});

function taskDataTimerAtRest(status: Record<string, unknown>): boolean {
  return typeof status.tasksDataHeartbeatAtRest === 'boolean'
    ? status.tasksDataHeartbeatAtRest
    : !(
        status.rightDockVisible === true &&
        status.rightDockActiveContent === 'tasks'
      );
}

async function measureArm(label: string): Promise<void> {
  const before = HarnessSmoke.Class.readStatus(statusPath);
  let sampleCount = Number(before.monitoringSampleCount ?? 0);
  const processorReadings: number[] = [];
  for (let sampleIndex = 0; sampleIndex < samplesPerArm; sampleIndex += 1) {
    const sample = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `the monitor publishes sample ${sampleIndex + 1} for ${label}`,
      (status) => Number(status.monitoringSampleCount ?? 0) > sampleCount,
    );
    sampleCount = Number(sample.monitoringSampleCount);
    processorReadings.push(Number(sample.monitoringProcessorPercent ?? 0));
  }
  const after = HarnessSmoke.Class.readStatus(statusPath);
  const delta = (name: string): number =>
    Number(after[name] ?? 0) - Number(before[name] ?? 0);
  const pluginRenderRequestsBefore =
    (before.monitoringRenderRequestsByPlugin as
      Record<string, number> | undefined) ?? {};
  const pluginRenderRequestsAfter =
    (after.monitoringRenderRequestsByPlugin as
      Record<string, number> | undefined) ?? {};
  const pluginIdentifiers = new Set([
    ...Object.keys(pluginRenderRequestsBefore),
    ...Object.keys(pluginRenderRequestsAfter),
  ]);
  const pluginRenderRequests = Object.fromEntries(
    [...pluginIdentifiers]
      .map(
        (pluginIdentifier) =>
          [
            pluginIdentifier,
            Number(pluginRenderRequestsAfter[pluginIdentifier] ?? 0) -
              Number(pluginRenderRequestsBefore[pluginIdentifier] ?? 0),
          ] as const,
      )
      .filter(([_pluginIdentifier, requestCount]) => requestCount !== 0),
  );
  console.log(
    JSON.stringify({
      label,
      monitoringProcessorPercent: Number(
        (
          processorReadings.reduce((total, reading) => total + reading, 0) /
          processorReadings.length
        ).toFixed(2),
      ),
      painted:
        after.rightDockVisible === true &&
        after.rightDockActiveContent === 'tasks',
      dataTimerAtRest: taskDataTimerAtRest(after),
      dataHeartbeatTicks: delta('tasksDataHeartbeatTicks'),
      taskTreeReads: delta('tasksTaskTreeReads'),
      fleetFactProbes: delta('tasksFleetFactProbes'),
      sessionProbes: delta('tasksSessionProbes'),
      rowRebuilds: delta('tasksRowRebuilds'),
      pluginRenderRequests,
      tasksDashboardRenderRequests:
        pluginRenderRequests['tasks-dashboard'] ?? 0,
      terminalRenderRequests: pluginRenderRequests.terminal ?? 0,
    }),
  );
}

async function addSecondWorkspace(): Promise<void> {
  const snapshot = driver.snapshot();
  const plusColumn = Array.from(snapshot.rowText(0)).lastIndexOf('+');
  if (plusColumn < 0)
    throw new Error('The workspace plus button is not visible.');
  driver.sendMouseClick({ column: plusColumn, row: 0, button: 'left' });
  await driver.awaitGridCondition(
    'the project picker opens at the fixture parent',
    (candidate) =>
      candidate.findText(`+ ${dirname(secondWorkspaceRoot)}`) !== null,
  );
  driver.sendText(basename(secondWorkspaceRoot));
  await driver.awaitGridCondition(
    'the project picker finds the second workspace',
    (candidate) => candidate.findText(`+ ${secondWorkspaceRoot}`) !== null,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the second workspace is active',
    (status) =>
      status.workspaceCount === 2 &&
      status.activeWorkspaceRoot === secondWorkspaceRoot,
  );
}

try {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the dashboard fixture settles hidden',
    (status) =>
      status.ready === true &&
      status.rightDockVisible === false &&
      taskDataTimerAtRest(status),
  );
  driver.sendKeys('Control+Shift+n');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the monitor is painted alone',
    (status) =>
      status.monitoringObserved === true && taskDataTimerAtRest(status),
  );
  await measureArm('monitor only');

  driver.sendKeys('Control+Shift+t');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the tasks pane is painted',
    (status) =>
      status.rightDockVisible === true &&
      status.rightDockActiveContent === 'tasks' &&
      !taskDataTimerAtRest(status),
  );
  const firstPaintedStatus = HarnessSmoke.Class.readStatus(statusPath);
  if (firstPaintedStatus.tasksFleetFactProbes !== undefined) {
    const settledHeartbeatTarget =
      Number(firstPaintedStatus.tasksDataHeartbeatTicks ?? 0) + 3;
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the first painted task window finishes its initial samples',
      (status) =>
        Number(status.tasksDataHeartbeatTicks ?? 0) >= settledHeartbeatTarget &&
        Number(status.tasksFleetFactProbes ?? 0) > 0,
    );
  }
  await measureArm('tasks painted');

  driver.sendKeys('Control+Shift+u');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the structure pane replaces tasks paint',
    (status) =>
      status.rightDockVisible === true &&
      status.rightDockActiveContent === 'structure' &&
      taskDataTimerAtRest(status),
  );
  await measureArm('tasks behind another tab');

  driver.sendKeys('Control+Alt+b');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the right dock collapses',
    (status) =>
      status.rightDockVisible === false && taskDataTimerAtRest(status),
  );
  await measureArm('right dock collapsed');

  await addSecondWorkspace();
  driver.sendKeys('Control+Shift+n');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the monitor follows the active workspace',
    (status) =>
      status.monitoringObserved === true && taskDataTimerAtRest(status),
  );
  await measureArm('different workspace painted');
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(secondWorkspaceRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
