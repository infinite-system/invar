#!/usr/bin/env bun
// The tasks dashboard pane through the real PTY: the three lenses over a real .invar/tasks tree,
// the cycling overview, selection opening the task record in the editor, the absent-tree degrade,
// and the Extensions uninstall/reinstall symmetry.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: The tasks dashboard is a pane content citizen (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: An absent task tree is stated, never blank (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FrameDump } from '../../src/modules/system/FrameProbe';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

async function awaitFrameDump(
  framePath: string,
  predicate: (frameDump: FrameDump) => boolean,
  description: string,
): Promise<FrameDump> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const frameFile = Bun.file(framePath);
    if (await frameFile.exists()) {
      const frameDump = (await frameFile.json()) as FrameDump;
      if (predicate(frameDump)) return frameDump;
    }
    await Bun.sleep(10);
  }
  throw new Error(`Timed out waiting for FrameProbe: ${description}`);
}

function codePointSequenceStart(
  codePoints: readonly string[],
  markerCodePoints: readonly string[],
): number {
  for (
    let startIndex = 0;
    startIndex <= codePoints.length - markerCodePoints.length;
    startIndex += 1
  ) {
    if (
      markerCodePoints.every(
        (codePoint, markerIndex) =>
          codePoints[startIndex + markerIndex] === codePoint,
      )
    ) {
      return startIndex;
    }
  }
  return -1;
}

function tabBackgroundLane(
  frameDump: FrameDump,
  tabLabel: string,
): { lane: string; before: string; after: string } | null {
  const marker = ` ${tabLabel} `;
  for (const row of frameDump.rows) {
    const markerStart = codePointSequenceStart(
      Array.from(row.text),
      Array.from(marker),
    );
    if (markerStart < 0) continue;
    const markerWidth = Array.from(marker).length;
    const lanes = row.bg.slice(markerStart, markerStart + markerWidth);
    const lane = lanes[0];
    if (!lane || lanes.some((candidate) => candidate !== lane)) return null;
    return {
      lane,
      before: row.bg[markerStart - 1] ?? 'edge',
      after: row.bg[markerStart + markerWidth] ?? 'edge',
    };
  }
  return null;
}

async function selectSettingByVisibleLabel(
  driver: PtyTestDriver.Model,
  statusPath: string,
  settingLabel: string,
): Promise<void> {
  let selectionStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the selected settings label is published before navigation',
    (status) => typeof status.settingsSelectedLabel === 'string',
  );
  for (let navigationStep = 0; navigationStep < 40; navigationStep += 1) {
    if (selectionStatus.settingsSelectedLabel === settingLabel) break;
    const previousSelectedLabel = selectionStatus.settingsSelectedLabel;
    driver.sendKeys('Down');
    selectionStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `settings navigation advances toward ${settingLabel}`,
      (status) => status.settingsSelectedLabel !== previousSelectedLabel,
    );
  }
  HarnessSmoke.Class.requireCondition(
    selectionStatus.settingsSelectedLabel === settingLabel,
    `${settingLabel} is discovered by its live settings label`,
  );
}

function writeTask(
  tasksRoot: string,
  state: string,
  folder: string,
  headerLines: string[],
  extraFiles: Record<string, string> = {},
): void {
  const folderPath = join(tasksRoot, state, folder);
  mkdirSync(folderPath, { recursive: true });
  writeFileSync(
    join(folderPath, `task-${folder}.md`),
    [`# ${folder.split('-')[0]} — planted record`, '']
      .concat(headerLines)
      .concat([
        '',
        '## Outline',
        '',
        `PLANTED-RECORD-${folder.split('-')[0]}`,
        '',
      ])
      .join('\n') + 'planted body line\n'.repeat(30),
  );
  for (const [fileName, text] of Object.entries(extraFiles)) {
    writeFileSync(join(folderPath, fileName), text);
  }
}

