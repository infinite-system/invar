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
type LayoutSettingName =
  | 'sidebarPosition'
  | 'panelAlignment'
  | 'leftDockVerticalSpan'
  | 'rightDockVerticalSpan';

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

function layoutTopRow(
  snapshot: HarnessSnapshot.Model,
  bottomPanel: Rectangle,
): number {
  return snapshot.rows - 1 - rectangleBottom(bottomPanel);
}

function assertPanelAlignmentGeometry(
  driver: PtyTestDriver.Model,
  status: StatusSnapshot,
  context: string,
): void {
  const panelAlignment = String(status.panelAlignment);
  const editorCenter = layoutSlot(status, 'editorCenter');
  const bottomPanel = layoutSlot(status, 'bottomPanel');
  const expectedLeft =
    panelAlignment === 'left' || panelAlignment === 'justify'
      ? 0
      : editorCenter.left;
  const expectedRight =
    panelAlignment === 'right' || panelAlignment === 'justify'
      ? Number(status.width)
      : rectangleRight(editorCenter);
  HarnessSmoke.Class.requireCondition(
    bottomPanel.left === expectedLeft
      && rectangleRight(bottomPanel) === expectedRight,
    `${context}: ${panelAlignment} alignment resolves exact slot edges ${expectedLeft}-${expectedRight}`,
  );

  const snapshot = driver.snapshot();
  const panelTopRow = layoutTopRow(snapshot, bottomPanel) + bottomPanel.top;
  const leftCorner = snapshot.cell(panelTopRow, bottomPanel.left);
  const rightCorner = snapshot.cell(panelTopRow, rectangleRight(bottomPanel) - 1);
  HarnessSmoke.Class.requireCondition(
    leftCorner !== null
      && rightCorner !== null
      && leftCorner.characters.trim().length > 0
      && rightCorner.characters.trim().length > 0,
    `${context}: ${panelAlignment} slot edges are painted in the emulator frame`,
  );
}

function assertDockVerticalSpanGeometry(
  driver: PtyTestDriver.Model,
  status: StatusSnapshot,
  slotName: 'sidebar' | 'rightDock',
  settingName: 'leftDockVerticalSpan' | 'rightDockVerticalSpan',
  context: string,
): void {
  const dock = layoutSlot(status, slotName);
  const bottomPanel = layoutSlot(status, 'bottomPanel');
  const bottomPanelSplitter = layoutSlot(status, 'bottomPanelSplitter');
  const verticalSpan = String(status[settingName]);
  if (slotName === 'rightDock' && status.rightDockVisible !== true) {
    HarnessSmoke.Class.requireCondition(
      dock.width === 0 && dock.height === 0,
      `${context}: hidden right dock has a zero-area slot for ${verticalSpan}`,
    );
    return;
  }

  const expectedBottom =
    verticalSpan === 'full-height'
      ? rectangleBottom(bottomPanel)
      : bottomPanelSplitter.top;
  HarnessSmoke.Class.requireCondition(
    rectangleBottom(dock) === expectedBottom,
    `${context}: ${slotName} ${verticalSpan} resolves bottom edge ${expectedBottom}`,
  );

  const snapshot = driver.snapshot();
  const dockBottomRow =
    layoutTopRow(snapshot, bottomPanel) + rectangleBottom(dock) - 1;
  const dockBottomCorner = snapshot.cell(dockBottomRow, dock.left);
  HarnessSmoke.Class.requireCondition(
    dockBottomCorner !== null
      && dockBottomCorner.characters.trim().length > 0,
    `${context}: ${slotName} ${verticalSpan} bottom edge is painted in the emulator frame`,
  );
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

function layoutSettingDescriptorIndex(settingName: LayoutSettingName): number {
  if (settingName === 'sidebarPosition') return 25;
  if (settingName === 'panelAlignment') return 26;
  if (settingName === 'leftDockVerticalSpan') return 27;
  return 28;
}

async function adjustSettingThroughSettings(
  driver: PtyTestDriver.Model,
  statusPath: string,
  settingName: LayoutSettingName,
  expectedValue: string,
): Promise<StatusSnapshot> {
  const targetDescriptorIndex = layoutSettingDescriptorIndex(settingName);
  const currentDescriptorIndex = Number(
    HarnessSmoke.Class.readStatus(statusPath).settingsSelected,
  );
  const selectionDelta = targetDescriptorIndex - currentDescriptorIndex;
  if (selectionDelta !== 0) {
    const selectionKey = selectionDelta > 0 ? 'Down' : 'Up';
    driver.sendKeys(
      ...Array.from(
        { length: Math.abs(selectionDelta) },
        () => selectionKey,
      ),
    );
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      (candidate) =>
        Number(candidate.settingsSelected) === targetDescriptorIndex,
    );
  }
  driver.sendKeys('Right');
  const status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate[settingName] === expectedValue,
  );
  await driver.awaitQuiescence();
  HarnessSmoke.Class.pass(
    `${settingName} settings edit live-applied ${expectedValue}`,
  );
  return status;
}

