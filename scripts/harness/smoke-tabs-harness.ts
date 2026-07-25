#!/usr/bin/env bun
// Byte-level editor-tabs port: tab labels, breadcrumb, badge, dropdown, and arrow clicks use cells.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  awaitStatusPublication,
  pass,
  requireCondition,
} from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';

function badgePosition(
  textRows: readonly string[],
  totalTabCount: number,
): { column: number; row: number; text: string } | null {
  const totalText = String(totalTabCount);
  for (let row = 0; row < textRows.length; row++) {
    const cells = Array.from(textRows[row] ?? '');
    const slashColumn = cells.findIndex(
      (cell, column) =>
        cell === '/' && cells.slice(column + 1, column + 1 + totalText.length).join('') === totalText,
    );
    if (slashColumn < 0) continue;
    let startColumn = slashColumn;
    while (startColumn > 0 && /[0-9]/.test(cells[startColumn - 1] ?? '')) startColumn--;
    return {
      column: startColumn,
      row,
      text: cells.slice(startColumn, slashColumn + 1 + totalText.length).join(''),
    };
  }
  return null;
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-tabs-harness-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-tabs-harness-home-'));
const statusPath = join(fixtureRoot, 'status.json');
for (let fileNumber = 1; fileNumber <= 9; fileNumber++) {
  await Bun.write(join(fixtureRoot, `file-${fileNumber}.txt`), 'x\n');
}

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== harness tabs: open enough files to overflow the strip ==');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('file-1.txt') !== null, 15_000);
  for (let openAttempt = 1; openAttempt <= 30; openAttempt++) {
    const openingStatus = await awaitStatusPublication(
      statusPath,
      'the tab count and focus are published before opening another file',
      (status) => typeof status.bufferTabCount === 'number'
        && typeof status.focus === 'string',
    );
    if (Number(openingStatus.bufferTabCount) >= 8) break;
    if (openingStatus.focus !== 'files') {
      driver.sendKeys('Tab');
      await awaitStatusPublication(
        statusPath,
        "status condition: status.focus === 'files'",
        (status) => status.focus === 'files',
      );
    }
    const previousTabCount = Number(openingStatus.bufferTabCount);
    driver.sendKeys('Down', 'Enter');
    await awaitStatusPublication(
      statusPath,
      "status condition: Number(status.bufferTabCount) > previousTabCount",
      (status) => Number(status.bufferTabCount) > previousTabCount,
    );
  }
  const openedTabsStatus = await awaitStatusPublication(
    statusPath,
    'at least eight buffer tabs are published',
    (status) => Number(status.bufferTabCount) >= 8,
  );
  const tabCount = Number(openedTabsStatus.bufferTabCount);
  requireCondition(tabCount >= 8, `opened ${tabCount} tabs`);

  console.log('== harness tabs: filenames, close marks, and breadcrumb paint without dividers ==');
  let snapshot = await driver.awaitGridCondition(
    'the overflowed tab strip paints filenames, close marks, and the active breadcrumb',
    (candidate) => candidate.textRows().some(
      (rowText) => /[A-Za-z0-9_-]+\.[A-Za-z]+ +✕/.test(rowText),
    )
      && candidate.findText('›') !== null
      && !candidate.textRows().some((rowText) => /✕ *❯/.test(rowText)),
  );
  requireCondition(
    snapshot.textRows().some((rowText) => /[A-Za-z0-9_-]+\.[A-Za-z]+ +✕/.test(rowText)),
    'a buffer tab paints a filename and close mark',
  );
  requireCondition(snapshot.findText('›') !== null, 'breadcrumb row paints the active path');
  requireCondition(
    !snapshot.textRows().some((rowText) => /✕ *❯/.test(rowText)),
    'no arrow divides adjacent tabs',
  );

  console.log('== harness tabs: Ctrl+PageDown and Ctrl+PageUp cycle positionally ==');
  const startIndexStatus = await awaitStatusPublication(
    statusPath,
    'the active buffer index is published before positional cycling',
    (status) => typeof status.activeBufferIndex === 'number',
  );
  const startIndex = Number(startIndexStatus.activeBufferIndex);
  driver.sendKeys('Control+PageDown');
  await awaitStatusPublication(
    statusPath,
    'Ctrl+PageDown publishes the next active buffer index',
    (status) => status.activeBufferIndex === ((startIndex + 1) % tabCount),
  );
  pass('Ctrl+PageDown advanced exactly one tab with wrap');
  driver.sendKeys('Control+PageUp');
  await awaitStatusPublication(
    statusPath,
    'Ctrl+PageUp republishes the starting active buffer index',
    (status) => status.activeBufferIndex === startIndex,
  );
  pass('Ctrl+PageUp returned to the starting tab');

  console.log('== harness tabs: count badge opens the all-buffers dropdown ==');
  snapshot = await driver.awaitGridCondition(
    'the buffer count badge is visible after positional tab cycling',
    (candidate) => badgePosition(candidate.textRows(), tabCount) !== null,
  );
  const badge = badgePosition(snapshot.textRows(), tabCount);
  requireCondition(badge !== null, 'count badge is visible');
  requireCondition(badge.text.includes(`/${tabCount}`), `count badge shows total ${badge.text}`);
  driver.sendMouse({ kind: 'press', column: badge.column, row: badge.row, button: 'left' });
  driver.sendMouse({ kind: 'release', column: badge.column, row: badge.row, button: 'left' });
  await awaitStatusPublication(
    statusPath,
    'the all-buffers popup is published as open',
    (status) => status.boundedListPopupOpen === true,
  );
  pass('badge click opened the all-buffers dropdown');
  driver.sendKeys('Escape');
  await driver.awaitQuiescence();

  console.log('== harness tabs: right arrow pans without changing the active tab ==');
  for (let cycleAttempt = 0; cycleAttempt < tabCount; cycleAttempt++) {
    const cycleStatus = await awaitStatusPublication(
      statusPath,
      'the active buffer index is published during tab cycling',
      (status) => typeof status.activeBufferIndex === 'number',
    );
    if (cycleStatus.activeBufferIndex === 0) break;
    driver.sendKeys('Control+PageUp');
    await driver.awaitQuiescence();
  }
  const arrowBaselineStatus = await awaitStatusPublication(
    statusPath,
    'the active buffer index is published before panning the strip',
    (status) => typeof status.activeBufferIndex === 'number',
  );
  const activeIndexBeforeArrow = arrowBaselineStatus.activeBufferIndex;
  snapshot = await driver.awaitGridCondition(
    'the buffer count badge remains visible beside the tab pan arrows',
    (candidate) => badgePosition(candidate.textRows(), tabCount) !== null,
  );
  const refreshedBadge = badgePosition(snapshot.textRows(), tabCount);
  requireCondition(refreshedBadge !== null, 'count badge remains visible beside the pan arrows');
  driver.sendMouse({
    kind: 'press',
    column: refreshedBadge.column - 2,
    row: refreshedBadge.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: refreshedBadge.column - 2,
    row: refreshedBadge.row,
    button: 'left',
  });
  await awaitStatusPublication(
    statusPath,
    'the strip pan preserves the active buffer index',
    (status) => status.activeBufferIndex === activeIndexBeforeArrow,
  );
  pass('right arrow pans the strip without changing the active tab');

  driver.sendKeys('Control+q');
  console.log('smoke-tabs-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