// The tasks fixture: one building, one READY, one prioritised active, one landed.
const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-tasks-dashboard-'));
const tasksRoot = join(fixtureRoot, '.invar', 'tasks');
const pastFilingMs = Date.now() - 600_000;
writeTask(
  tasksRoot,
  'in-progress',
  '901-planted-building',
  ['State: IN-PROGRESS', 'Engine: claude', 'Model: fable-5', 'Effort: high'],
  {
    'brief-901-1-planted-building.md': 'brief',
    'meta.json': JSON.stringify({
      startedAt: new Date(pastFilingMs).toISOString(),
      round: 1,
      roundBriefedAtMs: pastFilingMs,
    }),
  },
);
writeTask(
  tasksRoot,
  'in-progress',
  '902-planted-ready',
  ['State: IN-PROGRESS', 'Engine: codex'],
  {
    'brief-902-1-planted-ready.md': 'brief',
    'report-902-planted-ready.md': 'READY',
    'meta.json': JSON.stringify({
      startedAt: new Date(pastFilingMs).toISOString(),
      round: 2,
      roundBriefedAtMs: pastFilingMs,
    }),
  },
);
writeTask(tasksRoot, 'active', '903-planted-waiting', [
  'State: ACTIVE',
  'Priority: user-directed',
]);
writeTask(
  tasksRoot,
  'completed',
  '905-planted-landed',
  ['State: COMPLETED — merged 1a2b3c4d'],
  { 'meta.json': JSON.stringify({ durationMinutes: 75 }) },
);
writeFileSync(join(fixtureRoot, 'readme.txt'), 'fixture workspace\n');

const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-tasks-dashboard-home-'));
const statusPath = join(homeDirectory, 'status.json');
const framePath = join(homeDirectory, 'frame.json');
const settingsDirectory = join(homeDirectory, '.config', 'invar');
mkdirSync(settingsDirectory, { recursive: true });
// A short cycle interval lets the play arm observe a lens advance in seconds, not tens of them.
// The right dock stays at its default width so truncation is measured on the common path.
writeFileSync(
  join(settingsDirectory, 'settings.json'),
  JSON.stringify({ tasksDashboardCycleSeconds: 2 }),
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 150,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    TUI_FRAME_PATH: framePath,
    TUI_FRAME_DUMP: '1',
    COLORTERM: 'truecolor',
  },
  command: [process.execPath, 'src/main.ts', fixtureRoot],
});

// Walk the Extensions selection to a named row by LOOKING for it (the list grows as plugins are
// contributed; an ordinal Down would silently land on a neighbour).
async function selectExtensionsRow(rowLabel: string): Promise<void> {
  driver.sendKeys('Control+Shift+x');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `Extensions opens before selecting ${rowLabel}`,
    (status) => status.sidebarView === 'extensions',
  );
  driver.sendKeysWithoutFrameExpectation(
    ...Array.from({ length: 14 }, () => 'Up'),
  );
  await driver.awaitGridCondition(
    'the Extensions selection is anchored on its first row',
    (snapshot) => snapshot.findText('› [x] File Tree') !== null,
  );
  for (
    let selectionStep = 0;
    selectionStep < 14 && driver.snapshot().findText(`› ${rowLabel}`) === null;
    selectionStep++
  ) {
    driver.sendKeys('Down');
    await driver.awaitScreenChange();
  }
  if (driver.snapshot().findText(`› ${rowLabel}`) === null) {
    throw new Error(`Extensions row is not reachable: ${rowLabel}`);
  }
}

