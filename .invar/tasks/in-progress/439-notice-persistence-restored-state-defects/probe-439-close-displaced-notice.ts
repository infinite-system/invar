#!/usr/bin/env bun
// User recipe (2026-08-01): open invar with folderOpen tasks, close the
// "Displaced: Claude" pane -> observe the two task terminals vanish and
// Database content shows inside the Terminal space.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from '../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../scripts/harness/PtyTestDriver';
import type { StatusSnapshot } from '../src/modules/system/StatusChannel';

import { mkdirSync, copyFileSync } from 'node:fs';
const homeDirectory = mkdtempSync(join(tmpdir(), 'probe-displaced-home-'));
if (process.env.PROBE_COPY_REAL_SETTINGS === '1') {
  mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
  copyFileSync(
    '/home/parallels/.config/invar/settings.json',
    join(homeDirectory, '.config', 'invar', 'settings.json'),
  );
}
const statusPath = join(homeDirectory, 'status.json');

const driver = new PtyTestDriver.Class({
  workspaceRoot: '/home/parallels/dev/invar',
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    COLORTERM: 'truecolor',
    INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS: '0',
  },
});

const readStatus = (): Record<string, unknown> =>
  HarnessSmoke.Class.readStatus(statusPath) as Record<string, unknown>;

function click(row: number, column: number) {
  driver.sendMouse({ kind: 'move', row, column, button: 'none' });
  driver.sendMouse({ kind: 'press', row, column, button: 'left' });
  driver.sendMouse({ kind: 'release', row, column, button: 'left' });
}

function dumpState(label: string) {
  const status = readStatus();
  console.log(`--- ${label} ---`);
  console.log(
    JSON.stringify(
      {
        spaces: status.panelSpaceLabels,
        activeSpace: status.panelActiveSpace,
        activeContent: status.panelActiveContent,
        cells: status.panelCellIds,
        groups: status.panelGroups,
      },
      null,
      1,
    ),
  );
  const rows = driver.snapshot().textRows();
  rows.forEach((text, index) => {
    if (index >= 22 && index <= 30)
      console.log(index, JSON.stringify(text.slice(33, 120)));
  });
}

