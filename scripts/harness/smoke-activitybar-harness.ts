#!/usr/bin/env bun
// Byte-level port of the activity-bar contract: exact fallback glyphs, accent cells, and switched
// sidebar content come from the emulator grid; the active view remains a semantic status assertion.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)
// invariant: The active activity item determines its dock content (src/modules/ui/ui.invariants.md)
// invariant: One panel host owns keyboard focus (src/modules/ui/ui.invariants.md)
// invariant: Appearance is data with a capability fallback (project.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

// The expected glyphs come from the SAME vocabulary the bar paints from, so a vocabulary change (⊞ →
// ⬢ → ⧫ over two user reports) never re-breaks this drive. What the literal row must be
// is pinned once, in `src/modules/theme/ThemeIcons.test.ts`; what this smoke proves is that the
// painted cell IS the named slot and that it occupies exactly one cell.
function activityGlyphsFor(
  glyphLevel: 'nerd' | 'unicode',
): readonly [string, string, string] {
  const vocabulary = ThemeIcons.Class.interfaceGlyphVocabularyFor(glyphLevel);
  return [
    vocabulary.activityFiles,
    vocabulary.activitySourceControl,
    vocabulary.activityExtensions,
  ];
}

function glyphRow(snapshot: HarnessSnapshot.Model, glyph: string): number {
  for (let row = 0; row < snapshot.rows; row++) {
    if (snapshot.cell(row, 2)?.characters === glyph) return row;
  }
  return -1;
}

function glyphRowAtColumn(
  snapshot: HarnessSnapshot.Model,
  glyph: string,
  column: number,
): number {
  for (let row = 0; row < snapshot.rows; row++) {
    if (snapshot.cell(row, column)?.characters === glyph) return row;
  }
  return -1;
}

// The sidebar's left edge is the alignment witness: a glyph the renderer measures wider than the
// terminal renders it pushes everything to its right off by a column on that row alone.
function sidebarEdgeColumn(
  snapshot: HarnessSnapshot.Model,
  row: number,
): number {
  for (let column = 0; column < snapshot.columns; column++) {
    if (snapshot.cell(row, column)?.characters === '│') return column;
  }
  return -1;
}

function accentCount(snapshot: HarnessSnapshot.Model): number {
  let count = 0;
  for (let row = 0; row < snapshot.rows; row++) {
    if (snapshot.cell(row, 0)?.characters === '|') count++;
  }
  return count;
}

function clickCell(
  driver: PtyTestDriver.Model,
  column: number,
  row: number,
): void {
  driver.sendMouse({ kind: 'press', column, row, button: 'left' });
  driver.sendMouse({ kind: 'release', column, row, button: 'left' });
}

async function selectSettingByLabel(
  driver: PtyTestDriver.Model,
  statusPath: string,
  settingLabel: string,
): Promise<void> {
  let selectionStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `the Settings list is published before locating ${settingLabel}`,
    (status) =>
      Array.isArray(status.settingsLabels) &&
      status.settingsLabels.length > 0 &&
      typeof status.settingsSelected === 'number' &&
      typeof status.settingsSelectedLabel === 'string',
  );
  const settingsLabels = selectionStatus.settingsLabels as string[];
  const startingIndex = Number(selectionStatus.settingsSelected);
  if (startingIndex > 0) {
    driver.sendKeys(...Array.from({ length: startingIndex }, () => 'Up'));
    selectionStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `Settings returns to its first row before locating ${settingLabel}`,
      (status) => Number(status.settingsSelected) === 0,
    );
  }

  for (
    let inspectedRowCount = 0;
    inspectedRowCount < settingsLabels.length;
    inspectedRowCount += 1
  ) {
    if (selectionStatus.settingsSelectedLabel === settingLabel) {
      await driver.awaitGridCondition(
        `${settingLabel} is the visibly selected Settings row`,
        (snapshot) => snapshot.findText(`› ${settingLabel}`) !== null,
      );
      return;
    }
    const selectedIndex = Number(selectionStatus.settingsSelected);
    if (selectedIndex >= settingsLabels.length - 1) break;
    driver.sendKeys('Down');
    selectionStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `Settings advances toward ${settingLabel}`,
      (status) => Number(status.settingsSelected) === selectedIndex + 1,
    );
  }

  throw new Error(
    `Timed out locating Settings label "${settingLabel}" after inspecting ` +
      `${settingsLabels.length} rows`,
  );
}

