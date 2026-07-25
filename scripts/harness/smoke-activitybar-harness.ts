#!/usr/bin/env bun
// Byte-level port of the activity-bar contract: exact fallback glyphs, accent cells, and switched
// sidebar content come from the emulator grid; the active view remains a semantic status assertion.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: The active activity item determines the sidebar content (src/modules/ui/ui.invariants.md)
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function glyphRow(snapshot: HarnessSnapshot.Model, glyph: string): number {
  for (let row = 0; row < snapshot.rows; row++) {
    if (snapshot.cell(row, 2)?.characters === glyph) return row;
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

function clickCell(driver: PtyTestDriver.Model, column: number, row: number): void {
  driver.sendMouse({ kind: 'press', column, row, button: 'left' });
  driver.sendMouse({ kind: 'release', column, row, button: 'left' });
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-activitybar-harness-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-activitybar-harness-home-'));
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
  console.log('== harness activitybar: fallback glyph tier renders every view ==');
  let snapshot = await driver.awaitSnapshot(
    (candidate) => glyphRow(candidate, 'F') >= 0
      && glyphRow(candidate, 'G') >= 0
      && glyphRow(candidate, 'X') >= 0
      && candidate.findText('tree-marker.txt') !== null,
    15_000,
  );
  const filesRow = glyphRow(snapshot, 'F');
  const gitRow = glyphRow(snapshot, 'G');
  const extensionsRow = glyphRow(snapshot, 'X');
  HarnessSmoke.Class.pass(`Explorer glyph 'F' rendered (row ${filesRow})`);
  HarnessSmoke.Class.pass(`Source Control glyph 'G' rendered (row ${gitRow})`);
  HarnessSmoke.Class.pass(`Extensions glyph 'X' rendered (row ${extensionsRow})`);

  console.log('== harness activitybar: initial Explorer state is coherent ==');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the activity bar boots on the Explorer view',
    (status) => status.sidebarView === 'files',
  );
  HarnessSmoke.Class.pass('boots on the Explorer view');
  HarnessSmoke.Class.requireCondition(
    snapshot.cell(filesRow, 0)?.characters === '|',
    'active accent sits on the Explorer icon row',
  );
  HarnessSmoke.Class.requireCondition(accentCount(snapshot) === 1, 'exactly one activity item is active');
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('tree-marker.txt') !== null,
    'Explorer view renders the file tree',
  );

  console.log('== harness activitybar: clicks switch view, accent, content, and badge ==');
  clickCell(driver, 1, gitRow);
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('Git') !== null
      && candidate.cell(gitRow, 0)?.characters === '|',
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
  HarnessSmoke.Class.requireCondition(accentCount(snapshot) === 1, 'still exactly one active item');
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
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('Coming soon') !== null
      && candidate.cell(extensionsRow, 0)?.characters === '|',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.sidebarView === 'extensions'",
    (status) => status.sidebarView === 'extensions',
  );
  HarnessSmoke.Class.pass('clicking Extensions switched the view');
  HarnessSmoke.Class.requireCondition(accentCount(snapshot) === 1, 'one item remains active on Extensions');
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('tree-marker.txt') === null,
    'the file tree is gone while Extensions is shown',
  );
  clickCell(driver, 1, filesRow);
  await driver.awaitSnapshot((candidate) => candidate.findText('tree-marker.txt') !== null);
  HarnessSmoke.Class.pass('clicking Explorer returned to the tree');

  console.log('== harness activitybar: Ctrl+Shift chords switch the same views ==');
  driver.sendKeys('Control+Shift+g');
  snapshot = await driver.awaitSnapshot((candidate) => candidate.cell(gitRow, 0)?.characters === '|');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.sidebarView === 'git'",
    (status) => status.sidebarView === 'git',
  );
  HarnessSmoke.Class.pass('Ctrl+Shift+G switched to Source Control');
  HarnessSmoke.Class.pass('chord moved the accent to Source Control');
  driver.sendKeys('Control+Shift+e');
  await driver.awaitSnapshot((candidate) => candidate.cell(filesRow, 0)?.characters === '|');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.sidebarView === 'files'",
    (status) => status.sidebarView === 'files',
  );
  HarnessSmoke.Class.pass('Ctrl+Shift+E switched to Explorer');
  driver.sendKeys('Control+Shift+x');
  await driver.awaitSnapshot((candidate) => candidate.findText('Coming soon') !== null);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.sidebarView === 'extensions'",
    (status) => status.sidebarView === 'extensions',
  );
  HarnessSmoke.Class.pass('Ctrl+Shift+X switched to Extensions and its content');

  console.log('== harness activitybar: Ctrl+Shift+B hides and restores the bar ==');
  driver.sendKeys('Control+Shift+e');
  await driver.awaitSnapshot((candidate) => accentCount(candidate) === 1);
  driver.sendKeys('Control+Shift+b');
  await driver.awaitSnapshot((candidate) => accentCount(candidate) === 0);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.showActivityBar === false",
    (status) => status.showActivityBar === false,
  );
  HarnessSmoke.Class.pass('Ctrl+Shift+B hid the bar and flipped the setting off');
  driver.sendKeys('Control+Shift+b');
  await driver.awaitSnapshot((candidate) => accentCount(candidate) >= 1);
  HarnessSmoke.Class.pass('Ctrl+Shift+B showed the bar again');

  driver.sendKeys('Control+q');
  console.log('smoke-activitybar-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
