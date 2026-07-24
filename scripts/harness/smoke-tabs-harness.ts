#!/usr/bin/env bun
// Byte-level editor-tabs port: tab labels, breadcrumb, badge, dropdown, and arrow clicks use cells.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pass, requireCondition, statusField } from './HarnessSmokeSupport';
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
    if ((statusField<number>(statusPath, 'bufferTabCount') ?? 0) >= 8) break;
    if (statusField<string>(statusPath, 'focus') !== 'files') {
      driver.sendKeys('Tab');
      await driver.awaitQuiescence();
    }
    driver.sendKeys('Down');
    await driver.awaitQuiescence();
    driver.sendKeys('Enter');
    await driver.awaitQuiescence();
  }
  let snapshot = driver.snapshot();
  const tabCount = statusField<number>(statusPath, 'bufferTabCount') ?? 0;
  requireCondition(tabCount >= 8, `opened ${tabCount} tabs`);

  console.log('== harness tabs: filenames, close marks, and breadcrumb paint without dividers ==');
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
  const startIndex = statusField<number>(statusPath, 'activeBufferIndex') ?? 0;
  driver.sendKeys('Control+PageDown');
  await driver.awaitSnapshot(
    () => statusField<number>(statusPath, 'activeBufferIndex')
      === ((startIndex + 1) % tabCount),
  );
  pass('Ctrl+PageDown advanced exactly one tab with wrap');
  driver.sendKeys('Control+PageUp');
  await driver.awaitSnapshot(
    () => statusField<number>(statusPath, 'activeBufferIndex') === startIndex,
  );
  pass('Ctrl+PageUp returned to the starting tab');

  console.log('== harness tabs: count badge opens the all-buffers dropdown ==');
  snapshot = driver.snapshot();
  const badge = badgePosition(snapshot.textRows(), tabCount);
  requireCondition(badge !== null, 'count badge is visible');
  requireCondition(badge.text.includes(`/${tabCount}`), `count badge shows total ${badge.text}`);
  driver.sendMouse({ kind: 'press', column: badge.column, row: badge.row, button: 'left' });
  driver.sendMouse({ kind: 'release', column: badge.column, row: badge.row, button: 'left' });
  await driver.awaitSnapshot(
    () => statusField<boolean>(statusPath, 'contextMenuOpen') === true,
  );
  pass('badge click opened the all-buffers dropdown');
  driver.sendKeys('Escape');
  await driver.awaitQuiescence();

  console.log('== harness tabs: right arrow pans without changing the active tab ==');
  for (let cycleAttempt = 0; cycleAttempt < tabCount; cycleAttempt++) {
    if (statusField<number>(statusPath, 'activeBufferIndex') === 0) break;
    driver.sendKeys('Control+PageUp');
    await driver.awaitQuiescence();
  }
  const activeIndexBeforeArrow = statusField<number>(statusPath, 'activeBufferIndex');
  snapshot = driver.snapshot();
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
  await driver.awaitQuiescence();
  requireCondition(
    statusField<number>(statusPath, 'activeBufferIndex') === activeIndexBeforeArrow,
    'right arrow pans the strip without changing the active tab',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-tabs-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
