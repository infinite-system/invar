#!/usr/bin/env bun
// Workspace layout isolation: one arm per workspace-scoped layout slot and per v2 panel state.
//
// Workspace A is given a distinctive layout — a hidden primary dock, a widened primary dock, a
// visible right dock showing Tasks, a widened right dock, and a taller bottom panel — and a
// distinctive panel world: a second container, a window group inside it, and a contents list
// pinned open and dragged wider. A brand new workspace B must show the application defaults for
// every one of those, and returning to A must bring A's own values back.
//
// Run it: bun scripts/harness/smoke-workspace-layout-isolation-harness.ts
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Layout slot sizes are workspace scoped (src/modules/layout/layout.invariants.md)
// invariant: Each workspace owns one panel world (src/modules/workspace/workspace.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import {
  awaitStatus,
  dragBetweenCells,
  pass,
  requireCondition,
} from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';

// Both roots live inside their OWN parent: the project picker fuzzy-scores the current root's
// parent, so rooting the fixtures directly at the system temporary directory would make this smoke
// depend on how many entries that directory happens to hold.
const fixtureParent = mkdtempSync(
  join(tmpdir(), 'invar-workspace-layout-isolation-'),
);
const firstRoot = join(fixtureParent, 'alpha-layout-project');
const secondRoot = join(fixtureParent, 'beta-layout-project');
mkdirSync(firstRoot);
mkdirSync(secondRoot);
await Bun.write(join(firstRoot, 'alpha-file.txt'), 'alpha\n');
await Bun.write(join(secondRoot, 'beta-file.txt'), 'beta\n');
const homeDirectory = mkdtempSync(
  join(tmpdir(), 'invar-workspace-layout-isolation-home-'),
);
const statusPath = join(homeDirectory, 'status.json');
const secondName = basename(secondRoot);

interface LayoutRectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The PAINTED slot width, read from the resolved layout geometry rather than from the number the
 *  slot holds. A published size that the layout resolve never consumed would pass every assertion
 *  while the screen stayed unchanged, so every width arm checks the paint too. */
function paintedSlotWidth(
  status: Record<string, unknown>,
  slotName: 'sidebar' | 'rightDock' | 'bottomPanel',
): number {
  const geometry = status.layoutSlots as Record<string, LayoutRectangle>;
  const rectangle = geometry?.[slotName];
  if (!rectangle) throw new Error(`no resolved geometry for ${slotName}`);
  return slotName === 'bottomPanel' ? rectangle.height : rectangle.width;
}

interface SplitterRegion {
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
}

interface ScreenRectangle extends LayoutRectangle {
  visible: boolean;
}

interface TabBarControl {
  action: string;
  startColumn: number;
  endColumnExclusive: number;
}

interface HeadingGeometry {
  contentId: string;
  row: number;
  controls: readonly TabBarControl[];
}

/** The PAINTED width of the pinned contents list, read from the region the renderer resolved. */
function listWidth(status: Record<string, unknown>): number {
  const region = status.panelListGeometry as ScreenRectangle | undefined;
  return region?.visible ? region.width : 0;
}

