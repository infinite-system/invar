#!/usr/bin/env bun
// Driven overlay contract: dialog geometry stays bounded, every modal outside press closes through the
// model without reaching the pane beneath, inside actions remain live, and captured drags may leave.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Modal focus withdraws host terminal projections (src/modules/ui/ui.invariants.md)
// invariant: Overlay dialogs stay inside the terminal (src/modules/ui/ui.invariants.md)
// invariant: Overlay keyboard actions have visible mouse paths (src/modules/ui/ui.invariants.md)
// invariant: Modal outside presses dismiss and consume (src/modules/ui/ui.invariants.md)
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

interface UnderlyingInteractionState {
  cursor: unknown;
  focus: unknown;
  activeBuffer: unknown;
  activeBufferIndex: unknown;
  activeWorkspaceIndex: unknown;
  bufferRevision: unknown;
  dirty: unknown;
  terminalVisible: unknown;
  terminalFocused: unknown;
  panelActiveContent: unknown;
  panelFocusedIndex: unknown;
  primaryDockVisible: unknown;
  sidebarView: unknown;
  rightDockVisible: unknown;
  rightDockFocused: unknown;
}

interface BoundedPopupGeometry {
  boxLeft: number;
  boxTop: number;
  boxWidth: number;
  boxHeight: number;
  listLeft: number;
  listTop: number;
  listColumns: number;
  listRows: number;
}

type CursorVisibility = 'hidden' | 'shown' | 'unobserved';

