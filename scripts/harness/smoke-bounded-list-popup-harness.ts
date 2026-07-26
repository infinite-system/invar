#!/usr/bin/env bun
// Drives the bounded list popup through both production adapters with real PTY keys, wheel, and clicks.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { HarnessSmoke } from './HarnessSmoke';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';

// The search glyph comes from the SAME vocabulary the app paints from, never a literal. A smoke that
// hunts for a hardcoded glyph re-breaks on every vocabulary change, which contradicts the invariant
// that makes appearance data (the panel-heading smokes were decoupled the same way).
const themedSearchGlyph = ThemeIcons.Class.findIconsFor('unicode').search;

interface PopupGeometryStatus {
  boxLeft: number;
  boxTop: number;
  boxWidth: number;
  boxHeight: number;
  bottomRow: number;
  opensUpward: boolean;
  searchRow: number | null;
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
        cell === '/' &&
        cells.slice(column + 1, column + 1 + totalText.length).join('') ===
          totalText,
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

function cellAttributeSignature(
  snapshot: HarnessSnapshot.Model,
  position: { column: number; row: number },
): string {
  const cell = snapshot.cell(position.row, position.column);
  if (!cell) return 'missing';
  return [
    cell.foreground,
    cell.background,
    cell.isForegroundDefault,
    cell.isBackgroundDefault,
    cell.isBold,
    cell.isDim,
    cell.isUnderline,
    cell.isInverse,
  ].join(':');
}

const fixtureRoot = mkdtempSync(
  join(tmpdir(), 'tui-bounded-list-popup-harness-'),
);
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
  HarnessSmoke.Class.runGit(fixtureRoot, [
    'branch',
    `branch-${String(branchNumber).padStart(3, '0')}`,
  ]);
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
      (status) =>
        typeof status.bufferTabCount === 'number' &&
        typeof status.focus === 'string',
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
      'status condition: Number(status.bufferTabCount) > previousBufferCount',
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
    'status condition: status.activeBufferIndex === 0',
    (status) => status.activeBufferIndex === 0,
  );

  let snapshot = await driver.awaitGridCondition(
    'the 100-buffer badge paints',
    (candidate) => badgePosition(candidate, 100) !== null,
  );
  const badge = badgePosition(snapshot, 100);
  HarnessSmoke.Class.requireCondition(
    badge !== null,
    '100-buffer badge is visible',
  );
  if (!badge) throw new Error('Buffer badge vanished');
  clickPosition(driver, badge);
  let popupStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.boundedListPopupOpen === true && popupGeometry(status) !== null',
    (status) =>
      status.boundedListPopupOpen === true && popupGeometry(status) !== null,
  );
  let geometry = popupGeometry(popupStatus);
  HarnessSmoke.Class.requireCondition(
    geometry !== null && geometry.bottomRow < 39,
    'popup bottom row stays strictly above the terminal bottom row',
  );
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText(themedSearchGlyph) !== null &&
      candidate.findText('file-001.txt') !== null,
  );
  HarnessSmoke.Class.pass(
    'large-list search paints the themed unicode search glyph',
  );

  console.log('== bounded popup: search hover and pointer-sweep focus ==');
  if (!geometry || geometry.searchRow === null) {
    throw new Error('Popup search geometry vanished');
  }
  const searchCellColumn = geometry.listLeft;
  const searchCellRow = geometry.searchRow;
  const searchRestBackground = snapshot.cell(
    searchCellRow,
    searchCellColumn,
  )?.background;
  driver.sendMouse({
    kind: 'move',
    column: searchCellColumn,
    row: searchCellRow,
  });
  snapshot = await driver.awaitGridCondition(
    'the search row background changes on hover',
    (candidate) =>
      candidate.cell(searchCellRow, searchCellColumn)?.background !==
      searchRestBackground,
  );
  HarnessSmoke.Class.pass('search row is rest-muted and hover-lit');

  const sweptQuery = 'file-0';
  for (
    let queryCharacterIndex = 0;
    queryCharacterIndex < sweptQuery.length;
    queryCharacterIndex += 1
  ) {
    driver.sendMouseWithoutFrameExpectation({
      kind: 'move',
      column: geometry.listLeft + 2,
      row:
        geometry.listTop +
        (queryCharacterIndex % Math.max(1, geometry.listRows)),
    });
    driver.sendText(sweptQuery[queryCharacterIndex] ?? '');
    const expectedQuery = sweptQuery.slice(0, queryCharacterIndex + 1);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `the popup query contains ${expectedQuery} after a list-row sweep`,
      (status) => status.boundedListPopupQuery === expectedQuery,
    );
  }
  HarnessSmoke.Class.pass(
    'every character lands while the pointer sweeps list rows',
  );

  console.log('== bounded popup: filtered navigation wraps and reveals ==');
  driver.sendKeys('Up');
  popupStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Up from the filtered first item wraps to the filtered last item',
    (status) =>
      status.boundedListPopupSelected ===
        Number(status.boundedListPopupMatches) - 1 &&
      (popupGeometry(status)?.firstVisible ?? 0) > 0,
  );
  geometry = popupGeometry(popupStatus);
  HarnessSmoke.Class.requireCondition(
    geometry !== null && geometry.firstVisible > 0,
    'upward wrap reveals the filtered tail',
  );
  driver.sendKeys('Down');
  popupStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Down from the filtered last item wraps to the filtered first item',
    (status) =>
      status.boundedListPopupSelected === 0 &&
      popupGeometry(status)?.firstVisible === 0,
  );
  geometry = popupGeometry(popupStatus);
  HarnessSmoke.Class.pass(
    'both wrap directions follow the active filtered window',
  );
  for (
    let queryCharacterIndex = 0;
    queryCharacterIndex < sweptQuery.length;
    queryCharacterIndex += 1
  ) {
    driver.sendKeys('Backspace');
  }
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the popup query clears before full-list scrolling',
    (status) => status.boundedListPopupQuery === '',
  );

  console.log(
    '== bounded popup: wheel reaches the tail through the shared viewport ==',
  );
  if (!geometry) throw new Error('Popup geometry vanished');
  const popupWheelColumn =
    geometry.listLeft + Math.max(0, geometry.listColumns - 2);
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
    'status condition: (popupGeometry(status)?.firstVisible ?? 0) > 0',
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
    (status) =>
      status.boundedListPopupQuery === 'file-073' &&
      status.boundedListPopupMatches === 1,
  );
  geometry = popupGeometry(popupStatus);
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText(`${themedSearchGlyph} file-073`) !== null &&
      geometry !== null &&
      popupListContains(candidate, geometry, 'file-073.txt') &&
      !popupListContains(candidate, geometry, 'file-072.txt'),
  );
  HarnessSmoke.Class.pass(
    'the shared fuzzy scorer reduces the grid to one live match',
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeBufferIndex === 72 && status.boundedListPopupOpen === false',
    (status) =>
      status.activeBufferIndex === 72 && status.boundedListPopupOpen === false,
  );
  HarnessSmoke.Class.pass('keyboard Enter focuses the filtered buffer');

  console.log(
    '== bounded popup: buffer mouse selection and outside dismissal ==',
  );
  snapshot = await driver.awaitGridCondition(
    'the buffer badge remains available',
    (candidate) => badgePosition(candidate, 100) !== null,
  );
  const mouseSelectionBadge = badgePosition(snapshot, 100);
  if (!mouseSelectionBadge)
    throw new Error('Buffer badge vanished before mouse selection');
  clickPosition(driver, mouseSelectionBadge);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.boundedListPopupOpen === true',
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
    (candidate) =>
      geometry !== null &&
      popupListContains(candidate, geometry, 'file-025.txt') &&
      !popupListContains(candidate, geometry, 'file-024.txt'),
  );
  const bufferItem = geometry
    ? popupItemPosition(snapshot, geometry, 'file-025.txt')
    : null;
  HarnessSmoke.Class.requireCondition(
    bufferItem !== null,
    'filtered buffer row is visible',
  );
  if (!bufferItem) throw new Error('Filtered buffer row vanished');
  clickPosition(driver, bufferItem);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.activeBufferIndex === 24 && status.boundedListPopupOpen === false',
    (status) =>
      status.activeBufferIndex === 24 && status.boundedListPopupOpen === false,
  );
  HarnessSmoke.Class.pass('mouse click focuses the filtered buffer');

  snapshot = await driver.awaitGridCondition(
    'the buffer badge remains available for outside-dismiss coverage',
    (candidate) => badgePosition(candidate, 100) !== null,
  );
  const dismissalBadge = badgePosition(snapshot, 100);
  if (!dismissalBadge)
    throw new Error('Buffer badge vanished before outside dismissal');
  clickPosition(driver, dismissalBadge);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.boundedListPopupOpen === true',
    (status) => status.boundedListPopupOpen === true,
  );
  clickPosition(driver, { column: 0, row: 39 });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.boundedListPopupOpen === false',
    (status) => status.boundedListPopupOpen === false,
  );
  HarnessSmoke.Class.pass('click outside dismisses without activating a row');

  console.log(
    '== bounded popup: breadcrumb hover, drill navigation, and file activation ==',
  );
  const pickerSourceDirectory = join(fixtureRoot, 'picker-source');
  const pickerNestedDirectory = join(pickerSourceDirectory, 'picker-nested');
  const pickerDeeperDirectory = join(pickerNestedDirectory, 'deeper');
  mkdirSync(pickerDeeperDirectory, { recursive: true });
  await Bun.write(
    join(pickerSourceDirectory, 'source-peer.txt'),
    'source peer\n',
  );
  await Bun.write(
    join(pickerNestedDirectory, 'breadcrumb-active.txt'),
    'BREADCRUMB PICKER ACTIVE CONTENT\n',
  );
  await Bun.write(
    join(pickerNestedDirectory, 'breadcrumb-target.txt'),
    'BREADCRUMB PICKER FILE CONTENT\n',
  );
  await Bun.write(
    join(pickerDeeperDirectory, 'deeper-file.txt'),
    'deeper file\n',
  );

  driver.sendKeys('Control+p');
  await driver.awaitGridCondition(
    'Quick Open is visible before opening the nested breadcrumb fixture',
    (candidate) => candidate.findText('Go to File') !== null,
  );
  driver.sendText('breadcrumb-active');
  await driver.awaitGridCondition(
    'Quick Open shows the nested breadcrumb fixture file',
    (candidate) =>
      candidate.findText(
        'picker-source/picker-nested/breadcrumb-active.txt',
      ) !== null,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the nested breadcrumb fixture file becomes the active buffer',
    (status) =>
      String(status.activeBuffer).endsWith(
        '/picker-source/picker-nested/breadcrumb-active.txt',
      ),
  );
  snapshot = await driver.awaitGridCondition(
    'the nested breadcrumb fixture path and content are visible',
    (candidate) =>
      candidate.findText(
        'picker-source › picker-nested › breadcrumb-active.txt',
      ) !== null &&
      candidate.findText('BREADCRUMB PICKER ACTIVE CONTENT') !== null,
  );
  const breadcrumbPathPosition = snapshot.findText(
    'picker-source › picker-nested › breadcrumb-active.txt',
  );
  if (!breadcrumbPathPosition) {
    throw new Error('Nested breadcrumb path vanished before hover');
  }
  const sourceSegmentPosition = {
    column: breadcrumbPathPosition.column,
    row: breadcrumbPathPosition.row,
  };
  const nestedSegmentPosition = {
    column:
      breadcrumbPathPosition.column + Array.from('picker-source › ').length,
    row: breadcrumbPathPosition.row,
  };
  const sourceRestAttributes = cellAttributeSignature(
    snapshot,
    sourceSegmentPosition,
  );
  const nestedRestAttributes = cellAttributeSignature(
    snapshot,
    nestedSegmentPosition,
  );
  driver.sendMouse({
    kind: 'move',
    column: sourceSegmentPosition.column,
    row: sourceSegmentPosition.row,
  });
  snapshot = await driver.awaitGridCondition(
    'the hovered source breadcrumb changes attributes while the nested control segment does not',
    (candidate) =>
      cellAttributeSignature(candidate, sourceSegmentPosition) !==
        sourceRestAttributes &&
      cellAttributeSignature(candidate, nestedSegmentPosition) ===
        nestedRestAttributes,
  );
  HarnessSmoke.Class.pass(
    'breadcrumb hover changes only the pointed segment attributes',
  );

  clickPosition(driver, sourceSegmentPosition);
  popupStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'clicking the source breadcrumb opens its bounded list popup',
    (status) =>
      status.boundedListPopupOpen === true && popupGeometry(status) !== null,
  );
  geometry = popupGeometry(popupStatus);
  snapshot = await driver.awaitGridCondition(
    'the source-level popup paints its directory and file entries',
    (candidate) =>
      geometry !== null &&
      popupListContains(candidate, geometry, 'picker-nested/') &&
      popupListContains(candidate, geometry, 'source-peer.txt'),
  );
  const nestedDirectoryItemPosition = geometry
    ? popupItemPosition(snapshot, geometry, 'picker-nested/')
    : null;
  const sourcePeerItemPosition = geometry
    ? popupItemPosition(snapshot, geometry, 'source-peer.txt')
    : null;
  HarnessSmoke.Class.requireCondition(
    nestedDirectoryItemPosition !== null &&
      sourcePeerItemPosition !== null &&
      cellAttributeSignature(snapshot, nestedDirectoryItemPosition) !==
        cellAttributeSignature(snapshot, sourcePeerItemPosition),
    'the current child directory opens pre-selected in observed cells',
  );

  driver.sendText('picker-nest');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the source-level breadcrumb query is published',
    (status) =>
      status.boundedListPopupQuery === 'picker-nest' &&
      status.boundedListPopupMatches === 1,
  );
  snapshot = await driver.awaitGridCondition(
    'the source-level query filters observed popup cells',
    (candidate) =>
      geometry !== null &&
      popupListContains(candidate, geometry, 'picker-nested/') &&
      !popupListContains(candidate, geometry, 'source-peer.txt'),
  );
  HarnessSmoke.Class.pass('typing filters the current breadcrumb level');

  driver.sendKeys('Enter');
  popupStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Enter drills into the selected directory and resets its query',
    (status) =>
      status.boundedListPopupOpen === true &&
      status.boundedListPopupQuery === '' &&
      status.boundedListPopupMatches === 3,
  );
  geometry = popupGeometry(popupStatus);
  snapshot = await driver.awaitGridCondition(
    'the drilled directory paints its real children',
    (candidate) =>
      geometry !== null &&
      popupListContains(candidate, geometry, 'deeper/') &&
      popupListContains(candidate, geometry, 'breadcrumb-active.txt') &&
      popupListContains(candidate, geometry, 'breadcrumb-target.txt'),
  );
  HarnessSmoke.Class.pass(
    'Enter re-roots the shared popup without dismissing it',
  );

  driver.sendKeys('Left');
  popupStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Left returns to the source directory with the child selected',
    (status) =>
      status.boundedListPopupOpen === true &&
      status.boundedListPopupQuery === '' &&
      status.boundedListPopupMatches === 2,
  );
  geometry = popupGeometry(popupStatus);
  snapshot = await driver.awaitGridCondition(
    'the parent directory cells return after Left',
    (candidate) =>
      geometry !== null &&
      popupListContains(candidate, geometry, 'picker-nested/') &&
      popupListContains(candidate, geometry, 'source-peer.txt'),
  );
  HarnessSmoke.Class.pass('Left drills back out one filesystem level');

  driver.sendKeys('Right');
  popupStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Right drills into the reselected child directory',
    (status) =>
      status.boundedListPopupOpen === true &&
      status.boundedListPopupQuery === '' &&
      status.boundedListPopupMatches === 3,
  );
  geometry = popupGeometry(popupStatus);
  await driver.awaitGridCondition(
    'the Right-drilled directory paints the target file again',
    (candidate) =>
      geometry !== null &&
      popupListContains(candidate, geometry, 'breadcrumb-target.txt'),
  );
  HarnessSmoke.Class.pass(
    'Right drills into the selected directory without dismissing',
  );
  driver.sendText('target');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the target-file query leaves one breadcrumb match',
    (status) =>
      status.boundedListPopupQuery === 'target' &&
      status.boundedListPopupMatches === 1,
  );
  await driver.awaitGridCondition(
    'the target file is the only observed popup row',
    (candidate) =>
      geometry !== null &&
      popupListContains(candidate, geometry, 'breadcrumb-target.txt') &&
      !popupListContains(candidate, geometry, 'breadcrumb-active.txt'),
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Enter opens the selected breadcrumb file and dismisses the popup',
    (status) =>
      String(status.activeBuffer).endsWith(
        '/picker-source/picker-nested/breadcrumb-target.txt',
      ) && status.boundedListPopupOpen === false,
  );
  snapshot = await driver.awaitGridCondition(
    'the opened breadcrumb target file content is visible in editor cells',
    (candidate) =>
      candidate.findText('BREADCRUMB PICKER FILE CONTENT') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('BREADCRUMB PICKER FILE CONTENT') !== null,
    'selecting a breadcrumb file opens its content in the editor',
  );

  console.log(
    '== bounded popup: branch adapter keyboard and mouse selection ==',
  );
  driver.sendKeys('Control+g');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('history: main') !== null,
  );
  HarnessSmoke.Class.clickText(driver, snapshot, 'history: main', 7);
  popupStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.boundedListPopupOpen === true && popupGeometry(status) !== null',
    (status) =>
      status.boundedListPopupOpen === true && popupGeometry(status) !== null,
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
    (candidate) =>
      candidate.findText(`${themedSearchGlyph} branch-011`) !== null &&
      geometry !== null &&
      popupListContains(candidate, geometry, 'branch-011') &&
      !popupListContains(candidate, geometry, 'branch-010'),
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.gitLogBranch === 'branch-011' && status.boundedListPopupOpen === false",
    (status) =>
      status.gitLogBranch === 'branch-011' &&
      status.boundedListPopupOpen === false,
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
    'status condition: status.boundedListPopupOpen === true',
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
    (candidate) =>
      geometry !== null &&
      popupListContains(candidate, geometry, 'branch-007') &&
      !popupListContains(candidate, geometry, 'branch-006'),
  );
  const branchItem = geometry
    ? popupItemPosition(snapshot, geometry, 'branch-007')
    : null;
  HarnessSmoke.Class.requireCondition(
    branchItem !== null,
    'filtered branch row is visible',
  );
  if (!branchItem) throw new Error('Filtered branch row vanished');
  clickPosition(driver, branchItem);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.gitLogBranch === 'branch-007' && status.boundedListPopupOpen === false",
    (status) =>
      status.gitLogBranch === 'branch-007' &&
      status.boundedListPopupOpen === false,
  );
  HarnessSmoke.Class.pass('mouse click selects the viewed branch');
  HarnessSmoke.Class.requireCondition(
    HarnessSmoke.Class.runGit(fixtureRoot, ['branch', '--show-current']) ===
      'main',
    'branch popup remains a read-only history viewer',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-bounded-list-popup-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
