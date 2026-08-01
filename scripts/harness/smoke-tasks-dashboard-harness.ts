#!/usr/bin/env bun
// The tasks dashboard pane through the real PTY: the three lenses over a real .invar/tasks tree,
// the cycling overview, selection opening the task record in the editor, the absent-tree degrade,
// isolated missing/running/finished gate registry facts, and the Extensions uninstall/reinstall
// symmetry.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: The tasks dashboard is a pane content citizen (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: An absent task tree is stated, never blank (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
// invariant: Harness fleet facts are isolated from host state (src/modules/tasks-dashboard/tasks-dashboard.invariants.md)
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FrameDump } from '../../src/modules/system/FrameProbe';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
import { HarnessSmoke } from './HarnessSmoke';
import type { HarnessSnapshot } from './HarnessSnapshot';
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

function taskActionGlyphCellsAreReadable(
  snapshot: HarnessSnapshot.Model,
  taskTitle: string,
  includesSessionAction = true,
): boolean {
  const taskTitlePosition = snapshot.findText(taskTitle);
  if (!taskTitlePosition) return false;
  const actionIcons = ThemeIcons.Class.taskActionIconsFor('unicode');
  const detailRow = taskTitlePosition.row + 1;
  const detailText = snapshot.rowText(detailRow);
  const expectedDetailGlyphs = [
    ...(includesSessionAction ? [actionIcons.session] : []),
    actionIcons.workspace,
    actionIcons.taskRecord,
    actionIcons.latestBrief,
    actionIcons.latestReport,
  ];
  const detailGlyphsAreReadable = expectedDetailGlyphs.every((glyph) => {
    const glyphColumn = detailText.indexOf(glyph);
    if (glyphColumn < 0) return false;
    const glyphCell = snapshot.cell(detailRow, glyphColumn);
    return (
      glyphCell !== null &&
      glyphCell.characters === glyph &&
      glyphCell.foreground !== glyphCell.background
    );
  });
  const cyclePosition = snapshot.findText(actionIcons.cycleStart);
  const cycleCell =
    cyclePosition === null
      ? null
      : snapshot.cell(cyclePosition.row, cyclePosition.column);
  return (
    detailGlyphsAreReadable &&
    cycleCell !== null &&
    cycleCell.characters === actionIcons.cycleStart &&
    cycleCell.foreground !== cycleCell.background
  );
}

