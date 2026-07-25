#!/usr/bin/env bun
// Live layout configuration and shared-splitter contract. Every input travels through the real PTY;
// semantic slot edges come from the status projection and paint assertions come from emulator cells.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Splitter paint and hit testing share one geometry (src/modules/ui/ui.invariants.md)
// invariant: Layout slots derive from one configuration (src/modules/layout/layout.invariants.md)
// invariant: Right dock command and mouse affordance share one toggle (src/modules/ui/ui.invariants.md)
// invariant: Default panel height scales with the viewport (src/modules/layout/layout.invariants.md)
// invariant: The right dock control owns the status edge (src/modules/ui/ui.invariants.md)
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

function layoutSettingLabel(settingName: LayoutSettingName): string {
  if (settingName === 'sidebarPosition') return 'Sidebar position';
  if (settingName === 'panelAlignment') {
    return 'Bottom panel alignment (edges without a dock coincide)';
  }
  if (settingName === 'leftDockVerticalSpan') {
    return 'Primary dock vertical span (when bottom panel is open)';
  }
  return 'Right dock vertical span (when dock and panel are open)';
}

async function adjustSettingThroughSettings(
  driver: PtyTestDriver.Model,
  statusPath: string,
  settingName: LayoutSettingName,
  expectedValue: string,
): Promise<StatusSnapshot> {
  const targetSettingLabel = layoutSettingLabel(settingName);
  let selectionStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the selected settings row is published before layout-setting navigation',
    (status) => typeof status.settingsSelected === 'number'
      && typeof status.settingsSelectedLabel === 'string',
  );
  const currentDescriptorIndex = Number(selectionStatus.settingsSelected);
  if (currentDescriptorIndex > 0) {
    driver.sendKeysWithoutFrameExpectation(
      ...Array.from({ length: currentDescriptorIndex }, () => 'Up'),
    );
    selectionStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'settings navigation reaches the first descriptor',
      (candidate) => Number(candidate.settingsSelected) === 0,
    );
  }
  for (let navigationStep = 0; navigationStep < 40; navigationStep++) {
    if (selectionStatus.settingsSelectedLabel === targetSettingLabel) break;
    const previousSelectedLabel = selectionStatus.settingsSelectedLabel;
    driver.sendKeysWithoutFrameExpectation('Down');
    selectionStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `settings navigation advances toward ${targetSettingLabel}`,
      (candidate) => candidate.settingsSelectedLabel !== previousSelectedLabel,
    );
  }
  HarnessSmoke.Class.requireCondition(
    selectionStatus.settingsSelectedLabel === targetSettingLabel,
    `${settingName} row is discovered from its live settings label`,
  );
  driver.sendKeysWithoutFrameExpectation('Right');
  const status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: candidate[settingName] === expectedValue",
    (candidate) => candidate[settingName] === expectedValue,
  );
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
    "status condition: candidate.settingsOpen === false",
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
    "status condition: candidate.settingsOpen === true",
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
  let status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'a valid panel alignment is published before cycling alignments',
    (candidate) => alignmentCycle.includes(
      candidate.panelAlignment as (typeof alignmentCycle)[number],
    ),
  );
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
  const currentStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `${settingName} is published before changing dock vertical span`,
    (status) => status[settingName] === 'full-height'
      || status[settingName] === 'ends-at-panel',
  );
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
  const initialStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `${splitterName} splitter geometry is published before interaction`,
    (status) => {
      try {
        const region = splitterRegion(status, splitterName);
        return region.visible && region.width > 0 && region.height > 0;
      } catch {
        return false;
      }
    },
  );
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
    "status condition: changed( initialRegion, splitterRegion(candidate, splitterName), candidate, )",
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
  const settledSplitterStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `${splitterName} splitter publishes its settled geometry after release`,
    (status) => {
      try {
        return changed(
          initialRegion,
          splitterRegion(status, splitterName),
          status,
        );
      } catch {
        return false;
      }
    },
  );
  const settledSplitterPoint = splitterPoint(
    splitterRegion(settledSplitterStatus, splitterName),
  );
  await driver.awaitSnapshot(
    (snapshot) => backgroundAt(snapshot, settledSplitterPoint) === restingBackground,
  );
  HarnessSmoke.Class.pass(`${splitterName} splitter returns to its muted rest role`);
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-layout-harness-fixture-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-layout-harness-home-'));
const compactHomeDirectory = mkdtempSync(join(tmpdir(), 'tui-layout-harness-compact-home-'));
const settingsDirectory = join(homeDirectory, '.config', 'invar');
const compactSettingsDirectory = join(compactHomeDirectory, '.config', 'invar');
const statusPath = join(homeDirectory, 'status.json');
const compactStatusPath = join(compactHomeDirectory, 'status.json');
mkdirSync(settingsDirectory, { recursive: true });
mkdirSync(compactSettingsDirectory, { recursive: true });
await Bun.write(
  join(settingsDirectory, 'settings.json'),
  '{"glyphMode":"ascii"}\n',
);
await Bun.write(
  join(compactSettingsDirectory, 'settings.json'),
  '{"glyphMode":"ascii"}\n',
);
await Bun.write(join(fixtureRoot, 'layout.txt'), 'layout geometry\n');
await Bun.write(join(fixtureRoot, 'left-pane.txt'), 'left pane file\n');
await Bun.write(join(fixtureRoot, 'right-pane.txt'), 'right pane file\n');
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
  rows: 50,
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
    "status condition: candidate.ready === true",
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

  console.log('== harness layout: command bar and file-tree pane in the left dock ==');
  let commandBarSnapshot = await driver.awaitGridCondition(
    'command bar renders the folder and right-edge layouts control',
    (snapshot) => {
      const layoutsPosition = snapshot.findText(' layouts ');
      if (!layoutsPosition) return false;
      const folderName = fixtureRoot.split('/').at(-1) ?? '';
      return (
        snapshot.rowText(layoutsPosition.row).includes(folderName) &&
        layoutsPosition.column + ' layouts '.length === snapshot.columns
      );
    },
  );
  const layoutsPosition = commandBarSnapshot.findText(' layouts ');
  HarnessSmoke.Class.requireCondition(
    layoutsPosition !== null,
    'layouts control is painted at the command-bar right edge',
  );
  const commandBarFolderName = fixtureRoot.split('/').at(-1) ?? '';
  const folderColumn = commandBarSnapshot
    .rowText(layoutsPosition!.row)
    .indexOf(commandBarFolderName);
  clickCell(driver, folderColumn, layoutsPosition!.row);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) =>
      candidate.quickOpenOpen === true &&
      candidate.quickOpenMode === 'files',
  );
  await driver.awaitGridCondition(
    'folder click opens the existing Go to File quick-open surface',
    (snapshot) => snapshot.findText('Go to File') !== null,
  );
  HarnessSmoke.Class.pass('clicking the folder name opened QuickOpen file search');
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.quickOpenOpen === false,
  );

  let treeFilePosition = await driver.awaitGridCondition(
    'left primary dock paints the file-tree pane content',
    (snapshot) => snapshot.findText('left-pane.txt') !== null,
  ).then((snapshot) => snapshot.findText('left-pane.txt'));
  HarnessSmoke.Class.requireCondition(
    treeFilePosition !== null,
    'left-dock tree file has a painted pointer target',
  );
  clickCell(driver, treeFilePosition!.column, treeFilePosition!.row);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => String(candidate.activeBuffer).endsWith('/left-pane.txt'),
  );
  await driver.awaitGridCondition(
    'left-dock tree click opens the selected file',
    (snapshot) => snapshot.findText('left pane file') !== null,
  );
  HarnessSmoke.Class.pass('file-tree PaneContent opened a file from the left dock');

  driver.sendKeys('F8');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: candidate.terminalVisible === true",
    (candidate) => candidate.terminalVisible === true,
  );
  await driver.awaitQuiescence();
  commandBarSnapshot = await driver.awaitGridCondition(
    'layouts control remains at the right edge after a tree open',
    (snapshot) => snapshot.findText(' layouts ') !== null,
  );
  const layoutsButtonPosition = commandBarSnapshot.findText(' layouts ')!;
  clickCell(
    driver,
    layoutsButtonPosition.column + 2,
    layoutsButtonPosition.row,
  );
  await driver.awaitGridCondition(
    'layouts button opens the bounded layouts popup',
    (snapshot) =>
      snapshot.findText('Layouts') !== null &&
      snapshot.findText(
        'Sidebar right · panel right · primary ends at panel · right full height',
      ) !== null,
  );
  const targetLayoutPosition = driver.snapshot().findText(
    'Sidebar right · panel right · primary ends at panel · right full height',
  );
  HarnessSmoke.Class.requireCondition(
    targetLayoutPosition !== null,
    'the layouts popup lists a wave-one configuration',
  );
  clickCell(
    driver,
    targetLayoutPosition!.column + 2,
    targetLayoutPosition!.row,
  );
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) =>
      candidate.sidebarPosition === 'right' &&
      candidate.panelAlignment === 'right' &&
      candidate.leftDockVerticalSpan === 'ends-at-panel' &&
      candidate.rightDockVerticalSpan === 'full-height',
  );
  await driver.awaitQuiescence();
  assertPanelAlignmentGeometry(driver, status, 'command-bar layout selection');
  assertDockVerticalSpanGeometry(
    driver,
    status,
    'sidebar',
    'leftDockVerticalSpan',
    'command-bar layout selection',
  );
  HarnessSmoke.Class.pass(
    'layouts popup selection live-applied exact byte-level slot edges',
  );

  treeFilePosition = await driver.awaitGridCondition(
    'right primary dock preserves the file-tree pane content',
    (snapshot) => snapshot.findText('right-pane.txt') !== null,
  ).then((snapshot) => snapshot.findText('right-pane.txt'));
  HarnessSmoke.Class.requireCondition(
    treeFilePosition !== null,
    'right-dock tree file has a painted pointer target',
  );
  clickCell(driver, treeFilePosition!.column, treeFilePosition!.row);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => String(candidate.activeBuffer).endsWith('/right-pane.txt'),
  );
  await driver.awaitGridCondition(
    'right-dock tree click opens the selected file',
    (snapshot) => snapshot.findText('right pane file') !== null,
  );
  HarnessSmoke.Class.pass('file-tree PaneContent opened a file from the right dock');

  const restoredLayoutsPosition = driver.snapshot().findText(' layouts ');
  HarnessSmoke.Class.requireCondition(
    restoredLayoutsPosition !== null,
    'layouts control remains clickable after moving the primary dock',
  );
  clickCell(
    driver,
    restoredLayoutsPosition!.column + 2,
    restoredLayoutsPosition!.row,
  );
  await driver.awaitGridCondition(
    'layouts popup reopens from the right-sidebar configuration',
    (snapshot) =>
      snapshot.findText(
        'Sidebar left · panel center · primary full height · right ends at panel',
      ) !== null,
  );
  const defaultLayoutPosition = driver.snapshot().findText(
    'Sidebar left · panel center · primary full height · right ends at panel',
  );
  HarnessSmoke.Class.requireCondition(
    defaultLayoutPosition !== null,
    'default layout is present in the shared configuration list',
  );
  clickCell(
    driver,
    defaultLayoutPosition!.column + 2,
    defaultLayoutPosition!.row,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) =>
      candidate.sidebarPosition === 'left' &&
      candidate.panelAlignment === 'center' &&
      candidate.leftDockVerticalSpan === 'full-height' &&
      candidate.rightDockVerticalSpan === 'ends-at-panel',
  );

  status = HarnessSmoke.Class.readStatus(statusPath);
  let sidebar = layoutSlot(status, 'sidebar');
  let editorCenter = layoutSlot(status, 'editorCenter');
  let bottomPanel = layoutSlot(status, 'bottomPanel');
  HarnessSmoke.Class.requireCondition(
    bottomPanel.height === 21,
    '50-row viewport gives the bottom panel 45% of its 47 layout rows',
  );
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
  const sidebarLayoutStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the sidebar layout slot is published before opening settings',
    (status) => {
      try {
        return layoutSlot(status, 'sidebar').width > 0;
      } catch {
        return false;
      }
    },
  );
  clickCell(
    driver,
    layoutSlot(sidebarLayoutStatus, 'sidebar').left + 2,
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
      ) !== null,
  );
  HarnessSmoke.Class.pass(
    'visible layout settings disclose dock spans and empty alignment edges',
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
    "status condition: candidate.settingsOpen === false",
    (candidate) => candidate.settingsOpen === false,
  );

  await invokeCommand(driver, 'View: Toggle Right Dock');
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: candidate.rightDockVisible === true",
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
    "status condition: candidate.settingsOpen === false",
    (candidate) => candidate.settingsOpen === false,
  );
  await invokeCommand(driver, 'View: Toggle Right Dock');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: candidate.rightDockVisible === false",
    (candidate) => candidate.rightDockVisible === false,
  );

  console.log('== harness layout: git splitter shares rest, hover, and captured-drag paint ==');
  driver.sendKeys('Control+Shift+g');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: candidate.sidebarView === 'git' && splitterRegion(candidate, 'git').visible",
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
    "status condition: candidate.rightDockVisible === true",
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
    "status condition: candidate.rightDockVisible === false",
    (candidate) => candidate.rightDockVisible === false,
  );
  await driver.awaitQuiescence();
  const statusBarRow = driver.snapshot().rows - 1;
  const statusBarText = driver.snapshot().rowText(statusBarRow);
  const statusEdgeMatch = statusBarText.match(/ \d{2}:\d{2}  R $/);
  HarnessSmoke.Class.requireCondition(
    statusEdgeMatch !== null,
    'status controls end with the clock followed by the right-dock affordance',
  );
  const rightDockButtonColumn = statusBarText.lastIndexOf(' R ');
  HarnessSmoke.Class.requireCondition(
    rightDockButtonColumn === driver.snapshot().columns - 3,
    'right-dock status affordance owns the outermost edge',
  );
  const clockColumn = rightDockButtonColumn - 4;
  clickCell(driver, clockColumn, statusBarRow);
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: { const mouse = candidate.mouse as { x?: number; y?: number } | null; return mouse?.x === clockColumn && mouse.y === statusBarRow; }",
    (candidate) => {
      const mouse = candidate.mouse as { x?: number; y?: number } | null;
      return mouse?.x === clockColumn && mouse.y === statusBarRow;
    },
  );
  HarnessSmoke.Class.requireCondition(
    status.rightDockVisible === false,
    'clock is hit-tested without changing right-dock visibility',
  );
  clickCell(driver, rightDockButtonColumn + 1, statusBarRow);
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: candidate.rightDockVisible === true",
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
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the resized right dock width is live-applied and persisted',
    (candidate) => Number(candidate.rightDockWidth) > 28,
  );
  HarnessSmoke.Class.pass('right-dock splitter resize live-applied and persisted its width setting');

  driver.sendKeys('Control+q');

  console.log('== harness layout: compact viewport preserves proportional panel height ==');
  const compactDriver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 80,
    rows: 24,
    homeDirectory: compactHomeDirectory,
    environment: {
      TUI_STATUS_PATH: compactStatusPath,
      COLORTERM: 'truecolor',
    },
  });
  try {
    await HarnessSmoke.Class.awaitStatus(
      compactDriver,
      compactStatusPath,
      "status condition: candidate.ready === true",
      (candidate) => candidate.ready === true,
      20_000,
    );
    compactDriver.sendKeys('F8');
    const compactStatus = await HarnessSmoke.Class.awaitStatus(
      compactDriver,
      compactStatusPath,
      "status condition: candidate.terminalVisible === true",
      (candidate) => candidate.terminalVisible === true,
    );
    HarnessSmoke.Class.requireCondition(
      layoutSlot(compactStatus, 'bottomPanel').height === 9,
      '24-row viewport gives the bottom panel 45% of its 21 layout rows',
    );
    compactDriver.sendKeys('Control+q');
  } finally {
    await compactDriver.dispose();
  }
  console.log('smoke-layout-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
  rmSync(compactHomeDirectory, { recursive: true, force: true });
}
