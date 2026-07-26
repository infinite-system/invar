#!/usr/bin/env bun
// Byte-level gutter-diff port: exact glyphs and RGB foreground colors are read from the production
// terminal emulator after real editor and GitWatcher drives.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

const modifiedColor = 0x6183bb;
const addedColor = 0x41a6b5;
const deletedColor = 0xdb4b4b;

function markerHasForeground(
  snapshot: HarnessSnapshot.Model,
  lineText: string,
  glyph: string,
  foreground: number,
): boolean {
  const linePosition = snapshot.findText(lineText);
  if (!linePosition || linePosition.column === 0) return false;
  const markerCell = snapshot.cell(linePosition.row, linePosition.column - 1);
  return (
    markerCell?.characters === glyph &&
    markerCell.isForegroundRgb &&
    markerCell.foreground === foreground
  );
}

function hasNoDiffMarker(snapshot: HarnessSnapshot.Model): boolean {
  for (let row = 0; row < snapshot.rows; row++) {
    for (let column = 4; column < snapshot.columns; column++) {
      const character = snapshot.cell(row, column)?.characters;
      if (character === '▎' || character === '▁') return false;
    }
  }
  return true;
}

async function openTrackedFile(
  driver: PtyTestDriver.Model,
  statusPath: string,
  trackedPath: string,
): Promise<void> {
  const snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('tracked.txt') !== null,
    15_000,
  );
  HarnessSmoke.Class.clickText(driver, snapshot, 'tracked.txt');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeBuffer === trackedPath',
    (status) => status.activeBuffer === trackedPath,
  );
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-gutter-diff-harness-'));
const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-gutter-diff-harness-home-'),
);
const trackedPath = join(fixtureRoot, 'tracked.txt');
const switchedTrackedPath = join(fixtureRoot, 'switched-modified.txt');
await Bun.write(trackedPath, 'alpha\nbeta\ngamma\n');
await Bun.write(switchedTrackedPath, 'before switch\nstable\n');
HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);
HarnessSmoke.Class.runGit(fixtureRoot, [
  'add',
  'tracked.txt',
  'switched-modified.txt',
]);
HarnessSmoke.Class.runGit(fixtureRoot, [
  '-c',
  'user.email=gutter-diff@example.test',
  '-c',
  'user.name=Gutter Diff Smoke',
  'commit',
  '-qm',
  'fixture',
]);
await Bun.write(switchedTrackedPath, 'after switch\nstable\n');

const editStatusPath = join(homeDirectory, 'edit-status.json');
const editDriver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 100,
  rows: 30,
  homeDirectory,
  environment: { TUI_STATUS_PATH: editStatusPath, COLORTERM: 'truecolor' },
});
let deleteDriver: PtyTestDriver.Model | null = null;