try {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'ready',
    (candidate: Partial<StatusSnapshot>) => candidate.ready === true,
    20_000,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'both task cells present',
    (candidate) => {
      const cells = (candidate as Record<string, unknown>).panelCellIds;
      return Array.isArray(cells) && cells.length === 2;
    },
    20_000,
  );
  dumpState('boot with tasks');

  // Open the instances list via the visible toggle.
  const separator = readStatus().panelSeparatorGeometry as {
    tabRow: number;
    instancesToggle: { startColumn: number } | null;
  };
  if (!separator.instancesToggle) throw new Error('no instancesToggle');
  click(separator.tabRow, separator.instancesToggle.startColumn + 1);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'instances list opens',
    (candidate) =>
      (candidate as Record<string, unknown>).panelListVisible === true,
    8_000,
  );
  const listGeometry = readStatus().panelListGeometry as {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  await driver.awaitGridCondition(
    'instances list paints content',
    (grid) => {
      for (
        let row = listGeometry.top;
        row < listGeometry.top + listGeometry.height;
        row++
      ) {
        const text = grid
          .rowText(row)
          .slice(listGeometry.left, listGeometry.left + listGeometry.width);
        if (text.trim().length > 0) return true;
      }
      return false;
    },
    8_000,
  );
  const listRows = driver.snapshot().textRows();
  let displacedRow = -1;
  for (
    let row = listGeometry.top;
    row < listGeometry.top + listGeometry.height;
    row++
  ) {
    if ((listRows[row] ?? '').includes('Displaced')) {
      displacedRow = row;
      break;
    }
  }
  console.log(
    'Displaced row:',
    displacedRow,
    'listGeometry:',
    JSON.stringify(listGeometry),
  );
  if (displacedRow < 0) {
    listRows.forEach((text, index) => {
      if (
        index >= listGeometry.top - 2 &&
        index <= listGeometry.top + listGeometry.height + 2
      )
        console.log(
          'list',
          index,
          JSON.stringify(text.slice(Math.max(0, listGeometry.left - 2))),
        );
    });
    throw new Error('no Displaced row in the list');
  }

  // Restored state auto-closes the list (defect, recorded). Wait out the
  // dismissal, reopen, then act inside the fresh window.
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
  if (readStatus().panelListVisible !== true) {
    const separatorAgain = readStatus().panelSeparatorGeometry as {
      tabRow: number;
      instancesToggle: { startColumn: number } | null;
    };
    click(
      separatorAgain.tabRow,
      (separatorAgain.instancesToggle?.startColumn ?? 0) + 1,
    );
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'instances list reopens',
      (candidate) =>
        (candidate as Record<string, unknown>).panelListVisible === true,
      8_000,
    );
  }
  console.log('list reopened; visible:', readStatus().panelListVisible);
  // USER PATH: hover the Displaced row (travel through cells like a real
  // pointer), let the row reveal its controls, click the x at the right edge.
  for (
    let column = listGeometry.left + 2;
    column <= listGeometry.left + listGeometry.width - 2;
    column += 3
  ) {
    driver.sendMouseWithoutFrameExpectation({
      kind: 'move',
      row: displacedRow,
      column,
      button: 'none',
    });
  }
  await driver
    .awaitGridCondition(
      'Displaced row reveals a control on hover',
      (grid) => {
        const slice = grid
          .rowText(displacedRow)
          .slice(listGeometry.left, listGeometry.left + listGeometry.width);
        return (
          slice.includes('\u00d7') || grid.findText('Close instance') !== null
        );
      },
      8_000,
    )
    .catch(() => {
      const slice = driver
        .snapshot()
        .rowText(displacedRow)
        .slice(listGeometry.left);
      console.log('hovered Displaced row paints:', JSON.stringify(slice));
      throw new Error('no control revealed on Displaced row hover');
    });
  const revealedRow = driver.snapshot().rowText(displacedRow);
  const revealedColumn = revealedRow.lastIndexOf('\u00d7');
  console.log('revealed x at column:', revealedColumn);
  click(displacedRow, revealedColumn);
  const headings = readStatus().panelHeadingGeometry as {
    contentId: string;
    row: number;
    controls: {
      action: string;
      startColumn: number;
      endColumnExclusive: number;
    }[];
  }[];
  console.log('headings:', JSON.stringify(headings));
  const panelHeading = headings.find(
    (heading) => heading.contentId === 'panel',
  );
  const closeControl = panelHeading?.controls.find(
    (control) => control.action === 'close',
  );
  if (!closeControl) throw new Error('no panel close control');
  // The user closes the PANE below the line, not the panel itself: find a
  // heading for the notice content if one exists, else use the subwindow x.
  const noticeHeading = headings.find((heading) =>
    heading.contentId.includes('notice'),
  );
  const target =
    noticeHeading?.controls.find((control) => control.action === 'close') ??
    null;
  if (target && noticeHeading) {
    click(noticeHeading.row, target.startColumn + 1);
  } else {
    // fall back: the visible x at the right edge of the notice pane row 24
    const grid = driver.snapshot();
    let hit: { row: number; column: number } | null = null;
    for (let row = 23; row < 30 && !hit; row++) {
      for (let column = 119; column > 34; column--) {
        if (grid.cell(row, column)?.characters === '\u00d7') {
          hit = { row, column };
          break;
        }
      }
    }
    console.log('fallback x hit:', JSON.stringify(hit));
    if (!hit) throw new Error('no visible close x for the notice pane');
    click(hit.row, hit.column);
  }
  await driver.awaitScreenChange(8_000);
  dumpState('after closing Displaced');

  // Give any cascade a moment, then final state.
  await driver.awaitScreenChange(3_000).catch(() => {});
  dumpState('final');
} finally {
  await driver.dispose();
}
