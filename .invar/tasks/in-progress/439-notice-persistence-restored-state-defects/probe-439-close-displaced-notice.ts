#!/usr/bin/env bun
// This probe opens Invar with folder-open tasks, closes the "Displaced: Claude"
// notice, and prints the panel state before and after the close gesture.
// Run `bun .invar/tasks/in-progress/439-notice-persistence-restored-state-defects/probe-439-close-displaced-notice.ts`
// from the repo root for fresh settings. Add `PROBE_COPY_REAL_SETTINGS=1` to
// copy the live settings into the temporary probe home. The probe never writes
// the live settings. Read each JSON block as the panel content that survived
// the preceding gesture. A missing task cell or misplaced Database label shows
// the reported cascade.
import { copyFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';
import type { StatusSnapshot } from '../../../../src/modules/system/StatusChannel';

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
  workspaceRoot:
    process.env.PROBE_WORKSPACE_ROOT ?? '/home/parallels/dev/invar',
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

function clickCell(row: number, column: number): void {
  driver.sendMouse({ kind: 'move', row, column, button: 'none' });
  driver.sendMouse({ kind: 'press', row, column, button: 'left' });
  driver.sendMouse({ kind: 'release', row, column, button: 'left' });
}

function dumpState(label: string): void {
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
        listVisible: status.panelListVisible,
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

  // Open the instances list through the visible toggle only when restored
  // state has not already pinned it.
  if (readStatus().panelListVisible !== true) {
    const separator = readStatus().panelSeparatorGeometry as {
      tabRow: number;
      instancesToggle: { startColumn: number } | null;
    };
    if (!separator.instancesToggle) throw new Error('no instancesToggle');
    clickCell(separator.tabRow, separator.instancesToggle.startColumn + 1);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'instances list opens',
      (candidate) =>
        (candidate as Record<string, unknown>).panelListVisible === true,
      8_000,
    );
  }
  const panelContentLabels = readStatus().panelContentLabels;
  const displacedRowPresent =
    Array.isArray(panelContentLabels) &&
    panelContentLabels.some(
      (label) => typeof label === 'string' && label.startsWith('Displaced'),
    );
  console.log(
    'Displaced row present:',
    displacedRowPresent,
    'listGeometry:',
    JSON.stringify(readStatus().panelListGeometry),
  );
  if (!displacedRowPresent) {
    console.log(
      'No Displaced row: the file source explicitly redeclares Claude.',
    );
  } else {
    console.log('list ready; visible:', readStatus().panelListVisible);
    await HarnessSmoke.Class.closePanelContentsListRow(
      driver,
      statusPath,
      'Displaced',
    );
    dumpState('after closing Displaced');
  }
} finally {
  await driver.dispose();
}
