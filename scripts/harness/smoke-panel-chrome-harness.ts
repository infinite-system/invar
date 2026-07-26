#!/usr/bin/env bun
// Driven proof for panel heading controls, multi-instance visibility, center-only expansion, and
// the near-full-height unexpanded drag.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Panel heading controls share paint and hit geometry (src/modules/ui/ui.invariants.md)
// invariant: Each panel instance owns one independent session (src/modules/terminal/terminal.invariants.md)
// invariant: Expanded panel overrides only the editor center rows (src/modules/layout/layout.invariants.md)
// invariant: An unexpanded bottom panel leaves one editor row (src/modules/layout/layout.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { HarnessSmoke } from './HarnessSmoke';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver, type HarnessGridRegion } from './PtyTestDriver';

interface Rectangle {
  left: number;
  top: number;
  width: number;
  height: number;
  visible?: boolean;
}

function clickCell(
  driver: PtyTestDriver.Model,
  column: number,
  row: number,
): void {
  driver.sendMouse({ kind: 'press', column, row, button: 'left' });
  driver.sendMouse({ kind: 'release', column, row, button: 'left' });
}

function rectangle(status: StatusSnapshot, slot: string): Rectangle {
  const slots = status.layoutSlots as Record<string, Rectangle> | undefined;
  const resolved = slots?.[slot];
  if (!resolved) throw new Error(`Missing layout slot: ${slot}`);
  return resolved;
}

function splitterRectangle(status: StatusSnapshot): Rectangle {
  const splitters = status.splitterRegions as
    Record<string, Rectangle> | undefined;
  const resolved = splitters?.bottomPanel;
  if (!resolved) throw new Error('Missing bottom-panel splitter geometry');
  return resolved;
}

function contentsListRectangle(status: StatusSnapshot): Rectangle {
  const resolved = status.panelListGeometry as Rectangle | undefined;
  if (!resolved) throw new Error('Missing panel contents-list geometry');
  return resolved;
}

async function clickHeadingAction(
  driver: PtyTestDriver.Model,
  marker: 'EXPAND' | 'RESTORE',
  action: 'add' | 'expand',
): Promise<void> {
  await driver.awaitQuiescence();
  const snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText(marker) !== null,
  );
  const position = snapshot.findText(marker);
  if (!position) throw new Error(`Missing panel heading marker: ${marker}`);
  clickCell(
    driver,
    action === 'add' ? position.column - 3 : position.column,
    position.row,
  );
}

async function awaitPopup(
  driver: PtyTestDriver.Model,
  statusPath: string,
  timeoutMilliseconds = 30_000,
): Promise<{
  status: StatusSnapshot;
  geometry: Rectangle & { listTop: number; listLeft: number };
}> {
  const status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Add panel bounded list is open with two items',
    (candidate) =>
      candidate.boundedListPopupOpen === true &&
      Number(candidate.boundedListPopupMatches) === 2 &&
      candidate.boundedListPopupGeometry !== null,
    timeoutMilliseconds,
  );
  const geometry = status.boundedListPopupGeometry as
    (Rectangle & { listTop: number; listLeft: number }) | undefined;
  if (!geometry) throw new Error('Missing Add panel popup geometry');
  const snapshot = await driver.awaitGridCondition(
    'the Add popup paints Terminal and Agent through the bounded list',
    (candidate) =>
      candidate.findText('Add') !== null &&
      candidate.rowText(geometry.listTop).includes('Terminal') &&
      candidate.rowText(geometry.listTop + 1).includes('Agent'),
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('Add') !== null &&
      snapshot.rowText(geometry.listTop).includes('Terminal') &&
      snapshot.rowText(geometry.listTop + 1).includes('Agent'),
    'Add popup paints Terminal and Agent through the bounded list',
  );
  return { status, geometry };
}

async function openAddPopup(
  driver: PtyTestDriver.Model,
  statusPath: string,
): ReturnType<typeof awaitPopup> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clickHeadingAction(driver, 'EXPAND', 'add');
    try {
      return await awaitPopup(driver, statusPath, 2_500);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function clickPopupRow(
  driver: PtyTestDriver.Model,
  geometry: Rectangle & { listTop: number; listLeft: number },
  rowIndex: number,
): void {
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: geometry.listLeft + 1,
    row: geometry.listTop + rowIndex,
    button: 'left',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: geometry.listLeft + 1,
    row: geometry.listTop + rowIndex,
    button: 'left',
  });
}

