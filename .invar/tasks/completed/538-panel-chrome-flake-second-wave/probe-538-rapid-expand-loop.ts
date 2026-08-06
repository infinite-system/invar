#!/usr/bin/env bun
// PROBE for task #538 (panel-chrome flake, second wave).
//
// What it finds out: whether the "two rapid expand clicks complete one
// symmetric cycle" step of scripts/harness/smoke-panel-chrome-harness.ts can
// lose its SECOND click, and if so, which clock is at fault. The step reads
// the tab-bar geometry once, then clicks the expand control twice at the same
// cell with no wait between. When the panel expands, the tab row MOVES (row 33
// to row 3 at 220x60; similar jump at the smoke's 120x40), so the second click
// only reaches the restore control while the renderer's native hit grid still
// holds the PRE-expand generation. If a native render lands between the two
// clicks, the second click dispatches into the expanded panel body, no restore
// is issued, and the wait (an honest condition on the settled status file)
// times out.
//
// The probe repeats only that step in a loop inside one app boot. On a timeout
// it runs a staged autopsy that names the clock each side reads:
//   1. samples the settled status file (frame counter, panelExpanded) now and
//      after 3 seconds idle — frames advancing means the publisher is alive,
//      so this is NOT the #529 starved-publisher class;
//   2. reads the emulator screen for where the tab strip is painted — paint
//      current plus status current plus model stuck expanded means the model
//      never received the restore, i.e. the click was lost in the hit grid;
//   3. jiggles the mouse and samples again (liveness proof for the publisher);
//   4. recovery: re-reads geometry FRESH and clicks the restore control at its
//      CURRENT row. "restored: yes" proves the app was healthy the whole time
//      and only the blind second click was lost.
//
// How to run:
//   bun .invar/tasks/in-progress/538-panel-chrome-flake-second-wave/probe-538-rapid-expand-loop.ts [iterations]
//   Contention: run 3-4 copies concurrently to reproduce gate load.
// Positive control (plants the defect deterministically):
//   bun .../probe-538-rapid-expand-loop.ts 3 gap
//   In gap mode the probe waits for the expanded state to SETTLE between the
//   two clicks — guaranteeing the hit grid rebuilt to the expanded layout —
//   then sends the second click at the stale pre-expand cell, exactly what a
//   real-speed double click does. Expected result: timeout on iteration 1 with
//   autopsy verdicts "publisher alive: yes", "restored by fresh-geometry
//   click: yes".
//
// How to read the output: one line per iteration ("iteration N ok in Xms").
// On failure the AUTOPSY prints VERDICT lines; exit 0 = all iterations clean,
// exit 1 = a timeout happened (in gap mode exit 1 is the EXPECTED red).
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import type { StatusSnapshot } from '../../../../scripts/harness/HarnessSmoke';

const iterations = Number(process.argv[2] ?? 50);
const plantGap = process.argv[3] === 'gap';
const lineCount = 10;

interface ControlSegment {
  readonly action: string;
  readonly startColumn: number;
  readonly endColumnExclusive: number;
}

interface TabBarGeometry {
  readonly row: number;
  readonly tabRow: number;
  readonly controls: readonly ControlSegment[];
}

function tabBar(status: StatusSnapshot): TabBarGeometry {
  const geometry = status.panelSeparatorGeometry as
    TabBarGeometry | null | undefined;
  if (!geometry) throw new Error('Missing panel tab-bar geometry');
  return geometry;
}

function expandSegment(status: StatusSnapshot): {
  row: number;
  column: number;
} {
  const geometry = tabBar(status);
  const segment = geometry.controls.find(
    (control) => control.action === 'expand',
  );
  if (!segment) throw new Error('Missing expand control');
  const column =
    segment.startColumn +
    Math.floor((segment.endColumnExclusive - segment.startColumn) / 2);
  return { row: geometry.row, column };
}

const scaleFixture =
  await HarnessSmoke.Class.createDriveScaleFixture(lineCount);
