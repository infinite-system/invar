#!/usr/bin/env bun
// Drives the bounded list popup through both production adapters with real PTY keys, wheel, and clicks.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { HarnessSmoke } from './HarnessSmoke';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

interface PopupGeometryStatus {
  boxLeft: number;
  boxTop: number;
  boxWidth: number;
  boxHeight: number;
  bottomRow: number;
  opensUpward: boolean;
  listLeft: number;
  listTop: number;
  listColumns: number;
  listRows: number;
  firstVisible: number;
}

function popupGeometry(status: StatusSnapshot): PopupGeometryStatus | null {
  return status.boundedListPopupGeometry as PopupGeometryStatus | null;
}

function badgePosition(
  snapshot: HarnessSnapshot.Model,
  totalTabCount: number,
): { column: number; row: number } | null {
  const totalText = String(totalTabCount);
  for (let row = 0; row < snapshot.rows; row++) {
    const cells = Array.from(snapshot.rowText(row));
    const slashColumn = cells.findIndex(
      (cell, column) =>
        cell === '/'
        && cells.slice(column + 1, column + 1 + totalText.length).join('') === totalText,
    );
    if (slashColumn < 0) continue;
    let startColumn = slashColumn;
    while (startColumn > 0 && /[0-9]/.test(cells[startColumn - 1] ?? '')) {
      startColumn--;
    }
    return { column: startColumn, row };
  }
  return null;
}

