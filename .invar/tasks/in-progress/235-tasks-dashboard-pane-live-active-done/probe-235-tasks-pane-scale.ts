#!/usr/bin/env bun
// probe-235-tasks-pane-scale.ts — SCALE PARITY probe for the tasks dashboard pane (#235).
//
// What it finds out: whether the pane stays flat when the task tree is large. It builds a
// throwaway workspace with 438 planted tasks (400 completed, 30 active, 8 in-progress), boots
// the real app in the PTY harness, shows the pane, switches to the DONE lens (400 rows), and
// sends ten wheel notches over the pane.
//
// How to run: bun .invar/tasks/in-progress/235-tasks-dashboard-pane-live-active-done/probe-235-tasks-pane-scale.ts
// (run from the repository root; it resolves src/main.ts from this file's repository).
//
// How to read the output: four wall-time lines, one per step, then SCALE-OK. The numbers are
// milliseconds of wall time per driven step. Reference run on 2026-07-29 (Linux arm64):
// boot 215 ms, show 47 ms, done-lens switch over 400 rows 14 ms, ten wheel notches 34 ms.
// A lens switch or wheel time that GROWS with the task count would mean per-row work escaped
// the windowed renderer — the defect this probe exists to catch.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const repositoryRoot = join(import.meta.dir, '..', '..', '..', '..');
const root = mkdtempSync(join(tmpdir(), 'tasks-scale-'));
const tasksRoot = join(root, '.invar', 'tasks');

function write(
  state: string,
  folder: string,
  header: string[],
  files: Record<string, string> = {},
): void {
  const folderPath = join(tasksRoot, state, folder);
  mkdirSync(folderPath, { recursive: true });
  writeFileSync(
    join(folderPath, `task-${folder}.md`),
    `# planted\n\n${header.join('\n')}\n\n## Outline\n` + 'body\n'.repeat(20),
  );
  for (const [name, text] of Object.entries(files))
    writeFileSync(join(folderPath, name), text);
}

for (let index = 0; index < 400; index++)
  write(
    'completed',
    `${1000 + index}-done-${index}`,
    ['State: COMPLETED — merged 1a2b3c4d'],
    { 'meta.json': JSON.stringify({ durationMinutes: 10 + (index % 50) }) },
  );
for (let index = 0; index < 30; index++)
  write('active', `${2000 + index}-wait-${index}`, [
    'State: ACTIVE',
    'Priority: architecture-hygiene',
  ]);
for (let index = 0; index < 8; index++)
  write(
    'in-progress',
    `${3000 + index}-run-${index}`,
    ['State: IN-PROGRESS', 'Engine: codex'],
    {
      'meta.json': JSON.stringify({
        startedAt: new Date(Date.now() - 60000).toISOString(),
      }),
    },
  );

const homeDirectory = mkdtempSync(join(tmpdir(), 'tasks-scale-home-'));
const statusPath = join(homeDirectory, 'status.json');
const driver = new PtyTestDriver.Class({
  workspaceRoot: root,
  columns: 150,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath, COLORTERM: 'truecolor' },
  command: [process.execPath, join(repositoryRoot, 'src/main.ts'), root],
});

const stamp = (label: string, start: number): void =>
  console.log(label, Math.round(performance.now() - start), 'ms');

try {
  let start = performance.now();
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'boot',
    (status) => status.tasksLens === 'live',
  );
  stamp('boot-with-438-tasks', start);
  start = performance.now();
  driver.sendKeys('Control+Shift+t');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'pane',
    (status) =>
      status.rightDockActiveContent === 'tasks' &&
      Number(status.tasksRows) === 8,
  );
  stamp('show-live-8-rows', start);
  start = performance.now();
  driver.sendKeys('Right', 'Right');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'done lens',
    (status) => status.tasksLens === 'done' && Number(status.tasksRows) === 400,
  );
  stamp('done-lens-400-rows', start);
  start = performance.now();
  for (let notch = 0; notch < 10; notch++)
    driver.sendMouse({
      kind: 'wheel',
      column: 140,
      row: 12,
      direction: 'down',
    });
  await driver.awaitGridCondition(
    'scrolled deep',
    (snapshot) =>
      snapshot.findText('#1399') === null && snapshot.findText('#13') !== null,
    8000,
  );
  stamp('ten-wheel-notches', start);
  console.log('SCALE-OK');
} finally {
  await driver.dispose();
  rmSync(root, { recursive: true, force: true });
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
