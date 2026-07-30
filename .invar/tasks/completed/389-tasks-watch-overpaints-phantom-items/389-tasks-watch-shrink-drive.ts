#!/usr/bin/env bun
// This drive shows how the real tasks watch paints a task list before and after it shrinks.
// Run it from the repository root:
//   bun .invar/tasks/in-progress/389-tasks-watch-overpaints-phantom-items/389-tasks-watch-shrink-drive.ts
// Set INVAR_389_TASK_COUNT=100 and INVAR_389_TERMINAL_ROWS=320 for the large-scale drive.
// It prints the 60-column terminal grid at both states. The large drive prints the first
// and last eight nonblank rows. Any task title below the final "IN-PROGRESS (1)" frame is
// a phantom physical row left by the paint path.

import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const fixtureRoot = mkdtempSync(
  join(tmpdir(), 'invar-389-tasks-watch-shrink-drive-'),
);
const tasksRoot = join(fixtureRoot, 'tasks');
const taskCount = Number.parseInt(process.env.INVAR_389_TASK_COUNT ?? '3', 10);
const terminalRows = Number.parseInt(
  process.env.INVAR_389_TERMINAL_ROWS ?? '30',
  10,
);
const taskNumbers = Array.from(
  { length: taskCount },
  (_unused, taskIndex) => 901 + taskIndex,
);
for (const state of ['active', 'in-progress', 'completed', 'retired']) {
  mkdirSync(join(tasksRoot, state), { recursive: true });
}

function writeBuildingTask(taskNumber: number): void {
  const folderName = `${taskNumber}-planted-building-task-with-a-name-that-wraps-at-narrow-width`;
  const folderPath = join(tasksRoot, 'in-progress', folderName);
  mkdirSync(folderPath, { recursive: true });
  writeFileSync(
    join(folderPath, `task-${folderName}.md`),
    [
      `# ${taskNumber} — planted building task`,
      'State: IN-PROGRESS',
      'Engine: codex',
      'Model: 5.6-sol',
      'Effort: high',
      '',
      '## Outline',
      '',
      'This fixture row is intentionally long.',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(folderPath, 'meta.json'),
    JSON.stringify({
      startedAt: new Date(Date.now() - 60_000).toISOString(),
      tmuxSession: `invar/${folderName}`,
    }),
  );
}

for (const taskNumber of taskNumbers) writeBuildingTask(taskNumber);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 60,
  rows: terminalRows,
  command: [
    process.execPath,
    join(process.cwd(), 'scripts', 'tasks', 'tasks-status.ts'),
    'watch',
  ],
  environment: { INVAR_TASKS_ROOT: tasksRoot },
});

function printGrid(label: string): void {
  console.log(`\n${label}`);
  const textRows = driver.snapshot().textRows();
  const nonblankRows = Array.from(textRows.entries()).filter(
    ([_rowIndex, rowText]) => taskCount <= 10 || rowText.trim().length > 0,
  );
  const printedRows =
    taskCount <= 10 || nonblankRows.length <= 16
      ? nonblankRows
      : nonblankRows.slice(0, 8).concat(nonblankRows.slice(-8));
  for (const [rowIndex, rowText] of printedRows) {
    console.log(`${String(rowIndex).padStart(2, '0')} │${rowText}`);
  }
}

try {
  await driver.awaitGridCondition(
    'the initial watch frame shows every model row',
    (snapshot) =>
      snapshot.findText(`IN-PROGRESS (${taskCount})`) !== null &&
      snapshot.findText('#901') !== null &&
      snapshot.findText('0 completed') !== null,
  );
  printGrid('BEFORE SHRINK');

  for (const taskNumber of taskNumbers.slice(1)) {
    const folderName = `${taskNumber}-planted-building-task-with-a-name-that-wraps-at-narrow-width`;
    renameSync(
      join(tasksRoot, 'in-progress', folderName),
      join(tasksRoot, 'completed', folderName),
    );
  }

  await driver.awaitGridCondition(
    'the shrunken watch frame shows one model row',
    (snapshot) => snapshot.findText('IN-PROGRESS (1)') !== null,
  );
  printGrid('AFTER SHRINK');
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
}