function dockGeometry(status: StatusSnapshot): string {
  return JSON.stringify({
    activityBar: rectangle(status, 'activityBar'),
    sidebar: rectangle(status, 'sidebar'),
    sidebarSplitter: rectangle(status, 'sidebarSplitter'),
    rightDock: rectangle(status, 'rightDock'),
    rightDockSplitter: rectangle(status, 'rightDockSplitter'),
  });
}

async function filesHeadingRegion(
  driver: PtyTestDriver.Model,
): Promise<HarnessGridRegion> {
  const snapshot = await driver.awaitGridCondition(
    'the Files heading is rendered before the panel opens',
    (candidate) => candidate.findText('Files') !== null,
  );
  const headingPosition = snapshot.findText('Files');
  if (!headingPosition) throw new Error('Missing Files heading position');
  return {
    startRow: headingPosition.row,
    endRowExclusive: headingPosition.row + 1,
    startColumn: headingPosition.column,
    endColumnExclusive: headingPosition.column + 'Files'.length,
  };
}

function requireExpandedGeometry(
  status: StatusSnapshot,
  regularStatus: StatusSnapshot,
  snapshot: HarnessSnapshot.Model,
  label: string,
): void {
  const regularPanel = rectangle(regularStatus, 'bottomPanel');
  const expandedPanel = rectangle(status, 'bottomPanel');
  const expandedEditor = rectangle(status, 'editorCenter');
  const expandedSplitter = rectangle(status, 'bottomPanelSplitter');
  HarnessSmoke.Class.requireCondition(
    status.panelExpanded === true &&
      expandedPanel.top === 0 &&
      expandedPanel.left === regularPanel.left &&
      expandedPanel.width === regularPanel.width &&
      expandedPanel.height === regularPanel.top + regularPanel.height &&
      expandedEditor.height === 0 &&
      expandedSplitter.height === 0,
    `${label} expansion occupies the exact editor-plus-panel row extent`,
  );
  HarnessSmoke.Class.requireCondition(
    dockGeometry(status) === dockGeometry(regularStatus),
    `${label} expansion leaves both dock rectangles byte-identical`,
  );
  const restorePosition = snapshot.findText('RESTORE');
  const paintedTopRow = (restorePosition?.row ?? 0) - 1;
  const topLeftCell = snapshot.cell(paintedTopRow, expandedPanel.left);
  const bottomLeftCell = snapshot.cell(
    paintedTopRow + expandedPanel.height - 1,
    expandedPanel.left,
  );
  HarnessSmoke.Class.requireCondition(
    paintedTopRow >= 0 &&
      Boolean(topLeftCell?.characters.trim()) &&
      Boolean(bottomLeftCell?.characters.trim()),
    `${label} frame paints the expanded slot's top and bottom edges`,
  );
}

