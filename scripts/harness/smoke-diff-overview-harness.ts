#!/usr/bin/env bun
// Byte-level port of the side-by-side diff contract: ruler colors, toolbar geometry, split movement,
// selection paint, and current-file content are emulator facts; exact selection bytes remain status.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

interface OverviewProof {
  column: number;
  modifiedRows: number[];
  addedRows: number[];
  deletedRows: number[];
  unchangedRow: number;
}

interface SelectionPosition {
  line: number;
  col: number;
}

interface DiffSelection {
  side: string;
  start: SelectionPosition;
  end: SelectionPosition;
}

const modifiedColor = 0x6183bb;
const addedColor = 0x41a6b5;
const deletedColor = 0xdb4b4b;
const selectionColor = 0x2b2f41;

function overviewProof(snapshot: HarnessSnapshot.Model): OverviewProof | null {
  for (let column = snapshot.columns - 1; column >= Math.max(0, snapshot.columns - 8); column--) {
    const modifiedRows: number[] = [];
    const addedRows: number[] = [];
    const deletedRows: number[] = [];
    for (let row = 0; row < snapshot.rows; row++) {
      const cell = snapshot.cell(row, column);
      if (!cell?.isBackgroundRgb) continue;
      if (cell.background === modifiedColor) modifiedRows.push(row);
      if (cell.background === addedColor) addedRows.push(row);
      if (cell.background === deletedColor) deletedRows.push(row);
    }
    if (modifiedRows.length === 0 || addedRows.length === 0 || deletedRows.length === 0) continue;
    const trackTop = 2;
    const trackBottom = snapshot.rows - 2;
    const trackExtent = Math.max(1, trackBottom - trackTop);
    const modifiedPosition = ((modifiedRows[0] ?? trackBottom) - trackTop) / trackExtent;
    const addedPosition = ((addedRows[0] ?? trackBottom) - trackTop) / trackExtent;
    const deletedPosition = ((deletedRows.at(-1) ?? trackTop) - trackTop) / trackExtent;
    const unchangedRow = trackTop + Math.floor(trackExtent / 4);
    const unchangedCell = snapshot.cell(unchangedRow, column);
    const unchangedIsChange = unchangedCell?.isBackgroundRgb
      && [modifiedColor, addedColor, deletedColor].includes(unchangedCell.background);
    if (
      modifiedPosition < 0.2
      && addedPosition > 0.35
      && addedPosition < 0.65
      && deletedPosition > 0.8
      && !unchangedIsChange
    ) {
      return { column, modifiedRows, addedRows, deletedRows, unchangedRow };
    }
  }
  return null;
}

function selectionPaintedRowCount(snapshot: HarnessSnapshot.Model): number {
  let paintedRowCount = 0;
  for (let row = 0; row < snapshot.rows; row++) {
    if (
      snapshot.rowCells(row).some(
        (cell) => cell.isBackgroundRgb && cell.background === selectionColor,
      )
    ) {
      paintedRowCount++;
    }
  }
  return paintedRowCount;
}

async function openDiff(
  driver: PtyTestDriver.Model,
  statusPath: string,
): Promise<HarnessSnapshot.Model> {
  driver.sendKeys('Control+g');
  await HarnessSmoke.Class.awaitStatus(driver, statusPath, "status condition: status.focus === 'git'",
                                                           (status) => status.focus === 'git');
  driver.sendKeys('o');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.showingDiff === true",
    (status) => status.showingDiff === true,
  );
  return driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Base (HEAD)') !== null
      && snapshot.findText('Current (working)') !== null,
  );
}

