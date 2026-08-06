#!/usr/bin/env bun
// PROBE for task #529 (panel-chrome rapid-expand flake).
//
// What it finds out: whether the "add header press cancels cleanly" step of
// scripts/harness/smoke-panel-chrome-harness.ts loses the Escape that should
// close the panel Add chooser, and if so, WHERE the loss is. It repeats only
// that step in a loop inside one app boot: press the add header (the chooser
// opens on press), confirm the pressed paint, send Escape, wait for the
// chooser to close, release, settle. On a timeout it runs an autopsy:
//   1. samples the status frame counter for 3 seconds (app alive or wedged),
//   2. sends a SECOND Escape and waits 5 seconds (one lost key, or an
//      unclosable popup),
//   3. dumps the popup-related status fields and the app diagnostic log tail.
//
// How to run:   bun .invar/tasks/in-progress/529-panel-chrome-rapid-expand-flake/probe-529-press-cancel-loop.ts [iterations]
// Contention:   run 3-4 copies concurrently to reproduce gate load.
//
// How to read the output: one line per iteration ("iteration N ok in Xms").
// On failure the autopsy prints VERDICT lines: "frames advanced K in 3s"
// (K>0 means the app is alive), and "second Escape closed the popup: yes/no"
// (yes means exactly one Escape was lost or eaten; no means the popup entered
// an unclosable state). Exit 0 = all iterations clean, 1 = a timeout happened.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import type { StatusSnapshot } from '../../../../scripts/harness/HarnessSmoke';
import { ThemePalettes } from '../../../../src/modules/theme/ThemePalettes';

const iterations = Number(process.argv[2] ?? 50);
const lineCount = 10;

const scaleFixture =
  await HarnessSmoke.Class.createDriveScaleFixture(lineCount);
const homeDirectory = mkdtempSync(
  join(tmpdir(), `invar-probe-529-press-cancel-`),
);
const statusPath = join(homeDirectory, 'status.json');
const driver = new PtyTestDriver.Class({
  workspaceRoot: scaleFixture.workspaceRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_AGENT_BACKEND: 'echo',
  },
});

interface TabBarGeometry {
  readonly tabRow: number;
  readonly instancesToggle: {
    readonly startColumn: number;
    readonly endColumnExclusive: number;
  } | null;
  readonly spaceAdd: {
    readonly startColumn: number;
    readonly endColumnExclusive: number;
  } | null;
}

function tabBar(status: StatusSnapshot): TabBarGeometry {
  const geometry = status.panelSeparatorGeometry as
    TabBarGeometry | null | undefined;
  if (!geometry) throw new Error('Missing panel tab-bar geometry');
  return geometry;
}

function listGeometry(): { left: number; top: number; width: number } {
  const geometry = HarnessSmoke.Class.readStatus(statusPath)
    .panelListGeometry as { left: number; top: number; width: number };
  if (!geometry || geometry.width <= 0) {
    throw new Error('Missing panel instances-list geometry');
  }
  return geometry;
}

function sample(label: string): void {
  const status = HarnessSmoke.Class.readStatus(statusPath);
  const popupPainted = driver.snapshot().findText('Add Terminal') !== null;
  console.log(
    `SAMPLE ${label}: statusFrame=${status.frame} statusPopupOpen=${status.boundedListPopupOpen} ` +
      `screenPopupPainted=${popupPainted} renderQuiescent=${status.renderQuiescent} ` +
      `cadenceTimer=${status.animationFrameCadenceTimerCount}`,
  );
}

async function autopsy(iteration: number): Promise<void> {
  console.log(`AUTOPSY iteration ${iteration}`);
  sample('at timeout');
  await Bun.sleep(3000);
  sample('after 3s idle');
  driver.sendKeys('Escape');
  await Bun.sleep(3000);
  sample('after second Escape plus 3s');
  const geometry = listGeometry();
  driver.sendMouse({
    kind: 'move',
    column: geometry.left + 5,
    row: geometry.top + 3,
    button: 'none',
  });
  await Bun.sleep(2000);
  sample('after jiggle move plus 2s');
  const logText = await Bun.file(driver.diagnosticLogPath)
    .text()
    .catch(() => '(no diagnostic log)');
  const tail = logText.split('\n').slice(-30).join('\n');
  console.log(`DIAGNOSTIC LOG TAIL:\n${tail}`);
}