async function driveSecondSize(): Promise<void> {
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'invar-panel-chrome-compact-'),
  );
  const statusPath = join(homeDirectory, 'status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: join(process.cwd(), 'fixtures'),
    columns: 88,
    rows: 24,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_AGENT_BACKEND: 'echo',
    },
  });
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the compact application is ready',
      (status) => status.ready === true,
      15_000,
    );
    const compactFilesHeadingRegion = await filesHeadingRegion(driver);
    await driver.assertContentInvariantAcrossAction({
      invariantRegion: compactFilesHeadingRegion,
      changedRegion: {
        startRow: 12,
        endRowExclusive: 23,
        startColumn: 0,
        endColumnExclusive: 88,
      },
      actionDescription:
        'F8 opens the compact panel while the top application chrome stays fixed',
      performAction: () => driver.sendKeys('F8'),
    });
    const regularStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the compact terminal panel is visible',
      (status) =>
        status.terminalVisible === true &&
        status.panelActiveContent === 'terminal',
    );
    await clickHeadingAction(driver, 'EXPAND', 'expand');
    const expandedStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the compact panel is expanded',
      (status) => status.panelExpanded === true,
    );
    const expandedSnapshot = await driver.awaitSnapshot(
      (snapshot) => snapshot.findText('RESTORE') !== null,
    );
    requireExpandedGeometry(
      expandedStatus,
      regularStatus,
      expandedSnapshot,
      '88x24',
    );
  } finally {
    driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

console.log('== harness panel-chrome: boot and prove the quiet baseline ==');
const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-panel-chrome-'));
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
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the application is ready with its panel hidden',
    (status) => status.ready === true && status.terminalVisible === false,
    15_000,
  );
  const regularFilesHeadingRegion = await filesHeadingRegion(driver);
  await driver.assertContentInvariantAcrossAction({
    invariantRegion: regularFilesHeadingRegion,
    changedRegion: {
      startRow: 20,
      endRowExclusive: 39,
      startColumn: 0,
      endColumnExclusive: 120,
    },
    actionDescription:
      'F8 opens the panel while the top application chrome stays fixed',
    performAction: () => driver.sendKeys('F8'),
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Terminal 1 is visible',
    (status) =>
      status.panelActiveContent === 'terminal' &&
      Array.isArray(status.panelContentLabels) &&
      status.panelContentLabels.join(',') === 'Terminal',
  );

  console.log(
    '== harness panel-chrome: Add creates and selects independent instances ==',
  );
  let popup = await openAddPopup(driver, statusPath);
  clickPopupRow(driver, popup.geometry, 0);
  let status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Terminal 2 is registered and visible instead of Terminal 1',
    (candidate) =>
      Array.isArray(candidate.panelContentLabels) &&
      candidate.panelContentLabels.join(',') === 'Terminal,Terminal 2' &&
      Array.isArray(candidate.panelCellIds) &&
      candidate.panelCellIds.join(',') === 'terminal-2',
  );
  HarnessSmoke.Class.pass('Terminal selection adds an independent Terminal 2');

  let list = contentsListRectangle(status);
  HarnessSmoke.Class.requireCondition(
    list.visible === true && list.height > 0,
    'contents list remains visible for hidden and visible instances',
  );
  clickCell(driver, list.left + 4, list.top);
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the contents list selects hidden Terminal 1',
    (candidate) =>
      Array.isArray(candidate.panelCellIds) &&
      candidate.panelCellIds.join(',') === 'terminal',
  );
  HarnessSmoke.Class.pass('contents-list selection swaps same-kind visibility');

  list = contentsListRectangle(status);
  clickCell(driver, list.left + list.width - 1, list.top + 1);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Terminal 2 list close removes only that instance',
    (candidate) =>
      Array.isArray(candidate.panelContentLabels) &&
      candidate.panelContentLabels.join(',') === 'Terminal' &&
      candidate.panelListVisible === false,
  );
  HarnessSmoke.Class.pass('contents-list close destroys only Terminal 2');

  popup = await openAddPopup(driver, statusPath);
  clickPopupRow(driver, popup.geometry, 1);
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Agent 1 is added beside Terminal 1',
    (candidate) =>
      Array.isArray(candidate.panelContentKinds) &&
      candidate.panelContentKinds.join(',') === 'agent,terminal' &&
      Array.isArray(candidate.panelCellIds) &&
      candidate.panelCellIds.join(',') === 'agent,terminal',
  );
  HarnessSmoke.Class.pass('Agent selection adds the second offered kind');

  popup = await openAddPopup(driver, statusPath);
  clickPopupRow(driver, popup.geometry, 1);
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Agent 2 is registered and visible instead of Agent 1',
    (candidate) =>
      Array.isArray(candidate.panelContentLabels) &&
      candidate.panelContentLabels.join(',') === 'Agent,Terminal,Agent 2' &&
      Array.isArray(candidate.panelCellIds) &&
      candidate.panelCellIds.join(',') === 'agent-2,terminal',
  );
  HarnessSmoke.Class.pass('a second Agent selection adds independent Agent 2');

  list = contentsListRectangle(status);
  clickCell(driver, list.left + 4, list.top);
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the contents list restores hidden Agent 1',
    (candidate) =>
      Array.isArray(candidate.panelCellIds) &&
      candidate.panelCellIds.join(',') === 'agent,terminal',
  );
  list = contentsListRectangle(status);
  clickCell(driver, list.left + list.width - 1, list.top + 2);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Agent 2 list close removes only that instance',
    (candidate) =>
      Array.isArray(candidate.panelContentLabels) &&
      candidate.panelContentLabels.join(',') === 'Agent,Terminal' &&
      Array.isArray(candidate.panelCellIds) &&
      candidate.panelCellIds.join(',') === 'agent,terminal',
  );
  HarnessSmoke.Class.pass('Agent instances select and close through the list');

  const agentPosition = await driver
    .awaitSnapshot((snapshot) => snapshot.findText('Claude') !== null)
    .then((snapshot) => snapshot.findText('Claude'));
  if (!agentPosition) throw new Error('Missing Claude agent heading');
  const agentHeadingText = driver.snapshot().rowText(agentPosition.row);
  const agentCloseColumn = agentHeadingText.indexOf(
    ' X ',
    agentPosition.column,
  );
  HarnessSmoke.Class.requireCondition(
    agentCloseColumn >= 0,
    'Agent heading paints its own close control',
  );
  clickCell(driver, agentCloseColumn + 1, agentPosition.row);
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Agent heading close removes Agent 1',
    (candidate) =>
      Array.isArray(candidate.panelContentLabels) &&
      candidate.panelContentLabels.join(',') === 'Terminal' &&
      Array.isArray(candidate.panelCellIds) &&
      candidate.panelCellIds.join(',') === 'terminal',
  );
  HarnessSmoke.Class.pass('heading X closes its own content region');

  console.log(
    '== harness panel-chrome: Expand overrides only center rows and restores ==',
  );
  const regularStatus = status;
  const regularPanel = rectangle(regularStatus, 'bottomPanel');
  await clickHeadingAction(driver, 'EXPAND', 'expand');
  const expandedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the 120x40 panel is expanded',
    (candidate) => candidate.panelExpanded === true,
  );
  const expandedSnapshot = await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('RESTORE') !== null,
  );
  requireExpandedGeometry(
    expandedStatus,
    regularStatus,
    expandedSnapshot,
    '120x40',
  );

  await clickHeadingAction(driver, 'RESTORE', 'expand');
  const restoredStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the panel restores its previous height',
    (candidate) =>
      candidate.panelExpanded === false &&
      JSON.stringify(
        (candidate.layoutSlots as Record<string, Rectangle>)?.bottomPanel,
      ) === JSON.stringify(regularPanel),
  );
  HarnessSmoke.Class.requireCondition(
    JSON.stringify(rectangle(restoredStatus, 'bottomPanel')) ===
      JSON.stringify(regularPanel),
    'Restore returns to the exact prior panel rectangle',
  );

  console.log(
    '== harness panel-chrome: splitter reaches the new near-full maximum ==',
  );
  const splitter = splitterRectangle(restoredStatus);
  const splitterColumn = splitter.left + Math.floor(splitter.width / 2);
  driver.sendMouse({
    kind: 'press',
    column: splitterColumn,
    row: splitter.top,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'move',
    column: splitterColumn,
    row: 0,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: splitterColumn,
    row: 0,
    button: 'left',
  });
  const maximumStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the unexpanded splitter clamps at one editor row',
    (candidate) =>
      rectangle(candidate, 'editorCenter').height === 1 &&
      rectangle(candidate, 'bottomPanelSplitter').top === 1,
  );
  const maximumPanel = rectangle(maximumStatus, 'bottomPanel');
  const maximumEditor = rectangle(maximumStatus, 'editorCenter');
  const maximumSplitter = rectangle(maximumStatus, 'bottomPanelSplitter');
  HarnessSmoke.Class.requireCondition(
    maximumEditor.height === 1 &&
      maximumSplitter.height === 1 &&
      maximumPanel.top === 2 &&
      maximumPanel.height === regularPanel.top + regularPanel.height - 2,
    'drag maximum leaves only the one-row editor sliver and splitter',
  );

  console.log(
    '== harness panel-chrome: repeat exact expansion edges at 88x24 ==',
  );
  await driveSecondSize();
  console.log('smoke-panel-chrome-harness: ALL-PASS');
} finally {
  driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