function visibleTickWorkIsBounded(
  counts: {
    taskTreeReads: number;
    fleetFactProbes: number;
    sessionProbes: number;
    rowRebuilds: number;
  },
  paintedRows: number,
  heartbeatTicks: number,
): boolean {
  return (
    counts.taskTreeReads === 0 &&
    counts.fleetFactProbes <= paintedRows * heartbeatTicks &&
    counts.sessionProbes <= heartbeatTicks &&
    counts.rowRebuilds <= paintedRows * heartbeatTicks
  );
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

async function reobserveTasksThroughUserShortcuts(
  driver: PtyTestDriver.Model,
  statusPath: string,
  refreshDescription: string,
): Promise<void> {
  driver.sendKeys('Control+Shift+u');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `Structure replaces Tasks before ${refreshDescription}`,
    (status) => status.rightDockActiveContent === 'structure',
  );
  driver.sendKeys('Control+Shift+t');
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
const isolatedGateRegistryPath = join(fixtureRoot, 'fleet-watch-gates');
const isolatedGateLogPath = join(fixtureRoot, 'fleet-gate.log');
const pastFilingMs = Date.now() - 600_000;
const fakeTmuxDirectory = join(fixtureRoot, 'fake-bin');
const fakeTmuxSessionListPath = join(fixtureRoot, 'fake-tmux-sessions.txt');
mkdirSync(fakeTmuxDirectory, { recursive: true });
writeFileSync(
  fakeTmuxSessionListPath,
  'planted-new-session\ninvar/901-planted-building\n',
);
writeFileSync(
  join(fakeTmuxDirectory, 'tmux'),
  [
    '#!/usr/bin/env bun',
    'const argumentsAfterScript = Bun.argv.slice(2);',
    "if (argumentsAfterScript[0] === 'list-sessions') {",
    '  process.stdout.write(await Bun.file(process.env.FAKE_TMUX_SESSION_LIST!).text());',
    '  process.exit(0);',
    '}',
    "if (argumentsAfterScript[0] === 'attach') {",
    "  const targetIndex = argumentsAfterScript.indexOf('-t') + 1;",
    "  console.log(`FAKE TMUX ATTACH ${argumentsAfterScript[targetIndex] ?? 'missing-target'}`);",
    '  process.exit(0);',
    '}',
    "console.error('Fake tmux received an unsupported command. Update the tasks dashboard fixture.');",
    'process.exit(2);',
    '',
  ].join('\n'),
);
chmodSync(join(fakeTmuxDirectory, 'tmux'), 0o755);
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
// The building phase is EARNED, not a fallback: fleet facts derive from the
// workspace root, so the fixture plants a real worktree whose branch carries a
// committed edit past its merge-base with main — that line delta is what makes
// the dashboard say building instead of exploring.
const plantedWorktreePath = join(
  fixtureRoot,
  '.invar',
  'worktrees',
  '901-planted-building',
);
mkdirSync(plantedWorktreePath, { recursive: true });
const plantedGitEnvironment = {
  ...process.env,
  GIT_AUTHOR_NAME: 'fixture',
  GIT_AUTHOR_EMAIL: 'fixture@invar.local',
  GIT_COMMITTER_NAME: 'fixture',
  GIT_COMMITTER_EMAIL: 'fixture@invar.local',
};
const plantedGit = (...gitArguments: string[]) => {
  const result = Bun.spawnSync(['git', ...gitArguments], {
    cwd: plantedWorktreePath,
    env: plantedGitEnvironment,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `fixture git ${gitArguments.join(' ')} failed: ${result.stderr.toString()}`,
    );
  }
};
plantedGit('init', '--initial-branch=main');
mkdirSync(join(plantedWorktreePath, 'src'), { recursive: true });
writeFileSync(join(plantedWorktreePath, 'src', 'planted.ts'), 'base\n');
plantedGit('add', '-A');
plantedGit('commit', '-m', 'base');
plantedGit('checkout', '-b', 'fleet/901-planted-building');
writeFileSync(join(plantedWorktreePath, 'src', 'planted.ts'), 'base\nedit\n');
plantedGit('add', '-A');
plantedGit('commit', '-m', 'edit');
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
      tmuxSession: 'planted-dead-session',
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
  JSON.stringify({ tasksDashboardCycleSeconds: 2, glyphMode: 'unicode' }),
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
    NERD_FONT: '0',
    LANG: 'en_US.UTF-8',
    INVAR_FLEET_GATE_REGISTRY: isolatedGateRegistryPath,
    PATH: `${fakeTmuxDirectory}:${process.env.PATH ?? ''}`,
    FAKE_TMUX_SESSION_LIST: fakeTmuxSessionListPath,
  },
  command: [process.execPath, 'src/main.ts', fixtureRoot],
});