try {
  console.log('== tasks dashboard: the three lenses over a real task tree ==');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'boot publishes the hidden zero-work tasks projection',
    (status) =>
      status.tasksLens === 'live' &&
      status.tasksAvailable === false &&
      Number(status.tasksAnimationPaint) === 0,
  );
  HarnessSmoke.Class.requireCondition(
    HarnessSmoke.Class.readStatus(statusPath).rightDockVisible === false,
    'the default-off setting leaves the tasks dock hidden at boot',
  );
  driver.sendKeys('Control+Shift+t');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the show chord reveals and focuses the tasks pane in the right dock',
    (status) =>
      status.rightDockVisible === true &&
      status.rightDockActiveContent === 'tasks' &&
      status.rightDockFocused === true &&
      status.tasksAvailable === true &&
      Number(status.tasksRows) === 5,
  );
  await driver.awaitGridCondition(
    'the live lens paints each title above its own status row',
    (snapshot) => {
      const readyTitle = snapshot.findText('#902 planted-ready');
      const buildingTitle = snapshot.findText('#901 planted-building');
      const readyStatus = snapshot.findText('READY round');
      const buildingStatus = snapshot.findText('building  10');
      if (!readyTitle || !buildingTitle || !readyStatus || !buildingStatus)
        return false;
      return (
        readyStatus.row === readyTitle.row + 1 &&
        buildingStatus.row === buildingTitle.row + 1
      );
    },
  );
  HarnessSmoke.Class.pass(
    'the live lens lists the in-progress fixture with the standing vocabulary',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the observed building row advances its watch-parity motion clock',
    (status) => Number(status.tasksAnimationPaint) >= 3,
  );
  HarnessSmoke.Class.pass(
    'watch-parity motion runs while the pane is observed',
  );

  console.log(
    '== tasks dashboard: row actions state misses and open artifacts ==',
  );
  const buildingTaskPosition = driver
    .snapshot()
    .findText('#901 planted-building');
  const readyTaskPosition = driver.snapshot().findText('#902 planted-ready');
  if (!buildingTaskPosition || !readyTaskPosition)
    throw new Error('The live task rows disappeared before action clicks');
  const reportActionColumn = driver.snapshot().columns - 3;
  driver.sendMouseClick({
    column: reportActionColumn,
    row: buildingTaskPosition.row + 1,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'a missing latest report states itself in the task row',
    (status) =>
      status.tasksActionNotice === 'No latest report exists for #901.',
  );
  driver.sendMouseWithoutFrameExpectation({
    kind: 'move',
    column: reportActionColumn,
    row: readyTaskPosition.row + 1,
    button: 'none',
  });
  await driver.awaitGridCondition(
    'the report action tooltip names its destination',
    (snapshot) => snapshot.findText('Open the latest report') !== null,
  );
  driver.sendMouseClick({
    column: reportActionColumn,
    row: readyTaskPosition.row + 1,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the report action opens the latest report in the editor',
    (status) =>
      String(status.activeBuffer).endsWith('report-902-planted-ready.md'),
  );
  driver.sendKeys('Control+Shift+t');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the task pane returns before the tmux action',
    (status) =>
      status.rightDockActiveContent === 'tasks' &&
      status.rightDockFocused === true,
  );
  const sessionPosition = driver.snapshot().findText('READY round');
  if (!sessionPosition)
    throw new Error(
      'The READY task status target disappeared before its click',
    );
  driver.sendMouse({
    kind: 'move',
    column: sessionPosition.column + 2,
    row: sessionPosition.row,
    button: 'none',
  });
  await driver.awaitScreenChange();
  driver.sendMouseClick({
    column: sessionPosition.column + 2,
    row: sessionPosition.row,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the tmux prefix resolves to the session row action',
    (status) => status.tasksLastAction === 'session:902',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the tmux action opens a terminal-runtime pane',
    (status) =>
      (status.panelContentIds as string[]).includes('tasks-session-902'),
    15_000,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the gone tmux session states itself in the terminal pane',
    (status) =>
      String(status.panelActiveContent) === 'tasks-session-902' &&
      status.terminalExited === true,
    15_000,
  );
  HarnessSmoke.Class.pass('row actions use the workspace and terminal seams');

  driver.sendKeys('Control+Shift+t');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the tasks pane regains focus after the terminal action',
    (status) =>
      status.rightDockActiveContent === 'tasks' &&
      status.rightDockFocused === true,
  );
  driver.sendKeys('Right');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the active lens groups the waiting fixture by priority',
    (status) => status.tasksLens === 'active' && Number(status.tasksRows) === 3,
  );
  await driver.awaitGridCondition(
    'the active lens paints a capitalized group and one truncated task row',
    (snapshot) =>
      snapshot.findText('User-directed (1)') !== null &&
      snapshot.findText('#903 plant…') !== null &&
      snapshot.findText('user-directed (1)') === null,
  );
  const darkActiveFrame = await awaitFrameDump(
    framePath,
    (candidate) => tabBackgroundLane(candidate, 'ACTIVE') !== null,
    'the selected Active tab under the dark theme',
  );
  const darkActiveBackground = tabBackgroundLane(darkActiveFrame, 'ACTIVE');
  HarnessSmoke.Class.requireCondition(
    darkActiveBackground !== null &&
      darkActiveBackground.lane !== darkActiveBackground.before &&
      darkActiveBackground.lane !== darkActiveBackground.after,
    'the Active label and exactly one padding cell on both sides share the selected background',
  );
  driver.sendKeys('Control+,');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Settings opens above the selected Active lens',
    (status) => status.settingsOpen === true,
  );
  await selectSettingByVisibleLabel(driver, statusPath, 'Theme');
  driver.sendKeys('Right');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the live theme changes from dark to light',
    (status) => status.settingsSelectedValue === 'light',
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Settings closes onto the same selected Active lens',
    (status) => status.settingsOpen === false && status.tasksLens === 'active',
  );
  const lightActiveFrame = await awaitFrameDump(
    framePath,
    (candidate) => {
      const activeBackground = tabBackgroundLane(candidate, 'ACTIVE');
      return (
        activeBackground !== null &&
        activeBackground.lane !== darkActiveBackground?.lane
      );
    },
    'the persistent selected Active tab under the light theme',
  );
  const lightActiveBackground = tabBackgroundLane(lightActiveFrame, 'ACTIVE');
  HarnessSmoke.Class.requireCondition(
    lightActiveBackground !== null &&
      lightActiveBackground.lane !== lightActiveBackground.before &&
      lightActiveBackground.lane !== lightActiveBackground.after,
    'the live light theme preserves the exact padded Active projection with a new theme tone',
  );
  HarnessSmoke.Class.pass(
    'the active lens stays one row and its padded selected tab follows the live theme',
  );

  driver.sendKeys('Right');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the done lens lists the landed fixture',
    (status) => status.tasksLens === 'done' && Number(status.tasksRows) === 2,
  );
  await driver.awaitGridCondition(
    'the done lens paints one truncated task row',
    (snapshot) => snapshot.findText('#905 plant…') !== null,
  );
  HarnessSmoke.Class.pass('the done lens stays one row at the default width');

  console.log(
    '== tasks dashboard: the cycling control explains start and stop ==',
  );
  const cycleStartPosition = driver.snapshot().findText('▷');
  if (!cycleStartPosition)
    throw new Error('The cycle start control disappeared before hover');
  driver.sendMouse({
    kind: 'move',
    column: cycleStartPosition.column,
    row: cycleStartPosition.row,
    button: 'none',
  });
  await driver.awaitGridCondition(
    'the stopped cycle control explains its next action',
    (snapshot) => snapshot.findText('Start automatic lens cycling') !== null,
  );
  driver.sendMouseClick({
    column: cycleStartPosition.column,
    row: cycleStartPosition.row,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'play starts the cycling overview',
    (status) => status.tasksCycling === true,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the cycling overview advances the lens on its interval',
    (status) => status.tasksLens === 'live',
    15_000,
  );
  const cycleStopPosition = driver.snapshot().findText('■');
  if (!cycleStopPosition)
    throw new Error('The cycle stop control disappeared after start');
  driver.sendMouse({
    kind: 'move',
    column: cycleStopPosition.column,
    row: cycleStopPosition.row,
    button: 'none',
  });
  await driver.awaitGridCondition(
    'the running cycle control explains its next action',
    (snapshot) => snapshot.findText('Stop automatic lens cycling') !== null,
  );
  driver.sendMouseClick({
    column: cycleStopPosition.column,
    row: cycleStopPosition.row,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'stop holds the current lens selected',
    (status) => status.tasksCycling === false && status.tasksLens === 'live',
  );
  HarnessSmoke.Class.pass(
    'the cycle control exposes both tooltips and stops on the current lens',
  );

  console.log('== tasks dashboard: selection opens the task record ==');
  // The overview may have advanced again between the observed tick and the pause, so walk the
  // lens back to LIVE by observed transitions rather than assuming where the cycle stopped.
  const lensOrder = ['live', 'active', 'done'];
  let currentLens = String(HarnessSmoke.Class.readStatus(statusPath).tasksLens);
  while (currentLens !== 'live') {
    const nextLens =
      lensOrder[(lensOrder.indexOf(currentLens) + 1) % lensOrder.length] ??
      'live';
    driver.sendKeys('Right');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `the lens walks from ${currentLens} to ${nextLens}`,
      (status) => status.tasksLens === nextLens,
    );
    currentLens = nextLens;
  }
  driver.sendKeys('Down');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the selection moves to the building fixture row',
    (status) =>
      String(status.tasksSelectedFile).endsWith('task-901-planted-building.md'),
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Enter opens the selected task record in the editor',
    (status) =>
      String(status.activeBuffer).endsWith('task-901-planted-building.md') &&
      status.focus === 'editor' &&
      status.rightDockFocused === false,
  );
  await driver.awaitGridCondition(
    'the editor paints the opened task record',
    (snapshot) => snapshot.findEditorText('PLANTED-RECORD-901') !== null,
  );
  HarnessSmoke.Class.pass('selection opens the record through the editor');

  console.log(
    '== tasks dashboard: Extensions uninstall and reinstall are symmetric ==',
  );
  await selectExtensionsRow('[x] Tasks Dashboard');
  driver.sendKeys('Space');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'uninstall removes the tasks pane and withdraws its projection',
    (status) =>
      !(status.rightDockContentIds as string[]).includes('tasks') &&
      status.tasksLens === undefined &&
      !(status.settingsSections as string[] | undefined)?.includes(
        'Tasks Dashboard',
      ),
  );
  driver.sendKeysWithoutFrameExpectation('Control+Shift+t');
  driver.sendKeys('Control+,');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the removed tasks chord cannot switch away before Settings opens',
    (status) =>
      status.settingsOpen === true && status.sidebarView === 'extensions',
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Settings closes back onto Extensions before the reinstall',
    (status) => status.settingsOpen === false && status.focus === 'extensions',
  );
  driver.sendKeys('Space');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'reinstall restores the tasks pane registration and projection',
    (status) =>
      (status.rightDockContentIds as string[]).includes('tasks') &&
      status.tasksLens === 'live',
  );
  driver.sendKeys('Control+Shift+t');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the reinstalled pane shows the live lens over the same tree',
    (status) =>
      status.rightDockActiveContent === 'tasks' &&
      status.rightDockFocused === true &&
      Number(status.tasksRows) === 5,
  );
  HarnessSmoke.Class.pass(
    'the tasks dashboard uninstalls and reinstalls symmetrically',
  );
} finally {
  await driver.dispose();
}

