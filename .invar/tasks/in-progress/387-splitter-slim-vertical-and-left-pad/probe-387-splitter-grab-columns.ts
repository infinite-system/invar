#!/usr/bin/env bun
// What this finds out: WHICH columns of the bottom panel drag strip actually grab.
// The task adds one blank paint pad cell at the strip's left. The pad must not shrink
// the drag hit area, so this probe presses on every column the app publishes for the
// strip, drags one row, and reports whether the panel height changed. It also presses
// the columns just outside both ends, as the negative control: those must NOT resize.
//
// How to run it (from the repository root):
//   bun .invar/tasks/in-progress/387-splitter-slim-vertical-and-left-pad/probe-387-splitter-grab-columns.ts
//
// How to read the output: one line per tested column, `column <n>  GRAB` or `no grab`.
// The published strip is printed first. The GRAB columns must form ONE unbroken run whose
// length equals the published width, and that run must include the pad cell at its left
// end. A hole inside the run, or a run shorter than the published width, means the pad
// took cells out of the hit area.
//   The run does NOT have to start at the published `left`. It was measured one column
// lower on 2026-07-30: `panelSeparatorGeometry` publishes its columns one higher than the
// emulator grid and the PTY mouse use. Every control it describes is three cells wide, so
// that offset never shows on a control click. Only a one-cell strip edge exposes it.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../../../src/modules/system/StatusChannel';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

interface Rectangle {
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
}

interface SeparatorGeometry {
  row: number;
  drag: Rectangle & { leadingPaintPadCells: number };
}

function separatorGeometry(status: StatusSnapshot): SeparatorGeometry {
  const geometry = status.panelSeparatorGeometry as
    SeparatorGeometry | null | undefined;
  if (!geometry) throw new Error('Missing panel separator geometry');
  return geometry;
}

// The separator ROW is the resize signal. It moves whenever the panel height changes, and
// unlike `splitterRegions.bottomPanel` it is published correctly on every frame.
function separatorRow(status: StatusSnapshot): number {
  return separatorGeometry(status).row;
}

const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-387-grab-probe-'));
const statusPath = join(homeDirectory, 'status.json');
const driver = new PtyTestDriver.Class({
  workspaceRoot: join(process.cwd(), 'fixtures'),
  columns: 100,
  rows: 32,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_AGENT_BACKEND: 'echo',
    LANG: 'C.UTF-8',
  },
});

try {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the app boots',
    (status) => status.ready === true,
    20_000,
  );
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Quick Open is open',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText('greeter.ts');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Quick Open matches greeter.ts',
    (status) =>
      status.quickOpenQuery === 'greeter.ts' &&
      Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'one editor tab is open',
    (status) => Number(status.bufferTabCount) > 0,
  );
  driver.sendKeys('Control+j');
  let status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the bottom panel is visible',
    (candidate) => Number(separatorGeometry(candidate).drag.width) > 2,
  );

  const strip = separatorGeometry(status).drag;
  console.log(
    `published drag strip: left=${strip.left} width=${strip.width} ` +
      `pad=${strip.leadingPaintPadCells} row=${separatorGeometry(status).row}`,
  );

  const testedColumns = [
    strip.left - 1,
    strip.left,
    strip.left + 1,
    strip.left + Math.floor(strip.width / 2),
    strip.left + strip.width - 2,
    strip.left + strip.width - 1,
    strip.left + strip.width,
  ];
  let rowDelta = 1;
  for (const column of testedColumns) {
    const rowBefore = separatorRow(status);
    const pressRow = rowBefore;
    const targetRow = Math.max(0, pressRow + rowDelta);
    driver.sendMouse({ kind: 'press', column, row: pressRow, button: 'left' });
    driver.sendMouse({ kind: 'move', column, row: targetRow, button: 'left' });
    driver.sendMouse({
      kind: 'release',
      column,
      row: targetRow,
      button: 'left',
    });
    let grabbed = false;
    try {
      status = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `column ${column} resizes the panel`,
        (candidate) => separatorRow(candidate) !== rowBefore,
        4000,
      );
      grabbed = true;
    } catch {
      status = HarnessSmoke.Class.readStatus(statusPath);
    }
    console.log(`  column ${column}  ${grabbed ? 'GRAB' : 'no grab'}`);
    if (grabbed) rowDelta = -rowDelta;
  }
} finally {
  driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