async function closeSettingsForLayoutFrame(
  driver: PtyTestDriver.Model,
  statusPath: string,
): Promise<void> {
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.settingsOpen === false,
  );
  await driver.awaitQuiescence();
}

async function reopenSettingsAfterLayoutFrame(
  driver: PtyTestDriver.Model,
  statusPath: string,
): Promise<void> {
  driver.sendKeys('Control+,');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.settingsOpen === true,
  );
  await driver.awaitQuiescence();
}

async function cyclePanelAlignments(
  driver: PtyTestDriver.Model,
  statusPath: string,
  context: string,
): Promise<StatusSnapshot> {
  const alignmentCycle = ['left', 'center', 'right', 'justify'] as const;
  let status = HarnessSmoke.Class.readStatus(statusPath);
  for (
    let panelAlignmentCount = 0;
    panelAlignmentCount < alignmentCycle.length;
    panelAlignmentCount++
  ) {
    const currentAlignmentIndex = alignmentCycle.indexOf(
      status.panelAlignment as (typeof alignmentCycle)[number],
    );
    const expectedAlignment =
      alignmentCycle[(currentAlignmentIndex + 1) % alignmentCycle.length]!;
    status = await adjustSettingThroughSettings(
      driver,
      statusPath,
      'panelAlignment',
      expectedAlignment,
    );
    await closeSettingsForLayoutFrame(driver, statusPath);
    assertPanelAlignmentGeometry(driver, status, context);
    await reopenSettingsAfterLayoutFrame(driver, statusPath);
  }
  return status;
}

async function changeDockVerticalSpan(
  driver: PtyTestDriver.Model,
  statusPath: string,
  slotName: 'sidebar' | 'rightDock',
  settingName: 'leftDockVerticalSpan' | 'rightDockVerticalSpan',
  context: string,
): Promise<StatusSnapshot> {
  const currentStatus = HarnessSmoke.Class.readStatus(statusPath);
  const expectedSpan =
    currentStatus[settingName] === 'full-height'
      ? 'ends-at-panel'
      : 'full-height';
  const status = await adjustSettingThroughSettings(
    driver,
    statusPath,
    settingName,
    expectedSpan,
  );
  await closeSettingsForLayoutFrame(driver, statusPath);
  assertDockVerticalSpanGeometry(
    driver,
    status,
    slotName,
    settingName,
    context,
  );
  await reopenSettingsAfterLayoutFrame(driver, statusPath);
  return status;
}