function selectedText(status: StatusSnapshot, currentText: string): string {
  const selection = status.diffSelection as DiffSelection | null;
  if (!selection || selection.side !== 'current') {
    throw new Error('Selection is not in the current pane');
  }
  const lines = currentText.split('\n');
  if (selection.start.line === selection.end.line) {
    return (lines[selection.start.line] ?? '').slice(selection.start.col, selection.end.col);
  }
  const selectedParts = [
    (lines[selection.start.line] ?? '').slice(selection.start.col),
    ...lines.slice(selection.start.line + 1, selection.end.line),
    (lines[selection.end.line] ?? '').slice(0, selection.end.col),
  ];
  return selectedParts.join('\n');
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-diff-overview-harness-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-diff-overview-harness-home-'));
const statusPath = join(homeDirectory, 'status.json');
const currentPath = join(fixtureRoot, 'long.txt');
const originalLines = Array.from(
  { length: 120 },
  (_unused, lineIndex) => `line ${String(lineIndex + 1).padStart(3, '0')} original content for selection`,
);
await Bun.write(currentPath, `${originalLines.join('\n')}\n`);
HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);
HarnessSmoke.Class.runGit(fixtureRoot, ['add', 'long.txt']);
HarnessSmoke.Class.runGit(fixtureRoot, [
  '-c',
  'user.email=diff-overview@example.test',
  '-c',
  'user.name=Diff Overview Smoke',
  'commit',
  '-qm',
  'fixture',
]);
const changedLines = [...originalLines];
changedLines[4] = changedLines[4]?.replace('original', 'modified') ?? '';
changedLines.splice(60, 0, 'line 060 added content for overview');
changedLines.splice(115, 1);
await Bun.write(currentPath, `${changedLines.join('\n')}\n`);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath, COLORTERM: 'truecolor' },
});