console.log('== tasks dashboard: an absent task tree states itself ==');
const bareRoot = mkdtempSync(join(tmpdir(), 'tui-tasks-dashboard-bare-'));
writeFileSync(join(bareRoot, 'readme.txt'), 'no task tree here\n');
const bareHome = mkdtempSync(join(tmpdir(), 'tui-tasks-dashboard-bare-home-'));
const bareStatusPath = join(bareHome, 'status.json');
const bareDriver = new PtyTestDriver.Class({
  workspaceRoot: bareRoot,
  columns: 150,
  rows: 40,
  homeDirectory: bareHome,
  environment: { TUI_STATUS_PATH: bareStatusPath, COLORTERM: 'truecolor' },
  command: [process.execPath, 'src/main.ts', bareRoot],
});
try {
  await HarnessSmoke.Class.awaitStatus(
    bareDriver,
    bareStatusPath,
    'boot publishes the unavailable tasks projection',
    (status) => status.tasksAvailable === false,
  );
  bareDriver.sendKeys('Control+Shift+t');
  await HarnessSmoke.Class.awaitStatus(
    bareDriver,
    bareStatusPath,
    'the pane shows with zero rows over the absent tree',
    (status) =>
      status.rightDockActiveContent === 'tasks' &&
      Number(status.tasksRows) === 0,
  );
  await bareDriver.awaitGridCondition(
    'the absent tree is stated, never a blank pane',
    (snapshot) => snapshot.findText('No task system in this wo') !== null,
  );
  HarnessSmoke.Class.pass('the absent-tree degrade states its affordance');
} finally {
  await bareDriver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  await HarnessSmoke.Class.removeTemporaryDirectory(bareRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(bareHome);
}

console.log(
  '== tasks dashboard: large task trees keep the same visible window ==',
);
const largeRoot = mkdtempSync(join(tmpdir(), 'tui-tasks-dashboard-large-'));
const largeTasksRoot = join(largeRoot, '.invar', 'tasks');
for (let taskOffset = 0; taskOffset < 500; taskOffset += 1) {
  const taskNumber = 1_000 + taskOffset;
  writeTask(largeTasksRoot, 'in-progress', `${taskNumber}-scale-row`, [
    'State: IN-PROGRESS',
  ]);
}
const largeHome = mkdtempSync(
  join(tmpdir(), 'tui-tasks-dashboard-large-home-'),
);
const largeStatusPath = join(largeHome, 'status.json');
const largeDriver = new PtyTestDriver.Class({
  workspaceRoot: largeRoot,
  columns: 120,
  rows: 36,
  homeDirectory: largeHome,
  environment: { TUI_STATUS_PATH: largeStatusPath, COLORTERM: 'truecolor' },
  command: [process.execPath, 'src/main.ts', largeRoot],
});
try {
  largeDriver.sendKeys('Control+Shift+t');
  await HarnessSmoke.Class.awaitStatus(
    largeDriver,
    largeStatusPath,
    'the large fixture shows the same compact live projection',
    (status) =>
      status.rightDockActiveContent === 'tasks' &&
      status.tasksAvailable === true &&
      Number(status.tasksRows) === 1_001 &&
      Number(status.tasksAnimationPaint) >= 3,
  );
  await largeDriver.awaitGridCondition(
    'the large fixture paints only its visible leading window',
    (snapshot) =>
      snapshot.findText('#1499 scale-row') !== null &&
      snapshot.findText('#1000 scale-row') === null,
  );
  HarnessSmoke.Class.pass(
    'five hundred tasks keep the compact observed projection responsive',
  );
} finally {
  await largeDriver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(largeRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(largeHome);
}