function clickPosition(
  driver: PtyTestDriver.Model,
  position: { column: number; row: number },
): void {
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

function popupItemPosition(
  snapshot: HarnessSnapshot.Model,
  geometry: PopupGeometryStatus,
  itemText: string,
): { column: number; row: number } | null {
  for (
    let row = geometry.listTop;
    row < geometry.listTop + geometry.listRows;
    row++
  ) {
    const popupRowText = Array.from(snapshot.rowText(row))
      .slice(geometry.listLeft, geometry.listLeft + geometry.listColumns)
      .join('');
    const relativeColumn = popupRowText.indexOf(itemText);
    if (relativeColumn >= 0) {
      return { column: geometry.listLeft + relativeColumn, row };
    }
  }
  return null;
}

function popupListContains(
  snapshot: HarnessSnapshot.Model,
  geometry: PopupGeometryStatus,
  text: string,
): boolean {
  for (
    let row = geometry.listTop;
    row < geometry.listTop + geometry.listRows;
    row++
  ) {
    const popupRowText = Array.from(snapshot.rowText(row))
      .slice(geometry.listLeft, geometry.listLeft + geometry.listColumns)
      .join('');
    if (popupRowText.includes(text)) return true;
  }
  return false;
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-bounded-list-popup-harness-'));
const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-bounded-list-popup-harness-home-'),
);
const statusPath = join(homeDirectory, 'status.json');

for (let fileNumber = 1; fileNumber <= 100; fileNumber++) {
  const paddedFileNumber = String(fileNumber).padStart(3, '0');
  await Bun.write(
    join(fixtureRoot, `file-${paddedFileNumber}.txt`),
    `buffer ${paddedFileNumber}\n`,
  );
}
HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q', '-b', 'main']);
HarnessSmoke.Class.runGit(fixtureRoot, ['add', '-A']);
HarnessSmoke.Class.runGit(fixtureRoot, [
  '-c',
  'user.email=a@b.c',
  '-c',
  'user.name=x',
  'commit',
  '-q',
  '-m',
  'popup fixture root',
]);
for (let branchNumber = 1; branchNumber <= 30; branchNumber++) {
  HarnessSmoke.Class.runGit(
    fixtureRoot,
    ['branch', `branch-${String(branchNumber).padStart(3, '0')}`],
  );
}

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== bounded popup: build and open the 100-buffer fixture ==');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('file-001.txt') !== null,
    15_000,
  );
  for (let openAttempt = 0; openAttempt < 130; openAttempt++) {
    const openingStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the buffer count and focus are published before opening another fixture buffer',
      (status) => typeof status.bufferTabCount === 'number'
        && typeof status.focus === 'string',
    );
    const previousBufferCount = Number(openingStatus.bufferTabCount);
    if (previousBufferCount >= 100) break;
    if (openingStatus.focus !== 'files') {
      driver.sendKeys('Tab');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        "status condition: status.focus === 'files'",
        (status) => status.focus === 'files',
      );
    }
    driver.sendKeys('Down', 'Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      "status condition: Number(status.bufferTabCount) > previousBufferCount",
      (status) => Number(status.bufferTabCount) > previousBufferCount,
    );
  }
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the fixture publishes exactly 100 open buffers',
    (status) => status.bufferTabCount === 100,
  );
  HarnessSmoke.Class.pass('fixture exposes exactly 100 open buffers');
  driver.sendKeys('Control+PageDown');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.activeBufferIndex === 0",
    (status) => status.activeBufferIndex === 0,
  );

  let snapshot = await driver.awaitGridCondition(
    'the 100-buffer badge paints',
    (candidate) => badgePosition(candidate, 100) !== null,
  );
  const badge = badgePosition(snapshot, 100);
  HarnessSmoke.Class.requireCondition(badge !== null, '100-buffer badge is visible');
  if (!badge) throw new Error('Buffer badge vanished');
  clickPosition(driver, badge);
  let popupStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.boundedListPopupOpen === true && popupGeometry(status) !== null",
    (status) => status.boundedListPopupOpen === true
      && popupGeometry(status) !== null,
  );
  let geometry = popupGeometry(popupStatus);
  HarnessSmoke.Class.requireCondition(
    geometry !== null && geometry.bottomRow < 39,
    'popup bottom row stays strictly above the terminal bottom row',
  );
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('⌕') !== null
      && candidate.findText('file-001.txt') !== null,
  );
  HarnessSmoke.Class.pass('large-list search paints the themed unicode search glyph');

  console.log('== bounded popup: wheel reaches the tail through the shared viewport ==');
  if (!geometry) throw new Error('Popup geometry vanished');
  const popupWheelColumn = geometry.listLeft + Math.max(0, geometry.listColumns - 2);
  const popupWheelRow = geometry.listTop + Math.floor(geometry.listRows / 2);
  let tailVisible = false;
  for (let wheelNumber = 0; wheelNumber < 80; wheelNumber++) {
    driver.sendMouse({
      kind: 'wheel',
      column: popupWheelColumn,
      row: popupWheelRow,
      direction: 'down',
    });
    await driver.awaitQuiescence();
    snapshot = driver.snapshot();
    if (popupListContains(snapshot, geometry, 'file-100.txt')) {
      tailVisible = true;
      break;
    }
  }
  HarnessSmoke.Class.requireCondition(
    tailVisible,
    'wheel scrolling reveals the 100-buffer tail',
  );
  popupStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: (popupGeometry(status)?.firstVisible ?? 0) > 0",
    (status) => (popupGeometry(status)?.firstVisible ?? 0) > 0,
  );
  geometry = popupGeometry(popupStatus);
  HarnessSmoke.Class.requireCondition(
    geometry !== null && geometry.firstVisible > 0,
    'wheel scrolling moved the visible list window',
  );

  console.log('== bounded popup: live filter and keyboard selection ==');
  driver.sendText('file-073');
  popupStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.boundedListPopupQuery === 'file-073'",
    (status) => status.boundedListPopupQuery === 'file-073'
      && status.boundedListPopupMatches === 1,
  );
  geometry = popupGeometry(popupStatus);
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('⌕ file-073') !== null
      && geometry !== null
      && popupListContains(candidate, geometry, 'file-073.txt')
      && !popupListContains(candidate, geometry, 'file-072.txt'),
  );
  HarnessSmoke.Class.pass('the shared fuzzy scorer reduces the grid to one live match');
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.activeBufferIndex === 72 && status.boundedListPopupOpen === false",
    (status) => status.activeBufferIndex === 72
      && status.boundedListPopupOpen === false,
  );
  HarnessSmoke.Class.pass('keyboard Enter focuses the filtered buffer');

  console.log('== bounded popup: buffer mouse selection and outside dismissal ==');
  snapshot = await driver.awaitGridCondition(
    'the buffer badge remains available',
    (candidate) => badgePosition(candidate, 100) !== null,
  );
  const mouseSelectionBadge = badgePosition(snapshot, 100);
  if (!mouseSelectionBadge) throw new Error('Buffer badge vanished before mouse selection');
  clickPosition(driver, mouseSelectionBadge);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.boundedListPopupOpen === true",
    (status) => status.boundedListPopupOpen === true,
  );
  driver.sendText('file-025');
  popupStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.boundedListPopupQuery === 'file-025'",
    (status) => status.boundedListPopupQuery === 'file-025',
  );
  geometry = popupGeometry(popupStatus);
  snapshot = await driver.awaitSnapshot(
    (candidate) => geometry !== null
      && popupListContains(candidate, geometry, 'file-025.txt')
      && !popupListContains(candidate, geometry, 'file-024.txt'),
  );
  const bufferItem = geometry
    ? popupItemPosition(snapshot, geometry, 'file-025.txt')
    : null;
  HarnessSmoke.Class.requireCondition(bufferItem !== null, 'filtered buffer row is visible');
  if (!bufferItem) throw new Error('Filtered buffer row vanished');
  clickPosition(driver, bufferItem);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.activeBufferIndex === 24 && status.boundedListPopupOpen === false",
    (status) => status.activeBufferIndex === 24
      && status.boundedListPopupOpen === false,
  );
  HarnessSmoke.Class.pass('mouse click focuses the filtered buffer');

  snapshot = await driver.awaitGridCondition(
    'the buffer badge remains available for outside-dismiss coverage',
    (candidate) => badgePosition(candidate, 100) !== null,
  );
  const dismissalBadge = badgePosition(snapshot, 100);
  if (!dismissalBadge) throw new Error('Buffer badge vanished before outside dismissal');
  clickPosition(driver, dismissalBadge);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.boundedListPopupOpen === true",
    (status) => status.boundedListPopupOpen === true,
  );
  clickPosition(driver, { column: 0, row: 39 });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.boundedListPopupOpen === false",
    (status) => status.boundedListPopupOpen === false,
  );
  HarnessSmoke.Class.pass('click outside dismisses without activating a row');

  console.log('== bounded popup: branch adapter keyboard and mouse selection ==');
  driver.sendKeys('Control+g');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('history: main') !== null,
  );
  HarnessSmoke.Class.clickText(driver, snapshot, 'history: main', 7);
  popupStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.boundedListPopupOpen === true && popupGeometry(status) !== null",
    (status) => status.boundedListPopupOpen === true
      && popupGeometry(status) !== null,
  );
  geometry = popupGeometry(popupStatus);
  HarnessSmoke.Class.requireCondition(
    geometry?.opensUpward === true,
    'low branch-selector anchor opens the popup upward',
  );
  driver.sendText('branch-011');
  popupStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.boundedListPopupQuery === 'branch-011'",
    (status) => status.boundedListPopupQuery === 'branch-011',
  );
  geometry = popupGeometry(popupStatus);
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('⌕ branch-011') !== null
      && geometry !== null
      && popupListContains(candidate, geometry, 'branch-011')
      && !popupListContains(candidate, geometry, 'branch-010'),
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.gitLogBranch === 'branch-011' && status.boundedListPopupOpen === false",
    (status) => status.gitLogBranch === 'branch-011'
      && status.boundedListPopupOpen === false,
  );
  HarnessSmoke.Class.pass('keyboard search and Enter select the viewed branch');

  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.gitLogBranch === ''",
    (status) => status.gitLogBranch === '',
  );
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('history: main') !== null,
  );
  HarnessSmoke.Class.clickText(driver, snapshot, 'history: main', 7);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.boundedListPopupOpen === true",
    (status) => status.boundedListPopupOpen === true,
  );
  driver.sendText('branch-007');
  popupStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.boundedListPopupQuery === 'branch-007'",
    (status) => status.boundedListPopupQuery === 'branch-007',
  );
  geometry = popupGeometry(popupStatus);
  snapshot = await driver.awaitSnapshot(
    (candidate) => geometry !== null
      && popupListContains(candidate, geometry, 'branch-007')
      && !popupListContains(candidate, geometry, 'branch-006'),
  );
  const branchItem = geometry
    ? popupItemPosition(snapshot, geometry, 'branch-007')
    : null;
  HarnessSmoke.Class.requireCondition(branchItem !== null, 'filtered branch row is visible');
  if (!branchItem) throw new Error('Filtered branch row vanished');
  clickPosition(driver, branchItem);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.gitLogBranch === 'branch-007' && status.boundedListPopupOpen === false",
    (status) => status.gitLogBranch === 'branch-007'
      && status.boundedListPopupOpen === false,
  );
  HarnessSmoke.Class.pass('mouse click selects the viewed branch');
  HarnessSmoke.Class.requireCondition(
    HarnessSmoke.Class.runGit(fixtureRoot, ['branch', '--show-current']) === 'main',
    'branch popup remains a read-only history viewer',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-bounded-list-popup-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
