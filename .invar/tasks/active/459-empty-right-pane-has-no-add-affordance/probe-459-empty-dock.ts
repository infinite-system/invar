#!/usr/bin/env bun
// PROBE — close every instance in the pinned contents list, then look.
//
// The user reports: removing all terminals from the right pane instances
// list still leaves one terminal running underneath, with no row left to
// close it from. Wanted instead: an empty list offering "Add terminal".
//
// This probe does not assert a cause. It drives the real path and prints
// what is actually on the screen and in the published status afterwards.

import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PtyTestDriver } from '../scripts/harness/PtyTestDriver';
import { HarnessSmoke } from '../scripts/harness/HarnessSmoke';

const workspaceRoot = mkdtempSync(join(tmpdir(), 'probe-empty-dock-work-'));
await Bun.write(join(workspaceRoot, 'alpha.ts'), 'export const alpha = 1;\n');

const homeDirectory = mkdtempSync(join(tmpdir(), 'probe-empty-dock-home-'));
const configurationDirectory = join(homeDirectory, '.config', 'invar');
mkdirSync(configurationDirectory, { recursive: true });

// Restore a dock that already holds TWO terminals in one group, with the
// contents list pinned open — the user's starting state.
await Bun.write(
  join(configurationDirectory, 'settings.json'),
  `${JSON.stringify({
    panelWorkspaceStates: {
      [workspaceRoot]: {
        spaces: [
          {
            kind: 'terminal',
            label: 'Terminal',
            groups: [
              [
                { kind: 'terminal', label: 'Terminal One' },
                { kind: 'terminal', label: 'Terminal Two' },
              ],
            ],
            activeGroupIndex: 0,
          },
        ],
        activeSpaceIndex: 0,
        panelListExpanded: true,
        panelListWidth: 24,
        visible: true,
      },
    },
  })}\n`,
);

const statusPath = join(homeDirectory, 'status.json');
const driver = new PtyTestDriver.Class({
  workspaceRoot,
  columns: 132,
  rows: 42,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_AGENT_BACKEND: 'echo',
  },
});

const report = (moment: string): void => {
  const status = HarnessSmoke.Class.readStatus(statusPath);
  console.log(`\n===== ${moment} =====`);
  console.log('  panelContentIds   :', JSON.stringify(status.panelContentIds));
  console.log('  panelCellLabels   :', JSON.stringify(status.panelCellLabels));
  console.log('  panelCellIds      :', JSON.stringify(status.panelCellIds));
  console.log(
    '  panelContentLabels:',
    JSON.stringify(status.panelContentLabels),
  );
  console.log('  panelListVisible  :', status.panelListVisible);
  console.log('  panelVisible      :', status.panelVisible);
  console.log('  panelActiveContent:', status.panelActiveContent);
};

/** Close one contents-list row that belongs to a TERMINAL, which asks first.
 *  The shared helper cannot: it awaits the row count immediately, and a
 *  terminal row opens a "Close <label>?" dialog that blocks that wait. */
const closeTerminalRow = async (visibleTitle: string): Promise<void> => {
  const listSnapshot = await driver.awaitGridCondition(
    `the pinned list paints ${visibleTitle}`,
    (candidate) => candidate.findText(visibleTitle) !== null,
  );
  const rowPosition = listSnapshot.findText(visibleTitle);
  if (!rowPosition) throw new Error(`no row painted for ${visibleTitle}`);
  driver.sendMouseWithoutFrameExpectation({
    kind: 'move',
    column: rowPosition.column,
    row: rowPosition.row,
    button: 'none',
  });
  const hovered = await driver.awaitGridCondition(
    `${visibleTitle} reveals its close glyph on hover`,
    (candidate) => candidate.rowText(rowPosition.row).includes('\u00d7'),
  );
  const closeColumn = hovered.rowText(rowPosition.row).lastIndexOf('\u00d7');
  if (closeColumn < 0)
    throw new Error(`${visibleTitle} painted no close glyph`);
  driver.sendMouseWithoutFrameExpectation({
    kind: 'move',
    column: closeColumn,
    row: rowPosition.row,
    button: 'none',
  });
  driver.sendMouse({
    kind: 'press',
    column: closeColumn,
    row: rowPosition.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: closeColumn,
    row: rowPosition.row,
    button: 'left',
  });
  await driver.awaitGridCondition(
    `closing ${visibleTitle} asks for confirmation`,
    (candidate) => candidate.findText(`Close ${visibleTitle}?`) !== null,
  );
  // The dialog defaults to No (destructive action). Move to Yes first —
  // pressing Enter straight away silently DECLINES the close, and the drive
  // then reads "nothing was removed" as if the product had failed.
  driver.sendKeys('Left');
  driver.sendKeys('Enter');
  await driver.awaitGridCondition(
    `the ${visibleTitle} confirmation closes`,
    (candidate) => candidate.findText(`Close ${visibleTitle}?`) === null,
  );
};

try {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the restored dock shows both terminals with its list pinned',
    (candidate) =>
      candidate.panelListVisible === true &&
      Array.isArray(candidate.panelCellLabels) &&
      candidate.panelCellLabels.length === 2,
  );
  report('BEFORE — two terminals, list pinned');

  await closeTerminalRow('Terminal One');
  report('AFTER closing Terminal One');

  await closeTerminalRow('Terminal Two');
  await new Promise((resolve) => setTimeout(resolve, 1500));
  report('AFTER closing Terminal Two — the list is now empty');

  // The question the user actually asked: what is on the screen now?
  const snapshot = driver.snapshot();
  const paintedRows: string[] = [];
  for (let rowIndex = 0; rowIndex < 42; rowIndex += 1) {
    const rowText = snapshot.rowText(rowIndex);
    if (rowText.trim() !== '') {
      paintedRows.push(`${String(rowIndex).padStart(2, ' ')} |${rowText}|`);
    }
  }
  const painted = paintedRows.join('\n');
  console.log('\n===== PAINTED SCREEN AFTER CLOSING EVERY ROW =====');
  console.log(painted);

  console.log('\n===== LOOKING FOR =====');
  for (const needle of [
    'Add Terminal instance',
    'Add terminal',
    '+ Terminal',
    '$',
  ]) {
    console.log(
      `  ${needle.padEnd(24)} -> ${
        snapshot.findText(needle) ? 'PRESENT' : 'absent'
      }`,
    );
  }
} finally {
  await driver.dispose();
}