const driver = new PtyTestDriver.Class({
  workspaceRoot: firstRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

/** The activity bar column and each item's painted row on a settled 120x40 boot grid. */
const activityBarColumn = 2;
const activityItemRows: Record<string, number> = {
  files: 4,
  git: 6,
  structure: 8,
  tasks: 10,
  monitoring: 12,
  extensions: 14,
};

function clickActivityItem(identifier: string): void {
  const row = activityItemRows[identifier];
  if (row === undefined) {
    throw new Error(`no activity bar row is recorded for ${identifier}`);
  }
  driver.sendMouse({
    kind: 'press',
    column: activityBarColumn,
    row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: activityBarColumn,
    row,
    button: 'left',
  });
}

/** Click one of the panel tab bar's own controls, addressed through the geometry the app paints. */
function clickPanelControl(
  status: Record<string, unknown>,
  action: string,
): void {
  const headings = status.panelHeadingGeometry as
    readonly HeadingGeometry[] | undefined;
  const heading = headings?.find((entry) => entry.contentId === 'panel');
  const control = heading?.controls.find((entry) => entry.action === action);
  if (!heading || !control) {
    throw new Error(`the panel tab bar paints no ${action} control`);
  }
  driver.sendMouse({
    kind: 'press',
    column: control.startColumn,
    row: heading.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: control.startColumn,
    row: heading.row,
    button: 'left',
  });
}

async function splitterRegion(
  name: 'sidebar' | 'rightDock' | 'bottomPanel',
): Promise<SplitterRegion> {
  const status = await awaitStatus(
    driver,
    statusPath,
    `the ${name} splitter paints its own region`,
    (candidate) => {
      const region = (
        candidate.splitterRegions as Record<string, SplitterRegion | undefined>
      )?.[name];
      return (
        region !== undefined &&
        region.visible &&
        region.width > 0 &&
        region.height > 0
      );
    },
  );
  return (status.splitterRegions as Record<string, SplitterRegion>)[name]!;
}

try {
  console.log('== harness workspace layout isolation: shape workspace A ==');
  const bootStatus = await awaitStatus(
    driver,
    statusPath,
    'the first workspace boots',
    (status) => status.ready === true && status.workspaceCount === 1,
  );
  const defaultSidebarWidth = Number(bootStatus.sidebarWidth);
  const defaultRightDockWidth = Number(bootStatus.rightDockWidth);
  const defaultRightDockContent = String(bootStatus.rightDockActiveContent);
  requireCondition(
    bootStatus.primaryDockVisible === true &&
      bootStatus.rightDockVisible === false,
    'the boot defaults show the primary dock and hide the right dock',
  );

  driver.sendKeys('Control+j');
  const openPanelStatus = await awaitStatus(
    driver,
    statusPath,
    'workspace A opens its bottom panel',
    (status) => status.panelVisible === true && Number(status.panelRows) > 0,
  );
  const defaultPanelRows = Number(openPanelStatus.panelRows);

  clickActivityItem('tasks');
  await awaitStatus(
    driver,
    statusPath,
    'workspace A shows Tasks in its right dock',
    (status) =>
      status.rightDockVisible === true &&
      status.rightDockActiveContent === 'tasks',
  );
  requireCondition(
    defaultRightDockContent !== 'tasks',
    'Tasks is not what the right dock shows by default, so it can prove a leak',
  );

  const sidebarSplitter = await splitterRegion('sidebar');
  await dragBetweenCells(
    driver,
    sidebarSplitter.left,
    sidebarSplitter.top + Math.floor(sidebarSplitter.height / 2),
    sidebarSplitter.left + 8,
    sidebarSplitter.top + Math.floor(sidebarSplitter.height / 2),
  );
  await awaitStatus(
    driver,
    statusPath,
    'workspace A keeps its widened primary dock',
    (status) => Number(status.sidebarWidth) > defaultSidebarWidth,
  );

  const rightDockSplitter = await splitterRegion('rightDock');
  await dragBetweenCells(
    driver,
    rightDockSplitter.left,
    rightDockSplitter.top + Math.floor(rightDockSplitter.height / 2),
    rightDockSplitter.left - 6,
    rightDockSplitter.top + Math.floor(rightDockSplitter.height / 2),
  );
  await awaitStatus(
    driver,
    statusPath,
    'workspace A keeps its widened right dock',
    (status) => Number(status.rightDockWidth) > defaultRightDockWidth,
  );

  const panelSplitter = await splitterRegion('bottomPanel');
  const panelSplitterColumn =
    panelSplitter.left + Math.floor(panelSplitter.width / 2);
  await dragBetweenCells(
    driver,
    panelSplitterColumn,
    panelSplitter.top,
    panelSplitterColumn,
    panelSplitter.top - 5,
  );
  await awaitStatus(
    driver,
    statusPath,
    'workspace A keeps its taller bottom panel',
    (status) => Number(status.panelRows) > defaultPanelRows,
  );

  // --- shape the v2 panel model in workspace A --------------------------------------------------
  // Containers, window groups and the pinned contents list arrived with the panel chrome rebuild.
  // They are workspace state by the same argument as the slot sizes, so they get the same arms.
  driver.sendKeys('Control+Shift+a');
  await awaitStatus(
    driver,
    statusPath,
    'workspace A adds an agent container beside its terminal one',
    (status) => (status.panelSpaceIds as unknown[]).length >= 2,
  );
  driver.sendKeys('Control+Shift+s');
  const groupedStatus = await awaitStatus(
    driver,
    statusPath,
    'workspace A groups two panes in its selected container',
    (status) => (status.panelCellIds as unknown[]).length >= 2,
  );
  clickPanelControl(groupedStatus, 'pane-list');
  const pinnedStatus = await awaitStatus(
    driver,
    statusPath,
    'workspace A pins its contents list open',
    (status) => status.panelListVisible === true && listWidth(status) > 0,
  );
  // The list docks to the panel's right edge; its splitter sits immediately left of it.
  const pinnedRegion = pinnedStatus.panelListGeometry as ScreenRectangle;
  const pinnedWidth = pinnedRegion.width;
  await dragBetweenCells(
    driver,
    pinnedRegion.left - 1,
    pinnedRegion.top + Math.floor(pinnedRegion.height / 2),
    pinnedRegion.left - 8,
    pinnedRegion.top + Math.floor(pinnedRegion.height / 2),
  );
  await awaitStatus(
    driver,
    statusPath,
    'workspace A keeps its widened contents list',
    (status) => listWidth(status) > pinnedWidth,
  );

  clickActivityItem('git');
  await awaitStatus(
    driver,
    statusPath,
    'workspace A shows Source Control in its primary dock',
    (status) => status.sidebarView === 'git',
  );
  clickActivityItem('git');
  const shapedStatus = await awaitStatus(
    driver,
    statusPath,
    'workspace A hides its primary dock',
    (status) => status.primaryDockVisible === false,
  );
  const shapedSidebarWidth = Number(shapedStatus.sidebarWidth);
  const shapedRightDockWidth = Number(shapedStatus.rightDockWidth);
  const shapedPanelRows = Number(shapedStatus.panelRows);
  const shapedListWidth = listWidth(shapedStatus);
  const shapedCellIds = JSON.stringify(shapedStatus.panelCellIds);
  const shapedActiveSpace = String(shapedStatus.panelActiveSpace);
  requireCondition(
    paintedSlotWidth(shapedStatus, 'rightDock') === shapedRightDockWidth &&
      paintedSlotWidth(shapedStatus, 'bottomPanel') === shapedPanelRows,
    'workspace A PAINTS the sizes it reports ' +
      `(rightDock painted ${paintedSlotWidth(shapedStatus, 'rightDock')} of ${shapedRightDockWidth}, ` +
      `bottomPanel painted ${paintedSlotWidth(shapedStatus, 'bottomPanel')} of ${shapedPanelRows})`,
  );
  pass(
    `workspace A shaped: primaryDockVisible=false, sidebarWidth=${shapedSidebarWidth}, ` +
      `rightDock=tasks/${shapedRightDockWidth}, panelRows=${shapedPanelRows}`,
  );

  console.log('== harness workspace layout isolation: open workspace B ==');
  const stripSnapshot = driver.snapshot();
  const plusColumn = Array.from(stripSnapshot.rowText(0)).lastIndexOf('+');
  requireCondition(
    plusColumn >= 0,
    'the workspace plus button paints on the top strip',
  );
  driver.sendMouse({
    kind: 'press',
    column: plusColumn,
    row: 0,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: plusColumn,
    row: 0,
    button: 'left',
  });
  await driver.awaitSnapshot(
    (candidate) => candidate.findText(`+ ${dirname(firstRoot)}`) !== null,
  );
  driver.sendText(secondName);
  await driver.awaitSnapshot(
    (candidate) => candidate.findText(`+ ${secondRoot}`) !== null,
  );
  driver.sendKeys('Enter');
  const secondStatus = await awaitStatus(
    driver,
    statusPath,
    'workspace B is open and active',
    (status) =>
      status.workspaceCount === 2 && status.activeWorkspaceRoot === secondRoot,
    30_000,
  );

  // --- one arm per workspace-scoped layout slot -------------------------------------------------
  requireCondition(
    secondStatus.primaryDockVisible === true,
    `a new workspace shows its own primary dock (got ${secondStatus.primaryDockVisible})`,
  );
  pass('primary dock visibility does not leak');

  requireCondition(
    Number(secondStatus.sidebarWidth) === defaultSidebarWidth,
    `a new workspace opens at the default primary dock width ${defaultSidebarWidth} ` +
      `(got ${secondStatus.sidebarWidth}, workspace A holds ${shapedSidebarWidth})`,
  );
  pass('primary dock width does not leak');

  requireCondition(
    secondStatus.rightDockVisible === false,
    `a new workspace keeps its right dock hidden (got ${secondStatus.rightDockVisible})`,
  );
  pass('right dock visibility does not leak');

  requireCondition(
    secondStatus.rightDockActiveContent === defaultRightDockContent,
    `a new workspace shows the default right dock content ${defaultRightDockContent} ` +
      `(got ${secondStatus.rightDockActiveContent})`,
  );
  pass('right dock content does not leak');

  requireCondition(
    Number(secondStatus.rightDockWidth) === defaultRightDockWidth,
    `a new workspace opens at the default right dock width ${defaultRightDockWidth} ` +
      `(got ${secondStatus.rightDockWidth}, workspace A holds ${shapedRightDockWidth})`,
  );
  pass('right dock width does not leak');

  requireCondition(
    secondStatus.panelVisible === false,
    `a new workspace keeps its bottom panel closed (got ${secondStatus.panelVisible})`,
  );
  pass('bottom panel visibility does not leak');

  driver.sendKeys('Control+j');
  const secondPanelStatus = await awaitStatus(
    driver,
    statusPath,
    'workspace B opens its own bottom panel',
    (status) => status.panelVisible === true && Number(status.panelRows) > 0,
  );
  requireCondition(
    Number(secondPanelStatus.panelRows) === defaultPanelRows,
    `a new workspace opens its panel at the default ${defaultPanelRows} rows ` +
      `(got ${secondPanelStatus.panelRows}, workspace A holds ${shapedPanelRows})`,
  );
  pass('bottom panel height does not leak');

  // --- one arm per workspace-scoped v2 panel state ----------------------------------------------
  requireCondition(
    secondPanelStatus.panelListExpanded === false &&
      listWidth(secondPanelStatus) === 0,
    'a new workspace opens with its contents list unpinned ' +
      `(expanded=${secondPanelStatus.panelListExpanded}, painted width ` +
      `${listWidth(secondPanelStatus)}, workspace A holds ${shapedListWidth})`,
  );
  pass('pinned contents list state does not leak');

  requireCondition(
    (secondPanelStatus.panelCellIds as unknown[]).length === 1,
    'a new workspace opens with ONE pane in its container, not the group workspace A built ' +
      `(got ${JSON.stringify(secondPanelStatus.panelCellIds)}, workspace A holds ${shapedCellIds})`,
  );
  pass('window grouping does not leak');

  requireCondition(
    JSON.stringify(secondPanelStatus.panelCellIds) !== shapedCellIds,
    'a new workspace shows its OWN pane identifiers, not the ones workspace A registered ' +
      `(got ${JSON.stringify(secondPanelStatus.panelCellIds)}, workspace A holds ${shapedCellIds})`,
  );
  pass('container pane identifiers do not leak');

  driver.sendKeys('Control+j');
  await awaitStatus(
    driver,
    statusPath,
    'workspace B closes its own bottom panel again',
    (status) => status.panelVisible === false,
  );

  console.log(
    '== harness workspace layout isolation: return to workspace A ==',
  );
  driver.sendKeys('Control+Shift+[');
  const restoredStatus = await awaitStatus(
    driver,
    statusPath,
    'workspace A is active again',
    (status) => status.activeWorkspaceRoot === firstRoot,
    30_000,
  );
  requireCondition(
    paintedSlotWidth(restoredStatus, 'rightDock') ===
      Number(restoredStatus.rightDockWidth) &&
      paintedSlotWidth(restoredStatus, 'sidebar') === 0 &&
      paintedSlotWidth(restoredStatus, 'bottomPanel') ===
        Number(restoredStatus.panelRows),
    'the restored workspace PAINTS the sizes it reports, and its hidden primary dock ' +
      'resolves to a zero-width slot ' +
      `(sidebar ${paintedSlotWidth(restoredStatus, 'sidebar')} for a hidden dock, ` +
      `rightDock ${paintedSlotWidth(restoredStatus, 'rightDock')}/${restoredStatus.rightDockWidth}, ` +
      `bottomPanel ${paintedSlotWidth(restoredStatus, 'bottomPanel')}/${restoredStatus.panelRows})`,
  );
  requireCondition(
    restoredStatus.primaryDockVisible === false &&
      Number(restoredStatus.sidebarWidth) === shapedSidebarWidth &&
      restoredStatus.rightDockVisible === true &&
      restoredStatus.rightDockActiveContent === 'tasks' &&
      Number(restoredStatus.rightDockWidth) === shapedRightDockWidth &&
      restoredStatus.panelVisible === true &&
      Number(restoredStatus.panelRows) === shapedPanelRows,
    'returning to workspace A restores every slot it was left with ' +
      `(primaryDockVisible=${restoredStatus.primaryDockVisible}, ` +
      `sidebarWidth=${restoredStatus.sidebarWidth}, ` +
      `rightDockVisible=${restoredStatus.rightDockVisible}, ` +
      `rightDockActiveContent=${restoredStatus.rightDockActiveContent}, ` +
      `rightDockWidth=${restoredStatus.rightDockWidth}, ` +
      `panelVisible=${restoredStatus.panelVisible}, ` +
      `panelRows=${restoredStatus.panelRows})`,
  );
  pass('A to B to A restores every workspace-scoped layout slot');

  requireCondition(
    listWidth(restoredStatus) === shapedListWidth &&
      restoredStatus.panelListExpanded === true &&
      JSON.stringify(restoredStatus.panelCellIds) === shapedCellIds &&
      String(restoredStatus.panelActiveSpace) === shapedActiveSpace,
    'returning to workspace A restores its v2 panel world ' +
      `(list painted ${listWidth(restoredStatus)} of ${shapedListWidth}, ` +
      `expanded=${restoredStatus.panelListExpanded}, ` +
      `cells ${JSON.stringify(restoredStatus.panelCellIds)} of ${shapedCellIds}, ` +
      `container ${restoredStatus.panelActiveSpace} of ${shapedActiveSpace})`,
  );
  pass('A to B to A restores the container, its group, and the pinned list');

  console.log('ALL PASS: workspace layout isolation');
} finally {
  await driver.dispose();
}
