#!/usr/bin/env bun
// Live layout configuration and shared-splitter contract. Every input travels through the real PTY;
// semantic slot edges come from the status projection and paint assertions come from emulator cells.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Splitter paint and hit testing share one geometry (src/modules/ui/ui.invariants.md)
// invariant: Layout slots derive from one configuration (src/modules/layout/layout.invariants.md)
// invariant: Right dock command and mouse affordance share one toggle (src/modules/ui/ui.invariants.md)
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

interface Rectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface SplitterRegion extends Rectangle {
  visible: boolean;
}

type SplitterName = 'sidebar' | 'git' | 'bottomPanel' | 'rightDock';

function layoutSlot(status: StatusSnapshot, slotName: string): Rectangle {
  const layoutSlots = status.layoutSlots as Record<string, Rectangle> | undefined;
  const rectangle = layoutSlots?.[slotName];
  if (!rectangle) throw new Error(`Missing layout slot ${slotName}`);
  return rectangle;
}

function splitterRegion(
  status: StatusSnapshot,
  splitterName: SplitterName,
): SplitterRegion {
  const splitterRegions = status.splitterRegions as
    | Record<SplitterName, SplitterRegion>
    | undefined;
  const region = splitterRegions?.[splitterName];
  if (!region) throw new Error(`Missing splitter region ${splitterName}`);
  return region;
}

function rectangleRight(rectangle: Rectangle): number {
  return rectangle.left + rectangle.width;
}

function rectangleBottom(rectangle: Rectangle): number {
  return rectangle.top + rectangle.height;
}

function splitterPoint(region: SplitterRegion): { column: number; row: number } {
  return {
    column: region.left + Math.floor(Math.max(0, region.width - 1) / 2),
    row: region.top + Math.floor(Math.max(0, region.height - 1) / 2),
  };
}

function backgroundAt(
  snapshot: HarnessSnapshot.Model,
  point: { column: number; row: number },
): number {
  const cell = snapshot.cell(point.row, point.column);
  if (!cell) throw new Error(`No emulator cell at ${point.column},${point.row}`);
  return cell.background;
}

function clickCell(
  driver: PtyTestDriver.Model,
  column: number,
  row: number,
): void {
  driver.sendMouse({ kind: 'press', column, row, button: 'left' });
  driver.sendMouse({ kind: 'release', column, row, button: 'left' });
}

function settingsWidgetPosition(
  snapshot: HarnessSnapshot.Model,
  label: string,
): { column: number; row: number } {
  const labelPosition = snapshot.findText(label);
  if (!labelPosition) throw new Error(`Settings row is not visible: ${label}`);
  const widgetColumn = snapshot.rowText(labelPosition.row).lastIndexOf('>');
  if (widgetColumn < 0) throw new Error(`Settings increment arrow is not visible: ${label}`);
  return { column: widgetColumn, row: labelPosition.row };
}

async function clickSettingIncrement(
  driver: PtyTestDriver.Model,
  statusPath: string,
  label: string,
  settingName: string,
  expectedValue: string,
): Promise<StatusSnapshot> {
  const position = settingsWidgetPosition(driver.snapshot(), label);
  clickCell(driver, position.column, position.row);
  const status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate[settingName] === expectedValue,
  );
  await driver.awaitQuiescence();
  HarnessSmoke.Class.pass(`${label} mouse edit live-applied ${expectedValue}`);
  return status;
}

async function invokeCommand(
  driver: PtyTestDriver.Model,
  commandTitle: string,
): Promise<void> {
  driver.sendKeys('F1');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Command Palette') !== null,
  );
  driver.sendText(commandTitle);
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText(commandTitle) !== null,
  );
  driver.sendKeys('Enter');
}

