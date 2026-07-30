#!/usr/bin/env bun
// This probe measures idle CPU and complete frames with one, two, and four open workspaces.
// Run: bun .invar/tasks/in-progress/393-idle-cpu-multiple-workspaces/393-multi-workspace-idle-measurement.ts empty
// Use `terminals`, `agents`, or `language-services` to retain that subsystem in each workspace.
// Each JSON result covers five seconds through the real PTY. App CPU measures Invar alone.
// Process-tree CPU includes its children. A quiet arm has at most one complete frame.

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const fixtureMode = process.argv[2] ?? 'empty';
if (
  fixtureMode !== 'empty' &&
  fixtureMode !== 'terminals' &&
  fixtureMode !== 'agents' &&
  fixtureMode !== 'language-services'
) {
  throw new Error(
    'Fixture mode must be `empty`, `terminals`, `agents`, or `language-services`.',
  );
}

const clockTicksPerSecond = Number(
  new TextDecoder().decode(Bun.spawnSync(['getconf', 'CLK_TCK']).stdout).trim(),
);
if (!Number.isFinite(clockTicksPerSecond) || clockTicksPerSecond <= 0) {
  throw new Error('Could not read the Linux clock tick rate with getconf.');
}

const fixtureParent = mkdtempSync(
  join(tmpdir(), 'invar-393-multi-workspace-idle-'),
);
const homeDirectory = mkdtempSync(
  join(tmpdir(), 'invar-393-multi-workspace-idle-home-'),
);
const statusPath = join(homeDirectory, 'status.json');
const workspaceRoots = Array.from({ length: 4 }, (_unused, workspaceIndex) =>
  join(fixtureParent, `fixture-workspace-${workspaceIndex + 1}`),
);

for (const [workspaceIndex, workspaceRoot] of workspaceRoots.entries()) {
  mkdirSync(workspaceRoot);
  writeFileSync(
    join(workspaceRoot, 'readme.txt'),
    `idle fixture workspace ${workspaceIndex + 1}\n`,
  );
  writeFileSync(
    join(workspaceRoot, 'fixture.ts'),
    'const fixtureValue: string = 1;\nfixtureValue;\n',
  );
  writeFileSync(
    join(workspaceRoot, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
      },
      include: ['*.ts'],
    }),
  );
  const gitInitialization = Bun.spawnSync(['git', 'init', '-q'], {
    cwd: workspaceRoot,
  });
  if (gitInitialization.exitCode !== 0) {
    throw new Error(
      `Could not initialize fixture workspace ${workspaceIndex + 1}.`,
    );
  }
}

const driver = new PtyTestDriver.Class({
  workspaceRoot: workspaceRoots[0],
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
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

function descendantProcessIdentifiers(processIdentifier: number): number[] {
  const processIdentifiers = [processIdentifier];
  for (
    let processIndex = 0;
    processIndex < processIdentifiers.length;
    processIndex += 1
  ) {
    const candidateIdentifier = processIdentifiers[processIndex];
    if (candidateIdentifier === undefined) continue;
    try {
      const children = readFileSync(
        `/proc/${candidateIdentifier}/task/${candidateIdentifier}/children`,
        'utf8',
      )
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(Number)
        .filter((childIdentifier) => Number.isInteger(childIdentifier));
      processIdentifiers.push(...children);
    } catch {
      // A child that exits during the walk contributes no further idle cost.
    }
  }
  return processIdentifiers;
}

function processTreeCpuTicks(processIdentifier: number): number {
  let totalTicks = 0;
  for (const descendantIdentifier of descendantProcessIdentifiers(
    processIdentifier,
  )) {
    try {
      totalTicks += processCpuTicks(descendantIdentifier);
    } catch {
      // A child that exits between enumeration and reading is outside the sample.
    }
  }
  return totalTicks;
}

async function measureArm(workspaceCount: number, pair: string): Promise<void> {
  const settledStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `${workspaceCount} workspaces are settled before idle sample ${pair}`,
    (status) =>
      status.ready === true && status.workspaceCount === workspaceCount,
  );
  await Bun.sleep(500);
  const frameCountBefore = driver.completedFrameObservationCount;
  const appCpuTicksBefore = processCpuTicks(driver.processId);
  const processTreeCpuTicksBefore = processTreeCpuTicks(driver.processId);
  const sampleStartMilliseconds = performance.now();
  await Bun.sleep(5_000);
  const elapsedSeconds = (performance.now() - sampleStartMilliseconds) / 1_000;
  const appCpuTickDelta = processCpuTicks(driver.processId) - appCpuTicksBefore;
  const processTreeCpuTickDelta =
    processTreeCpuTicks(driver.processId) - processTreeCpuTicksBefore;
  const completeFrames =
    driver.completedFrameObservationCount - frameCountBefore;
  console.log(
    JSON.stringify({
      workspaceCount,
      fixtureMode,
      pair,
      appCpuPercent: Number(
        (
          (appCpuTickDelta * 100) /
          (elapsedSeconds * clockTicksPerSecond)
        ).toFixed(2),
      ),
      processTreeCpuPercent: Number(
        (
          (processTreeCpuTickDelta * 100) /
          (elapsedSeconds * clockTicksPerSecond)
        ).toFixed(2),
      ),
      completeFrames,
      descendantProcessCount:
        descendantProcessIdentifiers(driver.processId).length - 1,
      liveGitWatcherCount: settledStatus.liveGitWatcherCount,
      workspaceLiveGitWatchers: settledStatus.workspaceLiveGitWatchers,
      panelVisible: settledStatus.panelVisible,
      rightDockVisible: settledStatus.rightDockVisible,
      tasksAnimationAtRest: settledStatus.tasksAnimationAtRest,
      animationFrameCadenceTimerCount:
        settledStatus.animationFrameCadenceTimerCount,
      renderQuiescent: settledStatus.renderQuiescent,
    }),
  );
}

async function retainIdleTerminal(): Promise<void> {
  driver.sendKeys('Control+j');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the workspace terminal opens',
    (status) =>
      status.panelVisible === true &&
      String(status.panelActiveContent).startsWith('terminal') &&
      Array.isArray(status.panelContentKinds) &&
      status.panelContentKinds.includes('terminal'),
  );
  driver.sendKeys('Control+j');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the workspace terminal remains alive behind a hidden panel',
    (status) =>
      status.panelVisible === false &&
      Array.isArray(status.panelContentKinds) &&
      status.panelContentKinds.includes('terminal'),
  );
}