function cursorVisibilityFromOutput(output: string): CursorVisibility {
  const showSequenceOffset = output.lastIndexOf('\x1b[?25h');
  const hideSequenceOffset = output.lastIndexOf('\x1b[?25l');
  if (showSequenceOffset < 0 && hideSequenceOffset < 0) return 'unobserved';
  return showSequenceOffset > hideSequenceOffset ? 'shown' : 'hidden';
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

async function focusPanelBeforeOpeningDialog(
  driver: PtyTestDriver.Model,
  statusPath: string,
  expectedContentIdentifier: string,
): Promise<void> {
  // Focus the panel BEFORE the dialog opens. This used to click the panel while
  // Settings was already open, which stopped working the moment outside-press
  // dismissal landed: that click is now a dismissal gesture, so the wait for
  // "still open AND panel focused" could never be satisfied. Retained focus
  // beneath a modal is what the occlusion rule is about, and this is how a user
  // actually reaches it — working in the terminal, then opening Settings over it.
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
    `${expectedContentIdentifier} is focused before the dialog opens`,
    (candidate) =>
      candidate.terminalFocused === true &&
      candidate.panelActiveContent === expectedContentIdentifier,
  );
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

function boundedPopupBounds(status: HarnessStatus): DialogBounds | null {
  const geometry = status.boundedListPopupGeometry as
    BoundedPopupGeometry | null | undefined;
  return geometry
    ? {
        left: geometry.boxLeft,
        top: geometry.boxTop,
        width: geometry.boxWidth,
        height: geometry.boxHeight,
      }
    : null;
}

function boundedPopupItemPositionOrNull(
  snapshot: HarnessSnapshot.Model,
  status: HarnessStatus,
  itemText: string,
): { column: number; row: number } | null {
  const geometry = status.boundedListPopupGeometry as
    BoundedPopupGeometry | null | undefined;
  if (!geometry) return null;
  for (
    let row = geometry.listTop;
    row < geometry.listTop + geometry.listRows;
    row++
  ) {
    const rowText = Array.from(snapshot.rowText(row))
      .slice(geometry.listLeft, geometry.listLeft + geometry.listColumns)
      .join('');
    const relativeColumn = rowText.indexOf(itemText);
    if (relativeColumn >= 0) {
      return { column: geometry.listLeft + relativeColumn, row };
    }
  }
  return null;
}

function boundedPopupItemPosition(
  snapshot: HarnessSnapshot.Model,
  status: HarnessStatus,
  itemText: string,
): { column: number; row: number } {
  const position = boundedPopupItemPositionOrNull(snapshot, status, itemText);
  if (position) return position;
  throw new Error(`${itemText} is not visible inside the bounded popup`);
}

function underlyingInteractionState(
  status: HarnessStatus,
): UnderlyingInteractionState {
  return {
    cursor: status.cursor,
    focus: status.focus,
    activeBuffer: status.activeBuffer,
    activeBufferIndex: status.activeBufferIndex,
    activeWorkspaceIndex: status.activeWorkspaceIndex,
    bufferRevision: status.bufferRevision,
    dirty: status.dirty,
    terminalVisible: status.terminalVisible,
    terminalFocused: status.terminalFocused,
    panelActiveContent: status.panelActiveContent,
    panelFocusedIndex: status.panelFocusedIndex,
    primaryDockVisible: status.primaryDockVisible,
    sidebarView: status.sidebarView,
    rightDockVisible: status.rightDockVisible,
    rightDockFocused: status.rightDockFocused,
  };
}

function cellIsInside(
  bounds: DialogBounds,
  column: number,
  row: number,
): boolean {
  return (
    column >= bounds.left &&
    column < bounds.left + bounds.width &&
    row >= bounds.top &&
    row < bounds.top + bounds.height
  );
}

function discoveredOutsideActionPosition(
  snapshot: HarnessSnapshot.Model,
  bounds: DialogBounds,
  label: string,
): { column: number; row: number } {
  for (const marker of [' ❯ ', ' ✦ ']) {
    const position = snapshot.findText(marker);
    if (position && !cellIsInside(bounds, position.column, position.row)) {
      return position;
    }
  }
  const rightDockStatusPosition = {
    column: snapshot.columns - 2,
    row: snapshot.rows - 1,
  };
  if (
    !cellIsInside(
      bounds,
      rightDockStatusPosition.column,
      rightDockStatusPosition.row,
    )
  ) {
    return rightDockStatusPosition;
  }
  throw new Error(
    `${label} has no discovered outside status action in the current frame`,
  );
}

async function dismissOutsideAndRequireConsumed(
  driver: PtyTestDriver.Model,
  statusPath: string,
  label: string,
  openStatus: HarnessStatus,
  bounds: DialogBounds | null,
  closed: (status: HarnessStatus) => boolean,
): Promise<{ column: number; row: number }> {
  requireCondition(
    bounds !== null,
    `${label} publishes bounds before dismissal`,
  );
  const snapshot = await driver.awaitGridCondition(
    `${label} paints its single-token close anchor before outside dismissal`,
    (candidate) => candidate.findText('✕') !== null,
  );
  const outsidePosition = discoveredOutsideActionPosition(
    snapshot,
    bounds,
    label,
  );
  const underlyingBefore = underlyingInteractionState(openStatus);
  clickCell(driver, outsidePosition.column, outsidePosition.row);
  const closedStatus = await awaitStatusPublication(
    statusPath,
    `${label} closes after its discovered outside press`,
    closed,
  );
  requireCondition(
    JSON.stringify(underlyingInteractionState(closedStatus)) ===
      JSON.stringify(underlyingBefore),
    `${label} outside dismissal leaves cursor focus and active panes unchanged`,
  );
  pass(
    `${label} consumes its outside press before the underlying status action`,
  );
  return outsidePosition;
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

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-overlay-dialog-harness-'));
const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-overlay-dialog-harness-home-'),
);
const statusPath = join(homeDirectory, 'status.json');
await Bun.write(join(fixtureRoot, 'document.txt'), 'alpha\nbeta\ngamma\n');
await Bun.write(join(fixtureRoot, 'other.txt'), 'other\n');
HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q', '-b', 'main']);
HarnessSmoke.Class.runGit(fixtureRoot, ['add', '-A']);
HarnessSmoke.Class.runGit(fixtureRoot, [
  '-c',
  'user.email=overlay@example.test',
  '-c',
  'user.name=overlay',
  'commit',
  '-q',
  '-m',
  'overlay fixture',
]);
for (const branchName of ['branch-alpha', 'branch-beta']) {
  HarnessSmoke.Class.runGit(fixtureRoot, ['branch', branchName]);
}
const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  retainFullOutput: true,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log(
    '== harness overlays: live resize clamps Settings and shared thumb scrolls ==',
  );
  let snapshot = await driver.awaitGridCondition(
    'the single-token document.txt fixture anchor is visible',
    (candidate) => candidate.findText('document.txt') !== null,
    15_000,
  );
  const initialDocumentPosition = markerPosition(snapshot, 'document.txt');
  clickCell(
    driver,
    initialDocumentPosition.column,
    initialDocumentPosition.row,
  );
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
  snapshot = await driver.awaitGridCondition(
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
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: scrollbarColumn,
    row: scrollbarTopRow,
    button: 'left',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'move',
    column: Math.max(0, settingsBounds.left - 1),
    row: scrollbarTopRow + 2,
    button: 'left',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: Math.max(0, settingsBounds.left - 1),
    row: scrollbarTopRow + 2,
    button: 'left',
  });
  status = await awaitStatusPublication(
    statusPath,
    'Settings remains open after its captured thumb drag leaves the dialog',
    (candidate) => candidate.settingsOpen === true,
  );
  requireCondition(
    status.settingsOpen === true,
    'Settings remains open when its captured thumb drag leaves the dialog',
  );
  pass('an inside-started Settings scrollbar drag may leave without dismissal');
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
  await clickStatusMarker(driver, '?');
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

  console.log('== harness overlays: modal outside presses are consumed ==');
  driver.resize(100, 32);
  await driver.awaitQuiescence();
  driver.sendKeys('Control+,');
  status = await awaitStatusPublication(
    statusPath,
    'Settings opens with published bounds for outside dismissal',
    (candidate) =>
      candidate.settingsOpen === true &&
      dialogBounds(candidate, 'settingsPanel') !== null,
  );
  const settingsOutsidePosition = await dismissOutsideAndRequireConsumed(
    driver,
    statusPath,
    'Settings',
    status,
    dialogBounds(status, 'settingsPanel'),
    (candidate) => candidate.settingsOpen === false,
  );
  const underlyingStateBeforeNextPress = underlyingInteractionState(status);
  clickCell(
    driver,
    settingsOutsidePosition.column,
    settingsOutsidePosition.row,
  );
  await awaitStatusPublication(
    statusPath,
    'the first post-dismissal press reaches the underlying status action',
    (candidate) =>
      JSON.stringify(underlyingInteractionState(candidate)) !==
      JSON.stringify(underlyingStateBeforeNextPress),
  );
  clickCell(
    driver,
    settingsOutsidePosition.column,
    settingsOutsidePosition.row,
  );
  await awaitStatusPublication(
    statusPath,
    'the underlying status action returns to its pre-probe visibility',
    (candidate) =>
      JSON.stringify(underlyingInteractionState(candidate)) ===
      JSON.stringify(underlyingStateBeforeNextPress),
  );
  pass('the press after outside dismissal behaves normally');

  driver.sendKeys('Control+,');
  await awaitStatusPublication(
    statusPath,
    'Settings reopens for its Escape path',
    (candidate) => candidate.settingsOpen === true,
  );
  await closeSettingsWithEscape(driver, statusPath, 'editor');

  await clickStatusMarker(driver, ' ❯ ');
  await awaitStatusPublication(
    statusPath,
    'the terminal panel is visible',
    (candidate) =>
      candidate.terminalVisible === true &&
      candidate.terminalFocused === true &&
      candidate.panelActiveContent === 'terminal',
  );
  await driver.awaitQuiescence();
  requireCondition(
    cursorVisibilityFromOutput(driver.recordedOutput()) === 'shown',
    'cursor byte probe observes the focused terminal cursor without an overlay',
  );
  await focusPanelBeforeOpeningDialog(driver, statusPath, 'terminal');
  await openSettingsByMouse(driver, statusPath);
  await driver.awaitGridCondition(
    'Settings is painted above retained terminal focus',
    (candidate) => candidate.findText('Settings') !== null,
  );
  requireCondition(
    cursorVisibilityFromOutput(driver.recordedOutput()) === 'hidden',
    'cursor visibility bytes leave the hardware cursor hidden while Settings owns the screen',
  );
  await closeSettingsWithEscape(driver, statusPath, 'terminal region');
  await driver.awaitGridCondition(
    'Settings is absent after Escape restores terminal focus',
    (candidate) => candidate.findText('Settings') === null,
  );
  requireCondition(
    cursorVisibilityFromOutput(driver.recordedOutput()) === 'shown',
    'cursor visibility bytes restore the focused terminal cursor after Settings closes',
  );
  await clickStatusMarker(driver, '?');
  await awaitStatusPublication(
    statusPath,
    'Keyboard Shortcuts opens above retained terminal focus',
    (candidate) => candidate.shortcutHelpOpen === true,
  );
  await driver.awaitGridCondition(
    'Keyboard Shortcuts is painted above retained terminal focus',
    (candidate) => candidate.findText('Keyboard Shortcuts') !== null,
  );
  requireCondition(
    cursorVisibilityFromOutput(driver.recordedOutput()) === 'hidden',
    'cursor visibility bytes leave the hardware cursor hidden under Keyboard Shortcuts',
  );
  clickCell(driver, 0, 5);
  await awaitStatusPublication(
    statusPath,
    'clicking the shortcut backdrop closes the overlay',
    (candidate) => candidate.shortcutHelpOpen === false,
  );
  await driver.awaitGridCondition(
    'Keyboard Shortcuts is absent after backdrop dismissal',
    (candidate) => candidate.findText('Keyboard Shortcuts') === null,
  );
  requireCondition(
    cursorVisibilityFromOutput(driver.recordedOutput()) === 'shown',
    'cursor visibility bytes restore the focused terminal cursor after backdrop dismissal',
  );

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
  await focusPanelBeforeOpeningDialog(driver, statusPath, 'agent');
  await openSettingsByMouse(driver, statusPath);
  await closeSettingsWithEscape(driver, statusPath, 'agent region');

  console.log(
    '== harness overlays: Escape closes from contents-list and popup focus ==',
  );
  await clickStatusMarker(driver, ' ❯ ');
  // Open by MOUSE here, not Shift+F1. At this point the terminal panel holds focus,
  // and a focused terminal forwards keystrokes to the child shell — so the binding
  // never reaches the application. The status control is focus-independent, and this
  // same helper already proves the path earlier in this smoke.
  await clickStatusMarker(driver, '?');
  status = await awaitStatusPublication(
    statusPath,
    'Keyboard Shortcuts reopens with published bounds',
    (candidate) =>
      candidate.shortcutHelpOpen === true &&
      dialogBounds(candidate, 'shortcutHelp') !== null,
  );
  await dismissOutsideAndRequireConsumed(
    driver,
    statusPath,
    'Keyboard Shortcuts',
    status,
    dialogBounds(status, 'shortcutHelp'),
    (candidate) => candidate.shortcutHelpOpen === false,
  );

  driver.sendKeys('F1');
  status = await awaitStatusPublication(
    statusPath,
    'Command Palette opens with published bounds',
    (candidate) =>
      candidate.paletteOpen === true &&
      dialogBounds(candidate, 'commandPalette') !== null,
  );
  await dismissOutsideAndRequireConsumed(
    driver,
    statusPath,
    'Command Palette',
    status,
    dialogBounds(status, 'commandPalette'),
    (candidate) => candidate.paletteOpen === false,
  );
  driver.sendKeys('F1');
  await awaitStatusPublication(
    statusPath,
    'Command Palette reopens for an interior command click',
    (candidate) => candidate.paletteOpen === true,
  );
  driver.sendText('Keyboard Shortcuts');
  snapshot = await driver.awaitGridCondition(
    'the single-token Help anchor identifies the interior palette row',
    (candidate) => candidate.findText('Help:') !== null,
  );
  const shortcutCommandPosition = markerPosition(snapshot, 'Help:');
  clickCell(
    driver,
    shortcutCommandPosition.column,
    shortcutCommandPosition.row,
  );
  await awaitStatusPublication(
    statusPath,
    'the interior palette row opens Keyboard Shortcuts',
    (candidate) =>
      candidate.paletteOpen === false && candidate.shortcutHelpOpen === true,
  );
  driver.sendKeys('Escape');
  await awaitStatusPublication(
    statusPath,
    'Keyboard Shortcuts closes after the interior palette action',
    (candidate) => candidate.shortcutHelpOpen === false,
  );
  pass('Command Palette retains its interior row action');

  driver.sendKeys('Control+p');
  status = await awaitStatusPublication(
    statusPath,
    'Quick Open file search opens with published bounds',
    (candidate) =>
      candidate.quickOpenOpen === true &&
      candidate.quickOpenMode === 'files' &&
      dialogBounds(candidate, 'quickOpen') !== null,
  );
  await dismissOutsideAndRequireConsumed(
    driver,
    statusPath,
    'Quick Open file search',
    status,
    dialogBounds(status, 'quickOpen'),
    (candidate) => candidate.quickOpenOpen === false,
  );
  driver.sendKeys('Control+p');
  await awaitStatusPublication(
    statusPath,
    'Quick Open reopens for an interior file click',
    (candidate) => candidate.quickOpenOpen === true,
  );
  snapshot = await driver.awaitGridCondition(
    'the single-token other.txt anchor identifies a Quick Open result',
    (candidate) => candidate.findText('other.txt') !== null,
  );
  const otherFilePosition = markerPosition(snapshot, 'other.txt');
  clickCell(driver, otherFilePosition.column, otherFilePosition.row);
  await awaitStatusPublication(
    statusPath,
    'the interior Quick Open result activates other.txt',
    (candidate) =>
      candidate.quickOpenOpen === false &&
      String(candidate.activeBuffer).endsWith('/other.txt'),
  );
  pass('Quick Open retains its interior file action');

  driver.sendKeys('Control+Shift+o');
  status = await awaitStatusPublication(
    statusPath,
    'Open Project search opens with published bounds',
    (candidate) =>
      candidate.quickOpenOpen === true &&
      candidate.quickOpenMode === 'workspacePath' &&
      dialogBounds(candidate, 'quickOpen') !== null,
  );
  await dismissOutsideAndRequireConsumed(
    driver,
    statusPath,
    'Open Project search',
    status,
    dialogBounds(status, 'quickOpen'),
    (candidate) => candidate.quickOpenOpen === false,
  );

  driver.sendText('x');
  await awaitStatusPublication(
    statusPath,
    'other.txt is dirty before confirmation coverage',
    (candidate) => candidate.dirty === true,
  );
  driver.sendKeys('Control+w');
  status = await awaitStatusPublication(
    statusPath,
    'the dirty-tab confirmation opens with published bounds',
    (candidate) =>
      Number(candidate.pendingCloseTab) >= 0 &&
      dialogBounds(candidate, 'confirmation') !== null,
  );
  await dismissOutsideAndRequireConsumed(
    driver,
    statusPath,
    'Destructive confirmation',
    status,
    dialogBounds(status, 'confirmation'),
    (candidate) => Number(candidate.pendingCloseTab) < 0,
  );
  driver.sendKeys('Control+w');
  status = await awaitStatusPublication(
    statusPath,
    'the dirty-tab confirmation reopens for its interior cancel action',
    (candidate) =>
      Number(candidate.pendingCloseTab) >= 0 &&
      dialogBounds(candidate, 'confirmation') !== null,
  );
  snapshot = await driver.awaitGridCondition(
    'the confirmation paints its single-token close anchor',
    (candidate) => candidate.findText('✕') !== null,
  );
  const confirmationClosePosition = discoveredClosePosition(
    snapshot,
    'Confirm',
  );
  clickCell(
    driver,
    confirmationClosePosition.column,
    confirmationClosePosition.row,
  );
  await awaitStatusPublication(
    statusPath,
    'the interior confirmation close control cancels without closing the file',
    (candidate) =>
      Number(candidate.pendingCloseTab) < 0 &&
      String(candidate.activeBuffer).endsWith('/other.txt') &&
      candidate.dirty === true,
  );
  pass('confirmation retains its interior cancel action');

  console.log(
    '== harness overlays: every bounded-popup adapter dismisses outside ==',
  );
  const tabCountStatus = await awaitStatusPublication(
    statusPath,
    'two open buffers publish a badge for the buffer adapter',
    (candidate) => Number(candidate.bufferTabCount) >= 2,
  );
  snapshot = await driver.awaitGridCondition(
    'the buffer-count badge is visible before opening its adapter',
    (candidate) =>
      candidate.findText(`/${String(tabCountStatus.bufferTabCount)}`) !== null,
  );
  const bufferBadge = `/${String(tabCountStatus.bufferTabCount)}`;
  const badgePosition = markerPosition(snapshot, bufferBadge);
  clickCell(driver, badgePosition.column, badgePosition.row);
  status = await awaitStatusPublication(
    statusPath,
    'the buffer adapter opens with published bounds',
    (candidate) =>
      candidate.boundedListPopupOpen === true &&
      boundedPopupBounds(candidate) !== null,
  );
  await dismissOutsideAndRequireConsumed(
    driver,
    statusPath,
    'Open Buffers adapter',
    status,
    boundedPopupBounds(status),
    (candidate) => candidate.boundedListPopupOpen === false,
  );
  snapshot = await driver.awaitGridCondition(
    'the buffer-count badge remains visible for an interior row action',
    (candidate) => candidate.findText(bufferBadge) !== null,
  );
  const reopenedBadgePosition = markerPosition(snapshot, bufferBadge);
  clickCell(driver, reopenedBadgePosition.column, reopenedBadgePosition.row);
  status = await awaitStatusPublication(
    statusPath,
    'the buffer adapter reopens for its interior item action',
    (candidate) =>
      candidate.boundedListPopupOpen === true &&
      boundedPopupBounds(candidate) !== null,
  );
  snapshot = await driver.awaitGridCondition(
    'the single-token document.txt anchor identifies an interior buffer row',
    (candidate) =>
      boundedPopupItemPositionOrNull(candidate, status, 'document.txt') !==
      null,
  );
  const documentBufferPosition = boundedPopupItemPosition(
    snapshot,
    status,
    'document.txt',
  );
  clickCell(driver, documentBufferPosition.column, documentBufferPosition.row);
  await awaitStatusPublication(
    statusPath,
    'the interior buffer row activates document.txt',
    (candidate) =>
      candidate.boundedListPopupOpen === false &&
      String(candidate.activeBuffer).endsWith('/document.txt'),
  );
  pass('Open Buffers retains its interior item action');

  snapshot = await driver.awaitGridCondition(
    'the single-token layouts anchor identifies the command-bar adapter',
    (candidate) => candidate.findText('layouts') !== null,
  );
  const layoutsPosition = markerPosition(snapshot, 'layouts');
  clickCell(driver, layoutsPosition.column, layoutsPosition.row);
  status = await awaitStatusPublication(
    statusPath,
    'the layouts adapter opens with published bounds',
    (candidate) =>
      candidate.boundedListPopupOpen === true &&
      boundedPopupBounds(candidate) !== null,
  );
  await dismissOutsideAndRequireConsumed(
    driver,
    statusPath,
    'Layouts adapter',
    status,
    boundedPopupBounds(status),
    (candidate) => candidate.boundedListPopupOpen === false,
  );
  snapshot = await driver.awaitGridCondition(
    'the single-token layouts anchor remains available for an interior action',
    (candidate) => candidate.findText('layouts') !== null,
  );
  const reopenedLayoutsPosition = markerPosition(snapshot, 'layouts');
  clickCell(
    driver,
    reopenedLayoutsPosition.column,
    reopenedLayoutsPosition.row,
  );
  status = await awaitStatusPublication(
    statusPath,
    'the layouts adapter reopens for its interior preset action',
    (candidate) =>
      candidate.boundedListPopupOpen === true &&
      boundedPopupBounds(candidate) !== null,
  );
  snapshot = await driver.awaitGridCondition(
    'the single-token Focus anchor identifies an interior layout row',
    (candidate) =>
      boundedPopupItemPositionOrNull(candidate, status, 'Focus') !== null,
  );
  const focusPresetPosition = boundedPopupItemPosition(
    snapshot,
    status,
    'Focus',
  );
  clickCell(driver, focusPresetPosition.column, focusPresetPosition.row);
  await awaitStatusPublication(
    statusPath,
    'the interior Focus preset applies and closes the layouts adapter',
    (candidate) =>
      candidate.boundedListPopupOpen === false &&
      candidate.primaryDockVisible === false &&
      candidate.rightDockVisible === false &&
      candidate.terminalVisible === false,
  );
  pass('Layouts retains its interior preset action');

  snapshot = await driver.awaitGridCondition(
    'the single-token layouts anchor remains visible in Focus layout',
    (candidate) => candidate.findText('layouts') !== null,
  );
  const focusLayoutsPosition = markerPosition(snapshot, 'layouts');
  clickCell(driver, focusLayoutsPosition.column, focusLayoutsPosition.row);
  status = await awaitStatusPublication(
    statusPath,
    'the layouts adapter opens to restore the Default preset',
    (candidate) =>
      candidate.boundedListPopupOpen === true &&
      boundedPopupBounds(candidate) !== null,
  );
  snapshot = await driver.awaitGridCondition(
    'the single-token Default anchor identifies the restoring layout row',
    (candidate) =>
      boundedPopupItemPositionOrNull(candidate, status, 'Default') !== null,
  );
  const defaultPresetPosition = boundedPopupItemPosition(
    snapshot,
    status,
    'Default',
  );
  clickCell(driver, defaultPresetPosition.column, defaultPresetPosition.row);
  await awaitStatusPublication(
    statusPath,
    'the Default preset restores the primary dock for branch coverage',
    (candidate) =>
      candidate.boundedListPopupOpen === false &&
      candidate.primaryDockVisible === true,
  );

  snapshot = await driver.awaitGridCondition(
    'the single-token Source Control glyph is visible before branch coverage',
    (candidate) =>
      candidate.findText('⎇') !== null || candidate.findText('G') !== null,
  );
  const sourceControlPosition =
    snapshot.findText('⎇') ?? markerPosition(snapshot, 'G');
  clickCell(driver, sourceControlPosition.column, sourceControlPosition.row);
  await awaitStatusPublication(
    statusPath,
    'the discovered Source Control control opens the Git sidebar',
    (candidate) => candidate.sidebarView === 'git',
  );
  snapshot = await driver.awaitGridCondition(
    'the single-token history anchor identifies the branch adapter control',
    (candidate) => candidate.findText('history:') !== null,
  );
  const historyPosition = markerPosition(snapshot, 'history:');
  clickCell(
    driver,
    historyPosition.column + 'history:'.length,
    historyPosition.row,
  );
  status = await awaitStatusPublication(
    statusPath,
    'the branch adapter opens with published bounds',
    (candidate) =>
      candidate.boundedListPopupOpen === true &&
      boundedPopupBounds(candidate) !== null,
  );
  await dismissOutsideAndRequireConsumed(
    driver,
    statusPath,
    'Branch selector adapter',
    status,
    boundedPopupBounds(status),
    (candidate) => candidate.boundedListPopupOpen === false,
  );
  snapshot = await driver.awaitGridCondition(
    'the single-token history anchor remains available for an interior branch action',
    (candidate) => candidate.findText('history:') !== null,
  );
  const reopenedHistoryPosition = markerPosition(snapshot, 'history:');
  clickCell(
    driver,
    reopenedHistoryPosition.column + 'history:'.length,
    reopenedHistoryPosition.row,
  );
  status = await awaitStatusPublication(
    statusPath,
    'the branch adapter reopens for its interior branch action',
    (candidate) =>
      candidate.boundedListPopupOpen === true &&
      boundedPopupBounds(candidate) !== null,
  );
  snapshot = await driver.awaitGridCondition(
    'the single-token branch-alpha anchor identifies an interior branch row',
    (candidate) =>
      boundedPopupItemPositionOrNull(candidate, status, 'branch-alpha') !==
      null,
  );
  const branchPosition = boundedPopupItemPosition(
    snapshot,
    status,
    'branch-alpha',
  );
  clickCell(driver, branchPosition.column, branchPosition.row);
  await awaitStatusPublication(
    statusPath,
    'the interior branch row changes the viewed history branch',
    (candidate) =>
      candidate.boundedListPopupOpen === false &&
      candidate.gitLogBranch === 'branch-alpha',
  );
  pass('Branch selector retains its interior branch action');

  driver.sendRawInputWithoutFrameExpectation('\x1b');
  await awaitStatusPublication(
    statusPath,
    'Escape returns the history viewer to the current branch',
    (candidate) => candidate.gitLogBranch === '',
  );

  console.log('smoke-overlay-dialog-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
