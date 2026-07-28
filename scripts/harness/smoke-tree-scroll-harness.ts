#!/usr/bin/env bun
// Byte-level port of smoke-tree-scroll: real SGR wheel and click input drive the file tree while
// semantic scroll/selection state comes from the existing status projection.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Rendering is one coarse frame effect (src/modules/app/app.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-tree-scroll-harness-'));
const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-tree-scroll-harness-home-'),
);
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
  const openingStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: a settled boot publishes all 60 file-tree rows',
    (status) =>
      status.ready === true &&
      status.renderQuiescent === true &&
      status.treeRows === 60,
  );
  HarnessSmoke.Class.requireCondition(
    openingStatus.treeRows === 60,
    'the settled model contains all 60 file-tree rows',
  );
  const openingSnapshot = await driver.awaitGridCondition(
    'the settled boot paints the populated file tree',
    (snapshot) => snapshot.findText('file-20.txt') !== null,
    15_000,
  );
  HarnessSmoke.Class.pass('the settled boot paints the populated file tree');

  console.log(
    '== harness tree-scroll: wheel moves the window without swimming selection ==',
  );
  await driver.assertContentInvariantAcrossAction({
    invariantRegion: {
      startRow: 1,
      endRowExclusive: openingSnapshot.rows - 2,
      startColumn: 32,
      endColumnExclusive: openingSnapshot.columns,
    },
    changedRegion: {
      startRow: 1,
      endRowExclusive: openingSnapshot.rows - 2,
      startColumn: 0,
      endColumnExclusive: 30,
    },
    actionDescription:
      'tree wheel input changes the file window while the editor stays fixed',
    performAction: async () => {
      for (let wheelEventIndex = 0; wheelEventIndex < 80; wheelEventIndex++) {
        driver.sendMouseWithoutFrameExpectation({
          kind: 'wheel',
          column: 9,
          row: 9,
          direction: 'down',
        });
      }
      await driver.awaitGridCondition(
        'the wheel train reaches the final file-tree row',
        (candidate) => candidate.findText('file-60.txt') !== null,
      );
    },
  });
  const scrolledStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: Number(status.treeScrollTop) > 0',
    (status) => Number(status.treeScrollTop) > 0,
  );
  const scrolledOffset = Number(scrolledStatus.treeScrollTop);
  HarnessSmoke.Class.pass(
    `wheel scrolled the window (scrollTop=${scrolledOffset})`,
  );
  HarnessSmoke.Class.requireCondition(
    scrolledStatus.treeSelected === 0,
    'wheel left the selection put (selected=0)',
  );

  console.log(
    '== harness tree-scroll: clicking a visible lower row keeps the offset ==',
  );
  driver.sendMouse({
    kind: 'press',
    column: 9,
    row: 19,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: 9,
    row: 19,
    button: 'left',
  });
  const clickedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: typeof status.activeBuffer === 'string' && status.activeBuffer.length > 0",
    (status) =>
      typeof status.activeBuffer === 'string' && status.activeBuffer.length > 0,
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
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