// Walk the Extensions selection to a named row by LOOKING for it (the list grows as plugins are
// contributed; an ordinal Down would silently land on a neighbour).
function selectedExtensionsRow(snapshot: HarnessSnapshot.Model): string {
  return snapshot.textRows().find((rowText) => rowText.includes('› [')) ?? '';
}

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
    selectionStep < 32 && driver.snapshot().findText(`› ${rowLabel}`) === null;
    selectionStep++
  ) {
    const previousSelectedRow = selectedExtensionsRow(driver.snapshot());
    driver.sendKeys('Down');
    await driver.awaitGridCondition(
      `the Extensions selection advances from ${previousSelectedRow}`,
      (snapshot) => selectedExtensionsRow(snapshot) !== previousSelectedRow,
    );
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
      status.tasksAnimationAtRest === true &&
      status.tasksDataHeartbeatAtRest === true &&
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
      status.tasksAnimationAtRest === false &&
      status.tasksDataHeartbeatAtRest === false &&
      Number(status.tasksRows) === 4,
  );
  await driver.awaitGridCondition(
    'the live lens paints each title above its own status row',
    (snapshot) => {
      const readyTitle = snapshot.findText('#902 planted-ready');
      const buildingTitle = snapshot.findText('#901 planted-building');
      if (!readyTitle || !buildingTitle) return false;
      return (
        snapshot.rowText(readyTitle.row + 1).includes('DEGRADE') &&
        snapshot.rowText(buildingTitle.row + 1).includes('buildin')
      );
    },
  );
  HarnessSmoke.Class.pass(
    'the live lens lists the in-progress fixture with the standing vocabulary',
  );
  HarnessSmoke.Class.pass('a missing registry adds no gate row');
  writeFileSync(
    isolatedGateLogPath,
    '== merge-gate: behavioral contracts ==\n',
  );
  writeFileSync(isolatedGateRegistryPath, `${isolatedGateLogPath}\n`);
  await reobserveTasksThroughUserShortcuts(
    driver,
    statusPath,
    'the running gate refresh',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'a running gate adds one row while its exit code stays null',
    (status) =>
      status.tasksGateExitCode === null && Number(status.tasksRows) === 5,
  );
  await driver.awaitGridCondition(
    'the running gate row names its current phase',
    (snapshot) => snapshot.findText('Gate: running behaviora') !== null,
  );
  writeFileSync(
    isolatedGateLogPath,
    '== merge-gate: behavioral contracts ==\nGATE_EXIT=0\n',
  );
  await reobserveTasksThroughUserShortcuts(
    driver,
    statusPath,
    'the finished gate refresh',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'a finished gate keeps its row and publishes exit zero',
    (status) =>
      status.tasksGateExitCode === 0 && Number(status.tasksRows) === 5,
  );
  await driver.awaitGridCondition(
    'the finished gate row states that its phase passed',
    (snapshot) => snapshot.findText('Gate: passed behaviora') !== null,
  );
  rmSync(isolatedGateRegistryPath);
  rmSync(isolatedGateLogPath);
  await reobserveTasksThroughUserShortcuts(
    driver,
    statusPath,
    'the missing registry refresh',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'removing the isolated registry removes the gate row',
    (status) => Number(status.tasksRows) === 4,
  );
  HarnessSmoke.Class.pass(
    'missing, running, and finished gate registry states stay inside the fixture',
  );
  await driver.awaitGridCondition(
    'the 150 by 40 dashboard paints every Unicode task action glyph',
    (snapshot) =>
      taskActionGlyphCellsAreReadable(snapshot, '#902 planted-ready'),
  );
  HarnessSmoke.Class.pass(
    'the 150 by 40 dashboard keeps every Unicode task action glyph readable',
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
  driver.sendKeys('Control+Alt+b');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'closing the tasks pane stops its surviving motion timer',
    (status) =>
      status.rightDockVisible === false &&
      status.tasksAnimationAtRest === true &&
      status.tasksDataHeartbeatAtRest === true,
  );
  driver.sendKeys('Control+Shift+t');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the tasks pane can restart visible live motion after a close',
    (status) =>
      status.rightDockVisible === true &&
      status.rightDockActiveContent === 'tasks' &&
      status.tasksAnimationAtRest === false &&
      status.tasksDataHeartbeatAtRest === false,
  );
  await driver.awaitGridCondition(
    'the reopened tasks pane paints both live fixture rows',
    (snapshot) =>
      snapshot.findText('#901 planted-building') !== null &&
      snapshot.findText('#902 planted-ready') !== null,
  );
  HarnessSmoke.Class.pass('a closed tasks pane owns no surviving motion timer');
  driver.sendKeys('Control+Shift+u');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'another right-dock tab stops both tasks timers',
    (status) =>
      status.rightDockActiveContent === 'structure' &&
      status.tasksAnimationAtRest === true &&
      status.tasksDataHeartbeatAtRest === true,
  );
  driver.sendKeys('Control+Shift+t');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'tasks restarts both clocks when it is painted again',
    (status) =>
      status.rightDockActiveContent === 'tasks' &&
      status.tasksAnimationAtRest === false &&
      status.tasksDataHeartbeatAtRest === false,
  );
  await driver.awaitGridCondition(
    'tasks repaints its live rows after the tab switch',
    (snapshot) =>
      snapshot.findText('#901 planted-building') !== null &&
      snapshot.findText('#902 planted-ready') !== null,
  );
  HarnessSmoke.Class.pass('an unpainted tasks tab owns no heartbeat');

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
  const sessionTitlePosition = await driver
    .awaitGridCondition(
      'the READY task row repaints before its session action is addressed',
      (snapshot) => snapshot.findText('#902 planted-ready') !== null,
    )
    .then((snapshot) => snapshot.findText('#902 planted-ready'));
  if (!sessionTitlePosition)
    throw new Error(
      'The READY task status target disappeared before its click',
    );
  const sessionDetailRow = sessionTitlePosition.row + 1;
  const sessionGlyph = ThemeIcons.Class.taskActionIconsFor('unicode').session;
  const sessionActionColumn = driver
    .snapshot()
    .rowText(sessionDetailRow)
    .indexOf(sessionGlyph);
  if (sessionActionColumn < 0)
    throw new Error('The Unicode attach icon is absent from the detail row');
  driver.sendMouse({
    kind: 'move',
    column: sessionActionColumn,
    row: sessionDetailRow,
    button: 'none',
  });
  await driver.awaitGridCondition(
    'the missing session icon explains the stale target',
    (snapshot) =>
      snapshot.findText(
        'Builder tmux session is missing: planted-dead-session',
      ) !== null,
  );
  const sessionIconCell = driver
    .snapshot()
    .cell(sessionDetailRow, sessionActionColumn);
  HarnessSmoke.Class.requireCondition(
    sessionIconCell !== null &&
      sessionIconCell.characters.trim().length > 0 &&
      sessionIconCell.foreground !== sessionIconCell.background,
    'the Unicode attach icon occupies a readable terminal cell',
  );
  await driver.awaitGridCondition(
    'the dead session states a degraded live row',
    (snapshot) => snapshot.rowText(sessionDetailRow).includes('! DEGRADE'),
  );
  writeFileSync(
    join(tasksRoot, 'in-progress', '902-planted-ready', 'meta.json'),
    JSON.stringify({
      startedAt: new Date(pastFilingMs).toISOString(),
      round: 2,
      roundBriefedAtMs: pastFilingMs,
      tmuxSession: 'planted-new-session',
    }),
  );
  driver.sendMouseClick({
    column: sessionActionColumn,
    row: sessionDetailRow,
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
    'the current meta target opens in the terminal pane',
    (status) =>
      String(status.panelActiveContent) === 'tasks-session-902' &&
      (status.panelContentIds as string[]).includes('tasks-session-902'),
    15_000,
  );
  await driver.awaitGridCondition(
    'the mid-session meta edit selects the new attach target',
    (snapshot) =>
      snapshot.findText('FAKE TMUX ATTACH planted-new-session') !== null,
  );
  HarnessSmoke.Class.pass(
    'the attach icon is visible, stale targets degrade, and activation re-reads meta',
  );

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
    (status) => status.tasksLens === 'active' && Number(status.tasksRows) === 2,
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
    (status) => status.tasksLens === 'done' && Number(status.tasksRows) === 1,
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
  await driver.awaitGridCondition(
    'the attach icon remains readable after the live light-theme switch',
    (snapshot) => {
      const readyTitle = snapshot.findText('#902 planted-ready');
      if (!readyTitle) return false;
      const attachCell = snapshot.cell(
        readyTitle.row + 1,
        snapshot
          .rowText(readyTitle.row + 1)
          .indexOf(ThemeIcons.Class.taskActionIconsFor('unicode').session),
      );
      return (
        attachCell !== null &&
        attachCell.characters.trim().length > 0 &&
        attachCell.foreground !== attachCell.background
      );
    },
  );
  HarnessSmoke.Class.pass(
    'the cycle control stops on the current lens and the light-theme attach icon stays readable',
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
      Number(status.tasksRows) === 4,
  );
  HarnessSmoke.Class.pass(
    'the tasks dashboard uninstalls and reinstalls symmetrically',
  );
} finally {
  await driver.dispose();
}