try {
  console.log('== harness gutter-diff: clean, modified, and added markers ==');
  await openTrackedFile(editDriver, editStatusPath, trackedPath);
  const cleanSnapshot = await editDriver.awaitGridCondition(
    'the clean tracked file paints without a diff glyph',
    (candidate) =>
      candidate.findText('alpha') !== null && hasNoDiffMarker(candidate),
  );
  HarnessSmoke.Class.requireCondition(
    hasNoDiffMarker(cleanSnapshot),
    'clean HEAD file has no diff glyph',
  );

  HarnessSmoke.Class.clickText(
    editDriver,
    cleanSnapshot,
    'switched-modified.txt',
  );
  await HarnessSmoke.Class.awaitStatus(
    editDriver,
    editStatusPath,
    'status condition: status.activeBuffer === switchedTrackedPath',
    (status) => status.activeBuffer === switchedTrackedPath,
  );
  await editDriver.awaitGridCondition(
    'the switched tracked file paints its marker after its HEAD refresh',
    (snapshot) =>
      markerHasForeground(snapshot, 'after switch', '▎', modifiedColor),
  );
  HarnessSmoke.Class.pass(
    'post-switch marker appears after the active document HEAD refresh',
  );

  editDriver.sendKeys('Control+PageUp');
  await HarnessSmoke.Class.awaitStatus(
    editDriver,
    editStatusPath,
    'status condition: status.activeBuffer === trackedPath',
    (status) => status.activeBuffer === trackedPath,
  );
  await editDriver.awaitGridCondition(
    'the original clean tracked file is visible again',
    (snapshot) =>
      snapshot.findText('alpha') !== null && hasNoDiffMarker(snapshot),
  );

  editDriver.sendKeys('End');
  editDriver.sendText('X');
  await editDriver.awaitSnapshot((snapshot) =>
    markerHasForeground(snapshot, 'alphaX', '▎', modifiedColor),
  );
  HarnessSmoke.Class.pass(
    'edited existing line paints the modified-colored ▎ glyph',
  );

  editDriver.sendKeys('Control+s');
  // AWAIT THE DISK, not the marker. The marker assertion above already passed BEFORE this save — the
  // buffer was modified either way — so waiting on it again is a vacuous predicate that the pre-action
  // state already satisfies. What the git commands below actually depend on is the file CONTENT being
  // written, and under gate load the save had not landed yet: `git commit` reported exit 1 with
  // "nothing to commit" on 2026-07-26 while passing solo. Poll the real dependency with a deadline.
  const savedFilePath = join(fixtureRoot, 'tracked.txt');
  const saveDeadline = performance.now() + 15_000;
  let savedContentObserved = false;
  while (performance.now() < saveDeadline) {
    const savedContent = await Bun.file(savedFilePath)
      .text()
      .catch(() => '');
    if (savedContent.includes('alphaX')) {
      savedContentObserved = true;
      break;
    }
    await Bun.sleep(10);
  }
  HarnessSmoke.Class.requireCondition(
    savedContentObserved,
    'the saved edit reaches tracked.txt on disk before HEAD is advanced',
  );
  await editDriver.awaitSnapshot((snapshot) =>
    markerHasForeground(snapshot, 'alphaX', '▎', modifiedColor),
  );
  HarnessSmoke.Class.pass(
    'modified marker converges after save and git reconciliation',
  );

  HarnessSmoke.Class.runGit(fixtureRoot, ['add', 'tracked.txt']);
  HarnessSmoke.Class.runGit(fixtureRoot, [
    '-c',
    'user.email=gutter-diff@example.test',
    '-c',
    'user.name=Gutter Diff Smoke',
    'commit',
    '-qm',
    'advance HEAD',
  ]);
  await Bun.write(join(fixtureRoot, 'zz-reconcile-trigger.txt'), 'reconcile\n');
  await editDriver.awaitSnapshot(
    (snapshot) => hasNoDiffMarker(snapshot),
    8_000,
  );
  HarnessSmoke.Class.pass(
    'external HEAD advance clears the marker after git reconciliation',
  );

  editDriver.sendKeys('End', 'Enter');
  editDriver.sendText('added line');
  await editDriver.awaitSnapshot((snapshot) =>
    markerHasForeground(snapshot, 'added line', '▎', addedColor),
  );
  HarnessSmoke.Class.pass(
    'appended buffer line paints the added-colored ▎ glyph',
  );
  await editDriver.dispose();

  console.log('== harness gutter-diff: deleted-line marker ==');
  HarnessSmoke.Class.runGit(fixtureRoot, [
    'checkout',
    '-q',
    '--',
    'tracked.txt',
  ]);
  const deleteStatusPath = join(homeDirectory, 'delete-status.json');
  deleteDriver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 100,
    rows: 30,
    homeDirectory,
    environment: { TUI_STATUS_PATH: deleteStatusPath, COLORTERM: 'truecolor' },
  });
  await openTrackedFile(deleteDriver, deleteStatusPath, trackedPath);
  deleteDriver.sendKeys('Down', 'Home', 'Backspace');
  await deleteDriver.awaitSnapshot((snapshot) =>
    markerHasForeground(snapshot, 'gamma', '▁', deletedColor),
  );
  HarnessSmoke.Class.pass(
    'removed line paints the deleted-colored ▁ hint on the following line',
  );

  deleteDriver.sendKeys('Control+q');
  console.log('smoke-gutter-diff-harness: ALL-PASS');
} finally {
  await editDriver.dispose();
  await deleteDriver?.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
