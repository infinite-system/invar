#!/usr/bin/env bun
// What this finds out: whether the panel model #404 rebuilt (panel chrome v2 — containers,
// window groups, the pinned contents list) keeps its state inside one workspace.
//
// The round-1 census probe covers dock geometry and the panel HEIGHT. This one covers the
// state classes that did not exist when round 1 ran: which containers a workspace has, which
// container is selected, how its panes are grouped, whether the contents list is pinned open,
// and how wide that list is.
//
// How to run it:
//   bun .invar/tasks/in-progress/408-workspace-state-isolation/census-408-panel-v2-leak-probe.ts
//
// How to read the output:
//   "BOOT DEFAULTS" is workspace A before any shaping — what a brand new workspace B must show.
//   "A-SHAPED" is the v2 panel state A established, as field: default -> shaped.
//   "LEAKED INTO B" lists each field whose value in the brand new workspace B equals A's shaped
//     value instead of the boot default. Every line there is one leak.
//   "NOT RESTORED IN A" lists each field A lost across A -> B -> A. Every line there is one lost
//     per-workspace state.
//   The probe never asserts. It reports. The contract arms live in the smoke.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import {
  awaitStatus,
  dragBetweenCells,
} from '../../../../scripts/harness/HarnessSmokeSupport';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const fixtureParent = mkdtempSync(join(tmpdir(), 'invar-408-panel-v2-'));
const firstRoot = join(fixtureParent, 'alpha-workspace-project');
const secondRoot = join(fixtureParent, 'beta-workspace-project');
mkdirSync(firstRoot);
mkdirSync(secondRoot);
await Bun.write(join(firstRoot, 'alpha-file.txt'), 'alpha\n');
await Bun.write(join(secondRoot, 'beta-file.txt'), 'beta\n');
const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-408-panel-v2-home-'));
const statusPath = join(homeDirectory, 'status.json');
const secondName = basename(secondRoot);

/** Every v2-panel field this probe watches. */
const watchedFields = [
  'panelVisible',
  'panelSpaceIds',
  'panelSpaceLabels',
  'panelActiveSpace',
  'panelActiveSpacePaneIds',
  'panelActiveGroup',
  'panelGroups',
  'panelContentKinds',
  'panelCellIds',
  'panelListExpanded',
  'panelListVisible',
  'panelListWidth',
] as const;

interface ScreenRectangle {
  left: number;
  top: number;
  width: number;
  height: number;
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

type StatusRecord = Record<string, unknown>;

/**
 * The painted width of the pinned contents list. Read from the RESOLVED region the renderer
 * used, never from the model cell the drag writes — a published number agreeing with the cell
 * that produced it proves nothing about what the workspace shows.
 */
function listWidth(status: StatusRecord): number {
  const region = status.panelListGeometry as ScreenRectangle | undefined;
  return region?.visible ? region.width : 0;
}

function readWatched(status: StatusRecord): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of watchedFields)
    values[field] =
      field === 'panelListWidth'
        ? String(listWidth(status))
        : JSON.stringify(status[field]);
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

function clickCell(column: number, row: number): void {
  driver.sendMouse({ kind: 'press', column, row, button: 'left' });
  driver.sendMouse({ kind: 'release', column, row, button: 'left' });
}

/** The panel tab bar's own control run, addressed through the geometry the app publishes. */
function panelControl(status: StatusRecord, action: string): TabBarControl {
  const headings = status.panelHeadingGeometry as
    readonly HeadingGeometry[] | undefined;
  const heading = headings?.find((entry) => entry.contentId === 'panel');
  const control = heading?.controls.find((entry) => entry.action === action);
  if (!heading || !control)
    throw new Error(`the panel tab bar paints no ${action} control`);
  return control;
}

function clickPanelControl(status: StatusRecord, action: string): void {
  const headings = status.panelHeadingGeometry as readonly HeadingGeometry[];
  const heading = headings.find((entry) => entry.contentId === 'panel')!;
  const control = panelControl(status, action);
  clickCell(control.startColumn, heading.row);
}

