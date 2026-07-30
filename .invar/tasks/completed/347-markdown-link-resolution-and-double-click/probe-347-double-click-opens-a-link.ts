#!/usr/bin/env bun
// What this finds out: whether a plain DOUBLE CLICK on a rendered Markdown link opens its target,
// whether a single click still only focuses and selects, and what a double click on an external
// link states. It drives the real application in the PTY harness against a temporary workspace and
// reports the active buffer and the link notice after each gesture.
//
// How to run it (from the repository root):
//   bun .invar/tasks/in-progress/347-markdown-link-resolution-and-double-click/probe-347-double-click-opens-a-link.ts
//
// How to read the output: every line is `PASS` or `FAIL` with the observed state. `single click
// left the source buffer` proves the existing single-click meaning survived. `double click opened`
// proves the new gesture. `external double click stated` proves an unopenable link still answers.
// A non-zero exit means at least one gesture did not behave.
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';
import type { HarnessSnapshot } from '../../../../scripts/harness/HarnessSnapshot';

const repositoryRoot = resolve(import.meta.dir, '../../../..');
let failureCount = 0;

function report(passed: boolean, message: string): void {
  if (!passed) failureCount++;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${message}`);
}

function previewMarkerPosition(
  snapshot: HarnessSnapshot.Model,
  marker: string,
): { row: number; column: number } {
  let previewLeft = 0;
  let previewRight = snapshot.columns;
  for (let row = 0; row < snapshot.rows; row++) {
    const left = snapshot.rowText(row).indexOf('╭─Preview');
    if (left < 0) continue;
    previewLeft = left;
    const right = snapshot.rowText(row).indexOf('╮', left + 1);
    previewRight = right < 0 ? snapshot.columns : right;
    break;
  }
  for (let row = 0; row < snapshot.rows; row++) {
    const column = snapshot.rowText(row).indexOf(marker, previewLeft);
    if (column >= 0 && column < previewRight) return { row, column };
  }
  throw new Error(`the preview never painted the marker: ${marker}`);
}

const workspaceRoot = mkdtempSync(join(tmpdir(), 'invar-probe-347-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-probe-347-home-'));
const settingsDirectory = join(homeDirectory, '.config', 'invar');
mkdirSync(settingsDirectory, { recursive: true });
await Bun.write(
  join(settingsDirectory, 'settings.json'),
  JSON.stringify({ theme: 'dark', markdownViewMode: 'split' }),
);
// The link sits one directory DOWN and points back UP through the parent, the authored shape a
// task record uses. A fixture that only links to a sibling cannot see the resolution defect.
const documentDirectory = join(workspaceRoot, 'notes');
mkdirSync(documentDirectory, { recursive: true });
await Bun.write(
  join(workspaceRoot, 'double-click-target.ts'),
  'export const openedByDoubleClick = true;\n',
);
await Bun.write(
  join(documentDirectory, 'README.md'),
  [
    '# Double click opens links',
    '',
    'Open [the up target](../double-click-target.ts) by double click.',
    '',
    'Or [the outside world](https://example.com/docs) which stays here.',
    '',
    'Plain prose that a double click must never activate.',
    '',
  ].join('\n'),
);

const statusPath = join(homeDirectory, 'status.json');
const driver = new PtyTestDriver.Class({
  workspaceRoot,
  repositoryRoot,
  columns: 160,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath, LANG: 'C.UTF-8' },
});

async function doubleClick(column: number, row: number): Promise<void> {
  driver.sendMouseWithoutFrameExpectation({ kind: 'press', column, row });
  driver.sendMouseWithoutFrameExpectation({ kind: 'release', column, row });
  await Bun.sleep(60);
  driver.sendMouseWithoutFrameExpectation({ kind: 'press', column, row });
  driver.sendMouseWithoutFrameExpectation({ kind: 'release', column, row });
}

try {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the application to become ready on the probe workspace',
    (status) => status.ready === true && Boolean(status.activeWorkspace),
  );
  // Open notes/README.md through the file tree: expand the folder, then activate the file.
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the notes folder to expand',
    (status) => Number(status.treeRows) > 1,
  );
  driver.sendKeys('Down');
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'README.md to open with a parsed preview',
    (status) =>
      String(status.activeBuffer).endsWith('/notes/README.md') &&
      status.markdownPreviewOpen === true &&
      status.markdownParsing === false,
  );
  const documentPath = String(
    HarnessSmoke.Class.readStatus(statusPath).activeBuffer,
  );

  const snapshot = await driver.awaitGridCondition(
    'the preview to paint both links',
    (candidate) =>
      candidate.findText('the up target') !== null &&
      candidate.findText('the outside world') !== null,
  );

  console.log('== single click keeps its existing meaning ==');
  const linkPosition = previewMarkerPosition(snapshot, 'the up target');
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: linkPosition.column + 2,
    row: linkPosition.row,
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: linkPosition.column + 2,
    row: linkPosition.row,
  });
  await Bun.sleep(700);
  const afterSingleClick = HarnessSmoke.Class.readStatus(statusPath);
  report(
    String(afterSingleClick.activeBuffer) === documentPath &&
      afterSingleClick.markdownPaneFocus === 'preview',
    `single click left the source buffer open and focused the preview ` +
      `(buffer=${afterSingleClick.activeBuffer} focus=${afterSingleClick.markdownPaneFocus})`,
  );

  console.log('== double click on a resolving link opens it ==');
  await doubleClick(linkPosition.column + 2, linkPosition.row);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the double click to open the linked file',
    (status) => String(status.activeBuffer).endsWith('/double-click-target.ts'),
  );
  report(
    true,
    `double click opened ${HarnessSmoke.Class.readStatus(statusPath).activeBuffer}`,
  );

  console.log('== double click on an external link states why ==');
  driver.sendKeys('Control+Tab');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Markdown document to become active again',
    (status) =>
      String(status.activeBuffer).endsWith('/notes/README.md') &&
      status.markdownPreviewOpen === true &&
      status.markdownParsing === false,
  );
  const externalSnapshot = await driver.awaitGridCondition(
    'the preview to repaint the external link',
    (candidate) => candidate.findText('the outside world') !== null,
  );
  const externalPosition = previewMarkerPosition(
    externalSnapshot,
    'the outside world',
  );
  await doubleClick(externalPosition.column + 2, externalPosition.row);
  await Bun.sleep(700);
  const afterExternal = HarnessSmoke.Class.readStatus(statusPath);
  report(
    String(afterExternal.markdownLinkNotice).startsWith('External link') &&
      String(afterExternal.activeBuffer).endsWith('/notes/README.md'),
    `external double click stated: ${afterExternal.markdownLinkNotice}`,
  );

  console.log('== double click on plain prose activates nothing ==');
  const prosePosition = previewMarkerPosition(
    driver.snapshot(),
    'Plain prose that a double click',
  );
  await doubleClick(prosePosition.column + 4, prosePosition.row);
  await Bun.sleep(700);
  const afterProse = HarnessSmoke.Class.readStatus(statusPath);
  report(
    String(afterProse.activeBuffer).endsWith('/notes/README.md'),
    `prose double click left the document open (buffer=${afterProse.activeBuffer})`,
  );
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(workspaceRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}

console.log(`== RESULT: ${failureCount === 0 ? 'ALL-PASS' : 'FAILURES'} ==`);
process.exit(failureCount);