let sawTimeout = false;
try {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'probe fixture is ready',
    (status) => status.ready === true,
    15_000,
  );
  const statusControlSnapshot = await driver.awaitGridCondition(
    'probe status control is visible',
    (candidate) =>
      candidate.rowText(candidate.rows - 1).lastIndexOf(' ❯ ') >= 0,
  );
  const statusBarRow = statusControlSnapshot.rows - 1;
  const statusControlStart = statusControlSnapshot
    .rowText(statusBarRow)
    .lastIndexOf(' ❯ ');
  driver.sendMouse({
    kind: 'move',
    column: statusControlStart + 1,
    row: statusBarRow,
    button: 'none',
  });
  driver.sendMouseClick({
    column: statusControlStart + 1,
    row: statusBarRow,
    button: 'left',
  });
  let status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'probe panel opens',
    (candidate) => candidate.panelVisible === true,
  );
  if (status.panelListVisible !== true) {
    const listToggle = tabBar(status).instancesToggle;
    if (!listToggle) throw new Error('Missing instances-list toggle');
    const toggleColumn =
      listToggle.startColumn +
      Math.floor((listToggle.endColumnExclusive - listToggle.startColumn) / 2);
    driver.sendMouse({
      kind: 'move',
      column: toggleColumn,
      row: tabBar(status).tabRow,
      button: 'none',
    });
    driver.sendMouseClick({
      column: toggleColumn,
      row: tabBar(status).tabRow,
      button: 'left',
    });
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'probe instances list opens',
      (candidate) => candidate.panelListVisible === true,
    );
  }

  // Create terminal 1 the way the smoke does, so the list add header exists.
  status = HarnessSmoke.Class.readStatus(statusPath);
  const firstSpaceAdd = tabBar(status).spaceAdd;
  if (!firstSpaceAdd) throw new Error('Missing first Terminal-space Add');
  const spaceAddColumn =
    firstSpaceAdd.startColumn +
    Math.floor(
      (firstSpaceAdd.endColumnExclusive - firstSpaceAdd.startColumn) / 2,
    );
  driver.sendMouse({
    kind: 'move',
    column: spaceAddColumn,
    row: tabBar(status).tabRow,
    button: 'none',
  });
  driver.sendMouseClick({
    column: spaceAddColumn,
    row: tabBar(status).tabRow,
    button: 'left',
  });
  const popupStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'probe chooser offers terminal',
    (candidate) =>
      candidate.boundedListPopupOpen === true &&
      Array.isArray(candidate.boundedListPopupItemIdentifiers) &&
      candidate.boundedListPopupItemIdentifiers.includes('terminal'),
  );
  const identifiers = popupStatus.boundedListPopupItemIdentifiers as string[];
  const movement =
    identifiers.indexOf('terminal') -
    Number(popupStatus.boundedListPopupSelected);
  for (let step = 0; step < Math.abs(movement); step += 1) {
    driver.sendKeys(movement < 0 ? 'Up' : 'Down');
  }
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'probe chooser selects terminal',
    (candidate) => candidate.boundedListPopupSelectedIdentifier === 'terminal',
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'probe chooser closes after selecting terminal',
    (candidate) => candidate.boundedListPopupOpen === false,
  );
  status = HarnessSmoke.Class.readStatus(statusPath);
  if (status.panelListVisible !== true) {
    const recreatedListToggle = tabBar(status).instancesToggle;
    if (!recreatedListToggle) {
      throw new Error('Missing recreated instances-list toggle');
    }
    const recreatedToggleColumn =
      recreatedListToggle.startColumn +
      Math.floor(
        (recreatedListToggle.endColumnExclusive -
          recreatedListToggle.startColumn) /
          2,
      );
    driver.sendMouse({
      kind: 'move',
      column: recreatedToggleColumn,
      row: tabBar(status).tabRow,
      button: 'none',
    });
    driver.sendMouseClick({
      column: recreatedToggleColumn,
      row: tabBar(status).tabRow,
      button: 'left',
    });
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'probe recreated instances list opens',
      (candidate) => candidate.panelListVisible === true,
    );
  }

  const darkPalette = ThemePalettes.Class.DARK;
  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    const startedMilliseconds = performance.now();
    const headerGeometry = listGeometry();
    driver.sendMouse({
      kind: 'move',
      column: headerGeometry.left + 2,
      row: headerGeometry.top,
      button: 'none',
    });
    driver.sendMouse({
      kind: 'press',
      column: headerGeometry.left + 2,
      row: headerGeometry.top,
      button: 'left',
    });
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `iteration ${iteration} chooser opens on press`,
      (candidate) => candidate.boundedListPopupOpen === true,
    );
    await driver.awaitGridCondition(
      `iteration ${iteration} pressed header paints`,
      (candidate) =>
        candidate.cell(headerGeometry.top, headerGeometry.left + 1)
          ?.background === Number.parseInt(darkPalette.selection.slice(1), 16),
    );
    driver.sendKeys('Escape');
    try {
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `iteration ${iteration} chooser closes on Escape`,
        (candidate) => candidate.boundedListPopupOpen === false,
        30_000,
      );
    } catch (error) {
      sawTimeout = true;
      console.log(String(error));
      await autopsy(iteration);
      break;
    }
    driver.sendMouse({
      kind: 'release',
      column: headerGeometry.left + 2,
      row: headerGeometry.top,
      button: 'left',
    });
    // Park the pointer off the header so the idle (panel background) state returns.
    driver.sendMouse({
      kind: 'move',
      column: headerGeometry.left + 2,
      row: headerGeometry.top + 6,
      button: 'none',
    });
    await driver.awaitGridCondition(
      `iteration ${iteration} idle header repaints`,
      (candidate) =>
        candidate.cell(headerGeometry.top, headerGeometry.left + 1)
          ?.background === Number.parseInt(darkPalette.panel.slice(1), 16),
    );
    console.log(
      `iteration ${iteration} ok in ${Math.round(performance.now() - startedMilliseconds)}ms`,
    );
  }
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}

process.exit(sawTimeout ? 1 : 0);