const homeDirectory = mkdtempSync(
  join(tmpdir(), `invar-probe-538-rapid-expand-`),
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

function sample(label: string): void {
  const status = HarnessSmoke.Class.readStatus(statusPath);
  const paintedRow = tabBar(status).row;
  const strip = driver.snapshot().rowText(paintedRow).includes('─');
  console.log(
    `SAMPLE ${label}: statusFrame=${status.frame} panelExpanded=${status.panelExpanded} ` +
      `statusTabRow=${paintedRow} screenStripPaintedAtStatusRow=${strip} ` +
      `renderQuiescent=${status.renderQuiescent}`,
  );
}

async function autopsy(
  iteration: number,
  staleCell: {
    row: number;
    column: number;
  },
): Promise<void> {
  console.log(
    `AUTOPSY iteration ${iteration} (stale click cell ${staleCell.column},${staleCell.row})`,
  );
  sample('at timeout');
  const frameAtTimeout = Number(
    HarnessSmoke.Class.readStatus(statusPath).frame,
  );
  await Bun.sleep(3000);
  sample('after 3s idle');
  const frameAfterIdle = Number(
    HarnessSmoke.Class.readStatus(statusPath).frame,
  );
  driver.sendMouse({ kind: 'move', column: 5, row: 5, button: 'none' });
  await Bun.sleep(2000);
  sample('after jiggle move plus 2s');
  const frameAfterJiggle = Number(
    HarnessSmoke.Class.readStatus(statusPath).frame,
  );
  console.log(
    `VERDICT publisher alive: ${frameAfterJiggle > frameAtTimeout ? 'yes' : 'no'} ` +
      `(frames ${frameAtTimeout} -> ${frameAfterIdle} idle -> ${frameAfterJiggle} after jiggle)`,
  );
  // Recovery: click the restore control where it ACTUALLY is now.
  const freshStatus = HarnessSmoke.Class.readStatus(statusPath);
  if (freshStatus.panelExpanded === true) {
    const fresh = expandSegment(freshStatus);
    console.log(
      `RECOVERY clicking restore at CURRENT geometry ${fresh.column},${fresh.row} ` +
        `(stale cell was ${staleCell.column},${staleCell.row})`,
    );
    driver.sendMouse({
      kind: 'move',
      column: fresh.column,
      row: fresh.row,
      button: 'none',
    });
    driver.sendMouseClick({
      column: fresh.column,
      row: fresh.row,
      button: 'left',
    });
    try {
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'recovery restore click restores the panel',
        (candidate) => candidate.panelExpanded === false,
        5_000,
      );
      console.log('VERDICT restored by fresh-geometry click: yes');
    } catch {
      console.log('VERDICT restored by fresh-geometry click: no');
    }
  } else {
    console.log(
      'VERDICT model was NOT stuck expanded at autopsy time (late self-heal)',
    );
  }
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
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'probe panel opens',
    (candidate) => candidate.panelVisible === true,
  );

  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    const startedMilliseconds = performance.now();
    const status = HarnessSmoke.Class.readStatus(statusPath);
    const staleCell = expandSegment(status);
    const frameBeforeRapidCycle = Number(status.frame);
    // The smoke's exact gesture: two blind clicks at the pre-expand cell.
    driver.sendMouse({
      kind: 'move',
      column: staleCell.column,
      row: staleCell.row,
      button: 'none',
    });
    driver.sendMouseClick({
      column: staleCell.column,
      row: staleCell.row,
      button: 'left',
    });
    if (plantGap) {
      // Planted defect: let the expanded frame settle (hit grid rebuilt to the
      // expanded layout) before the second click at the stale cell — the
      // timing of a real-speed double click.
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `iteration ${iteration} planted gap: expanded state settles`,
        (candidate) => candidate.panelExpanded === true,
        10_000,
      );
      await Bun.sleep(100);
    }
    driver.sendMouse({
      kind: 'move',
      column: staleCell.column,
      row: staleCell.row,
      button: 'none',
    });
    driver.sendMouseClick({
      column: staleCell.column,
      row: staleCell.row,
      button: 'left',
    });
    try {
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `iteration ${iteration} two rapid expand clicks complete one symmetric cycle`,
        (candidate) =>
          Number(candidate.frame) > frameBeforeRapidCycle &&
          candidate.panelExpanded === false,
        15_000,
      );
    } catch (error) {
      sawTimeout = true;
      console.log(String(error));
      await autopsy(iteration, staleCell);
      break;
    }
    console.log(
      `iteration ${iteration} ok in ${Math.round(performance.now() - startedMilliseconds)}ms`,
    );
  }
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}

process.exit(sawTimeout ? 1 : 0);
