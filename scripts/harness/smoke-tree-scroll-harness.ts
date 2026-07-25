#!/usr/bin/env bun
// Byte-level port of smoke-tree-scroll: real SGR wheel and click input drive the file tree while
// semantic scroll/selection state comes from the existing status projection.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-tree-scroll-harness-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-tree-scroll-harness-home-'));
const statusPath = join(homeDirectory, 'status.json');
for (let fileNumber = 1; fileNumber <= 60; fileNumber++) {
  await Bun.write(
    join(fixtureRoot, `file-${String(fileNumber).padStart(2, '0')}.txt`),
    'x\n',
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
  console.log('== harness tree-scroll: overflowing tree boots ==');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('file-20.txt') !== null, 15_000);
  HarnessSmoke.Class.pass('boot');

  console.log('== harness tree-scroll: wheel moves the window without swimming selection ==');
  for (let wheelEventIndex = 0; wheelEventIndex < 8; wheelEventIndex++) {
    driver.sendMouse({ kind: 'wheel', column: 9, row: 9, direction: 'down' });
  }
  await HarnessSmoke.Class.awaitFrameSilence(driver);
  const scrolledStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: Number(status.treeScrollTop) > 0",
    (status) => Number(status.treeScrollTop) > 0,
  );
  const scrolledOffset = Number(scrolledStatus.treeScrollTop);
  HarnessSmoke.Class.pass(`wheel scrolled the window (scrollTop=${scrolledOffset})`);
  HarnessSmoke.Class.requireCondition(
    scrolledStatus.treeSelected === 0,
    'wheel left the selection put (selected=0)',
  );

  console.log('== harness tree-scroll: clicking a visible lower row keeps the offset ==');
  driver.sendMouse({ kind: 'press', column: 9, row: 19, button: 'left' });
  driver.sendMouse({ kind: 'release', column: 9, row: 19, button: 'left' });
  const clickedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: typeof status.activeBuffer === 'string' && status.activeBuffer.length > 0",
    (status) => typeof status.activeBuffer === 'string' && status.activeBuffer.length > 0,
  );
  HarnessSmoke.Class.requireCondition(
    clickedStatus.treeScrollTop === scrolledOffset,
    `scroll stayed put on click (${scrolledOffset})`,
  );
  HarnessSmoke.Class.requireCondition(
    typeof clickedStatus.activeBuffer === 'string',
    `click opened the clicked row (${String(clickedStatus.activeBuffer).split('/').at(-1)})`,
  );
  const clickedFileSnapshot = await driver.awaitGridCondition(
    'the clicked file content is visible in the emulator grid',
    (candidate) => candidate.findText('x') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    clickedFileSnapshot.findText('x') !== null,
    'the clicked file content is visible in the emulator grid',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-tree-scroll-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