async function assertSplitterStates(
  driver: PtyTestDriver.Model,
  statusPath: string,
  splitterName: SplitterName,
  dragColumnDelta: number,
  dragRowDelta: number,
  changed: (
    before: SplitterRegion,
    after: SplitterRegion,
    status: StatusSnapshot,
  ) => boolean,
): Promise<void> {
  await driver.awaitQuiescence();
  const initialStatus = HarnessSmoke.Class.readStatus(statusPath);
  const initialRegion = splitterRegion(initialStatus, splitterName);
  HarnessSmoke.Class.requireCondition(
    initialRegion.visible && initialRegion.width > 0 && initialRegion.height > 0,
    `${splitterName} splitter has a one-cell visible hit region`,
  );
  HarnessSmoke.Class.requireCondition(
    initialRegion.width === 1 || initialRegion.height === 1,
    `${splitterName} splitter uses the shared one-cell cross axis`,
  );
  const initialPoint = splitterPoint(initialRegion);
  const restingBackground = backgroundAt(driver.snapshot(), initialPoint);

  driver.sendMouse({
    kind: 'move',
    column: initialPoint.column,
    row: initialPoint.row,
  });
  const hoveredSnapshot = await driver.awaitSnapshot(
    (snapshot) => backgroundAt(snapshot, initialPoint) !== restingBackground,
  );
  const activeBackground = backgroundAt(hoveredSnapshot, initialPoint);
  HarnessSmoke.Class.pass(`${splitterName} splitter is muted at rest and lit on hover`);

  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: initialPoint.column,
    row: initialPoint.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'move',
    column: initialPoint.column + dragColumnDelta,
    row: initialPoint.row + dragRowDelta,
    button: 'left',
  });
  const changedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => changed(
      initialRegion,
      splitterRegion(candidate, splitterName),
      candidate,
    ),
  );
  await driver.awaitQuiescence();
  const draggedRegion = splitterRegion(changedStatus, splitterName);
  const draggedPoint = splitterPoint(draggedRegion);
  const pointerTarget = {
    column: initialPoint.column + dragColumnDelta,
    row: initialPoint.row + dragRowDelta,
  };
  HarnessSmoke.Class.requireCondition(
    backgroundAt(driver.snapshot(), draggedPoint) === activeBackground
      || backgroundAt(driver.snapshot(), initialPoint) === activeBackground
      || backgroundAt(driver.snapshot(), pointerTarget) === activeBackground,
    `${splitterName} splitter stays lit while captured drag moves its geometry`,
  );

  driver.sendMouse({
    kind: 'release',
    column: initialPoint.column + dragColumnDelta,
    row: initialPoint.row + dragRowDelta,
    button: 'left',
  });
  driver.sendMouse({ kind: 'move', column: 1, row: 1 });
  await driver.awaitSnapshot(
    (snapshot) => backgroundAt(snapshot, splitterPoint(
      splitterRegion(HarnessSmoke.Class.readStatus(statusPath), splitterName),
    )) === restingBackground,
  );
  HarnessSmoke.Class.pass(`${splitterName} splitter returns to its muted rest role`);
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-layout-harness-fixture-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-layout-harness-home-'));
const settingsDirectory = join(homeDirectory, '.config', 'invar');
const statusPath = join(homeDirectory, 'status.json');
mkdirSync(settingsDirectory, { recursive: true });
await Bun.write(
  join(settingsDirectory, 'settings.json'),
  '{"glyphMode":"ascii"}\n',
);
await Bun.write(join(fixtureRoot, 'layout.txt'), 'layout geometry\n');
HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);
HarnessSmoke.Class.runGit(fixtureRoot, ['add', '.']);
HarnessSmoke.Class.runGit(fixtureRoot, [
  '-c',
  'user.name=layout-smoke',
  '-c',
  'user.email=layout-smoke@example.test',
  'commit',
  '-qm',
  'base',
]);
await Bun.write(join(fixtureRoot, 'layout.txt'), 'layout geometry\nchanged\n');

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 60,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    COLORTERM: 'truecolor',
  },
});

