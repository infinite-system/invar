#!/usr/bin/env bun
// What this finds out: which pieces of user interface state LEAK between workspaces.
// It drives the real application in a pseudo terminal, gives workspace A a
// distinctive layout across every drivable state class, opens a brand new workspace
// B, and prints every published status field whose value in B still carries A's
// value. Then it returns to A and prints every field A failed to restore.
//
// How to run it:
//   bun .invar/tasks/in-progress/408-workspace-state-isolation/census-408-workspace-state-leak-probe.ts
//
// How to read the output:
//   "BOOT DEFAULTS" is workspace A before any shaping. It is the value a brand new
//     workspace B must show.
//   "A-SHAPED" lists the state A established, as field: default -> shaped.
//   "LEAKED INTO B" lists each field whose value in the brand new workspace B equals
//     A's shaped value instead of the boot default. Every line there is one leak.
//   "NOT RESTORED IN A" lists each field that changed after A -> B -> A. Every line
//     there is one lost per-workspace state.
//   Empty lists under both headings mean no leak at the state classes driven here.
//   The probe never asserts. It reports. The contract arms live in the smoke.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import {
  awaitStatus,
  dragBetweenCells,
} from '../../../../scripts/harness/HarnessSmokeSupport';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const fixtureParent = mkdtempSync(join(tmpdir(), 'invar-408-state-leak-'));
const firstRoot = join(fixtureParent, 'alpha-workspace-project');
const secondRoot = join(fixtureParent, 'beta-workspace-project');
mkdirSync(firstRoot);
mkdirSync(secondRoot);
await Bun.write(join(firstRoot, 'alpha-file.txt'), 'alpha\n');
await Bun.write(join(secondRoot, 'beta-file.txt'), 'beta\n');
const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-408-state-leak-home-'));
const statusPath = join(homeDirectory, 'status.json');
const secondName = basename(secondRoot);

/** The activity bar column, and each item's row, read from a settled boot grid. */
const activityBarColumn = 2;
const activityItemRows: Record<string, number> = {
  files: 4,
  git: 6,
  structure: 8,
  tasks: 10,
  monitoring: 12,
  extensions: 14,
};

/** Every field this probe watches. */
const watchedFields = [
  'primaryDockVisible',
  'sidebarView',
  'sidebarWidth',
  'primaryDockFocused',
  'rightDockVisible',
  'rightDockActiveContent',
  'rightDockWidth',
  'rightDockColumns',
  'rightDockFocused',
  'panelVisible',
  'panelFocused',
  'panelExpanded',
  'panelActiveContent',
  'panelContentKinds',
  'panelRows',
  'panelCellIds',
  'panelListExpanded',
  'showActivityBar',
  'showRightActivityBar',
  'sidebarPosition',
  'panelAlignment',
  'leftDockVerticalSpan',
  'rightDockVerticalSpan',
  'workspaceTabPosition',
  'bufferTabCount',
  'activeBuffer',
  'activeBufferIndex',
  'editorScrollTop',
  'cursorLineIndex',
  'wordWrap',
  'focus',
] as const;

interface SplitterRegion {
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
}

type SplitterRegions = Record<string, SplitterRegion | undefined>;

function readWatched(status: Record<string, unknown>): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of watchedFields)
    values[field] = JSON.stringify(status[field]);
  return values;
}

function report(
  heading: string,
  left: Record<string, string>,
  right: Record<string, string>,
  keep: (field: string) => boolean,
): void {
  console.log(`\n== ${heading} ==`);
  let printed = 0;
  for (const field of watchedFields) {
    if (!keep(field)) continue;
    console.log(`  ${field}: ${left[field]} -> ${right[field]}`);
    printed += 1;
  }
  if (printed === 0) console.log('  (none)');
}

