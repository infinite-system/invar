#!/usr/bin/env bun
// Byte-level move-line port: palette drives mutate the real editor and line order/caret come from cells.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { pass, requireCondition, runGit } from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';
import { HarnessSmoke } from './HarnessSmoke';

function lineRows(snapshot: HarnessSnapshot.Model): number[] | null {
  const lineMarkers = ['one', 'two', 'three'];
  const rows = lineMarkers.map(
    (lineMarker) => snapshot.findText(lineMarker)?.row ?? -1,
  );
  return rows.every((row) => row >= 0) ? rows : null;
}

function hasVisibleOrder(
  snapshot: HarnessSnapshot.Model,
  expectedLines: readonly string[],
): boolean {
  const positions = expectedLines.map((line) => snapshot.findText(line));
  return (
    positions.every((position) => position !== null) &&
    positions.every(
      (position, lineIndex) =>
        lineIndex === 0 || position!.row === positions[lineIndex - 1]!.row + 1,
    )
  );
}

async function runCommand(
  driver: PtyTestDriver.Model,
  commandTitle: string,
  predicate: (snapshot: HarnessSnapshot.Model) => boolean,
): Promise<HarnessSnapshot.Model> {
  driver.sendKeys('F1');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Command Palette') !== null,
  );
  driver.sendText(commandTitle);
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText(commandTitle) !== null,
  );
  driver.sendKeys('Enter');
  return driver.awaitSnapshot(predicate);
}

const unitResult = Bun.spawnSync(
  [process.execPath, 'test', 'src/modules/editor/EditorMoveLine.test.ts'],
  { stdout: 'pipe', stderr: 'pipe' },
);
requireCondition(unitResult.exitCode === 0, 'move-line unit tests pass');

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-move-line-harness-'));
const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-move-line-harness-home-'),
);
await Bun.write(join(fixtureRoot, 'sample.ts'), 'one\ntwo\nthree');
runGit(fixtureRoot, ['init', '-q']);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
});

try {
  console.log('== harness move line: quick-open the three-line fixture ==');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('sample.ts') !== null,
    15_000,
  );
  driver.sendKeys('Control+p');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Go to File') !== null,
  );
  driver.sendText('sample');
  driver.sendKeys('Enter');
  let snapshot = await driver.awaitSnapshot((candidate) =>
    hasVisibleOrder(candidate, ['one', 'two', 'three']),
  );
  driver.sendKeys('Tab');
  await driver.awaitScreenChange();
  const initialRows = lineRows(snapshot);
  requireCondition(initialRows !== null, 'initial order is one, two, three');

  console.log('== harness move line: Move Line Down follows the moved row ==');
  // The WAIT must cover the property the assertion reads. It used to terminate on the
  // visible TEXT ORDER alone and then assert on CURSOR ROW — but the caret is a separate
  // escape sequence that can arrive in a later frame, so under load the snapshot could
  // satisfy the order condition while the caret had not moved yet. That is why this
  // assertion is the pool's load canary, and why it hard-failed once the pool grew from
  // 31 to 51 jobs: nothing about the caret was ever proven before it was read.
  snapshot = await runCommand(driver, 'Move Line Down', (candidate) => {
    if (!hasVisibleOrder(candidate, ['two', 'one', 'three'])) return false;
    const candidatePosition = candidate.findText('one');
    return (
      candidatePosition !== null &&
      candidate.cursorRow === candidatePosition.row
    );
  });
  const movedOnePosition = snapshot.findText('one');
  requireCondition(
    movedOnePosition !== null && snapshot.cursorRow === movedOnePosition.row,
    'native caret follows the moved line to its new row',
  );

  console.log('== harness move line: one undo restores the complete move ==');
  driver.sendKeys('Control+z');
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      hasVisibleOrder(candidate, ['one', 'two', 'three']) &&
      candidate.cursorRow === candidate.findText('one')?.row,
  );
  requireCondition(
    snapshot.cursorRow === snapshot.findText('one')?.row,
    'one undo restores order and caret row',
  );

  console.log('== harness move line: Move Line Up at top is a no-op ==');
  snapshot = await runCommand(
    driver,
    'Move Line Up',
    (candidate) =>
      hasVisibleOrder(candidate, ['one', 'two', 'three']) &&
      candidate.cursorRow === candidate.findText('one')?.row,
  );
  requireCondition(
    snapshot.cursorRow === snapshot.findText('one')?.row,
    'top-edge move leaves order and caret unchanged',
  );

  console.log(
    '== harness move line: Duplicate Line inserts a copy and undo removes it ==',
  );
  snapshot = await runCommand(driver, 'Duplicate Line', (candidate) => {
    const oneRows = candidate
      .textRows()
      .map((text, row) => ({ text, row }))
      .filter(({ text }) => text.includes('one'))
      .map(({ row }) => row);
    return (
      oneRows.length >= 2 &&
      oneRows[1] === oneRows[0]! + 1 &&
      candidate.cursorRow === oneRows[1]
    );
  });
  const visibleOneRows = snapshot
    .textRows()
    .map((text, row) => ({ text, row }))
    .filter(({ text }) => text.includes('one'))
    .map(({ row }) => row);
  requireCondition(
    visibleOneRows.length >= 2 && snapshot.cursorRow === visibleOneRows[1],
    'duplicated line paints below and receives the caret',
  );
  driver.sendKeys('Control+z');
  await driver.awaitSnapshot((candidate) =>
    hasVisibleOrder(candidate, ['one', 'two', 'three']),
  );
  pass('one undo removes the duplicated line');

  driver.sendKeys('Control+q');
  console.log('smoke-move-line-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