try {
  console.log('== harness layout: exact defaults and center panel geometry ==');
  let status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.ready === true,
    20_000,
  );
  HarnessSmoke.Class.requireCondition(
    status.sidebarPosition === 'left',
    'sidebar default is left',
  );
  HarnessSmoke.Class.requireCondition(
    status.panelAlignment === 'center',
    'panel default is center',
  );
  HarnessSmoke.Class.requireCondition(
    status.leftDockVerticalSpan === 'full-height',
    'left dock default is full-height',
  );
  HarnessSmoke.Class.requireCondition(
    status.rightDockVerticalSpan === 'ends-at-panel',
    'right dock default ends-at-panel',
  );
  HarnessSmoke.Class.requireCondition(
    status.rightDockVisible === false,
    'right dock starts empty and hidden',
  );

  driver.sendKeys('F8');
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.terminalVisible === true,
  );
  await driver.awaitQuiescence();
  let sidebar = layoutSlot(status, 'sidebar');
  let editorCenter = layoutSlot(status, 'editorCenter');
  let bottomPanel = layoutSlot(status, 'bottomPanel');
  HarnessSmoke.Class.requireCondition(
    bottomPanel.left === editorCenter.left
      && rectangleRight(bottomPanel) === rectangleRight(editorCenter),
    'center alignment puts the bottom panel exactly under the editor',
  );
  const sidebarScreenRegion = splitterRegion(status, 'sidebar');
  HarnessSmoke.Class.requireCondition(
    sidebarScreenRegion.top + sidebar.height === Number(status.height) - 1,
    'the full-height left dock reaches the row above the status bar',
  );

  console.log('== harness layout: shared sidebar and bottom-panel splitter states ==');
  await assertSplitterStates(
    driver,
    statusPath,
    'sidebar',
    5,
    0,
    (before, after) => after.left > before.left,
  );
  await assertSplitterStates(
    driver,
    statusPath,
    'bottomPanel',
    0,
    -4,
    (before, after) => after.top < before.top,
  );

  console.log('== harness layout: settings mouse edits reconfigure live slot edges ==');
  driver.sendKeys('F8');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.terminalVisible === false,
  );
  driver.sendKeys('Control+,');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Sidebar position') !== null
      && snapshot.findText('Right dock vertical span') !== null,
  );
  status = await clickSettingIncrement(
    driver,
    statusPath,
    'Sidebar position',
    'sidebarPosition',
    'right',
  );
  sidebar = layoutSlot(status, 'sidebar');
  editorCenter = layoutSlot(status, 'editorCenter');
  HarnessSmoke.Class.requireCondition(
    sidebar.left >= rectangleRight(editorCenter),
    'right sidebar configuration places the primary dock after the editor',
  );

  status = await clickSettingIncrement(
    driver,
    statusPath,
    'Left dock vertical span',
    'leftDockVerticalSpan',
    'ends-at-panel',
  );
  status = await clickSettingIncrement(
    driver,
    statusPath,
    'Panel alignment',
    'panelAlignment',
    'right',
  );
  bottomPanel = layoutSlot(status, 'bottomPanel');
  HarnessSmoke.Class.requireCondition(
    rectangleRight(bottomPanel) === 120,
    'right alignment reaches the viewport right edge when the primary dock ends at the panel',
  );
  status = await clickSettingIncrement(
    driver,
    statusPath,
    'Panel alignment',
    'panelAlignment',
    'justify',
  );
  bottomPanel = layoutSlot(status, 'bottomPanel');
  HarnessSmoke.Class.requireCondition(
    bottomPanel.left === 0 && rectangleRight(bottomPanel) === 120,
    'justify alignment spans the full viewport when both docks can end at the panel',
  );
  status = await clickSettingIncrement(
    driver,
    statusPath,
    'Panel alignment',
    'panelAlignment',
    'left',
  );
  bottomPanel = layoutSlot(status, 'bottomPanel');
  editorCenter = layoutSlot(status, 'editorCenter');
  HarnessSmoke.Class.requireCondition(
    bottomPanel.left === 0 && rectangleRight(bottomPanel) === rectangleRight(editorCenter),
    'left alignment ends at the editor right edge',
  );
  status = await clickSettingIncrement(
    driver,
    statusPath,
    'Panel alignment',
    'panelAlignment',
    'center',
  );
  bottomPanel = layoutSlot(status, 'bottomPanel');
  HarnessSmoke.Class.requireCondition(
    bottomPanel.left === editorCenter.left
      && rectangleRight(bottomPanel) === rectangleRight(editorCenter),
    'cycling panel alignment returns to the editor-centered slot',
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.settingsOpen === false,
  );

  console.log('== harness layout: git splitter shares rest, hover, and captured-drag paint ==');
  driver.sendKeys('Control+Shift+g');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.sidebarView === 'git'
      && splitterRegion(candidate, 'git').visible,
  );
  await assertSplitterStates(
    driver,
    statusPath,
    'git',
    0,
    4,
    (before, after, candidate) =>
      after.top > before.top || Number(candidate.gitSplitRatio) > 0.5,
  );

  console.log('== harness layout: right-dock command, button, geometry, and shared resize ==');
  await invokeCommand(driver, 'View: Toggle Right Dock');
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.rightDockVisible === true,
  );
  HarnessSmoke.Class.requireCondition(
    Number(status.rightDockColumns) > 0,
    'command opened a real right-dock viewport',
  );
  driver.sendKeys('Control+Alt+b');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.rightDockVisible === false,
  );
  await driver.awaitQuiescence();
  const statusBarRow = driver.snapshot().rows - 1;
  const rightDockButtonColumn = driver.snapshot().rowText(statusBarRow).lastIndexOf(' R ');
  HarnessSmoke.Class.requireCondition(
    rightDockButtonColumn >= 0,
    'right-dock status affordance is visibly present',
  );
  clickCell(driver, rightDockButtonColumn + 1, statusBarRow);
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.rightDockVisible === true,
  );
  HarnessSmoke.Class.pass('clicking the status affordance opened the command-owned host');

  driver.sendKeys('F8');
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.terminalVisible === true,
  );
  HarnessSmoke.Class.pass('bottom panel opened without hiding the right dock');
  const rightDock = layoutSlot(status, 'rightDock');
  const bottomPanelSplitter = layoutSlot(status, 'bottomPanelSplitter');
  HarnessSmoke.Class.requireCondition(
    rectangleBottom(rightDock) === bottomPanelSplitter.top,
    'ends-at-panel right dock stops at the bottom-panel splitter',
  );
  await assertSplitterStates(
    driver,
    statusPath,
    'rightDock',
    -5,
    0,
    (before, after) => after.left < before.left,
  );
  HarnessSmoke.Class.requireCondition(
    Number(HarnessSmoke.Class.readStatus(statusPath).rightDockWidth) > 28,
    'right-dock splitter resize live-applied and persisted its width setting',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-layout-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
