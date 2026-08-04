#!/usr/bin/env bun
// Byte-level selection port: click, hover, wheel, blur, and keyboard movement are asserted from the
// app's truecolor terminal cells rather than FrameProbe or tmux capture text.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';
import { HarnessSmoke } from './HarnessSmoke';

const focusedSelectionColor = 0x2b2f41;

const focusedChangesSelectionColor = 0x283457;

const unfocusedSelectionColor = 0x1e202e;

function pass(label: string): void {
  console.log(`  PASS  ${label}`);
}

function requireCondition(
  condition: unknown,
  label: string,
): asserts condition {
  if (!condition) throw new Error(`FAIL ${label}`);
  pass(label);
}

function markerHasBackground(
  snapshot: HarnessSnapshot.Model,
  marker: string,
  expectedBackground: number,
): boolean {
  for (let row = 0; row < snapshot.rows; row++) {
    const rowText = snapshot.rowText(row);
    let searchColumn = 0;
    while (searchColumn < snapshot.columns) {
      const column = rowText.indexOf(marker, searchColumn);
      if (column < 0) break;
      let allMarkerCellsMatch = true;
      for (let markerOffset = 0; markerOffset < marker.length; markerOffset++) {
        const cell = snapshot.cell(row, column + markerOffset);
        if (!cell?.isBackgroundRgb || cell.background !== expectedBackground) {
          allMarkerCellsMatch = false;
          break;
        }
      }
      if (allMarkerCellsMatch) return true;
      searchColumn = column + 1;
    }
  }
  return false;
}

function markerPosition(
  snapshot: HarnessSnapshot.Model,
  marker: string,
): { row: number; column: number } {
  const position = snapshot.findText(marker);
  if (!position)
    throw new Error(`Marker is not visible: ${marker}\n${snapshot.text()}`);
  return position;
}

function clickMarker(
  driver: PtyTestDriver.Model,
  snapshot: HarnessSnapshot.Model,
  marker: string,
): void {
  const position = markerPosition(snapshot, marker);
  driver.sendMouse({
    kind: 'press',
    column: position.column,
    row: position.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: position.column,
    row: position.row,
    button: 'left',
  });
}

