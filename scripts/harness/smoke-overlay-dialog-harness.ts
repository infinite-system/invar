#!/usr/bin/env bun
// Driven overlay contract: live resize clamps every dialog, shared viewport scrolling reaches overflow,
// discovered close controls work, and Escape outranks every retained content focus.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Overlay dialogs stay inside the terminal (src/modules/ui/ui.invariants.md)
// invariant: Overlay keyboard actions have visible mouse paths (src/modules/ui/ui.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import {
  awaitStatusPublication,
  markerPosition,
  pass,
  requireCondition,
  type HarnessStatus,
} from './HarnessSmokeSupport';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

interface DialogBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

function dialogBounds(
  status: HarnessStatus,
  dialogName: string,
): DialogBounds | null {
  const boundsByDialog = status.overlayDialogBounds as
    Record<string, DialogBounds | null> | undefined;
  return boundsByDialog?.[dialogName] ?? null;
}

function scrollPosition(status: HarnessStatus, dialogName: string): number {
  const positions = status.overlayScrollPositions as
    Record<string, number> | undefined;
  return Number(positions?.[dialogName] ?? 0);
}

function requireBoundsInside(
  bounds: DialogBounds | null,
  columns: number,
  rows: number,
  label: string,
): asserts bounds is DialogBounds {
  requireCondition(bounds !== null, `${label} publishes live bounds`);
  requireCondition(
    bounds.left >= 0 && bounds.top >= 0,
    `${label} starts inside the terminal`,
  );
  requireCondition(
    bounds.left + bounds.width <= columns,
    `${label} right edge stays inside ${columns} columns`,
  );
  requireCondition(
    bounds.top + bounds.height <= rows,
    `${label} bottom edge stays inside ${rows} rows`,
  );
}

function discoveredClosePosition(
  snapshot: HarnessSnapshot.Model,
  title: string,
): { column: number; row: number } {
  const titlePosition = markerPosition(snapshot, title);
  const titleRow = snapshot.rowText(titlePosition.row);
  const closeColumn = titleRow.indexOf(
    '✕',
    titlePosition.column + title.length,
  );
  requireCondition(
    closeColumn >= 0,
    `${title} has a discovered top-edge close control`,
  );
  return { column: closeColumn, row: titlePosition.row };
}

function clickCell(
  driver: PtyTestDriver.Model,
  column: number,
  row: number,
): void {
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column,
    row,
    button: 'left',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column,
    row,
    button: 'left',
  });
}

async function clickStatusMarker(
  driver: PtyTestDriver.Model,
  marker: string,
): Promise<void> {
  const snapshot = await driver.awaitGridCondition(
    `status control ${marker.trim()} is visible`,
    (candidate) => candidate.rowText(candidate.rows - 1).includes(marker),
  );
  const statusRow = snapshot.rows - 1;
  const markerColumn = snapshot.rowText(statusRow).indexOf(marker);
  requireCondition(
    markerColumn >= 0,
    `status control ${marker.trim()} is visible`,
  );
  clickCell(driver, markerColumn, statusRow);
}

async function openSettingsByMouse(
  driver: PtyTestDriver.Model,
  statusPath: string,
): Promise<HarnessStatus> {
  const snapshot = await driver.awaitGridCondition(
    'the settings gear is visible',
    (candidate) => candidate.findText('⚙') !== null,
  );
  const gearPosition = markerPosition(snapshot, '⚙');
  clickCell(driver, gearPosition.column, gearPosition.row);
  return await awaitStatusPublication(
    statusPath,
    'Settings is open',
    (status) => status.settingsOpen === true,
  );
}

async function closeSettingsWithEscape(
  driver: PtyTestDriver.Model,
  statusPath: string,
  focusLabel: string,
): Promise<void> {
  driver.sendRawInputWithoutFrameExpectation('\x1b');
  await awaitStatusPublication(
    statusPath,
    `Settings closes from ${focusLabel} focus`,
    (status) => status.settingsOpen === false,
  );
  pass(`bare Escape closes Settings from ${focusLabel} focus`);
}

