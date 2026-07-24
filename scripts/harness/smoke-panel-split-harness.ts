#!/usr/bin/env bun
// Byte-level panel-split port: the real agent and terminal citizens render in independent regions,
// receive focus-routed keys, resize through a dragged divider, and return to one cell.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function cellColumns(statusPath: string): number[] {
  const value = HarnessSmoke.Class.readStatus(statusPath).panelCellColumns;
  return Array.isArray(value) ? value.map(Number) : [];
}

console.log('== harness panel-split: deterministic PanelHost split tests ==');
const unitResult = Bun.spawnSync(
  [process.execPath, 'test', 'src/modules/ui/PanelHost.test.ts'],
  { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' },
);
HarnessSmoke.Class.requireCondition(
  unitResult.exitCode === 0,
  'PanelHost unit tests (split layout, focus routing, per-cell resize, divider re-flow)',
);

const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-panel-split-harness-home-'));
const statusPath = join(homeDirectory, 'status.json');
const driver = new PtyTestDriver.Class({
  workspaceRoot: join(process.cwd(), 'fixtures'),
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_AGENT_BACKEND: 'echo',
  },
});

try {
  console.log('== harness panel-split: boot hidden and open the single terminal cell ==');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.ready === true,
    15_000,
  );
  HarnessSmoke.Class.requireCondition(
    HarnessSmoke.Class.readStatus(statusPath).terminalVisible === false,
    'panel hidden at boot',
  );
  driver.sendKeys('F8');
  let openedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.terminalVisible === true
      && Array.isArray(status.panelCellIds)
      && status.panelCellIds.join(',') === 'terminal'
      && Array.isArray(status.panelCellColumns)
      && Number(status.panelCellColumns[0]) > 1,
  );
  HarnessSmoke.Class.pass('panel visible');
  HarnessSmoke.Class.pass('single cell is terminal');
  HarnessSmoke.Class.requireCondition(
    openedStatus.panelFocusedIndex === 0,
    'focused cell index is 0',
  );
  const fullColumns = cellColumns(statusPath)[0] ?? 0;
  HarnessSmoke.Class.requireCondition(fullColumns > 1, 'single cell has real width');

  console.log('== harness panel-split: F9 creates agent left and terminal right ==');
  driver.sendKeys('F9');
  openedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => Array.isArray(status.panelCellIds)
      && status.panelCellIds.join(',') === 'agent,terminal',
  );
  HarnessSmoke.Class.pass('two cells render left-to-right');
  HarnessSmoke.Class.requireCondition(
    openedStatus.panelFocusedIndex === 0,
    'left agent cell is focused',
  );
  const initialColumns = cellColumns(statusPath);
  const initialLeftColumns = initialColumns[0] ?? 0;
  const initialRightColumns = initialColumns[1] ?? 0;
  HarnessSmoke.Class.requireCondition(initialLeftColumns > 1, 'left cell has its own width');
  HarnessSmoke.Class.requireCondition(initialRightColumns > 1, 'right cell has its own width');
  HarnessSmoke.Class.requireCondition(
    initialLeftColumns < fullColumns && initialRightColumns < fullColumns,
    'both split cells are narrower than the full pane',
  );
  await driver.awaitSnapshot((snapshot) => snapshot.findText('❯') !== null);
  HarnessSmoke.Class.pass('left cell shows the agent composer prompt');

  console.log('== harness panel-split: keys reach only the focused left cell ==');
  driver.sendText('AGENTKEY');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('AGENTKEY') !== null);
  HarnessSmoke.Class.pass('focused left agent cell received the keys');

  console.log('== harness panel-split: click focuses terminal and stty sees its sub-width ==');
  const panelRow = Number(openedStatus.height) - 8;
  const rightClickColumn = initialLeftColumns + 6;
  driver.sendMouse({
    kind: 'press',
    column: rightClickColumn,
    row: panelRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: rightClickColumn,
    row: panelRow,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.panelFocusedIndex === 1,
  );
  HarnessSmoke.Class.pass('click moved focus to the right cell');
  driver.sendText('stty size');
  driver.sendKeys('Enter');
  const expectedTerminalColumns = initialRightColumns - 4;
  const terminalSizePattern = new RegExp(`(?:^|\\D)\\d+ ${expectedTerminalColumns}(?:\\D|$)`);
  await driver.awaitSnapshot(
    (snapshot) => snapshot.textRows().some((rowText) => terminalSizePattern.test(rowText)),
  );
  HarnessSmoke.Class.pass(
    `terminal reported its padded sub-width ${expectedTerminalColumns}`,
  );
  HarnessSmoke.Class.requireCondition(
    driver.snapshot().findText('AGENTKEY') !== null,
    'blurred agent kept its composer text and terminal keys did not leak',
  );

  console.log('== harness panel-split: divider drag reflows both cells ==');
  const dividerColumn = initialLeftColumns + 1;
  const targetColumn = dividerColumn - 18;
  driver.sendMouse({ kind: 'press', column: dividerColumn, row: panelRow, button: 'left' });
  driver.sendMouse({
    kind: 'move',
    column: targetColumn,
    row: panelRow,
    button: 'left',
  });
  driver.sendMouse({ kind: 'release', column: targetColumn, row: panelRow, button: 'left' });
  await HarnessSmoke.Class.awaitStatus(driver, statusPath, () => {
    const resizedColumns = cellColumns(statusPath);
    return Number(resizedColumns[0]) < initialLeftColumns
      && Number(resizedColumns[1]) > initialRightColumns;
  });
  const resizedColumns = cellColumns(statusPath);
  const resizedLeftColumns = resizedColumns[0] ?? 0;
  const resizedRightColumns = resizedColumns[1] ?? 0;
  HarnessSmoke.Class.pass(
    `divider drag re-flowed both cells (left ${initialLeftColumns}->${resizedLeftColumns}, `
    + `right ${initialRightColumns}->${resizedRightColumns})`,
  );

  console.log('== harness panel-split: F9 restores one full-width terminal ==');
  driver.sendKeys('F9');
  const restoredStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => Array.isArray(status.panelCellIds)
      && status.panelCellIds.join(',') === 'terminal',
  );
  HarnessSmoke.Class.pass('single cell restored');
  HarnessSmoke.Class.requireCondition(
    restoredStatus.panelFocusedIndex === 0,
    'focused cell index reset',
  );
  HarnessSmoke.Class.requireCondition(
    (cellColumns(statusPath)[0] ?? 0) > resizedLeftColumns,
    'restored cell reclaimed the full width',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-panel-split-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(homeDirectory, { recursive: true, force: true });
}
