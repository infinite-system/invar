#!/usr/bin/env bun
// Observe task-state link resolution and Markdown link colors through the real app.
//
// Run from the repository root:
//   bun .invar/tasks/in-progress/291-task-links-survive-state-moves/291-observe-task-state-links.ts
//
// The output names the foreground color for current, moved, and dead links. It also
// reports the result of Ctrl-clicking the moved link. A moved link that reports the
// missing-target notice reproduces the task-state bug. This probe does not pass or
// fail. The final smoke contract carries the assertions after the fix is established.

import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from '../../../../scripts/harness/HarnessSnapshot';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

function previewRightColumn(snapshot: HarnessSnapshot.Model): number {
  const previewBorder = snapshot.findText('╭─Preview');
  if (!previewBorder) throw new Error('preview border is missing');
  const sourceColumn = snapshot
    .rowText(previewBorder.row)
    .indexOf('╭', previewBorder.column + 1);
  return sourceColumn >= 0 ? sourceColumn : snapshot.columns;
}

function previewMarkerPosition(
  snapshot: HarnessSnapshot.Model,
  marker: string,
): { row: number; column: number } {
  const previewBorder = snapshot.findText('╭─Preview');
  if (!previewBorder) throw new Error('preview border is missing');
  const rightColumn = previewRightColumn(snapshot);
  for (let row = 0; row < snapshot.rows; row += 1) {
    const column = snapshot.rowText(row).indexOf(marker, previewBorder.column);
    if (column >= 0 && column < rightColumn) return { row, column };
  }
  throw new Error(`preview marker is missing: ${marker}`);
}

function controlClick(
  driver: PtyTestDriver.Model,
  position: { row: number; column: number },
): void {
  driver.sendMouse({
    kind: 'press',
    column: position.column,
    row: position.row,
    button: 'left',
    control: true,
  });
  driver.sendMouse({
    kind: 'release',
    column: position.column,
    row: position.row,
    button: 'left',
    control: true,
  });
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'invar-291-task-state-links-'));
const homeDirectory = mkdtempSync(
  join(tmpdir(), 'invar-291-task-state-links-home-'),
);
const taskFolderName = '999-task-state-link-control';
const currentTaskFolder = join(
  fixtureRoot,
  '.invar',
  'tasks',
  'completed',
  taskFolderName,
);
const currentTaskFile = join(currentTaskFolder, `task-${taskFolderName}.md`);
const statusPath = join(homeDirectory, 'status.json');

mkdirSync(currentTaskFolder, { recursive: true });
await Bun.write(currentTaskFile, '# Current task record\n');
await Bun.write(
  join(fixtureRoot, 'README.md'),
  [
    '# Task-state links',
    '',
    `[current target](.invar/tasks/completed/${taskFolderName}/task-${taskFolderName}.md)`,
    '',
    `[moved target](.invar/tasks/active/${taskFolderName}/task-${taskFolderName}.md)`,
    '',
    '[dead target](.invar/tasks/active/998-dead-task-link-control/task-998-dead-task-link-control.md)',
    '',
  ].join('\n'),
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 30,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    LANG: 'C.UTF-8',
    NERD_FONT: '0',
  },
});

try {
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('README.md') !== null,
    30_000,
  );
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File opens',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText('README.md');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File finds README',
    (status) =>
      status.quickOpenQuery === 'README.md' &&
      Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'README preview opens and parses',
    (status) =>
      String(status.activeBuffer).endsWith('/README.md') &&
      status.markdownPreviewOpen === true &&
      status.markdownParsing === false,
    60_000,
  );
  const snapshot = await driver.awaitGridCondition(
    'all task-state link labels paint',
    (candidate) =>
      candidate.findText('current target') !== null &&
      candidate.findText('moved target') !== null &&
      candidate.findText('dead target') !== null,
  );
  for (const marker of ['current target', 'moved target', 'dead target']) {
    const position = previewMarkerPosition(snapshot, marker);
    console.log(
      `${marker}: foreground=${String(snapshot.cell(position.row, position.column)?.foreground)}`,
    );
  }

  const movedPosition = previewMarkerPosition(snapshot, 'moved target');
  controlClick(driver, movedPosition);
  const clickOutcome = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'moved link click produces an open or a stated miss',
    (status) =>
      String(status.activeBuffer).endsWith(`/task-${taskFolderName}.md`) ||
      status.markdownLinkNotice !== null,
  );
  console.log(
    `moved click: activeBuffer=${String(clickOutcome.activeBuffer)} notice=${String(clickOutcome.markdownLinkNotice)}`,
  );
} catch (error) {
  console.error(driver.snapshot().text());
  try {
    console.error(
      JSON.stringify(HarnessSmoke.Class.readStatus(statusPath), null, 2),
    );
  } catch {
    console.error('status file is unavailable');
  }
  throw error;
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