async function driveActivityGlyphTier(
  fixtureRoot: string,
  glyphLevel: 'nerd' | 'unicode',
  expectedGlyphs: readonly [string, string, string],
): Promise<void> {
  const tierHomeDirectory = mkdtempSync(
    join(tmpdir(), `tui-activitybar-${glyphLevel}-`),
  );
  const tierStatusPath = join(tierHomeDirectory, 'status.json');
  mkdirSync(join(tierHomeDirectory, '.config', 'invar'), { recursive: true });
  await Bun.write(
    join(tierHomeDirectory, '.config', 'invar', 'settings.json'),
    `${JSON.stringify({ glyphMode: glyphLevel })}\n`,
  );
  const tierDriver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 100,
    rows: 36,
    homeDirectory: tierHomeDirectory,
    environment: {
      TUI_STATUS_PATH: tierStatusPath,
      COLORTERM: 'truecolor',
    },
  });
  try {
    const snapshot = await tierDriver.awaitGridCondition(
      `${glyphLevel} activity glyph slots render their expected fallback row`,
      (candidate) =>
        expectedGlyphs.every((glyph) => glyphRow(candidate, glyph) >= 0) &&
        candidate.findText('tree-marker.txt') !== null,
      15_000,
    );
    for (const glyph of expectedGlyphs) {
      const glyphRowIndex = glyphRow(snapshot, glyph);
      HarnessSmoke.Class.requireCondition(
        glyphRowIndex >= 0,
        `${glyphLevel} activity glyph slot renders ${glyph}`,
      );
      // Column 0 is the accent, 1 a pad, 2 the glyph, 3 a pad. The glyph must own exactly one
      // terminal cell or the four-column bar cannot keep its rows aligned.
      HarnessSmoke.Class.requireCondition(
        snapshot.cell(glyphRowIndex, 2)?.width === 1,
        `${glyphLevel} activity glyph ${glyph} occupies exactly one terminal cell`,
      );
    }
    const sourceControlEdgeColumn = sidebarEdgeColumn(
      snapshot,
      glyphRow(snapshot, expectedGlyphs[1]),
    );
    const extensionsEdgeColumn = sidebarEdgeColumn(
      snapshot,
      glyphRow(snapshot, expectedGlyphs[2]),
    );
    HarnessSmoke.Class.requireCondition(
      sourceControlEdgeColumn > 0 &&
        sourceControlEdgeColumn === extensionsEdgeColumn,
      `${glyphLevel} activity rows keep the sidebar edge in one column`,
    );
  } finally {
    await tierDriver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(tierHomeDirectory);
  }
}

async function drivePlantedPanelOrderProfile(
  fixtureRoot: string,
): Promise<void> {
  const plantedHomeDirectory = mkdtempSync(
    join(tmpdir(), 'tui-activitybar-planted-panel-order-'),
  );
  const plantedStatusPath = join(plantedHomeDirectory, 'status.json');
  mkdirSync(join(plantedHomeDirectory, '.config', 'invar'), {
    recursive: true,
  });
  await Bun.write(
    join(plantedHomeDirectory, '.config', 'invar', 'settings.json'),
    `${JSON.stringify({
      glyphMode: 'ascii',
      panelContentOrder: ['terminal', 'agent'],
    })}\n`,
  );
  const plantedDriver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 100,
    rows: 36,
    homeDirectory: plantedHomeDirectory,
    environment: {
      TUI_STATUS_PATH: plantedStatusPath,
      COLORTERM: 'truecolor',
      INVAR_AGENT_BACKEND: 'echo',
    },
  });
  try {
    await HarnessSmoke.Class.awaitStatus(
      plantedDriver,
      plantedStatusPath,
      'the planted profile reaches application readiness',
      (status) => status.ready === true,
      15_000,
    );
    plantedDriver.sendKeys('Control+Shift+s');
    await HarnessSmoke.Class.awaitStatus(
      plantedDriver,
      plantedStatusPath,
      'the planted terminal-first order reaches the first split paint',
      (status) =>
        Array.isArray(status.panelCellIds) &&
        status.panelCellIds.join(',') === 'terminal,agent',
    );
    HarnessSmoke.Class.pass(
      'a planted terminal-first profile overrides the agent-first default',
    );
  } finally {
    await plantedDriver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(plantedHomeDirectory);
  }
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-activitybar-harness-'));

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-activitybar-harness-home-'),
);