console.log(
  '== tasks dashboard: narrow geometry keeps every task action glyph ==',
);
const narrowHome = mkdtempSync(
  join(tmpdir(), 'tui-tasks-dashboard-narrow-home-'),
);
const narrowStatusPath = join(narrowHome, 'status.json');
const narrowSettingsDirectory = join(narrowHome, '.config', 'invar');
mkdirSync(narrowSettingsDirectory, { recursive: true });
writeFileSync(
  join(narrowSettingsDirectory, 'settings.json'),
  JSON.stringify({ glyphMode: 'unicode' }),
);
const narrowDriver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 36,
  homeDirectory: narrowHome,
  environment: {
    TUI_STATUS_PATH: narrowStatusPath,
    COLORTERM: 'truecolor',
    NERD_FONT: '0',
    LANG: 'en_US.UTF-8',
    INVAR_FLEET_GATE_REGISTRY: isolatedGateRegistryPath,
    PATH: `${fakeTmuxDirectory}:${process.env.PATH ?? ''}`,
    FAKE_TMUX_SESSION_LIST: fakeTmuxSessionListPath,
  },
  command: [process.execPath, 'src/main.ts', fixtureRoot],
});
try {
  narrowDriver.sendKeys('Control+Shift+t');
  await HarnessSmoke.Class.awaitStatus(
    narrowDriver,
    narrowStatusPath,
    'the 120 by 36 task pane opens over the fixture',
    (status) =>
      status.rightDockActiveContent === 'tasks' &&
      status.rightDockFocused === true &&
      status.tasksAvailable === true,
  );
  await narrowDriver.awaitGridCondition(
    'the 120 by 36 dashboard paints every Unicode task action glyph',
    (snapshot) =>
      taskActionGlyphCellsAreReadable(snapshot, '#902 planted-ready'),
  );
  HarnessSmoke.Class.pass(
    'the 120 by 36 dashboard keeps every Unicode task action glyph readable',
  );
} finally {
  await narrowDriver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(narrowHome);
}

