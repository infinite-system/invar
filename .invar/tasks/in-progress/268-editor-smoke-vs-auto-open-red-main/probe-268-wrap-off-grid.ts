#!/usr/bin/env bun
// Probe for #268: repeats smoke-editor-harness's opening walk (tree Down/Down,
// Enter until a buffer opens, Right, type X) and prints the emulator grid rows
// around the typed glyph, with column rulers. It shows WHERE the editor pane
// and its gutter actually sit after #237's markdown preview auto-open, versus
// the smoke's hard-coded gutter window slice(37, 44).
//
// Run: bun .invar/tasks/in-progress/268-editor-smoke-vs-auto-open-red-main/probe-268-wrap-off-grid.ts
// (from the repo root)
//
// Read: each printed row is `row NN |<grid text>`. The ruler lines mark every
// 10th column. Compare where the digits of the gutter numbers fall against
// columns 37-44. If they fall elsewhere, the smoke's fixed window is stale.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { awaitStatusPublication } from '../../../../scripts/harness/HarnessSmokeSupport';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';

const repositoryRoot = process.cwd();
const fixtureRoot = join(repositoryRoot, 'fixtures');
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-editor-probe-268-'));
const statusPath = join(homeDirectory, 'status.json');

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  repositoryRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  await awaitStatusPublication(
    statusPath,
    'the application is ready with an active workspace',
    (status) => status.ready === true && Boolean(status.activeWorkspace),
    15_000,
  );
  driver.sendKeys('Down');
  await driver.awaitScreenChange();
  driver.sendKeys('Down');
  await driver.awaitScreenChange();
  for (let openAttempt = 1; openAttempt <= 8; openAttempt++) {
    const openAttemptStatus = await awaitStatusPublication(
      statusPath,
      'the active buffer field is published during tree navigation',
      (status) => Object.hasOwn(status, 'activeBuffer'),
    );
    if (openAttemptStatus.activeBuffer) break;
    driver.sendKeys('Enter');
    await driver.awaitScreenChange();
    driver.sendKeys('Down');
    await driver.awaitScreenChange();
  }
  const openedBufferStatus = await awaitStatusPublication(
    statusPath,
    'tree navigation publishes an active buffer path',
    (status) =>
      typeof status.activeBuffer === 'string' && status.activeBuffer.length > 0,
  );
  console.log(`opened buffer: ${String(openedBufferStatus.activeBuffer)}`);

  driver.sendKeys('Right');
  await driver.awaitScreenChange();
  driver.sendText('X');
  const snapshot = await driver.awaitSnapshot((candidate) => {
    const typedPosition = candidate.findText('X');
    return (
      typedPosition !== null &&
      candidate.cursorColumn === typedPosition.column + 1 &&
      candidate.cursorRow === typedPosition.row
    );
  });
  const typedPosition = snapshot.findText('X');
  console.log(
    `typed X at row ${typedPosition?.row}, column ${typedPosition?.column}`,
  );
  const tens = Array.from({ length: 120 }, (_u, c) =>
    c % 10 === 0 ? String((c / 10) % 10) : ' ',
  ).join('');
  const ones = Array.from({ length: 120 }, (_u, c) => String(c % 10)).join('');
  console.log(`        |${tens}`);
  console.log(`        |${ones}`);
  for (let row = 0; row < snapshot.rows; row++) {
    console.log(`row ${String(row).padStart(2)} |${snapshot.rowText(row)}`);
  }
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