try {
  await awaitStatus(
    driver,
    statusPath,
    'the first workspace boots',
    (status) => status.ready === true && status.workspaceCount === 1,
  );
  // The baseline is a workspace whose panel is OPEN but unshaped. A closed panel answers every v2
  // question with a blank, so comparing against it would call B's blank an isolation.
  driver.sendKeys('Control+j');
  const bootStatus = await awaitStatus(
    driver,
    statusPath,
    'workspace A opens its bottom panel on a terminal container',
    (status) => status.panelVisible === true,
  );
  const bootValues = readWatched(bootStatus);
  console.log('\n== BOOT DEFAULTS (workspace A, panel just opened) ==');
  for (const field of watchedFields)
    console.log(`  ${field}: ${bootValues[field]}`);

  // --- shape the v2 panel in workspace A --------------------------------------------------------
  // An agent container beside the terminal one: two containers, so "which container is selected"
  // becomes a real question a workspace can answer differently from its neighbour.
  driver.sendKeys('Control+Shift+a');
  await awaitStatus(
    driver,
    statusPath,
    'workspace A adds an agent container',
    (status) => (status.panelSpaceIds as unknown[]).length >= 2,
  );

  // A window group inside the selected container.
  driver.sendKeys('Control+Shift+s');
  const groupedStatus = await awaitStatus(
    driver,
    statusPath,
    'workspace A groups two panes in its selected container',
    (status) => (status.panelCellIds as unknown[]).length >= 2,
  );

  // Pin the contents list open, then drag it wider. The list splitter sits immediately LEFT of
  // the list, which is docked to the panel's right edge.
  clickPanelControl(groupedStatus, 'pane-list');
  const pinnedStatus = await awaitStatus(
    driver,
    statusPath,
    'workspace A pins its contents list open',
    (status) => status.panelListVisible === true && listWidth(status) > 0,
  );
  const pinnedWidth = listWidth(pinnedStatus);
  const pinnedRegion = pinnedStatus.panelListGeometry as ScreenRectangle;
  const listSplitterColumn = pinnedRegion.left - 1;
  const listSplitterRow =
    pinnedRegion.top + Math.floor(pinnedRegion.height / 2);
  await dragBetweenCells(
    driver,
    listSplitterColumn,
    listSplitterRow,
    listSplitterColumn - 7,
    listSplitterRow,
  );
  await awaitStatus(
    driver,
    statusPath,
    'workspace A keeps its widened contents list',
    (status) => listWidth(status) !== pinnedWidth,
  );

  const shapedStatus = await awaitStatus(
    driver,
    statusPath,
    'workspace A settles on its shaped v2 panel',
    (status) => status.panelVisible === true && listWidth(status) > 0,
  );
  const shapedValues = readWatched(shapedStatus);
  const shapedListWidth = listWidth(shapedStatus);
  console.log('\n== A-SHAPED (v2 panel state established in workspace A) ==');
  for (const field of watchedFields) {
    if (shapedValues[field] === bootValues[field]) continue;
    console.log(`  ${field}: ${bootValues[field]} -> ${shapedValues[field]}`);
  }

  // --- open workspace B -------------------------------------------------------------------------
  const stripSnapshot = driver.snapshot();
  const plusColumn = Array.from(stripSnapshot.rowText(0)).lastIndexOf('+');
  if (plusColumn < 0) throw new Error('workspace plus button is not painted');
  clickCell(plusColumn, 0);
  // The open-folder prompt opens already holding the parent directory, so only the leaf is typed.
  await driver.awaitSnapshot(
    (candidate) => candidate.findText(`+ ${dirname(firstRoot)}`) !== null,
  );
  driver.sendText(secondName);
  await driver.awaitSnapshot(
    (candidate) => candidate.findText(`+ ${secondRoot}`) !== null,
  );
  driver.sendKeys('Enter');
  await awaitStatus(
    driver,
    statusPath,
    'workspace B is open and active',
    (status) =>
      status.workspaceCount === 2 && status.activeWorkspaceRoot === secondRoot,
    30_000,
  );
  // B opens with its panel CLOSED, and a closed panel answers every v2 question with a blank.
  // Open B's own panel first: the comparison is only fair once B has a panel to compare.
  driver.sendKeys('Control+j');
  const secondStatus = await awaitStatus(
    driver,
    statusPath,
    'workspace B opens its own bottom panel',
    (status) => status.panelVisible === true,
  );
  const secondValues = readWatched(secondStatus);

  report(
    'LEAKED INTO B (B carries A-shaped value instead of the boot default)',
    bootValues,
    secondValues,
    (field) =>
      shapedValues[field] !== bootValues[field] &&
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

  console.log('\n== PINNED CONTENTS LIST WIDTH ==');
  console.log(`  workspace A pinned width: ${pinnedWidth}`);
  console.log(`  workspace A dragged width: ${shapedListWidth}`);
  console.log(`  workspace B own width: ${listWidth(secondStatus)}`);
  console.log(
    `  VERDICT: ${
      listWidth(secondStatus) === shapedListWidth && shapedListWidth > 0
        ? 'LEAK — B inherited the width A dragged'
        : 'isolated — B did not inherit A dragged width'
    }`,
  );

  // --- return to workspace A --------------------------------------------------------------------
  // B's terminal owns the keyboard after the panel opened, and it swallows the workspace-switch
  // chord. Close B's panel first to release focus; B has already been measured, so this changes
  // nothing the comparison depends on.
  driver.sendKeys('Control+j');
  await awaitStatus(
    driver,
    statusPath,
    'workspace B releases the keyboard from its panel',
    (status) => status.panelFocused !== true,
  );
  driver.sendKeys('Control+Shift+[');
  const restoredStatus = await awaitStatus(
    driver,
    statusPath,
    'workspace A becomes active again',
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
  driver.dispose();
}