try {
  console.log('== harness diff-overview: open a real long working-tree diff ==');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('long.txt') !== null, 15_000);
  let snapshot = await openDiff(driver, statusPath);
  HarnessSmoke.Class.pass('git panel opened the changed file in DiffView');

  console.log('== harness diff-overview: ruler locates top, middle, and bottom changes ==');
  snapshot = await driver.awaitSnapshot((candidate) => overviewProof(candidate) !== null);
  const rulerProof = overviewProof(snapshot);
  if (!rulerProof) throw new Error('Overview proof vanished');
  HarnessSmoke.Class.pass(
    `ruler column ${rulerProof.column}: modified=${rulerProof.modifiedRows.join(',')}, `
    + `added=${rulerProof.addedRows.join(',')}, deleted=${rulerProof.deletedRows.join(',')}; `
    + `unchanged row ${rulerProof.unchangedRow} is clear`,
  );

  console.log('== harness diff-overview: toolbar labels and Next placement ==');
  const baseTitlePosition = snapshot.findText('Base (HEAD)');
  const currentTitlePosition = snapshot.findText('Current (working)');
  const openCurrentPosition = snapshot.findText('Open current');
  const nextPosition = snapshot.findText('Next');
  HarnessSmoke.Class.requireCondition(
    baseTitlePosition !== null
      && currentTitlePosition !== null
      && openCurrentPosition !== null
      && nextPosition !== null
      && currentTitlePosition.column > baseTitlePosition.column
      && openCurrentPosition.column >= currentTitlePosition.column,
    'Base is left, Current is right, and Open current is over current',
  );
  if (!currentTitlePosition || !openCurrentPosition || !nextPosition) {
    throw new Error('Toolbar positions vanished');
  }
  const nextBaselineStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the aligned diff offset is published before clicking Next',
    (status) => typeof status.diffScrollTop === 'number',
  );
  const scrollBeforeNext = Number(nextBaselineStatus.diffScrollTop);
  driver.sendMouse({
    kind: 'press',
    column: nextPosition.column + 1,
    row: nextPosition.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: nextPosition.column + 1,
    row: nextPosition.row,
    button: 'left',
  });
  const nextStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: Number(status.diffScrollTop) > scrollBeforeNext",
    (status) => Number(status.diffScrollTop) > scrollBeforeNext,
  );
  HarnessSmoke.Class.pass(
    `clicking Next advanced the aligned diff offset `
    + `(${scrollBeforeNext} -> ${nextStatus.diffScrollTop})`,
  );

  console.log('== harness diff-overview: divider drag persists to a second open ==');
  const currentColumnBeforeDrag = currentTitlePosition.column;
  const dividerColumn = currentColumnBeforeDrag - 2;
  const dragRow = currentTitlePosition.row + 7;
  driver.sendMouse({ kind: 'press', column: dividerColumn, row: dragRow, button: 'left' });
  driver.sendMouse({
    kind: 'move',
    column: dividerColumn + 14,
    row: dragRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: dividerColumn + 14,
    row: dragRow,
    button: 'left',
  });
  snapshot = await driver.awaitSnapshot((candidate) => {
    const position = candidate.findText('Current (working)');
    return position !== null
      && position.column > currentColumnBeforeDrag;
  });
  const persistedRatioStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the divider drag publishes a diff split ratio above one half',
    (status) => Number(status.diffSplitRatio) > 0.5,
  );
  const currentColumnAfterDrag = snapshot.findText('Current (working)')?.column ?? -1;
  const persistedRatio = persistedRatioStatus.diffSplitRatio;
  HarnessSmoke.Class.pass(
    `divider drag moved current pane right `
    + `(${currentColumnBeforeDrag} -> ${currentColumnAfterDrag}), ratio=${persistedRatio}`,
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(driver, statusPath, "status condition: status.showingDiff === false",
                                                           (status) => status.showingDiff === false);
  snapshot = await openDiff(driver, statusPath);
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('Current (working)')?.column === currentColumnAfterDrag,
    `second diff reused the persisted split column ${currentColumnAfterDrag}`,
  );

  console.log('== harness diff-overview: held edge drag scrolls, paints, and copies exact text ==');
  const reopenedCurrentPosition = snapshot.findText('Current (working)');
  if (!reopenedCurrentPosition) throw new Error('Current title missing after reopen');
  const selectionColumn = reopenedCurrentPosition.column + 7;
  const selectionPressRow = reopenedCurrentPosition.row + 3;
  driver.sendMouse({
    kind: 'press',
    column: selectionColumn,
    row: selectionPressRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'move',
    column: selectionColumn,
    row: 30,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'move',
    column: selectionColumn,
    row: 37,
    button: 'left',
  });
  const draggedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: Number(status.diffScrollTop) > 0 && Number(status.diffSelectionChars) > 200",
    (status) => Number(status.diffScrollTop) > 0 && Number(status.diffSelectionChars) > 200,
  );
  driver.sendMouse({
    kind: 'release',
    column: selectionColumn,
    row: 37,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: selectionColumn,
    row: 37,
    button: 'left',
  });
  snapshot = await driver.awaitSnapshot(
    (candidate) => selectionPaintedRowCount(candidate) > 10,
  );
  const completedSelectionStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the released diff selection publishes its final character count',
    (status) => Number(status.diffSelectionChars)
      >= Number(draggedStatus.diffSelectionChars),
  );
  const selectionCharacterCount = Number(completedSelectionStatus.diffSelectionChars);
  HarnessSmoke.Class.pass(
    `held edge drag scrolled to ${draggedStatus.diffScrollTop} and selected `
    + `${selectionCharacterCount} chars across ${selectionPaintedRowCount(snapshot)} painted rows`,
  );

  driver.sendKeysWithoutFrameExpectation('Control+c');
  const copiedStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    "status condition: Number(status.lastCopyChars) > 0",
    (status) => Number(status.lastCopyChars) > 0,
  );
  const currentText = await Bun.file(currentPath).text();
  const expectedSelectedText = selectedText(copiedStatus, currentText);
  const expectedHash = createHash('sha256').update(expectedSelectedText).digest('hex');
  HarnessSmoke.Class.requireCondition(
    copiedStatus.lastCopyChars === expectedSelectedText.length
      && copiedStatus.lastCopyHash === expectedHash,
    `Ctrl+C delivered the exact selected span `
    + `(${expectedSelectedText.length} chars, SHA-256 matched)`,
  );

  console.log('== harness diff-overview: Open current opens the editable working file ==');
  const reopenedOpenCurrentPosition = snapshot.findText('Open current');
  if (!reopenedOpenCurrentPosition) throw new Error('Open current button missing');
  driver.sendMouse({
    kind: 'press',
    column: reopenedOpenCurrentPosition.column + 2,
    row: reopenedOpenCurrentPosition.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: reopenedOpenCurrentPosition.column + 2,
    row: reopenedOpenCurrentPosition.row,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.showingDiff === false && status.activeBuffer === currentPath",
    (status) => status.showingDiff === false && status.activeBuffer === currentPath,
  );
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('line 005 modified content') !== null,
  );
  HarnessSmoke.Class.pass('Open current dismissed the diff and opened working long.txt');

  driver.sendKeys('Control+q');
  console.log('smoke-diff-overview-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
