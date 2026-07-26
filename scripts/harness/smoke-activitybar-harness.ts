#!/usr/bin/env bun
// Byte-level port of the activity-bar contract: exact fallback glyphs, accent cells, and switched
// sidebar content come from the emulator grid; the active view remains a semantic status assertion.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)
// invariant: The active activity item determines the sidebar content (src/modules/ui/ui.invariants.md)
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

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-activitybar-harness-'));
const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-activitybar-harness-home-'),
);
const statusPath = join(homeDirectory, 'status.json');
await Bun.write(join(fixtureRoot, 'tree-marker.txt'), 'unchanged tree file\n');
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
  environment: { TUI_STATUS_PATH: statusPath, COLORTERM: 'truecolor' },
});

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
  HarnessSmoke.Class.pass(`Explorer glyph 'F' rendered (row ${filesRow})`);
  HarnessSmoke.Class.pass(`Source Control glyph 'G' rendered (row ${gitRow})`);
  HarnessSmoke.Class.pass(
    `Extensions glyph 'X' rendered (row ${extensionsRow})`,
  );

  console.log('== harness activitybar: initial Explorer state is coherent ==');
  const initialStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the activity bar boots on the Explorer view',
    (status) => status.sidebarView === 'files',
  );
  const pluginPrimaryDockContentIdentifiers =
    initialStatus.pluginPrimaryDockContentIdentifiers as string[];
  const expectedPrimaryDockContentIdentifiers =
    pluginPrimaryDockContentIdentifiers;
  HarnessSmoke.Class.requireCondition(
    pluginPrimaryDockContentIdentifiers.includes('files'),
    'the default plugin manifest declares the Explorer view',
  );
  HarnessSmoke.Class.requireCondition(
    pluginPrimaryDockContentIdentifiers.includes('git'),
    'the default plugin manifest declares the Source Control view',
  );
  HarnessSmoke.Class.requireCondition(
    JSON.stringify(initialStatus.activityBarItemIdentifiers) ===
      JSON.stringify(expectedPrimaryDockContentIdentifiers),
    'the activity bar item set contains every plugin-contributed view in order',
  );
  HarnessSmoke.Class.requireCondition(
    JSON.stringify(initialStatus.sidebarViewIdentifiers) ===
      JSON.stringify(expectedPrimaryDockContentIdentifiers),
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
  clickCell(driver, 1, filesRow);
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

  driver.sendKeys('Control+q');
  console.log('smoke-activitybar-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
