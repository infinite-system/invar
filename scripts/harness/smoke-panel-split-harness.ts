#!/usr/bin/env bun
// Byte-level panel-split port: the real agent and terminal citizens render in independent regions,
// receive focus-routed keys, resize through a dragged divider, and return to one cell.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Visible panel contents own separate headed regions (src/modules/ui/ui.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { HarnessSmoke } from './HarnessSmoke';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

function cellColumns(status: StatusSnapshot): number[] {
  const value = status.panelCellColumns;
  return Array.isArray(value) ? value.map(Number) : [];
}

function clickCell(
  driver: PtyTestDriver.Model,
  column: number,
  row: number,
): void {
  driver.sendMouse({ kind: 'press', column, row, button: 'left' });
  driver.sendMouse({ kind: 'release', column, row, button: 'left' });
}

function statusButtonColumn(
  snapshot: HarnessSnapshot.Model,
  buttonText: string,
): number {
  const column = snapshot.rowText(snapshot.rows - 1).lastIndexOf(buttonText);
  if (column < 0) throw new Error(`Status button is not visible: ${buttonText}`);
  return column + 1;
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
    'the application is ready with the panel hidden',
    (status) => status.ready === true && status.terminalVisible === false,
    15_000,
  );
  HarnessSmoke.Class.pass('panel hidden at boot');
  await driver.awaitQuiescence();
  clickCell(
    driver,
    statusButtonColumn(driver.snapshot(), ' ❯ '),
    driver.snapshot().rows - 1,
  );
  let openedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.terminalVisible === true && Array.isArray(status.panelCellIds) && status.panelCellIds.join(',') === 'terminal' && Array.isArray(status.panelCellColumns) && Number(status.panelCellColumns[0]) > 1",
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
  const fullColumns = cellColumns(openedStatus)[0] ?? 0;
  HarnessSmoke.Class.requireCondition(fullColumns > 1, 'single cell has real width');

  console.log('== harness panel-split: clicking Agent adds its own side-by-side pane ==');
  clickCell(
    driver,
    statusButtonColumn(driver.snapshot(), ' ✦ '),
    driver.snapshot().rows - 1,
  );
  openedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: Array.isArray(status.panelCellIds) && status.panelCellIds.join(',') === 'terminal,agent' && status.panelActiveContent === 'agent'",
    (status) => Array.isArray(status.panelCellIds)
      && status.panelCellIds.join(',') === 'terminal,agent'
      && status.panelActiveContent === 'agent'
      && Array.isArray(status.panelCellColumns),
  );
  HarnessSmoke.Class.pass('two cells render left-to-right');
  HarnessSmoke.Class.requireCondition(
    openedStatus.panelFocusedIndex === 1,
    'newly opened agent cell is focused',
  );
  const initialColumns = cellColumns(openedStatus);
  const initialLeftColumns = initialColumns[0] ?? 0;
  const initialRightColumns = initialColumns[1] ?? 0;
  HarnessSmoke.Class.requireCondition(initialLeftColumns > 1, 'left cell has its own width');
  HarnessSmoke.Class.requireCondition(initialRightColumns > 1, 'right cell has its own width');
  HarnessSmoke.Class.requireCondition(
    initialLeftColumns < fullColumns && initialRightColumns < fullColumns,
    'both split cells are narrower than the full pane',
  );
  await driver.awaitSnapshot((snapshot) =>
    snapshot.textRows().some(
      (text) =>
        text.includes('❯')
        && text.includes('✦')
        && text.indexOf('❯') < text.indexOf('✦'),
    ),
  );
  const headingText = driver.snapshot().textRows().find(
    (text) =>
      text.includes('❯')
      && text.includes('✦')
      && text.indexOf('❯') < text.indexOf('✦'),
  ) ?? '';
  HarnessSmoke.Class.requireCondition(
    headingText.indexOf('❯') < headingText.indexOf('✦'),
    'terminal and agent render separate headings over their own regions',
  );
  HarnessSmoke.Class.pass('agent cell shows its own heading and composer');

  console.log('== harness panel-split: keys reach only the focused agent cell ==');
  driver.sendText('AGENTKEY');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('AGENTKEY') !== null);
  HarnessSmoke.Class.pass('focused agent cell received the keys');

  console.log('== harness panel-split: click focuses terminal and stty sees its sub-width ==');
  const panelRow = Number(openedStatus.height) - 8;
  const layoutSlots = openedStatus.layoutSlots as
    | Record<string, { left: number }>
    | undefined;
  const panelLeft = Number(layoutSlots?.bottomPanel?.left ?? 0);
  const terminalClickColumn = panelLeft + 6;
  clickCell(driver, terminalClickColumn, panelRow);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.panelFocusedIndex === 0 && status.panelActiveContent === 'terminal'",
    (status) => status.panelFocusedIndex === 0
      && status.panelActiveContent === 'terminal',
  );
  HarnessSmoke.Class.pass('click moved focus to the terminal cell');
  driver.sendText('stty size');
  driver.sendKeys('Enter');
  const expectedTerminalColumns = initialLeftColumns - 4;
  const terminalSizePattern = new RegExp(`(?:^|\\D)\\d+ ${expectedTerminalColumns}(?:\\D|$)`);
  const focusedTerminalSnapshot = await driver.awaitGridCondition(
    'the terminal reports its split width while the blurred agent keeps its composer text',
    (candidate) => candidate.textRows().some((rowText) => terminalSizePattern.test(rowText))
      && candidate.findText('AGENTKEY') !== null,
  );
  HarnessSmoke.Class.pass(
    `terminal reported its padded sub-width ${expectedTerminalColumns}`,
  );
  HarnessSmoke.Class.requireCondition(
    focusedTerminalSnapshot.findText('AGENTKEY') !== null,
    'blurred agent kept its composer text and terminal keys did not leak',
  );

  console.log('== harness panel-split: divider drag reflows both cells ==');
  const dividerColumn = panelLeft + initialLeftColumns + 1;
  const targetColumn = dividerColumn - 18;
  driver.sendMouse({ kind: 'press', column: dividerColumn, row: panelRow, button: 'left' });
  driver.sendMouse({
    kind: 'move',
    column: targetColumn,
    row: panelRow,
    button: 'left',
  });
  driver.sendMouse({ kind: 'release', column: targetColumn, row: panelRow, button: 'left' });
  const resizedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the panel divider publishes narrower left and wider right cell columns',
    (status) => {
      const resizedColumns = cellColumns(status);
      return Number(resizedColumns[0]) < initialLeftColumns
        && Number(resizedColumns[1]) > initialRightColumns;
    },
  );
  const resizedColumns = cellColumns(resizedStatus);
  const resizedLeftColumns = resizedColumns[0] ?? 0;
  const resizedRightColumns = resizedColumns[1] ?? 0;
  HarnessSmoke.Class.pass(
    `divider drag re-flowed both cells (left ${initialLeftColumns}->${resizedLeftColumns}, `
    + `right ${initialRightColumns}->${resizedRightColumns})`,
  );

  console.log('== harness panel-split: F9 collapses to the focused pane, then restores the split ==');
  driver.sendKeys('F9');
  const restoredStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: Array.isArray(status.panelCellIds) && status.panelCellIds.join(',') === 'terminal'",
    (status) => Array.isArray(status.panelCellIds)
      && status.panelCellIds.join(',') === 'terminal',
  );
  HarnessSmoke.Class.pass('single cell restored');
  HarnessSmoke.Class.requireCondition(
    restoredStatus.panelFocusedIndex === 0,
    'focused cell index reset',
  );
  HarnessSmoke.Class.requireCondition(
    (cellColumns(restoredStatus)[0] ?? 0) > resizedLeftColumns,
    'restored cell reclaimed the full width',
  );
  driver.sendKeys('F9');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: Array.isArray(status.panelCellIds) && status.panelCellIds.join(',') === 'terminal,agent'",
    (status) => Array.isArray(status.panelCellIds)
      && status.panelCellIds.join(',') === 'terminal,agent',
  );
  HarnessSmoke.Class.pass('F9 produces the same side-by-side terminal and agent layout');
  clickCell(
    driver,
    statusButtonColumn(driver.snapshot(), ' ✦ '),
    driver.snapshot().rows - 1,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: Array.isArray(status.panelCellIds) && status.panelCellIds.join(',') === 'terminal'",
    (status) => Array.isArray(status.panelCellIds)
      && status.panelCellIds.join(',') === 'terminal',
  );
  clickCell(
    driver,
    statusButtonColumn(driver.snapshot(), ' ✦ '),
    driver.snapshot().rows - 1,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: Array.isArray(status.panelCellIds) && status.panelCellIds.join(',') === 'terminal,agent'",
    (status) => Array.isArray(status.panelCellIds)
      && status.panelCellIds.join(',') === 'terminal,agent',
  );
  HarnessSmoke.Class.pass('agent close and reopen preserves the terminal pane');

  driver.sendKeys('Control+q');
  console.log('smoke-panel-split-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(homeDirectory, { recursive: true, force: true });
}