async function focusPanelOutsideDialog(
  driver: PtyTestDriver.Model,
  statusPath: string,
  expectedContentIdentifier: string,
): Promise<void> {
  const status = await awaitStatusPublication(
    statusPath,
    `the ${expectedContentIdentifier} panel geometry is available`,
    (candidate) => {
      const layoutSlots = candidate.layoutSlots as
        Record<string, DialogBounds> | undefined;
      return (
        candidate.panelActiveContent === expectedContentIdentifier &&
        layoutSlots?.bottomPanel !== undefined
      );
    },
  );
  const bottomPanel = (status.layoutSlots as Record<string, DialogBounds>)
    .bottomPanel;
  requireCondition(
    bottomPanel !== undefined,
    `${expectedContentIdentifier} bottom-panel bounds are published`,
  );
  clickCell(
    driver,
    bottomPanel.left + bottomPanel.width - 2,
    bottomPanel.top + 2,
  );
  await awaitStatusPublication(
    statusPath,
    `${expectedContentIdentifier} is focused beneath Settings`,
    (candidate) =>
      candidate.settingsOpen === true &&
      candidate.terminalFocused === true &&
      candidate.panelActiveContent === expectedContentIdentifier,
  );
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-overlay-dialog-harness-'));
const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-overlay-dialog-harness-home-'),
);
const statusPath = join(homeDirectory, 'status.json');
await Bun.write(join(fixtureRoot, 'document.txt'), 'alpha\nbeta\ngamma\n');
const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log(
    '== harness overlays: live resize clamps Settings and shared thumb scrolls ==',
  );
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('document.txt') !== null,
    15_000,
  );
  driver.sendKeys('Enter');
  await awaitStatusPublication(
    statusPath,
    'the fixture document is active',
    (status) => String(status.activeBuffer).endsWith('/document.txt'),
  );
  driver.sendKeys('Control+,');
  await awaitStatusPublication(
    statusPath,
    'Settings is open before resize',
    (status) => status.settingsOpen === true,
  );
  driver.resize(54, 12);
  let status = await awaitStatusPublication(
    statusPath,
    'Settings publishes resized bounds',
    (candidate) => {
      const bounds = dialogBounds(candidate, 'settingsPanel');
      return (
        bounds !== null &&
        bounds.left + bounds.width <= 54 &&
        bounds.top + bounds.height <= 12
      );
    },
  );
  let settingsBounds = dialogBounds(status, 'settingsPanel');
  requireBoundsInside(settingsBounds, 54, 12, 'Settings');
  let snapshot = await driver.awaitGridCondition(
    'Settings title and close control remain visible after resize',
    (candidate) =>
      candidate.findText('Settings') !== null &&
      candidate.findText('✕') !== null,
  );
  const settingsClosePosition = discoveredClosePosition(snapshot, 'Settings');
  requireCondition(settingsBounds !== null, 'Settings bounds remain available');
  const scrollbarColumn = settingsBounds.left + settingsBounds.width - 2;
  const scrollbarTopRow = settingsBounds.top + 1;
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: scrollbarColumn,
    row: scrollbarTopRow,
    button: 'left',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'move',
    column: scrollbarColumn,
    row: Math.min(
      settingsBounds.top + settingsBounds.height - 2,
      scrollbarTopRow + 4,
    ),
    button: 'left',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: scrollbarColumn,
    row: Math.min(
      settingsBounds.top + settingsBounds.height - 2,
      scrollbarTopRow + 4,
    ),
    button: 'left',
  });
  status = await awaitStatusPublication(
    statusPath,
    'the Settings thumb drag advances the shared viewport',
    (candidate) => scrollPosition(candidate, 'settingsPanel') > 0,
  );
  const scrollAfterThumb = scrollPosition(status, 'settingsPanel');
  requireCondition(
    scrollAfterThumb > 0,
    'Settings thumb drag scrolls overflow',
  );
  driver.sendMouse({
    kind: 'wheel',
    column: settingsBounds.left + 2,
    row: settingsBounds.top + 2,
    direction: 'down',
  });
  status = await awaitStatusPublication(
    statusPath,
    'the Settings wheel stays on the shared viewport',
    (candidate) =>
      scrollPosition(candidate, 'settingsPanel') >= scrollAfterThumb,
  );
  requireCondition(
    scrollPosition(status, 'settingsPanel') >= scrollAfterThumb,
    'Settings wheel uses the same scroll authority',
  );
  clickCell(driver, settingsClosePosition.column, settingsClosePosition.row);
  await awaitStatusPublication(
    statusPath,
    'the discovered Settings close control closes the dialog',
    (candidate) => candidate.settingsOpen === false,
  );
  pass('Settings top-edge close control closes through the model close path');

  console.log(
    '== harness overlays: shortcut dialog clamps, scrolls, and closes by mouse ==',
  );
  driver.sendKeys('Shift+F1');
  status = await awaitStatusPublication(
    statusPath,
    'shortcut help opens in the resized terminal',
    (candidate) => candidate.shortcutHelpOpen === true,
  );
  const shortcutBounds = dialogBounds(status, 'shortcutHelp');
  requireBoundsInside(shortcutBounds, 54, 12, 'Keyboard Shortcuts');
  driver.sendKeys('PageDown');
  status = await awaitStatusPublication(
    statusPath,
    'shortcut PageDown advances the shared viewport',
    (candidate) => scrollPosition(candidate, 'shortcutHelp') > 0,
  );
  requireCondition(
    Number(status.shortcutHelpScrollTop) ===
      scrollPosition(status, 'shortcutHelp'),
    'shortcut semantic projection mirrors the shared viewport',
  );
  snapshot = await driver.awaitGridCondition(
    'Keyboard Shortcuts close control is visible',
    (candidate) =>
      candidate.findText('Keyboard Shortcuts') !== null &&
      candidate.findText('✕') !== null,
  );
  const shortcutClosePosition = discoveredClosePosition(
    snapshot,
    'Keyboard Shortcuts',
  );
  clickCell(driver, shortcutClosePosition.column, shortcutClosePosition.row);
  await awaitStatusPublication(
    statusPath,
    'the shortcut close control closes the sheet',
    (candidate) => candidate.shortcutHelpOpen === false,
  );
  pass('Keyboard Shortcuts top-edge close control closes through its model');

  console.log(
    '== harness overlays: Escape outranks retained editor and terminal focus ==',
  );
  driver.resize(100, 32);
  await driver.awaitQuiescence();
  driver.sendKeys('Control+,');
  await awaitStatusPublication(
    statusPath,
    'Settings opens from editor focus',
    (candidate) => candidate.settingsOpen === true,
  );
  await closeSettingsWithEscape(driver, statusPath, 'editor');

  await clickStatusMarker(driver, ' ❯ ');
  await awaitStatusPublication(
    statusPath,
    'the terminal panel is visible',
    (candidate) =>
      candidate.terminalVisible === true &&
      candidate.panelActiveContent === 'terminal',
  );
  await openSettingsByMouse(driver, statusPath);
  await focusPanelOutsideDialog(driver, statusPath, 'terminal');
  await closeSettingsWithEscape(driver, statusPath, 'terminal region');

  await clickStatusMarker(driver, ' ❯ ');
  await awaitStatusPublication(
    statusPath,
    'the terminal panel closes before the agent-only case',
    (candidate) => candidate.terminalVisible === false,
  );
  await clickStatusMarker(driver, ' ✦ ');
  await awaitStatusPublication(
    statusPath,
    'the agent-only panel is visible',
    (candidate) =>
      candidate.terminalVisible === true &&
      candidate.panelActiveContent === 'agent',
  );
  await openSettingsByMouse(driver, statusPath);
  await focusPanelOutsideDialog(driver, statusPath, 'agent');
  await closeSettingsWithEscape(driver, statusPath, 'agent region');

  console.log(
    '== harness overlays: Escape closes from contents-list and popup focus ==',
  );
  await clickStatusMarker(driver, ' ❯ ');
  status = await awaitStatusPublication(
    statusPath,
    'both panel contents and the docked contents list are visible',
    (candidate) =>
      candidate.panelListVisible === true &&
      Array.isArray(candidate.panelCellIds) &&
      candidate.panelCellIds.length === 2,
  );
  await openSettingsByMouse(driver, statusPath);
  const panelListGeometry = status.panelListGeometry as DialogBounds & {
    visible: boolean;
  };
  clickCell(
    driver,
    panelListGeometry.left + panelListGeometry.width - 2,
    panelListGeometry.top + 1,
  );
  await awaitStatusPublication(
    statusPath,
    'the contents list retains panel focus beneath Settings',
    (candidate) =>
      candidate.settingsOpen === true && candidate.terminalFocused === true,
  );
  await closeSettingsWithEscape(driver, statusPath, 'contents list');

  snapshot = driver.snapshot();
  const tabCountStatus = await awaitStatusPublication(
    statusPath,
    'the buffer tab count is published',
    (candidate) => typeof candidate.bufferTabCount === 'number',
  );
  const bufferBadge = `/${String(tabCountStatus.bufferTabCount)}`;
  const badgePosition = markerPosition(snapshot, bufferBadge);
  clickCell(driver, badgePosition.column, badgePosition.row);
  await awaitStatusPublication(
    statusPath,
    'the bounded popup is open for its discovered close probe',
    (candidate) => candidate.boundedListPopupOpen === true,
  );
  snapshot = await driver.awaitGridCondition(
    'the bounded popup title and close control are visible',
    (candidate) =>
      candidate.findText('Open Buffers') !== null &&
      candidate.findText('✕') !== null,
  );
  const boundedPopupClosePosition = discoveredClosePosition(
    snapshot,
    'Open Buffers',
  );
  clickCell(
    driver,
    boundedPopupClosePosition.column,
    boundedPopupClosePosition.row,
  );
  await awaitStatusPublication(
    statusPath,
    'the bounded popup closes through its shared close control',
    (candidate) => candidate.boundedListPopupOpen === false,
  );
  pass('bounded popup uses the shared discovered top-edge close control');

  snapshot = driver.snapshot();
  const reopenedBadgePosition = markerPosition(snapshot, bufferBadge);
  clickCell(driver, reopenedBadgePosition.column, reopenedBadgePosition.row);
  await awaitStatusPublication(
    statusPath,
    'the bounded popup reopens above retained content focus',
    (candidate) => candidate.boundedListPopupOpen === true,
  );
  driver.sendRawInputWithoutFrameExpectation('\x1b');
  await awaitStatusPublication(
    statusPath,
    'Escape closes the bounded popup',
    (candidate) => candidate.boundedListPopupOpen === false,
  );
  pass(
    'bare Escape closes the popup before retained pane content can consume it',
  );

  console.log('smoke-overlay-dialog-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