async function exerciseLayoutSettingsConfigurationMatrix(
  driver: PtyTestDriver.Model,
  statusPath: string,
  context: string,
): Promise<StatusSnapshot> {
  let status = await cyclePanelAlignments(driver, statusPath, context);
  status = await changeDockVerticalSpan(
    driver,
    statusPath,
    'sidebar',
    'leftDockVerticalSpan',
    context,
  );
  status = await cyclePanelAlignments(driver, statusPath, context);
  status = await changeDockVerticalSpan(
    driver,
    statusPath,
    'rightDock',
    'rightDockVerticalSpan',
    context,
  );
  status = await cyclePanelAlignments(driver, statusPath, context);
  status = await changeDockVerticalSpan(
    driver,
    statusPath,
    'sidebar',
    'leftDockVerticalSpan',
    context,
  );
  status = await cyclePanelAlignments(driver, statusPath, context);
  status = await changeDockVerticalSpan(
    driver,
    statusPath,
    'rightDock',
    'rightDockVerticalSpan',
    context,
  );
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
  // Park the pointer away from the splitter before sampling the resting background: a previous
  // drive step can leave the mouse ON this cell (hover already lit), and then "background changes
  // on hover" never fires. Row 0 is the workspace tab strip — never a splitter cell.
  driver.sendMouseWithoutFrameExpectation({ kind: 'move', column: 0, row: 0 });
  await driver.awaitQuiescence();
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

  console.log('== harness layout: settings UI edits reconfigure live slot edges ==');
  clickCell(
    driver,
    layoutSlot(HarnessSmoke.Class.readStatus(statusPath), 'sidebar').left + 2,
    4,
  );
  await driver.awaitQuiescence();
  driver.sendKeys('Control+,');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Sidebar position') !== null
      && snapshot.findText(
        'Bottom panel alignment (edges without a dock coincide)',
      ) !== null
      && snapshot.findText(
        'Primary dock vertical span (when bottom panel is open)',
      ) !== null
      && snapshot.findText(
        'Right dock vertical span (when dock and panel are open)',
      ) !== null,
  );
  HarnessSmoke.Class.pass(
    'settings disclose that hidden dock spans and empty alignment edges coincide',
  );

  status = await exerciseLayoutSettingsConfigurationMatrix(
    driver,
    statusPath,
    'left sidebar with right dock hidden',
  );

  status = await adjustSettingThroughSettings(
    driver,
    statusPath,
    'sidebarPosition',
    'right',
  );
  sidebar = layoutSlot(status, 'sidebar');
  editorCenter = layoutSlot(status, 'editorCenter');
  HarnessSmoke.Class.requireCondition(
    sidebar.left >= rectangleRight(editorCenter),
    'right sidebar configuration places the primary dock after the editor',
  );
  status = await exerciseLayoutSettingsConfigurationMatrix(
    driver,
    statusPath,
    'right sidebar with right dock hidden',
  );
  status = await adjustSettingThroughSettings(
    driver,
    statusPath,
    'sidebarPosition',
    'left',
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.settingsOpen === false,
  );

  await invokeCommand(driver, 'View: Toggle Right Dock');
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.rightDockVisible === true,
  );
  HarnessSmoke.Class.requireCondition(
    Number(status.rightDockColumns) > 0,
    'command opened a real right-dock viewport before visible-dock settings checks',
  );
  clickCell(driver, layoutSlot(status, 'sidebar').left + 2, 4);
  await driver.awaitQuiescence();
  driver.sendKeys('Control+,');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Sidebar position') !== null
      && snapshot.findText(
        'Bottom panel alignment (edges without a dock coincide)',
      ) !== null
      && snapshot.findText(
        'Primary dock vertical span (when bottom panel is open)',
      ) !== null
      && snapshot.findText(
        'Right dock vertical span (when dock and panel are open)',
      ) !== null,
  );
  status = await exerciseLayoutSettingsConfigurationMatrix(
    driver,
    statusPath,
    'left sidebar with right dock visible',
  );
  status = await adjustSettingThroughSettings(
    driver,
    statusPath,
    'sidebarPosition',
    'right',
  );
  status = await exerciseLayoutSettingsConfigurationMatrix(
    driver,
    statusPath,
    'right sidebar with right dock visible',
  );
  status = await adjustSettingThroughSettings(
    driver,
    statusPath,
    'sidebarPosition',
    'left',
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.settingsOpen === false,
  );
  await invokeCommand(driver, 'View: Toggle Right Dock');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.rightDockVisible === false,
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

  HarnessSmoke.Class.pass('bottom panel stayed open while the right dock toggled');
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