function runGit(repositoryRoot: string, commandArguments: string[]): void {
  const result = Bun.spawnSync(['git', ...commandArguments], {
    cwd: repositoryRoot,
    // Pipe BOTH streams: git writes some failure reasons to stdout, and a
    // dropped stream turns a real red into `failed: ` with no reason.
    stdout: 'pipe',
    stderr: 'pipe',
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        ([key, value]) => value !== undefined && !key.startsWith('GIT_'),
      ),
    ) as Record<string, string>,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${commandArguments.join(' ')} failed (exit ${result.exitCode}); ` +
        `stderr: ${new TextDecoder().decode(result.stderr).trim()}; ` +
        `stdout: ${new TextDecoder().decode(result.stdout).trim()}`,
    );
  }
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-selection-harness-'));

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-selection-harness-home-'),
);

for (let directoryNumber = 1; directoryNumber <= 20; directoryNumber++) {
  mkdirSync(
    join(fixtureRoot, `directory-${String(directoryNumber).padStart(2, '0')}`),
  );
}

for (let fileNumber = 1; fileNumber <= 35; fileNumber++) {
  await Bun.write(
    join(fixtureRoot, `file-${String(fileNumber).padStart(2, '0')}.txt`),
    `base ${fileNumber}\n`,
  );
}

runGit(fixtureRoot, ['init', '-q']);

runGit(fixtureRoot, ['config', 'user.name', 'selection-harness']);

runGit(fixtureRoot, ['config', 'user.email', 'selection-harness@example.test']);

runGit(fixtureRoot, ['add', '.']);

runGit(fixtureRoot, ['commit', '-qm', 'base']);

for (let commitNumber = 1; commitNumber <= 24; commitNumber++) {
  const changedFilePath = join(fixtureRoot, 'file-35.txt');
  const existingText = await Bun.file(changedFilePath).text();
  await Bun.write(changedFilePath, `${existingText}${commitNumber}\n`);
  runGit(fixtureRoot, ['add', 'file-35.txt']);
  runGit(fixtureRoot, [
    'commit',
    '-qm',
    `commit-${String(commitNumber).padStart(2, '0')} selection subject`,
  ]);
}

for (let fileNumber = 1; fileNumber <= 25; fileNumber++) {
  const changedFilePath = join(
    fixtureRoot,
    `file-${String(fileNumber).padStart(2, '0')}.txt`,
  );
  const existingText = await Bun.file(changedFilePath).text();
  await Bun.write(changedFilePath, `${existingText}changed ${fileNumber}\n`);
}

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 100,
  rows: 36,
  homeDirectory,
});

try {
  console.log(
    '== harness selection: file tree owns one item-anchored selection ==',
  );
  let snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('directory-15') !== null,
    15_000,
  );
  pass('overflowing fixture booted through the real PTY');
  clickMarker(driver, snapshot, 'directory-15');
  snapshot = await driver.awaitSnapshot((candidate) =>
    markerHasBackground(candidate, 'directory-15', focusedSelectionColor),
  );
  pass('click paints the selected tree token with exact truecolor background');

  const hoverTarget = markerPosition(snapshot, 'directory-05');
  const treeHoverTargetRowBefore = JSON.stringify(
    snapshot.rowCells(hoverTarget.row),
  );
  driver.sendMouse({
    kind: 'move',
    column: hoverTarget.column,
    row: hoverTarget.row,
    button: 'none',
  });
  snapshot = await driver.awaitGridCondition(
    'hover decorates directory-05 while directory-15 stays selected',
    (candidate) =>
      JSON.stringify(candidate.rowCells(hoverTarget.row)) !==
        treeHoverTargetRowBefore &&
      markerHasBackground(candidate, 'directory-15', focusedSelectionColor),
  );
  pass('hover leaves the item selection anchored');

  const selectedTreePosition = markerPosition(snapshot, 'directory-15');
  driver.sendMouse({
    kind: 'wheel',
    column: selectedTreePosition.column,
    row: selectedTreePosition.row,
    direction: 'down',
  });
  snapshot = await driver.awaitGridCondition(
    'wheel moves directory-15 while its selected background stays painted',
    (candidate) =>
      candidate.findText('directory-15')?.row !== selectedTreePosition.row &&
      markerHasBackground(candidate, 'directory-15', focusedSelectionColor),
  );
  pass('wheel moves the viewport while the highlight travels with its item');

  driver.sendKeys('Tab');
  snapshot = await driver.awaitSnapshot((candidate) =>
    markerHasBackground(candidate, 'directory-15', unfocusedSelectionColor),
  );
  pass('blur preserves a dim truecolor selection');
  // Back INTO the tree from the editor: Tab indents there now, so the host focus chord returns.
  driver.sendKeys('Control+Shift+j');
  await driver.awaitScreenChange();
  driver.sendKeys('Down');
  snapshot = await driver.awaitSnapshot((candidate) =>
    markerHasBackground(candidate, 'directory-16', focusedSelectionColor),
  );
  pass('refocused keyboard movement resumes from the selected item');

  console.log(
    '== harness selection: changes and commit-log lists preserve the same contract ==',
  );
  driver.sendKeys('Control+g');
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('file-10.txt') !== null &&
      candidate.findText('commit-14') !== null,
    15_000,
  );
  const parkedPointerPosition = markerPosition(snapshot, 'file-10.txt');
  driver.sendMouse({
    kind: 'move',
    column: parkedPointerPosition.column,
    row: parkedPointerPosition.row,
    button: 'none',
  });
  const hoverBaselineSnapshot = await driver.awaitGridCondition(
    'the staging hover parks on file-10 before the row comparison',
    (candidate) =>
      markerHasBackground(candidate, 'file-10.txt', unfocusedSelectionColor),
  );
  const changesHoverTarget = markerPosition(
    hoverBaselineSnapshot,
    'file-05.txt',
  );
  const hoverTargetRowBefore = JSON.stringify(
    hoverBaselineSnapshot.rowCells(changesHoverTarget.row),
  );
  const rowAfterHoverTargetBefore = JSON.stringify(
    hoverBaselineSnapshot.rowCells(changesHoverTarget.row + 1),
  );
  driver.sendMouse({
    kind: 'move',
    column: changesHoverTarget.column,
    row: changesHoverTarget.row,
    button: 'none',
  });
  snapshot = await driver.awaitGridCondition(
    'the staging hover decorates its target row',
    (candidate) =>
      JSON.stringify(candidate.rowCells(changesHoverTarget.row)) !==
      hoverTargetRowBefore,
  );
  requireCondition(
    JSON.stringify(snapshot.rowCells(changesHoverTarget.row + 1)) ===
      rowAfterHoverTargetBefore,
    'staging hover leaves the following row byte-identical',
  );
  clickMarker(driver, snapshot, 'file-10.txt');
  snapshot = await driver.awaitGridCondition(
    'the clicked file opens while its dim selection stays painted',
    (candidate) =>
      candidate.findText('base 10') !== null &&
      markerHasBackground(candidate, 'file-10.txt', unfocusedSelectionColor),
  );
  pass('opening a clicked change preserves its dim selection');

  driver.sendKeys('Control+g');
  snapshot = await driver.awaitSnapshot((candidate) =>
    markerHasBackground(candidate, 'file-10.txt', focusedChangesSelectionColor),
  );
  pass('refocusing changes restores the exact focused background');
  // The repository panel has no Tab binding (the host floor may not grow its source-control
  // coupling), so the global focus chord is what blurs it.
  driver.sendKeys('Control+Shift+j');
  snapshot = await driver.awaitSnapshot((candidate) =>
    markerHasBackground(candidate, 'file-10.txt', unfocusedSelectionColor),
  );
  pass('changes selection remains visible on blur');
  driver.sendKeys('Control+g');
  await driver.awaitScreenChange();
  driver.sendKeys('Down');
  snapshot = await driver.awaitSnapshot((candidate) =>
    markerHasBackground(candidate, 'file-11.txt', focusedChangesSelectionColor),
  );
  pass('changes keyboard movement advances exactly one item');

  const commitPosition = markerPosition(snapshot, 'commit-14');
  driver.sendMouse({
    kind: 'press',
    column: commitPosition.column,
    row: commitPosition.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: commitPosition.column,
    row: commitPosition.row,
    button: 'left',
  });
  snapshot = await driver.awaitSnapshot((candidate) =>
    markerHasBackground(candidate, 'commit-14', focusedSelectionColor),
  );
  pass('commit click paints the selected commit token');
  const selectedCommitPosition = markerPosition(snapshot, 'commit-14');
  driver.sendMouse({
    kind: 'wheel',
    column: selectedCommitPosition.column,
    row: selectedCommitPosition.row,
    direction: 'down',
  });
  await driver.awaitGridCondition(
    'wheel moves commit-14 while its selected background stays painted',
    (candidate) =>
      candidate.findText('commit-14')?.row !== selectedCommitPosition.row &&
      markerHasBackground(candidate, 'commit-14', focusedSelectionColor),
  );
  pass('commit selection remains item-anchored across wheel scroll');
  driver.sendKeys('Control+Shift+j');
  await driver.awaitSnapshot((candidate) =>
    markerHasBackground(candidate, 'commit-14', unfocusedSelectionColor),
  );
  pass('commit selection stays visibly dimmed on blur');

  requireCondition(
    driver.snapshot().findText('commit-14') !== null,
    'all selection verdicts came from emulator text and background cells',
  );
  driver.sendKeys('Control+q');
  console.log('smoke-selection-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