const statusPath = join(homeDirectory, 'status.json');

await Bun.write(join(fixtureRoot, 'tree-marker.txt'), 'unchanged tree file\n');

await Bun.write(
  join(fixtureRoot, 'focus-sample.ts'),
  'export function focusTarget(): string { return "focus"; }\n',
);

await Bun.write(join(fixtureRoot, 'change-me.txt'), 'original\n');

HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);

HarnessSmoke.Class.runGit(fixtureRoot, ['add', '.']);

HarnessSmoke.Class.runGit(fixtureRoot, [
  '-c',
  'user.name=activitybar-smoke',
  '-c',
  'user.email=activitybar-smoke@example.test',
  'commit',
  '-qm',
  'base',
]);

await Bun.write(join(fixtureRoot, 'change-me.txt'), 'original\nedited\n');

mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });

await Bun.write(
  join(homeDirectory, '.config', 'invar', 'settings.json'),
  '{"glyphMode":"ascii"}\n',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 100,
  rows: 36,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    COLORTERM: 'truecolor',
    INVAR_AGENT_BACKEND: 'echo',
  },
});

let restartDriver: PtyTestDriver.Model | null = null;

try {
  console.log(
    '== harness activitybar: semantic slots resolve at nerd and unicode tiers ==',
  );
  await driveActivityGlyphTier(fixtureRoot, 'nerd', activityGlyphsFor('nerd'));
  await driveActivityGlyphTier(
    fixtureRoot,
    'unicode',
    activityGlyphsFor('unicode'),
  );

  console.log(
    '== harness activitybar: fallback glyph tier renders every view ==',
  );
  let snapshot = await driver.awaitGridCondition(
    'ascii activity glyph slots and the Explorer tree render together',
    (candidate) =>
      glyphRow(candidate, 'F') >= 0 &&
      glyphRow(candidate, 'G') >= 0 &&
      glyphRow(candidate, 'X') >= 0 &&
      candidate.findText('tree-marker.txt') !== null,
    15_000,
  );
  const filesRow = glyphRow(snapshot, 'F');
  const gitRow = glyphRow(snapshot, 'G');
  const extensionsRow = glyphRow(snapshot, 'X');
  const structureRow = glyphRow(snapshot, 't');
  const tasksRow = glyphRow(snapshot, '#');
  HarnessSmoke.Class.pass(`Explorer glyph 'F' rendered (row ${filesRow})`);
  HarnessSmoke.Class.pass(`Source Control glyph 'G' rendered (row ${gitRow})`);
  HarnessSmoke.Class.pass(
    `Extensions glyph 'X' rendered (row ${extensionsRow})`,
  );
  HarnessSmoke.Class.requireCondition(
    structureRow >= 0 && tasksRow >= 0,
    'right-dock Structure and Tasks glyphs render in the activity surface',
  );

  console.log(
    '== harness activitybar: fresh and planted profiles choose panel order ==',
  );
  const initialStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the activity bar boots on the Explorer view',
    (status) => status.sidebarView === 'files',
  );
  driver.sendKeys('Control+Shift+s');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the fresh profile paints agent left of terminal on its first split',
    (status) =>
      Array.isArray(status.panelCellIds) &&
      status.panelCellIds.join(',') === 'agent,terminal',
  );
  HarnessSmoke.Class.pass(
    'fresh profile paints agent left of terminal on first split paint',
  );
  driver.sendKeys('Control+Shift+s');
  driver.sendKeys('Control+Shift+a');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the panel returns hidden after the fresh-order measurement',
    (status) => status.terminalVisible === false,
  );
  await drivePlantedPanelOrderProfile(fixtureRoot);

  console.log('== harness activitybar: initial Explorer state is coherent ==');
  const pluginPrimaryDockContentIdentifiers =
    initialStatus.pluginPrimaryDockContentIdentifiers as string[];
  const registeredDockContentIdentifiers = [
    ...(initialStatus.sidebarViewIdentifiers as string[]),
    ...(initialStatus.rightDockContentIds as string[]),
  ];
  const activityBarItemIdentifiers =
    initialStatus.activityBarItemIdentifiers as string[];
  HarnessSmoke.Class.requireCondition(
    pluginPrimaryDockContentIdentifiers.includes('files'),
    'the default plugin manifest declares the Explorer view',
  );
  HarnessSmoke.Class.requireCondition(
    pluginPrimaryDockContentIdentifiers.includes('git'),
    'the default plugin manifest declares the Source Control view',
  );
  HarnessSmoke.Class.requireCondition(
    activityBarItemIdentifiers.length ===
      new Set(activityBarItemIdentifiers).size &&
      activityBarItemIdentifiers.length ===
        registeredDockContentIdentifiers.length &&
      registeredDockContentIdentifiers.every((identifier) =>
        activityBarItemIdentifiers.includes(identifier),
      ),
    'the activity surface contains every registered dock content exactly once',
  );
  HarnessSmoke.Class.requireCondition(
    JSON.stringify(initialStatus.sidebarViewIdentifiers) ===
      JSON.stringify(pluginPrimaryDockContentIdentifiers),
    'the sidebar view-id set contains every plugin-contributed view in order',
  );
  HarnessSmoke.Class.pass('boots on the Explorer view');
  HarnessSmoke.Class.requireCondition(
    snapshot.cell(filesRow, 0)?.characters === '|',
    'active accent sits on the Explorer icon row',
  );
  HarnessSmoke.Class.requireCondition(
    accentCount(snapshot) === 1,
    'exactly one activity item is active',
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('tree-marker.txt') !== null,
    'Explorer view renders the file tree',
  );

  console.log(
    '== harness activitybar: mirror and live dock side share one surface ==',
  );
  HarnessSmoke.Class.requireCondition(
    (initialStatus.layoutSlots as Record<string, { width: number }>)
      .rightActivityBar?.width === 0,
    'the mirrored right activity bar is off by default',
  );
  driver.sendKeys('Control+,');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Settings opens before the mirrored activity-bar drive',
    (status) => status.settingsOpen === true,
  );
  await selectSettingByLabel(
    driver,
    statusPath,
    'Mirror activity bar on right',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the mirror setting is selected before it changes',
    (status) =>
      status.settingsSelectedLabel === 'Mirror activity bar on right' &&
      status.settingsSelectedValue === 'off',
  );
  driver.sendKeys('Right');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the mirror setting allocates the right activity-bar slot live',
    (status) =>
      status.showRightActivityBar === true &&
      (status.layoutSlots as Record<string, { width: number }>).rightActivityBar
        ?.width === 4,
  );
  driver.sendKeys('Escape');
  snapshot = await driver.awaitGridCondition(
    'the mirrored right activity bar paints the same registered glyphs',
    (candidate) =>
      glyphRowAtColumn(candidate, 'F', candidate.columns - 2) >= 0 &&
      glyphRowAtColumn(candidate, 't', candidate.columns - 2) >= 0 &&
      glyphRowAtColumn(candidate, '#', candidate.columns - 2) >= 0,
  );
  HarnessSmoke.Class.pass(
    'the optional right activity bar mirrors the dock-agnostic surface',
  );
  driver.sendKeys('Control+,');
  driver.sendKeys('Left');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'turning the mirror off removes its slot live',
    (status) =>
      status.showRightActivityBar === false &&
      (status.layoutSlots as Record<string, { width: number }>).rightActivityBar
        ?.width === 0,
  );

  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Settings closes before the activity-surface click',
    (status) => status.settingsOpen === false,
  );
  snapshot = await driver.awaitGridCondition(
    'the single left activity surface remains after the mirror closes',
    (candidate) =>
      glyphRow(candidate, 't') === structureRow &&
      candidate.findText('Mirror activity bar on right') === null,
  );
  clickCell(driver, 1, structureRow);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Structure activity item focuses its suggested right host',
    (status) =>
      status.rightDockActiveContent === 'structure' &&
      status.rightDockVisible === true &&
      status.rightDockFocused === true &&
      status.primaryDockFocused === false,
  );
  driver.sendKeys('Control+,');
  await selectSettingByLabel(driver, statusPath, 'Dock side');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Structure dock-side setting is selected at its default',
    (status) =>
      status.settingsSelectedLabel === 'Dock side' &&
      status.settingsSelectedValue === 'right',
  );
  driver.sendKeys('Left');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the visible Structure instance moves from right to left with focus',
    (status) =>
      (status.sidebarViewIdentifiers as string[]).includes('structure') &&
      !(status.rightDockContentIds as string[]).includes('structure') &&
      status.sidebarView === 'structure' &&
      status.primaryDockVisible === true &&
      status.primaryDockFocused === true &&
      status.rightDockVisible === false,
  );
  driver.sendKeys('Right');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the visible Structure instance moves from left to right with focus',
    (status) =>
      !(status.sidebarViewIdentifiers as string[]).includes('structure') &&
      (status.rightDockContentIds as string[]).includes('structure') &&
      status.primaryDockVisible === false &&
      status.rightDockVisible === true &&
      status.rightDockFocused === true,
  );
  driver.sendKeys('Left');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the same visible Structure instance moves back from right to left',
    (status) =>
      (status.sidebarViewIdentifiers as string[]).includes('structure') &&
      !(status.rightDockContentIds as string[]).includes('structure') &&
      status.primaryDockVisible === true &&
      status.primaryDockFocused === true &&
      status.rightDockVisible === false,
  );
  driver.sendKeys('Right');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Structure returns to its suggested right side before later drives',
    (status) =>
      !(status.sidebarViewIdentifiers as string[]).includes('structure') &&
      (status.rightDockContentIds as string[]).includes('structure') &&
      status.rightDockFocused === true,
  );
  const absentSettingLabel = 'Absent activity-bar locator control';
  let absentSettingFailure: unknown = null;
  try {
    await selectSettingByLabel(driver, statusPath, absentSettingLabel);
  } catch (error) {
    absentSettingFailure = error;
  }
  HarnessSmoke.Class.requireCondition(
    absentSettingFailure instanceof Error &&
      absentSettingFailure.message ===
        `Timed out locating Settings label "${absentSettingLabel}" after inspecting ` +
          `${(HarnessSmoke.Class.readStatus(statusPath).settingsLabels as string[]).length} rows`,
    'an absent Settings label exhausts the bounded walk and names itself',
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Settings closes before the Structure toggle drive',
    (status) => status.settingsOpen === false,
  );
  snapshot = await driver.awaitGridCondition(
    'the settings paint leaves before the Structure toggle click',
    (candidate) =>
      glyphRow(candidate, 't') >= 0 &&
      candidate.findText('Mirror activity bar on right') === null,
  );
  clickCell(driver, 1, glyphRow(snapshot, 't'));
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'a second Structure activity click toggles its right host closed',
    (status) => status.rightDockVisible === false,
  );
  clickCell(driver, 1, filesRow);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Explorer restores the primary dock after the side-setting drive',
    (status) =>
      status.sidebarView === 'files' &&
      status.primaryDockVisible === true &&
      status.primaryDockFocused === true,
  );

  console.log(
    '== harness activitybar: clicks switch view, accent, content, and badge ==',
  );
  clickCell(driver, 1, gitRow);
  snapshot = await driver.awaitGridCondition(
    'Source Control content and active accent render after its click',
    (candidate) =>
      candidate.findText('Git') !== null &&
      candidate.cell(gitRow, 0)?.characters === '|',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.sidebarView === 'git'",
    (status) => status.sidebarView === 'git',
  );
  HarnessSmoke.Class.pass('clicking Source Control switched the view');
  HarnessSmoke.Class.requireCondition(
    snapshot.cell(gitRow, 0)?.characters === '|',
    'accent moved to column 0 on the Source Control icon row',
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.cell(filesRow, 0)?.characters === ' ',
    'the Explorer button is no longer accented',
  );
  HarnessSmoke.Class.requireCondition(
    accentCount(snapshot) === 1,
    'still exactly one active item',
  );
  HarnessSmoke.Class.pass('Source Control view renders the git panel');
  // Adjudicated from both terminal grids plus lineage: 140ea02 intentionally moved the badge from
  // column 0 to column 1, closer to the centred icon, while the icon-row accent remains at column 0.
  HarnessSmoke.Class.requireCondition(
    snapshot.cell(gitRow - 1, 0)?.characters === ' ',
    'git badge row leaves column 0 clear',
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.cell(gitRow - 1, 1)?.characters === '1',
    'git badge shows one change in column 1 above the icon',
  );

  clickCell(driver, 1, filesRow);
  const focusSamplePosition = await driver
    .awaitGridCondition(
      'the Explorer paints the focus fixture before the cross-dock drive',
      (candidate) => candidate.findText('focus-sample.ts') !== null,
    )
    .then((candidate) => candidate.findText('focus-sample.ts'));
  HarnessSmoke.Class.requireCondition(
    focusSamplePosition !== null,
    'the focus fixture has a painted pointer target',
  );
  clickCell(driver, focusSamplePosition!.column, focusSamplePosition!.row);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the structure row is ready before the cross-dock focus drive',
    (status) =>
      status.structureStatus === 'ready' && Number(status.structureRows) > 0,
  );

  clickCell(driver, 1, extensionsRow);
  snapshot = await driver.awaitGridCondition(
    'Extensions content and active accent render after its click',
    (candidate) =>
      candidate.findText('Space/Enter installs or') !== null &&
      candidate.cell(extensionsRow, 0)?.characters === '|',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.sidebarView === 'extensions'",
    (status) => status.sidebarView === 'extensions',
  );
  HarnessSmoke.Class.pass('clicking Extensions switched the view');
  HarnessSmoke.Class.requireCondition(
    accentCount(snapshot) === 1,
    'one item remains active on Extensions',
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('tree-marker.txt') === null,
    'the file tree is gone while Extensions is shown',
  );
  let structureHeadingPosition: { row: number; column: number } | null = null;
  const rightHalfStartColumn = Math.floor(snapshot.columns / 2);
  for (let row = 0; row < snapshot.rows; row++) {
    const column = snapshot
      .rowText(row)
      .indexOf('Structure', rightHalfStartColumn);
    if (column < 0) continue;
    structureHeadingPosition = { row, column };
    break;
  }
  HarnessSmoke.Class.requireCondition(
    structureHeadingPosition !== null,
    'the right-dock heading has a painted pointer target',
  );
  clickCell(
    driver,
    structureHeadingPosition!.column,
    structureHeadingPosition!.row,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the right-dock heading click leaves only the right dock focused',
    (status) =>
      status.primaryDockFocused === false &&
      status.rightDockFocused === true &&
      status.terminalFocused === false,
  );
  HarnessSmoke.Class.pass(
    'a right-dock click withdrew primary and bottom-panel focus',
  );

  const structureRowPosition = await driver
    .awaitGridCondition(
      'the right dock paints focusTarget for the structure-row drive',
      (candidate) => candidate.findText('focusTarget') !== null,
    )
    .then((candidate) => candidate.findText('focusTarget'));
  HarnessSmoke.Class.requireCondition(
    structureRowPosition !== null,
    'the structure row has a painted pointer target',
  );
  clickCell(driver, structureRowPosition!.column, structureRowPosition!.row);
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Enter on the focused structure row returns focus to its editor target',
    (status) =>
      status.focus === 'editor' &&
      status.cursor?.line === 0 &&
      status.cursor.col === 16 &&
      status.primaryDockFocused === false &&
      status.rightDockFocused === false &&
      status.terminalFocused === false,
  );
  HarnessSmoke.Class.pass(
    'Enter routed through the right dock instead of the primary dock',
  );

  clickCell(driver, 1, filesRow);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the primary-dock click leaves only the primary dock focused',
    (status) =>
      status.primaryDockFocused === true &&
      status.rightDockFocused === false &&
      status.terminalFocused === false,
  );
  HarnessSmoke.Class.pass(
    'a primary-dock click withdrew right and bottom-panel focus',
  );
  await driver.awaitGridCondition(
    'the Explorer tree returns after its activity item is clicked',
    (candidate) => candidate.findText('tree-marker.txt') !== null,
  );
  HarnessSmoke.Class.pass('clicking Explorer returned to the tree');

  console.log(
    '== harness activitybar: Ctrl+Shift chords switch the same views ==',
  );
  driver.sendKeys('Control+Shift+g');
  snapshot = await driver.awaitGridCondition(
    'the Source Control chord moves the active accent to its item',
    (candidate) => candidate.cell(gitRow, 0)?.characters === '|',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.sidebarView === 'git'",
    (status) => status.sidebarView === 'git',
  );
  HarnessSmoke.Class.pass('Ctrl+Shift+G switched to Source Control');
  HarnessSmoke.Class.pass('chord moved the accent to Source Control');
  driver.sendKeys('Control+Shift+e');
  await driver.awaitGridCondition(
    'the Explorer chord moves the active accent to its item',
    (candidate) => candidate.cell(filesRow, 0)?.characters === '|',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.sidebarView === 'files'",
    (status) => status.sidebarView === 'files',
  );
  HarnessSmoke.Class.pass('Ctrl+Shift+E switched to Explorer');
  driver.sendKeys('Control+Shift+x');
  await driver.awaitGridCondition(
    'the Extensions chord renders its sidebar content',
    (candidate) => candidate.findText('Space/Enter installs or') !== null,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.sidebarView === 'extensions'",
    (status) => status.sidebarView === 'extensions',
  );
  HarnessSmoke.Class.pass(
    'Ctrl+Shift+X switched to Extensions and its content',
  );

  console.log(
    '== harness activitybar: disable and re-enable preserve the icon slot ==',
  );
  const initialActivityOrder = [
    ...(initialStatus.activityBarItemIdentifiers as string[]),
  ];
  driver.sendKeys('Down');
  await driver.awaitGridCondition(
    'the Extensions list selects Git before disabling it',
    (candidate) => candidate.findText('› [x] Git') !== null,
  );
  driver.sendKeys('Space');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Git unregisters while its persisted activity slot stays dormant',
    (status) =>
      Array.isArray(status.activityBarItemIdentifiers) &&
      !status.activityBarItemIdentifiers.includes('git'),
  );
  HarnessSmoke.Class.pass('disabling Git removes its activity membership');
  driver.sendKeys('Space');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Git returns to the exact activity order it held before disable',
    (status) =>
      JSON.stringify(status.activityBarItemIdentifiers) ===
      JSON.stringify(initialActivityOrder),
  );
  HarnessSmoke.Class.pass(
    're-enabling Git restored the same activity-bar index',
  );

  console.log(
    '== harness activitybar: keyboard and pointer share persisted reorder ==',
  );
  // Every expected order DERIVES from the observed initial order. A literal list here is a
  // rotted enumeration the moment the manifest grows a contributor — it did (#35 added the
  // structure navigator as the ninth), and the literal 'files,extensions,git' went red while
  // the behaviour it guarded stayed correct.
  const activityOrderAfterAltUp = [...initialActivityOrder];
  const activeExtensionsIndex = activityOrderAfterAltUp.indexOf('extensions');
  activityOrderAfterAltUp.splice(activeExtensionsIndex, 1);
  activityOrderAfterAltUp.splice(activeExtensionsIndex - 1, 0, 'extensions');
  driver.sendKeys('Alt+Up');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Alt+Up moves the active Extensions item through the activity order',
    (status) =>
      Array.isArray(status.activityBarItemIdentifiers) &&
      status.activityBarItemIdentifiers.join(',') ===
        activityOrderAfterAltUp.join(','),
  );
  HarnessSmoke.Class.pass('Alt+Up reorders the active activity item');
  driver.sendKeys('Alt+Down');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Alt+Down restores the initial activity order',
    (status) =>
      JSON.stringify(status.activityBarItemIdentifiers) ===
      JSON.stringify(initialActivityOrder),
  );
  snapshot = await driver.awaitGridCondition(
    'all activity glyphs render before the pointer reorder',
    (candidate) =>
      glyphRow(candidate, 'F') >= 0 &&
      glyphRow(candidate, 'G') >= 0 &&
      glyphRow(candidate, 'X') >= 0,
  );
  const dragSourceRow = glyphRow(snapshot, 'G');
  const dragTargetRow = glyphRow(snapshot, 'F');
  driver.sendMouse({
    kind: 'press',
    column: 1,
    row: dragSourceRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'move',
    column: 1,
    row: dragTargetRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: 1,
    row: dragTargetRow,
    button: 'left',
  });
  // Dropping Git on the Explorer row moves it to Explorer's index; derive the expectation from
  // the initial order so a longer manifest keeps the assertion honest.
  const draggedActivityOrder = initialActivityOrder.filter(
    (identifier) => identifier !== 'git',
  );
  draggedActivityOrder.splice(draggedActivityOrder.indexOf('files'), 0, 'git');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'pointer drag moves Git to the first activity index',
    (status) =>
      JSON.stringify(status.activityBarItemIdentifiers) ===
      JSON.stringify(draggedActivityOrder),
  );
  HarnessSmoke.Class.pass('pointer drag moved Git to a new activity index');

  console.log(
    '== harness activitybar: Ctrl+Shift+B hides and restores the bar ==',
  );
  driver.sendKeys('Control+Shift+e');
  await driver.awaitGridCondition(
    'the Explorer chord restores one visible activity accent',
    (candidate) => accentCount(candidate) === 1,
  );
  driver.sendKeys('Control+Shift+b');
  await driver.awaitGridCondition(
    'the activity-bar toggle removes every activity accent',
    (candidate) => accentCount(candidate) === 0,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.showActivityBar === false',
    (status) => status.showActivityBar === false,
  );
  HarnessSmoke.Class.pass(
    'Ctrl+Shift+B hid the bar and flipped the setting off',
  );
  driver.sendKeys('Control+Shift+b');
  await driver.awaitGridCondition(
    'the activity-bar toggle restores its active accent',
    (candidate) => accentCount(candidate) >= 1,
  );
  HarnessSmoke.Class.pass('Ctrl+Shift+B showed the bar again');

  console.log(
    '== harness activitybar: restart restores the pointer-dragged order ==',
  );
  driver.sendKeys('Control+q');
  restartDriver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 100,
    rows: 36,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      COLORTERM: 'truecolor',
      INVAR_AGENT_BACKEND: 'echo',
    },
  });
  await HarnessSmoke.Class.awaitStatus(
    restartDriver,
    statusPath,
    'the restarted app restores the pointer-dragged activity order',
    (status) =>
      status.ready === true &&
      JSON.stringify(status.activityBarItemIdentifiers) ===
        JSON.stringify(draggedActivityOrder),
    15_000,
  );
  const restartedSnapshot = await restartDriver.awaitGridCondition(
    'the restarted activity bar paints Git above Explorer',
    (candidate) =>
      glyphRow(candidate, 'G') >= 0 &&
      glyphRow(candidate, 'F') > glyphRow(candidate, 'G'),
  );
  HarnessSmoke.Class.requireCondition(
    glyphRow(restartedSnapshot, 'G') < glyphRow(restartedSnapshot, 'F'),
    'the dragged activity order persists visually after restart',
  );
  restartDriver.sendKeys('Control+q');
  console.log('smoke-activitybar-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await restartDriver?.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