console.log('== tasks dashboard: the attach icon keeps its ASCII fallback ==');
const asciiHome = mkdtempSync(
  join(tmpdir(), 'tui-tasks-dashboard-ascii-home-'),
);
const asciiStatusPath = join(asciiHome, 'status.json');
const asciiSettingsDirectory = join(asciiHome, '.config', 'invar');
mkdirSync(asciiSettingsDirectory, { recursive: true });
writeFileSync(
  join(asciiSettingsDirectory, 'settings.json'),
  JSON.stringify({ glyphMode: 'ascii' }),
);
const asciiDriver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 150,
  rows: 40,
  homeDirectory: asciiHome,
  environment: {
    TUI_STATUS_PATH: asciiStatusPath,
    COLORTERM: 'truecolor',
    INVAR_FLEET_GATE_REGISTRY: isolatedGateRegistryPath,
    PATH: `${fakeTmuxDirectory}:${process.env.PATH ?? ''}`,
    FAKE_TMUX_SESSION_LIST: fakeTmuxSessionListPath,
  },
  command: [process.execPath, 'src/main.ts', fixtureRoot],
});
try {
  asciiDriver.sendKeys('Control+Shift+t');
  await HarnessSmoke.Class.awaitStatus(
    asciiDriver,
    asciiStatusPath,
    'the ASCII task pane shows the current live rows',
    (status) =>
      status.rightDockActiveContent === 'tasks' &&
      status.tasksAvailable === true,
  );
  await asciiDriver.awaitGridCondition(
    'the ASCII attach action paints a non-blank fallback cell',
    (snapshot) => {
      const readyTitle = snapshot.findText('#902 planted-ready');
      if (!readyTitle) return false;
      const attachCell = snapshot.cell(
        readyTitle.row + 1,
        snapshot
          .rowText(readyTitle.row + 1)
          .indexOf(ThemeIcons.Class.taskActionIconsFor('ascii').session),
      );
      return (
        attachCell?.characters === '>' &&
        attachCell.foreground !== attachCell.background
      );
    },
  );
  HarnessSmoke.Class.pass('the attach action remains visible in ASCII mode');
} finally {
  await asciiDriver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(asciiHome);
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
  environment: {
    TUI_STATUS_PATH: bareStatusPath,
    COLORTERM: 'truecolor',
    INVAR_FLEET_GATE_REGISTRY: isolatedGateRegistryPath,
  },
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
      status.tasksAnimationAtRest === true &&
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
  writeTask(
    largeTasksRoot,
    'in-progress',
    `${taskNumber}-scale-row`,
    ['State: IN-PROGRESS'],
    taskNumber === 1_499
      ? {}
      : {
          [`report-${taskNumber}-scale-row.md`]: 'READY',
        },
  );
}
const largeHome = mkdtempSync(
  join(tmpdir(), 'tui-tasks-dashboard-large-home-'),
);
const largeStatusPath = join(largeHome, 'status.json');
const largeSettingsDirectory = join(largeHome, '.config', 'invar');
mkdirSync(largeSettingsDirectory, { recursive: true });
writeFileSync(
  join(largeSettingsDirectory, 'settings.json'),
  JSON.stringify({
    glyphMode: 'unicode',
    'monitoring.dockSide': 'left',
    'tasks.dockSide': 'right',
  }),
);
const largeDriver = new PtyTestDriver.Class({
  workspaceRoot: largeRoot,
  columns: 120,
  rows: 36,
  homeDirectory: largeHome,
  environment: {
    TUI_STATUS_PATH: largeStatusPath,
    INVAR_FLEET_REPOSITORY_ROOT: largeRoot,
    INVAR_FLEET_GATE_REGISTRY: isolatedGateRegistryPath,
    COLORTERM: 'truecolor',
    NERD_FONT: '0',
    LANG: 'en_US.UTF-8',
  },
  command: [process.execPath, 'src/main.ts', largeRoot],
});
try {
  largeDriver.sendKeys('Control+Shift+n');
  await HarnessSmoke.Class.awaitStatus(
    largeDriver,
    largeStatusPath,
    'the monitor paints beside the large fixture',
    (status) =>
      status.monitoringObserved === true &&
      Number(status.monitoringSampleCount) > 0,
  );
  largeDriver.sendKeys('Control+Shift+t');
  await HarnessSmoke.Class.awaitStatus(
    largeDriver,
    largeStatusPath,
    'the large fixture shows the same compact live projection',
    (status) =>
      status.rightDockActiveContent === 'tasks' &&
      status.tasksAvailable === true &&
      Number(status.tasksRows) === 1_000 &&
      Number(status.tasksAnimationPaint) >= 3,
  );
  await largeDriver.awaitGridCondition(
    'the large fixture paints only its visible leading window',
    (snapshot) =>
      snapshot.findText('#1499 scale-row') !== null &&
      snapshot.findText('#1000 scale-row') === null,
  );
  await largeDriver.awaitGridCondition(
    'the large fixture keeps every visible Unicode task action glyph readable',
    (snapshot) =>
      taskActionGlyphCellsAreReadable(snapshot, '#1499 scale-row', false),
  );
  HarnessSmoke.Class.pass(
    'five hundred tasks keep the compact observed projection responsive',
  );
  const hydrationStatus = HarnessSmoke.Class.readStatus(largeStatusPath);
  const hydrationHeartbeatTarget =
    Number(hydrationStatus.tasksDataHeartbeatTicks) + 3;
  await HarnessSmoke.Class.awaitStatus(
    largeDriver,
    largeStatusPath,
    'the large painted window reaches a steady data cycle',
    (status) =>
      Number(status.tasksDataHeartbeatTicks) >= hydrationHeartbeatTarget &&
      Number(status.tasksFleetFactProbes) > 0,
  );
  const steadyBefore = HarnessSmoke.Class.readStatus(largeStatusPath);
  const steadyHeartbeatTarget =
    Number(steadyBefore.tasksDataHeartbeatTicks) + 3;
  const steadyAfter = await HarnessSmoke.Class.awaitStatus(
    largeDriver,
    largeStatusPath,
    'three more visible ticks stay bounded by the painted window',
    (status) => Number(status.tasksDataHeartbeatTicks) >= steadyHeartbeatTarget,
  );
  const heartbeatTicks =
    Number(steadyAfter.tasksDataHeartbeatTicks) -
    Number(steadyBefore.tasksDataHeartbeatTicks);
  const paintedRows = Number(steadyAfter.rightDockRows);
  const steadyCounts = {
    taskTreeReads:
      Number(steadyAfter.tasksTaskTreeReads) -
      Number(steadyBefore.tasksTaskTreeReads),
    fleetFactProbes:
      Number(steadyAfter.tasksFleetFactProbes) -
      Number(steadyBefore.tasksFleetFactProbes),
    sessionProbes:
      Number(steadyAfter.tasksSessionProbes) -
      Number(steadyBefore.tasksSessionProbes),
    rowRebuilds:
      Number(steadyAfter.tasksRowRebuilds) -
      Number(steadyBefore.tasksRowRebuilds),
  };
  HarnessSmoke.Class.requireCondition(
    !visibleTickWorkIsBounded(
      {
        taskTreeReads: 1,
        fleetFactProbes: 500,
        sessionProbes: 500,
        rowRebuilds: 1_000,
      },
      paintedRows,
      heartbeatTicks,
    ),
    'positive control: an all-tree tick must fail the painted-window bound',
  );
  HarnessSmoke.Class.requireCondition(
    visibleTickWorkIsBounded(steadyCounts, paintedRows, heartbeatTicks),
    `visible tick work stayed within ${paintedRows} painted rows across ${heartbeatTicks} ticks: ` +
      JSON.stringify(steadyCounts),
  );
  HarnessSmoke.Class.pass(
    'visible data ticks stay proportional to the painted window',
  );
  for (let wheelEvent = 0; wheelEvent < 40; wheelEvent += 1) {
    largeDriver.sendMouseWithoutFrameExpectation({
      kind: 'wheel',
      column: 110,
      row: 20,
      direction: 'down',
    });
  }
  await HarnessSmoke.Class.awaitStatus(
    largeDriver,
    largeStatusPath,
    'the motion timer stops after the only building row leaves the viewport',
    (status) =>
      status.tasksAnimationAtRest === true &&
      Number(status.tasksAnimationPaint) >= 3,
  );
  await largeDriver.awaitGridCondition(
    'the large fixture scrolls past the building row while held rows remain visible',
    (snapshot) =>
      snapshot.findText('#1499 scale-row') === null &&
      snapshot.findText('#1479 scale-row') !== null,
  );
  HarnessSmoke.Class.pass(
    'an off-screen live row owns no dashboard motion timer',
  );
} finally {
  await largeDriver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(largeRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(largeHome);
}
