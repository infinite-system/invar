#!/usr/bin/env bun
// This probe measures dashboard idle CPU and complete frames through the real PTY.
// Run: bun .invar/tasks/in-progress/380-idle-cpu-fifteen-to-twentyfive-percent/380-dashboard-idle-cpu-toggle-measurement.ts small
// Run again with `large` to put the only building row below 50 READY rows.
// Each result gives CPU use and complete frames over five seconds. A quiet arm has at most one
// frame, while about 150 frames names the dashboard's 30 Hz motion timer.

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const scale = process.argv[2] ?? 'small';
if (scale !== 'small' && scale !== 'large') {
  throw new Error('Scale must be `small` or `large`.');
}

const clockTicksPerSecond = Number(
  new TextDecoder().decode(Bun.spawnSync(['getconf', 'CLK_TCK']).stdout).trim(),
);
if (!Number.isFinite(clockTicksPerSecond) || clockTicksPerSecond <= 0) {
  throw new Error('Could not read the Linux clock tick rate with getconf.');
}

const fixtureRoot = mkdtempSync(
  join(tmpdir(), `invar-380-dashboard-idle-${scale}-`),
);
const homeDirectory = mkdtempSync(
  join(tmpdir(), `invar-380-dashboard-idle-home-${scale}-`),
);
const tasksRoot = join(fixtureRoot, '.invar', 'tasks', 'in-progress');
const statusPath = join(homeDirectory, 'status.json');

function writeTask(taskNumber: number, taskName: string, ready: boolean): void {
  const folderName = `${taskNumber}-${taskName}`;
  const folderPath = join(tasksRoot, folderName);
  mkdirSync(folderPath, { recursive: true });
  writeFileSync(
    join(folderPath, `task-${folderName}.md`),
    [
      `# ${taskNumber} — ${taskName}`,
      '',
      'State: IN-PROGRESS',
      'Engine: codex',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(folderPath, `brief-${taskNumber}-1-${taskName}.md`),
    'fixture brief\n',
  );
  if (ready) {
    writeFileSync(
      join(folderPath, `report-${taskNumber}-${taskName}.md`),
      'READY\n',
    );
  }
  writeFileSync(
    join(folderPath, 'meta.json'),
    JSON.stringify({
      startedAt: new Date(Date.now() - 600_000).toISOString(),
      round: 1,
      roundBriefedAtMs: Date.now() - 600_000,
    }),
  );
}

const readyTaskCount = scale === 'large' ? 50 : 1;
for (
  let readyTaskOffset = 0;
  readyTaskOffset < readyTaskCount;
  readyTaskOffset += 1
) {
  writeTask(900 + readyTaskOffset, `ready-${readyTaskOffset}`, true);
}
writeTask(100, 'building', false);
writeFileSync(join(fixtureRoot, 'readme.txt'), 'dashboard idle fixture\n');

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    COLORTERM: 'truecolor',
  },
});

function processCpuTicks(processIdentifier: number): number {
  const processStat = readFileSync(`/proc/${processIdentifier}/stat`, 'utf8');
  const commandEnd = processStat.lastIndexOf(')');
  const fieldsAfterCommand = processStat
    .slice(commandEnd + 2)
    .trim()
    .split(/\s+/);
  const userTicks = Number(fieldsAfterCommand[11]);
  const systemTicks = Number(fieldsAfterCommand[12]);
  if (!Number.isFinite(userTicks) || !Number.isFinite(systemTicks)) {
    throw new Error(
      `Could not read CPU ticks for process ${processIdentifier}.`,
    );
  }
  return userTicks + systemTicks;
}

async function measureArm(label: string): Promise<void> {
  await Bun.sleep(500);
  const frameCountBefore = driver.completedFrameObservationCount;
  const cpuTicksBefore = processCpuTicks(driver.processId);
  const startMilliseconds = performance.now();
  await Bun.sleep(5_000);
  const elapsedSeconds = (performance.now() - startMilliseconds) / 1000;
  const cpuTickDelta = processCpuTicks(driver.processId) - cpuTicksBefore;
  const cpuPercent =
    (cpuTickDelta * 100) / (elapsedSeconds * clockTicksPerSecond);
  const frameDelta = driver.completedFrameObservationCount - frameCountBefore;
  const status = HarnessSmoke.Class.readStatus(statusPath);
  console.log(
    JSON.stringify({
      scale,
      label,
      cpuPercent: Number(cpuPercent.toFixed(2)),
      completeFrames: frameDelta,
      tasksLens: status.tasksLens,
      tasksRows: status.tasksRows,
      tasksAnimationAtRest: status.tasksAnimationAtRest,
      rightDockVisible: status.rightDockVisible,
    }),
  );
}

try {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the fixture app settles with the dashboard hidden',
    (status) =>
      status.ready === true &&
      status.rightDockVisible === false &&
      status.tasksAnimationAtRest === true,
  );
  await measureArm('pane hidden, live rows exist');

  driver.sendKeys('Control+Shift+t');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the dashboard opens on the live lens',
    (status) =>
      status.rightDockVisible === true &&
      status.rightDockActiveContent === 'tasks' &&
      status.tasksLens === 'live',
  );
  await measureArm(
    scale === 'small'
      ? 'pane visible, building row visible'
      : 'pane visible, building row below viewport',
  );

  driver.sendKeys('Right');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the dashboard selects an empty active lens',
    (status) =>
      status.tasksLens === 'active' && status.tasksAnimationAtRest === true,
  );
  await measureArm('pane visible, no live rows');

  driver.sendKeys('Left');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the dashboard returns to the live lens',
    (status) => status.tasksLens === 'live',
  );
  driver.sendKeys('Control+Alt+b');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the right dock closes while live rows remain',
    (status) =>
      status.rightDockVisible === false && status.tasksAnimationAtRest === true,
  );
  await measureArm('pane closed, live rows remain');
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