const driver = new PtyTestDriver.Class({
  workspaceRoot: firstRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

function clickActivityItem(identifier: string): void {
  const row = activityItemRows[identifier];
  if (row === undefined) throw new Error(`no activity row for ${identifier}`);
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

try {
  const bootStatus = await awaitStatus(
    driver,
    statusPath,
    'the first workspace boots',
    (status) => status.ready === true && status.workspaceCount === 1,
  );
  const bootValues = readWatched(bootStatus);
  console.log('\n== BOOT DEFAULTS (workspace A) ==');
  for (const field of watchedFields)
    console.log(`  ${field}: ${bootValues[field]}`);

  // --- shape workspace A ------------------------------------------------------------------------
  driver.sendKeys('Control+j');
  await awaitStatus(
    driver,
    statusPath,
    'workspace A opens its bottom panel',
    (status) => status.panelVisible === true,
  );
  const openPanelStatus = await awaitStatus(
    driver,
    statusPath,
    'workspace A reports its bottom panel height',
    (status) => Number(status.panelRows) > 0,
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

  const splitterRegion = async (
    name: 'sidebar' | 'rightDock' | 'bottomPanel',
  ): Promise<SplitterRegion> => {
    const status = await awaitStatus(
      driver,
      statusPath,
      `the ${name} splitter paints its own region`,
      (candidate) => {
        const region = (candidate.splitterRegions as SplitterRegions)?.[name];
        return (
          region !== undefined &&
          region.visible &&
          region.width > 0 &&
          region.height > 0
        );
      },
    );
    return (status.splitterRegions as SplitterRegions)[name]!;
  };

  const sidebarSplitter = await splitterRegion('sidebar');
  const sidebarSplitterRow =
    sidebarSplitter.top + Math.floor(sidebarSplitter.height / 2);
  await dragBetweenCells(
    driver,
    sidebarSplitter.left,
    sidebarSplitterRow,
    sidebarSplitter.left + 8,
    sidebarSplitterRow,
  );
  const widenedStatus = await awaitStatus(
    driver,
    statusPath,
    'workspace A keeps its widened primary dock',
    (status) => Number(status.sidebarWidth) !== Number(bootStatus.sidebarWidth),
  );

  const rightDockSplitter = await splitterRegion('rightDock');
  const rightDockSplitterRow =
    rightDockSplitter.top + Math.floor(rightDockSplitter.height / 2);
  await dragBetweenCells(
    driver,
    rightDockSplitter.left,
    rightDockSplitterRow,
    rightDockSplitter.left - 6,
    rightDockSplitterRow,
  );
  await awaitStatus(
    driver,
    statusPath,
    'workspace A keeps its widened right dock',
    (status) =>
      Number(status.rightDockWidth) !== Number(bootStatus.rightDockWidth),
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
    (status) => Number(status.panelRows) !== defaultPanelRows,
  );
  void widenedStatus;

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
  const shapedPanelRows = Number(shapedStatus.panelRows);
  const shapedValues = readWatched(shapedStatus);
  console.log('\n== A-SHAPED (state established in workspace A) ==');
  for (const field of watchedFields) {
    if (shapedValues[field] === bootValues[field]) continue;
    console.log(`  ${field}: ${bootValues[field]} -> ${shapedValues[field]}`);
  }

  // --- open workspace B -------------------------------------------------------------------------
  const stripSnapshot = driver.snapshot();
  const plusColumn = Array.from(stripSnapshot.rowText(0)).lastIndexOf('+');
  if (plusColumn < 0) throw new Error('workspace plus button is not painted');
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
  const secondValues = readWatched(secondStatus);
  report(
    'LEAKED INTO B (B carries A-shaped value instead of the boot default)',
    bootValues,
    secondValues,
    (field) =>
      secondValues[field] !== bootValues[field] &&
      secondValues[field] === shapedValues[field],
  );
  report(
    'CHANGED IN B BUT MATCHING NEITHER (inspect by hand)',
    bootValues,
    secondValues,
    (field) =>
      secondValues[field] !== bootValues[field] &&
      secondValues[field] !== shapedValues[field],
  );
  report(
    'ISOLATED (B shows its own boot default while A holds another value)',
    shapedValues,
    secondValues,
    (field) =>
      shapedValues[field] !== bootValues[field] &&
      secondValues[field] === bootValues[field],
  );

  // --- workspace B opens its OWN bottom panel ----------------------------------------------------
  // The panel height cannot be compared while B's panel is closed, so open it here and read the
  // height B gets. A default-sized panel is isolated; A's dragged height is a leak.
  driver.sendKeys('Control+j');
  const secondPanelStatus = await awaitStatus(
    driver,
    statusPath,
    'workspace B opens its own bottom panel',
    (status) => status.panelVisible === true && Number(status.panelRows) > 0,
  );
  console.log('\n== BOTTOM PANEL HEIGHT ==');
  console.log(`  workspace A default rows: ${defaultPanelRows}`);
  console.log(`  workspace A dragged rows: ${shapedPanelRows}`);
  console.log(
    `  workspace B own-open rows: ${Number(secondPanelStatus.panelRows)}`,
  );
  console.log(
    Number(secondPanelStatus.panelRows) === shapedPanelRows
      ? '  VERDICT: LEAK — B inherited the height A dragged'
      : '  VERDICT: isolated — B opened at its own height',
  );
  driver.sendKeys('Control+j');
  await awaitStatus(
    driver,
    statusPath,
    'workspace B closes its own bottom panel again',
    (status) => status.panelVisible === false,
  );

  // --- return to workspace A --------------------------------------------------------------------
  driver.sendKeys('Control+Shift+[');
  const restoredStatus = await awaitStatus(
    driver,
    statusPath,
    'workspace A is active again',
    (status) => status.activeWorkspaceRoot === firstRoot,
    30_000,
  );
  const restoredValues = readWatched(restoredStatus);
  report(
    'NOT RESTORED IN A (A -> B -> A lost the value A had)',
    shapedValues,
    restoredValues,
    (field) => restoredValues[field] !== shapedValues[field],
  );
} finally {
  await driver.dispose();
}
