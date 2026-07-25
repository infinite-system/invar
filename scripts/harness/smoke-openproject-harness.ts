#!/usr/bin/env bun
// Byte-level port of open-project navigation: the emulator proves selected rows stay painted and
// windowed while semantic status proves enumeration and responsiveness.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: The selected quick-open row is always visible (src/modules/search/search.invariants.md)
// invariant: The open-project path input is a live directory navigator (src/modules/search/search.invariants.md)
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function markerHasSelectionBackground(snapshot: HarnessSnapshot.Model, marker: string): boolean {
  const position = snapshot.findText(marker);
  if (!position) return false;
  const cell = snapshot.cell(position.row, position.column);
  return Boolean(cell && !cell.isBackgroundDefault);
}

const navigatorBase = mkdtempSync(join(tmpdir(), 'tui-openproject-harness-'));
const fixtureRoot = join(navigatorBase, 'proj');
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-openproject-harness-home-'));
const statusPath = join(homeDirectory, 'status.json');
mkdirSync(fixtureRoot);
HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);
await Bun.write(join(fixtureRoot, 'file.txt'), 'x\n');
for (let folderNumber = 0; folderNumber <= 39; folderNumber++) {
  mkdirSync(join(navigatorBase, `folder-${String(folderNumber).padStart(2, '0')}`));
}
symlinkSync('/nonexistent/definitely/not/here', join(navigatorBase, 'broken-link'));

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 130,
  rows: 44,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    NERD_FONT: '0',
    TERM_PROGRAM: 'xterm',
    LANG: 'C',
  },
});

try {
  console.log('== harness open-project: navigator enumerates without the broken symlink ==');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('file.txt') !== null, 15_000);
  driver.sendKeys('F1');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('Command Palette') !== null);
  driver.sendText('Open Folder');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('Open Folder') !== null);
  driver.sendKeys('Enter');
  const openedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.quickOpenMode === 'workspacePath'",
    (status) => status.quickOpenMode === 'workspacePath',
  );
  HarnessSmoke.Class.pass('the open-project navigator opened');
  HarnessSmoke.Class.requireCondition(
    openedStatus.quickOpenMatches === 41,
    'the listing has 41 folders (broken symlink skipped, no freeze)',
  );
  HarnessSmoke.Class.requireCondition(
    openedStatus.quickOpenSelected === 0,
    'the first folder is selected on open',
  );
  await driver.awaitGridCondition(
    'the first open-project folder is visibly selected',
    (candidate) => markerHasSelectionBackground(candidate, 'folder-00'),
  );

  console.log('== harness open-project: deep keyboard selection stays in the drawn window ==');
  for (let movementIndex = 0; movementIndex < 20; movementIndex++) driver.sendKeys('Down');
  const deepStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.quickOpenSelected === 20",
    (status) => status.quickOpenSelected === 20,
  );
  let snapshot = await driver.awaitSnapshot(
    (candidate) => markerHasSelectionBackground(candidate, 'folder-20'),
  );
  HarnessSmoke.Class.requireCondition(
    deepStatus.quickOpenSelected === 20,
    'arrowing down 20x advanced the selection (app stayed responsive)',
  );
  HarnessSmoke.Class.pass('the selected folder-20 is drawn with a selection background');
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('folder-00') === null,
    'the list scrolled and the original top row is off-screen',
  );

  console.log('== harness open-project: last row remains visible and wraps to the top ==');
  for (let movementIndex = 0; movementIndex < 20; movementIndex++) driver.sendKeys('Down');
  const lastFolderStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.quickOpenSelected === 40",
    (status) => status.quickOpenSelected === 40,
  );
  snapshot = await driver.awaitGridCondition(
    'the final proj folder is visibly selected',
    (candidate) => markerHasSelectionBackground(candidate, 'proj'),
  );
  HarnessSmoke.Class.requireCondition(
    lastFolderStatus.quickOpenSelected === 40,
    'reached the last folder (index 40), visible, never froze',
  );
  HarnessSmoke.Class.pass('the last folder is visible with a selection background');
  driver.sendKeys('Down');
  const wrappedFolderStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.quickOpenSelected === 0",
    (status) => status.quickOpenSelected === 0,
  );
  snapshot = await driver.awaitGridCondition(
    'the wrapped first folder is visibly selected',
    (candidate) => markerHasSelectionBackground(candidate, 'folder-00'),
  );
  HarnessSmoke.Class.requireCondition(
    wrappedFolderStatus.quickOpenSelected === 0,
    'arrowing past the last wraps back to the top (index 0)',
  );
  HarnessSmoke.Class.pass('after wrap the top folder is visible again with the selection background');

  console.log('== harness open-project: click drills into a visible folder ==');
  HarnessSmoke.Class.clickText(driver, snapshot, 'folder-05', 2);
  const drilledStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: String(status.quickOpenQuery).includes('folder-05/')",
    (status) => String(status.quickOpenQuery).includes('folder-05/'),
  );
  HarnessSmoke.Class.pass('clicking a folder drilled into it (path completed)');
  HarnessSmoke.Class.requireCondition(
    drilledStatus.quickOpenOpen === true,
    'the navigator stayed open and responsive after drilling in',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-openproject-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(navigatorBase, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
