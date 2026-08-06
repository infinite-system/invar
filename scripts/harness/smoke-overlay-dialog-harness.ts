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
// invariant: Wheel impulses start their own frame sequence (src/modules/ui/ui.invariants.md)
// invariant: Settings selection stays inside its viewport (src/modules/ui/ui.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
import type { HarnessSnapshot } from './HarnessSnapshot';
import {
  awaitStatusPublication,
  commandBarLayoutSwitcherPosition,
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

const sharedCloseGlyphs = (['nerd', 'unicode', 'ascii'] as const).map(
  (glyphLevel) =>
    ThemeIcons.Class.interfaceGlyphVocabularyFor(glyphLevel).panelClose,
);

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
  expectedContentKind: string,
): Promise<void> {
  // Focus the panel BEFORE the dialog opens. This used to click the panel while
  // Settings was already open, which stopped working the moment outside-press
  // dismissal landed: that click is now a dismissal gesture, so the wait for
  // "still open AND panel focused" could never be satisfied. Retained focus
  // beneath a modal is what the occlusion rule is about, and this is how a user
  // actually reaches it — working in the terminal, then opening Settings over it.
  const status = await awaitStatusPublication(
    statusPath,
    `the ${expectedContentKind} panel geometry is available`,
    (candidate) => {
      const layoutSlots = candidate.layoutSlots as
        Record<string, DialogBounds> | undefined;
      return (
        candidate.panelActiveContentKind === expectedContentKind &&
        layoutSlots?.bottomPanel !== undefined
      );
    },
  );
  const bottomPanel = (status.layoutSlots as Record<string, DialogBounds>)
    .bottomPanel;
  requireCondition(
    bottomPanel !== undefined,
    `${expectedContentKind} bottom-panel bounds are published`,
  );
  clickCell(
    driver,
    bottomPanel.left + bottomPanel.width - 2,
    bottomPanel.top + 2,
  );
  await awaitStatusPublication(
    statusPath,
    `${expectedContentKind} is focused before the dialog opens`,
    (candidate) =>
      candidate.panelFocused === true &&
      candidate.panelActiveContentKind === expectedContentKind,
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

function layoutSlotBounds(
  status: HarnessStatus,
  slotName: string,
): DialogBounds | null {
  const layoutSlots = status.layoutSlots as
    Record<string, DialogBounds> | undefined;
  return layoutSlots?.[slotName] ?? null;
}

function markerPositionWithinBoundsOrNull(
  snapshot: HarnessSnapshot.Model,
  bounds: DialogBounds,
  marker: string,
): { column: number; row: number } | null {
  for (
    let row = bounds.top;
    row < Math.min(snapshot.rows, bounds.top + bounds.height);
    row++
  ) {
    const rowText = snapshot.rowText(row);
    const markerColumn = rowText.indexOf(marker, bounds.left);
    if (
      markerColumn >= bounds.left &&
      markerColumn + marker.length <= bounds.left + bounds.width
    ) {
      return { column: markerColumn, row };
    }
  }
  return null;
}

function activityBarMarkerPositionOrNull(
  snapshot: HarnessSnapshot.Model,
  marker: string,
): { column: number; row: number } | null {
  for (let row = 0; row < snapshot.rows; row++) {
    const markerColumn = snapshot.rowText(row).slice(0, 4).indexOf(marker);
    if (markerColumn >= 0) return { column: markerColumn, row };
  }
  return null;
}

function scrollPosition(status: HarnessStatus, dialogName: string): number {
  const positions = status.overlayScrollPositions as
    Record<string, number> | undefined;
  return Number(positions?.[dialogName] ?? 0);
}

function viewportExtent(
  status: HarnessStatus,
  dialogName: string,
): { contentRows: number; viewportRows: number } | null {
  const extents = status.overlayViewportExtents as
    Record<string, { contentRows: number; viewportRows: number }> | undefined;
  return extents?.[dialogName] ?? null;
}

function settingsSelectionMarkerInsideViewport(
  snapshot: HarnessSnapshot.Model,
  status: HarnessStatus,
  selectedLabel: string,
): boolean {
  const bounds = dialogBounds(status, 'settingsPanel');
  const extent = viewportExtent(status, 'settingsPanel');
  if (!bounds || !extent) return false;
  const visibleLabelPrefix = selectedLabel.slice(
    0,
    Math.min(selectedLabel.length, 16),
  );
  const markerPosition = markerPositionWithinBoundsOrNull(
    snapshot,
    bounds,
    `› ${visibleLabelPrefix}`,
  );
  if (!markerPosition) return false;
  const viewportRow = markerPosition.row - bounds.top - 1;
  return viewportRow >= 0 && viewportRow < extent.viewportRows;
}

async function requireEverySettingsNavigationStepRevealed(
  driver: PtyTestDriver.Model,
  statusPath: string,
  geometryLabel: string,
): Promise<void> {
  let status = await awaitStatusPublication(
    statusPath,
    `Settings publishes its descriptor population at ${geometryLabel}`,
    (candidate) =>
      candidate.settingsOpen === true &&
      candidate.settingsSelected === 0 &&
      Array.isArray(candidate.settingsLabels) &&
      candidate.settingsLabels.length > 0,
  );
  const settingsLabels = status.settingsLabels as string[];
  const directions = [
    {
      keyName: 'Down',
      indices: Array.from(
        { length: settingsLabels.length - 1 },
        (_unused, index) => index + 1,
      ),
    },
    {
      keyName: 'Up',
      indices: Array.from(
        { length: settingsLabels.length - 1 },
        (_unused, index) => settingsLabels.length - index - 2,
      ),
    },
  ] as const;

  for (const direction of directions) {
    for (const selectedIndex of direction.indices) {
      driver.sendKeys(direction.keyName);
      status = await awaitStatusPublication(
        statusPath,
        `Settings selection reaches descriptor ${selectedIndex} at ${geometryLabel}`,
        (candidate) =>
          candidate.settingsSelected === selectedIndex &&
          candidate.settingsSelectedLabel === settingsLabels[selectedIndex],
      );
      const selectedLabel = settingsLabels[selectedIndex] ?? '';
      await driver.awaitGridCondition(
        `Settings descriptor ${selectedIndex} is painted inside its published viewport at ${geometryLabel}`,
        (snapshot) =>
          settingsSelectionMarkerInsideViewport(
            snapshot,
            status,
            selectedLabel,
          ),
      );
    }
  }

  pass(
    `all ${settingsLabels.length} Settings descriptors stay revealed on every ` +
      `Down and Up step at ${geometryLabel}`,
  );
}

function dialogContentRowText(
  snapshot: HarnessSnapshot.Model,
  bounds: DialogBounds,
  contentRowOffset: number,
): string {
  return snapshot
    .rowText(bounds.top + contentRowOffset)
    .slice(bounds.left + 1, bounds.left + bounds.width - 2);
}

function dialogVerticalScrollbarIsPainted(
  snapshot: HarnessSnapshot.Model,
  bounds: DialogBounds,
): boolean {
  const scrollbarColumn = bounds.left + bounds.width - 2;
  for (let row = bounds.top + 1; row < bounds.top + bounds.height - 1; row++) {
    const scrollbarCell = snapshot.cell(row, scrollbarColumn);
    const adjacentContentCell = snapshot.cell(row, scrollbarColumn - 1);
    if (
      scrollbarCell?.characters === ' ' &&
      scrollbarCell.isBackgroundRgb &&
      adjacentContentCell?.isBackgroundRgb &&
      scrollbarCell.background !== adjacentContentCell.background
    ) {
      return true;
    }
  }
  return false;
}

async function requireWheelScrollsOverlay(
  driver: PtyTestDriver.Model,
  statusPath: string,
  label: string,
  dialogName: string,
  contentRowOffset: number,
  wheelRowOffset: number = contentRowOffset,
): Promise<HarnessStatus> {
  let status = await awaitStatusPublication(
    statusPath,
    `${label} is open, scrollable, and at its top before wheel input`,
    (candidate) => {
      const extent = viewportExtent(candidate, dialogName);
      return (
        dialogBounds(candidate, dialogName) !== null &&
        extent !== null &&
        extent.contentRows > extent.viewportRows &&
        scrollPosition(candidate, dialogName) === 0
      );
    },
  );
  const bounds = dialogBounds(status, dialogName);
  requireCondition(bounds !== null, `${label} publishes its dialog bounds`);

  driver.sendMouseWithoutFrameExpectation({
    kind: 'move',
    column: bounds.left + Math.floor(bounds.width / 2),
    row: bounds.top + wheelRowOffset,
    button: 'none',
  });
  const settledBeforeWheelSnapshot = await driver.awaitGridCondition(
    `${label} paints its scrollbar before wheel input`,
    (candidate) => dialogVerticalScrollbarIsPainted(candidate, bounds),
  );
  requireCondition(
    dialogVerticalScrollbarIsPainted(settledBeforeWheelSnapshot, bounds),
    `${label} paints a scrollbar before wheel input`,
  );
  const extent = viewportExtent(status, dialogName);
  requireCondition(
    extent !== null && extent.contentRows > extent.viewportRows,
    `${label} content exceeds its visible viewport before wheel input`,
  );
  requireCondition(
    scrollPosition(status, dialogName) === 0,
    `${label} viewport is at the top before wheel input`,
  );
  const originalContent = dialogContentRowText(
    settledBeforeWheelSnapshot,
    bounds,
    contentRowOffset,
  );
  requireCondition(
    originalContent.trim().length > 0,
    `${label} has observed content on the comparison row`,
  );

  const settledAfterWheelSnapshot =
    await driver.assertContentInvariantAcrossAction({
      invariantRegion: {
        startRow: bounds.top,
        endRowExclusive: bounds.top + 1,
        startColumn: 0,
        endColumnExclusive: bounds.left,
      },
      changedRegion: {
        startRow: bounds.top + 1,
        endRowExclusive: bounds.top + bounds.height - 1,
        startColumn: bounds.left + 1,
        endColumnExclusive: bounds.left + bounds.width - 1,
      },
      actionDescription: `${label} wheel scrolls only the dialog content`,
      performAction: () =>
        driver.sendMouseWithoutFrameExpectation({
          kind: 'wheel',
          column: bounds.left + Math.floor(bounds.width / 2),
          row: bounds.top + wheelRowOffset,
          direction: 'down',
        }),
    });
  const settledContent = dialogContentRowText(
    settledAfterWheelSnapshot,
    bounds,
    contentRowOffset,
  );
  if (settledContent === originalContent) {
    const diagnosticStatus = await awaitStatusPublication(
      statusPath,
      `${label} publishes diagnostic state after an unchanged wheel row`,
      () => true,
    );
    throw new Error(
      `FAIL ${label} wheel left its observed row unchanged ` +
        `(scrollTop=${scrollPosition(diagnosticStatus, dialogName)}, ` +
        `row=${JSON.stringify(originalContent)}, ` +
        `mouse=${JSON.stringify(diagnosticStatus.mouse)})`,
    );
  }
  requireCondition(
    settledContent !== originalContent,
    `${label} wheel moves the original content off its observed row after settling`,
  );
  return status;
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

function underlyingVisibilityState(status: HarnessStatus): {
  panelVisible: unknown;
  terminalVisible: unknown;
  primaryDockVisible: unknown;
  rightDockVisible: unknown;
} {
  return {
    panelVisible: status.panelVisible,
    terminalVisible: status.terminalVisible,
    primaryDockVisible: status.primaryDockVisible,
    rightDockVisible: status.rightDockVisible,
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
  const statusRow = snapshot.rows - 1;
  const statusText = snapshot.rowText(statusRow);
  for (const marker of [' ❯ ', ' ✦ ']) {
    const markerColumn = statusText.indexOf(marker);
    const position =
      markerColumn >= 0 ? { column: markerColumn, row: statusRow } : null;
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
  if (!bounds) throw new Error(`${label} did not publish bounds`);
  const snapshot = await driver.awaitGridCondition(
    `${label} paints its single-token close anchor before outside dismissal`,
    (candidate) =>
      sharedCloseGlyphs.some((glyph) =>
        candidate
          .rowText(bounds.top)
          .slice(bounds.left, bounds.left + bounds.width)
          .includes(glyph),
      ),
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

function requireDialogCanvasMargins(
  bounds: DialogBounds | null,
  columns: number,
  rows: number,
  label: string,
): asserts bounds is DialogBounds {
  requireBoundsInside(bounds, columns, rows, label);
  requireCondition(bounds.left >= 2, `${label} keeps two columns at its left`);
  requireCondition(
    columns - bounds.left - bounds.width >= 2,
    `${label} keeps two columns at its right`,
  );
  requireCondition(bounds.top >= 3, `${label} keeps three rows above it`);
  requireCondition(
    rows - bounds.top - bounds.height >= 3,
    `${label} keeps three rows below it`,
  );
  requireCondition(
    bounds.width <= 84,
    `${label} stays within its content-derived width ceiling`,
  );
}

function discoveredClosePosition(
  snapshot: HarnessSnapshot.Model,
  title: string,
): { column: number; row: number } {
  const titlePosition = markerPosition(snapshot, title);
  const titleRow = snapshot.rowText(titlePosition.row);
  const closeColumn = Math.min(
    ...sharedCloseGlyphs
      .map((glyph) =>
        titleRow.indexOf(glyph, titlePosition.column + title.length),
      )
      .filter((column) => column >= 0),
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

async function driveContextMenuWheelAndBranchCoverage(
  fixtureRoot: string,
): Promise<void> {
  const contextMenuHomeDirectory = mkdtempSync(
    join(tmpdir(), 'tui-overlay-context-menu-home-'),
  );
  const contextMenuStatusPath = join(contextMenuHomeDirectory, 'status.json');
  mkdirSync(join(contextMenuHomeDirectory, '.config', 'invar'), {
    recursive: true,
  });
  await Bun.write(
    join(contextMenuHomeDirectory, '.config', 'invar', 'settings.json'),
    '{"glyphMode":"ascii"}\n',
  );
  const contextMenuDriver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 100,
    rows: 36,
    homeDirectory: contextMenuHomeDirectory,
    retainFullOutput: true,
    environment: {
      TUI_STATUS_PATH: contextMenuStatusPath,
      COLORTERM: 'truecolor',
    },
  });

  try {
    console.log(
      '== harness overlays: context menu wheels from a real Git row ==',
    );
    let snapshot = await contextMenuDriver.awaitGridCondition(
      'the ASCII Source Control glyph and fixture tree are visible',
      (candidate) =>
        activityBarMarkerPositionOrNull(candidate, 'G') !== null &&
        candidate.findText('other.txt') !== null,
      15_000,
    );
    const sourceControlPosition = activityBarMarkerPositionOrNull(
      snapshot,
      'G',
    );
    requireCondition(
      sourceControlPosition !== null,
      'the ASCII Source Control glyph is inside the activity bar',
    );
    if (sourceControlPosition === null) {
      throw new Error(
        'FAIL the Source Control activity-bar position is absent',
      );
    }
    contextMenuDriver.sendMouse({
      kind: 'press',
      column: Math.max(0, sourceControlPosition.column - 1),
      row: sourceControlPosition.row,
      button: 'left',
    });
    contextMenuDriver.sendMouse({
      kind: 'release',
      column: Math.max(0, sourceControlPosition.column - 1),
      row: sourceControlPosition.row,
      button: 'left',
    });
    await contextMenuDriver.awaitGridCondition(
      'Source Control paints its active accent and Git panel',
      (candidate) =>
        candidate.cell(sourceControlPosition.row, 0)?.characters === '|' &&
        candidate.findText('Git') !== null,
    );
    let status = await awaitStatusPublication(
      contextMenuStatusPath,
      'Source Control opens for context-menu coverage',
      (candidate) =>
        candidate.sidebarView === 'git' &&
        layoutSlotBounds(candidate, 'sidebar') !== null,
    );
    const contextMenuSidebarBounds = layoutSlotBounds(status, 'sidebar');
    requireCondition(
      contextMenuSidebarBounds !== null,
      'the sidebar publishes bounds for the context-menu opener',
    );
    snapshot = await contextMenuDriver.awaitGridCondition(
      'the single-token history anchor identifies the branch adapter control',
      (candidate) => candidate.findText('history:') !== null,
    );
    const historyPosition = markerPosition(snapshot, 'history:');
    clickCell(
      contextMenuDriver,
      historyPosition.column + 'history:'.length,
      historyPosition.row,
    );
    status = await awaitStatusPublication(
      contextMenuStatusPath,
      'the branch adapter opens with published bounds',
      (candidate) =>
        candidate.boundedListPopupOpen === true &&
        boundedPopupBounds(candidate) !== null,
    );
    await dismissOutsideAndRequireConsumed(
      contextMenuDriver,
      contextMenuStatusPath,
      'Branch selector adapter',
      status,
      boundedPopupBounds(status),
      (candidate) => candidate.boundedListPopupOpen === false,
    );
    snapshot = await contextMenuDriver.awaitGridCondition(
      'the single-token history anchor remains available for an interior branch action',
      (candidate) => candidate.findText('history:') !== null,
    );
    const reopenedHistoryPosition = markerPosition(snapshot, 'history:');
    clickCell(
      contextMenuDriver,
      reopenedHistoryPosition.column + 'history:'.length,
      reopenedHistoryPosition.row,
    );
    status = await awaitStatusPublication(
      contextMenuStatusPath,
      'the branch adapter reopens for its interior branch action',
      (candidate) =>
        candidate.boundedListPopupOpen === true &&
        boundedPopupBounds(candidate) !== null,
    );
    snapshot = await contextMenuDriver.awaitGridCondition(
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
    clickCell(contextMenuDriver, branchPosition.column, branchPosition.row);
    await awaitStatusPublication(
      contextMenuStatusPath,
      'the interior branch row changes the viewed history branch',
      (candidate) =>
        candidate.boundedListPopupOpen === false &&
        candidate.gitLogBranch === 'branch-alpha',
    );
    pass('Branch selector retains its interior branch action');
    contextMenuDriver.sendRawInputWithoutFrameExpectation('\x1b');
    await awaitStatusPublication(
      contextMenuStatusPath,
      'Escape returns the history viewer to the current branch',
      (candidate) => candidate.gitLogBranch === '',
    );

    snapshot = await contextMenuDriver.awaitGridCondition(
      'the changed other.txt row is visible inside the Git primary dock',
      (candidate) =>
        markerPositionWithinBoundsOrNull(
          candidate,
          contextMenuSidebarBounds,
          'other.txt',
        ) !== null,
    );
    const dirtyFilePosition = markerPositionWithinBoundsOrNull(
      snapshot,
      contextMenuSidebarBounds,
      'other.txt',
    );
    requireCondition(
      dirtyFilePosition !== null,
      'the changed other.txt row is discovered inside the Git primary dock',
    );
    contextMenuDriver.sendMouseWithoutFrameExpectation({
      kind: 'press',
      column: dirtyFilePosition.column,
      row: dirtyFilePosition.row,
      button: 'right',
    });
    status = await awaitStatusPublication(
      contextMenuStatusPath,
      'the Git change context menu opens with published bounds',
      (candidate) =>
        candidate.contextMenuOpen === true &&
        dialogBounds(candidate, 'contextMenu') !== null,
    );
    contextMenuDriver.sendMouseWithoutFrameExpectation({
      kind: 'release',
      column: dirtyFilePosition.column,
      row: dirtyFilePosition.row,
      button: 'right',
    });
    contextMenuDriver.resize(54, 5);
    await awaitStatusPublication(
      contextMenuStatusPath,
      'the context menu becomes scrollable in the constrained terminal',
      (candidate) => {
        const bounds = dialogBounds(candidate, 'contextMenu');
        return (
          candidate.contextMenuOpen === true &&
          bounds !== null &&
          bounds.left + bounds.width <= 54 &&
          bounds.top + bounds.height <= 5 &&
          scrollPosition(candidate, 'contextMenu') === 0
        );
      },
    );
    await requireWheelScrollsOverlay(
      contextMenuDriver,
      contextMenuStatusPath,
      'Context Menu',
      'contextMenu',
      1,
    );
    contextMenuDriver.sendRawInputWithoutFrameExpectation('\x1b');
    await awaitStatusPublication(
      contextMenuStatusPath,
      'Escape closes the context menu after its wheel proof',
      (candidate) => candidate.contextMenuOpen === false,
    );
  } finally {
    await contextMenuDriver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(contextMenuHomeDirectory);
  }
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-overlay-dialog-harness-'));

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-overlay-dialog-harness-home-'),
);

const statusPath = join(homeDirectory, 'status.json');

await Bun.write(join(fixtureRoot, 'document.txt'), 'alpha\nbeta\ngamma\n');

await Bun.write(join(fixtureRoot, 'other.txt'), 'other\n');

for (let fixtureFileIndex = 0; fixtureFileIndex < 30; fixtureFileIndex++) {
  await Bun.write(
    join(
      fixtureRoot,
      `scroll-fixture-${String(fixtureFileIndex).padStart(2, '0')}.txt`,
    ),
    `scroll fixture ${fixtureFileIndex}\n`,
  );
}

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

await Bun.write(join(fixtureRoot, 'other.txt'), 'other changed on disk\n');

await driveContextMenuWheelAndBranchCoverage(fixtureRoot);

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
    (candidate) => String(candidate.activeBuffer).endsWith('/document.txt'),
  );
  driver.sendKeys('Control+,');
  let status = await awaitStatusPublication(
    statusPath,
    'Settings is open before resize',
    (status) => status.settingsOpen === true,
  );
  requireDialogCanvasMargins(
    dialogBounds(status, 'settingsPanel'),
    120,
    40,
    'Settings at 120x40',
  );
  status = await requireWheelScrollsOverlay(
    driver,
    statusPath,
    'Settings',
    'settingsPanel',
    1,
  );
  await requireEverySettingsNavigationStepRevealed(
    driver,
    statusPath,
    '120x40',
  );
  status = await awaitStatusPublication(
    statusPath,
    'Settings returns to its first descriptor before the theme proof',
    (candidate) =>
      candidate.settingsSelected === 0 &&
      Array.isArray(candidate.settingsLabels),
  );
  const themeSettingIndex = (status.settingsLabels as string[]).indexOf(
    'Theme',
  );
  requireCondition(
    themeSettingIndex >= 0,
    'Settings publishes the Theme descriptor',
  );
  for (
    let navigationStep = 0;
    navigationStep < themeSettingIndex;
    navigationStep += 1
  ) {
    driver.sendKeys('Down');
    await awaitStatusPublication(
      statusPath,
      `Settings advances to the Theme descriptor step ${navigationStep + 1}`,
      (candidate) => candidate.settingsSelected === navigationStep + 1,
    );
  }
  driver.sendKeys('Right');
  status = await awaitStatusPublication(
    statusPath,
    'Settings switches to the light theme without changing its geometry',
    (candidate) =>
      candidate.settingsSelectedLabel === 'Theme' &&
      candidate.settingsSelectedValue === 'light',
  );
  requireDialogCanvasMargins(
    dialogBounds(status, 'settingsPanel'),
    120,
    40,
    'Light-theme Settings at 120x40',
  );
  driver.sendKeys('Left');
  await awaitStatusPublication(
    statusPath,
    'Settings restores the dark theme after the geometry proof',
    (candidate) =>
      candidate.settingsSelectedLabel === 'Theme' &&
      candidate.settingsSelectedValue === 'dark',
  );
  for (
    let navigationStep = themeSettingIndex;
    navigationStep > 0;
    navigationStep -= 1
  ) {
    driver.sendKeys('Up');
    await awaitStatusPublication(
      statusPath,
      `Settings returns from the Theme descriptor step ${navigationStep - 1}`,
      (candidate) => candidate.settingsSelected === navigationStep - 1,
    );
  }
  driver.resize(54, 12);
  status = await awaitStatusPublication(
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
  requireDialogCanvasMargins(settingsBounds, 54, 12, 'Settings at 54x12');
  await requireEverySettingsNavigationStepRevealed(driver, statusPath, '54x12');
  snapshot = await driver.awaitGridCondition(
    'Settings title and close control remain visible after resize',
    (candidate) =>
      candidate.findText('Settings') !== null &&
      sharedCloseGlyphs.some((glyph) => candidate.findText(glyph) !== null),
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
  clickCell(driver, settingsClosePosition.column, settingsClosePosition.row);
  await awaitStatusPublication(
    statusPath,
    'the discovered Settings close control closes the dialog',
    (candidate) => candidate.settingsOpen === false,
  );
  pass('Settings top-edge close control closes through the model close path');

  driver.resize(120, 40);
  await clickStatusMarker(driver, '?');
  status = await awaitStatusPublication(
    statusPath,
    'shortcut help opens in the larger terminal',
    (candidate) => candidate.shortcutHelpOpen === true,
  );
  requireDialogCanvasMargins(
    dialogBounds(status, 'shortcutHelp'),
    120,
    40,
    'Keyboard Shortcuts at 120x40',
  );
  driver.sendKeys('Escape');
  await awaitStatusPublication(
    statusPath,
    'shortcut help closes before the smaller geometry proof',
    (candidate) => candidate.shortcutHelpOpen === false,
  );
  await driver.awaitGridCondition(
    'the closed shortcut frame settles before reopening',
    (candidate) => candidate.findText('Keyboard Shortcuts') === null,
  );
  driver.resize(54, 12);

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
  requireDialogCanvasMargins(
    shortcutBounds,
    54,
    12,
    'Keyboard Shortcuts at 54x12',
  );
  status = await requireWheelScrollsOverlay(
    driver,
    statusPath,
    'Keyboard Shortcuts',
    'shortcutHelp',
    2,
  );
  const shortcutWheelPosition = scrollPosition(status, 'shortcutHelp');
  driver.sendKeys('PageDown');
  status = await awaitStatusPublication(
    statusPath,
    'shortcut PageDown advances the shared viewport',
    (candidate) =>
      scrollPosition(candidate, 'shortcutHelp') > shortcutWheelPosition,
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
      sharedCloseGlyphs.some((glyph) => candidate.findText(glyph) !== null),
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

  driver.sendKeys('F1');
  status = await awaitStatusPublication(
    statusPath,
    'Command Palette opens at the top for wheel input',
    (candidate) =>
      candidate.paletteOpen === true &&
      dialogBounds(candidate, 'commandPalette') !== null,
  );
  await requireWheelScrollsOverlay(
    driver,
    statusPath,
    'Command Palette',
    'commandPalette',
    2,
  );
  driver.sendKeys('Escape');
  await awaitStatusPublication(
    statusPath,
    'Command Palette closes after its wheel proof',
    (candidate) => candidate.paletteOpen === false,
  );

  driver.sendKeys('Control+p');
  status = await awaitStatusPublication(
    statusPath,
    'Quick Open opens at the top for wheel input',
    (candidate) =>
      candidate.quickOpenOpen === true &&
      dialogBounds(candidate, 'quickOpen') !== null,
  );
  await requireWheelScrollsOverlay(
    driver,
    statusPath,
    'Quick Open',
    'quickOpen',
    2,
  );
  driver.sendKeys('Escape');
  await awaitStatusPublication(
    statusPath,
    'Quick Open closes after its wheel proof',
    (candidate) => candidate.quickOpenOpen === false,
  );

  console.log('== harness overlays: modal outside presses are consumed ==');
  driver.resize(100, 32);
  await driver.awaitScreenChange();
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
  const underlyingVisibilityBeforeNextPress = underlyingVisibilityState(status);
  clickCell(
    driver,
    settingsOutsidePosition.column,
    settingsOutsidePosition.row,
  );
  await awaitStatusPublication(
    statusPath,
    'the first post-dismissal press reaches the underlying status action',
    (candidate) =>
      JSON.stringify(underlyingVisibilityState(candidate)) !==
      JSON.stringify(underlyingVisibilityBeforeNextPress),
  );
  snapshot = await driver.awaitGridCondition(
    'the changed status action settles before its restoring press',
    (candidate) =>
      candidate.rowText(candidate.rows - 1).includes(' ❯ ') ||
      candidate.rowText(candidate.rows - 1).includes(' ✦ '),
  );
  const restoringStatusActionPosition = discoveredOutsideActionPosition(
    snapshot,
    dialogBounds(status, 'settingsPanel')!,
    'the changed status row',
  );
  clickCell(
    driver,
    restoringStatusActionPosition.column,
    restoringStatusActionPosition.row,
  );
  await awaitStatusPublication(
    statusPath,
    'the underlying status action returns to its pre-probe visibility',
    (candidate) =>
      JSON.stringify(underlyingVisibilityState(candidate)) ===
      JSON.stringify(underlyingVisibilityBeforeNextPress),
  );
  pass('the press after outside dismissal behaves normally');

  driver.sendKeys('Control+,');
  await awaitStatusPublication(
    statusPath,
    'Settings reopens for its Escape path',
    (candidate) => candidate.settingsOpen === true,
  );
  await closeSettingsWithEscape(driver, statusPath, 'editor');

  driver.sendKeys('Control+j');
  await awaitStatusPublication(
    statusPath,
    'the terminal panel is visible',
    (candidate) =>
      candidate.panelVisible === true &&
      candidate.terminalVisible === true &&
      candidate.terminalFocused === true &&
      candidate.panelActiveContentKind === 'terminal',
  );
  await driver.awaitOutputCondition(
    'the focused terminal leaves the hardware cursor shown',
    () => cursorVisibilityFromOutput(driver.recordedOutput()) === 'shown',
  );
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
  await driver.awaitOutputCondition(
    'Settings leaves the retained terminal cursor hidden',
    () => cursorVisibilityFromOutput(driver.recordedOutput()) === 'hidden',
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
  await driver.awaitOutputCondition(
    'closing Settings restores the focused terminal cursor',
    () => cursorVisibilityFromOutput(driver.recordedOutput()) === 'shown',
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
  await driver.awaitOutputCondition(
    'Keyboard Shortcuts leaves the retained terminal cursor hidden',
    () => cursorVisibilityFromOutput(driver.recordedOutput()) === 'hidden',
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
  await driver.awaitOutputCondition(
    'shortcut dismissal restores the focused terminal cursor',
    () => cursorVisibilityFromOutput(driver.recordedOutput()) === 'shown',
  );
  requireCondition(
    cursorVisibilityFromOutput(driver.recordedOutput()) === 'shown',
    'cursor visibility bytes restore the focused terminal cursor after backdrop dismissal',
  );

  await clickStatusMarker(driver, ' ❯ ');
  await awaitStatusPublication(
    statusPath,
    'the terminal panel closes before the agent-only case',
    (candidate) =>
      candidate.panelVisible === false && candidate.terminalVisible === false,
  );
  driver.sendKeys('Control+Shift+a');
  await awaitStatusPublication(
    statusPath,
    'the agent-only panel is visible',
    (candidate) =>
      candidate.panelVisible === true &&
      candidate.panelActiveContentKind === 'agent',
  );
  await focusPanelBeforeOpeningDialog(driver, statusPath, 'agent');
  await openSettingsByMouse(driver, statusPath);
  await closeSettingsWithEscape(driver, statusPath, 'agent region');

  console.log(
    '== harness overlays: Escape closes from contents-list and popup focus ==',
  );
  driver.sendKeys('Control+j');
  await awaitStatusPublication(
    statusPath,
    'the terminal regains focus before the contents-list overlay cases',
    (candidate) =>
      candidate.panelVisible === true &&
      candidate.terminalFocused === true &&
      candidate.panelActiveContentKind === 'terminal',
  );
  // Open by mouse here, not Shift+F1. A focused terminal forwards that chord to its child shell.
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
  status = await awaitStatusPublication(
    statusPath,
    'Quick Open reopens for an interior file click',
    (candidate) =>
      candidate.quickOpenOpen === true &&
      dialogBounds(candidate, 'quickOpen') !== null,
  );
  const quickOpenBounds = dialogBounds(status, 'quickOpen');
  requireCondition(
    quickOpenBounds !== null,
    'Quick Open publishes bounds for its interior file click',
  );
  snapshot = await driver.awaitGridCondition(
    'the bounded other.txt anchor identifies a Quick Open result',
    (candidate) =>
      quickOpenBounds !== null &&
      markerPositionWithinBoundsOrNull(
        candidate,
        quickOpenBounds,
        'other.txt',
      ) !== null,
  );
  const otherFilePosition = markerPositionWithinBoundsOrNull(
    snapshot,
    quickOpenBounds,
    'other.txt',
  );
  requireCondition(
    otherFilePosition !== null,
    'other.txt is inside the published Quick Open bounds',
  );
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
    (candidate) =>
      sharedCloseGlyphs.some((glyph) => candidate.findText(glyph) !== null),
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
    'the theme layout glyph identifies the command-bar adapter',
    (candidate) => commandBarLayoutSwitcherPosition(candidate) !== null,
  );
  const layoutsPosition = commandBarLayoutSwitcherPosition(snapshot)!;
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
    'the theme layout glyph remains available for an interior action',
    (candidate) => commandBarLayoutSwitcherPosition(candidate) !== null,
  );
  const reopenedLayoutsPosition = commandBarLayoutSwitcherPosition(snapshot)!;
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
    'the theme layout glyph remains visible in Focus layout',
    (candidate) => commandBarLayoutSwitcherPosition(candidate) !== null,
  );
  const focusLayoutsPosition = commandBarLayoutSwitcherPosition(snapshot)!;
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
  status = await awaitStatusPublication(
    statusPath,
    'the Default preset restores the primary dock for branch coverage',
    (candidate) =>
      candidate.boundedListPopupOpen === false &&
      candidate.primaryDockVisible === true,
  );

  console.log('smoke-overlay-dialog-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