async function openLanguageService(): Promise<void> {
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File opens for the language fixture',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText('fixture.ts');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File finds the language fixture',
    (status) =>
      status.quickOpenQuery === 'fixture.ts' &&
      Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the workspace language service reports the fixture diagnostic',
    (status) =>
      String(status.activeBuffer).endsWith('/fixture.ts') &&
      typeof status.lspProvider === 'string' &&
      Number(status.diagnosticsCount) > 0,
  );
}

async function retainIdleAgent(): Promise<void> {
  driver.sendKeys('Control+Shift+a');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the workspace agent pane opens',
    (status) =>
      status.panelVisible === true &&
      String(status.panelActiveContent).startsWith('agent') &&
      Array.isArray(status.panelContentKinds) &&
      status.panelContentKinds.includes('agent') &&
      status.agentBusy === false,
  );
  driver.sendKeys('Control+Shift+a');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the idle workspace agent remains behind a hidden panel',
    (status) =>
      status.panelVisible === false &&
      Array.isArray(status.panelContentKinds) &&
      status.panelContentKinds.includes('agent') &&
      status.agentBusy === false,
  );
}

async function prepareWorkspaceFixture(): Promise<void> {
  if (fixtureMode === 'terminals') await retainIdleTerminal();
  if (fixtureMode === 'agents') await retainIdleAgent();
  if (fixtureMode === 'language-services') await openLanguageService();
}

async function addWorkspace(workspaceIndex: number): Promise<void> {
  const workspaceRoot = workspaceRoots[workspaceIndex];
  if (!workspaceRoot) {
    throw new Error(`No fixture workspace exists at index ${workspaceIndex}.`);
  }
  const snapshot = driver.snapshot();
  const plusColumn = Array.from(snapshot.rowText(0)).lastIndexOf('+');
  if (plusColumn < 0) {
    throw new Error('The workspace plus button is not visible.');
  }
  driver.sendMouse({
    kind: 'press',
    column: plusColumn,
    row: 0,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: plusColumn,
    row: 0,
    button: 'left',
  });
  await driver.awaitGridCondition(
    'the project picker opens at the fixture parent',
    (candidate) =>
      candidate.findText(`+ ${dirname(workspaceRoots[0] ?? '')}`) !== null,
  );
  driver.sendText(basename(workspaceRoot));
  await driver.awaitGridCondition(
    `the project picker paints ${workspaceRoot}`,
    (candidate) => candidate.findText(`+ ${workspaceRoot}`) !== null,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `${workspaceIndex + 1} workspaces are open`,
    (status) =>
      status.workspaceCount === workspaceIndex + 1 &&
      status.activeWorkspaceRoot === workspaceRoot &&
      status.gitWatcherActivationCompleted === true,
  );
}

try {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the one-workspace fixture app settles',
    (status) =>
      status.ready === true &&
      status.workspaceCount === 1 &&
      status.gitWatcherActivationCompleted === true,
  );
  await prepareWorkspaceFixture();
  await measureArm(1, 'candidate');
  await measureArm(1, 'quiet-reference');

  await addWorkspace(1);
  await prepareWorkspaceFixture();
  await measureArm(2, 'candidate');
  await measureArm(2, 'quiet-reference');

  await addWorkspace(2);
  await prepareWorkspaceFixture();
  await addWorkspace(3);
  await prepareWorkspaceFixture();
  await measureArm(4, 'candidate');
  await measureArm(4, 'quiet-reference');
} finally {
  await driver.dispose();
  rmSync(fixtureParent, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
