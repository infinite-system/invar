#!/usr/bin/env bun
// PROBE for task #529 (panel-chrome rapid-expand flake), second class.
//
// What it finds out: whether a splitter drag begun on an edge cell of the
// painted drag span can be LOST — the press+move+release resize gesture the
// "a drag begun on the last cell of the drag span still resizes the panel"
// smoke step drives. It opens the bottom panel at 88 columns, then loops:
// read the painted mark run, press on one edge cell, move one row (down then
// up on alternate iterations), release, and wait for the published tab-bar
// row to change. On a timeout it runs an autopsy: samples the published
// separator row and panel rows, checks the painted splitter row on screen,
// then repeats the same drag once to see whether a second identical gesture
// works (a lost single gesture) or also fails (a dead span).
//
// How to run:   bun .invar/tasks/in-progress/529-panel-chrome-rapid-expand-flake/probe-529-drag-span-loop.ts [iterations]
// Contention:   run 3-4 copies concurrently to reproduce gate load.
//
// How to read the output: one line per iteration ("iteration N ok in Xms",
// direction and edge alternate). On failure the AUTOPSY/SAMPLE lines say
// whether the model moved at all and whether a retry of the same gesture
// moves it. Exit 0 = all iterations clean, 1 = a timeout happened.
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import type { StatusSnapshot } from '../../../../scripts/harness/HarnessSmoke';
import { ThemePalettes } from '../../../../src/modules/theme/ThemePalettes';

const iterations = Number(process.argv[2] ?? 40);
// 'blind' keeps the original press-without-hover gesture — the POSITIVE CONTROL
// that demonstrates the hit-grid-lag loss this probe was built to catch.
const blindMode = process.argv[3] === 'blind';
const columns = 88;
const rows = 30;

const splitterHoverTone = Number.parseInt(
  ThemePalettes.Class.DARK.fg.slice(1),
  16,
);
const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-probe-529-drag-'));
const settingsDirectory = join(homeDirectory, '.config', 'invar');
mkdirSync(settingsDirectory, { recursive: true });
await Bun.write(
  join(settingsDirectory, 'settings.json'),
  `${JSON.stringify({ glyphMode: 'ascii' })}\n`,
);
const statusPath = join(homeDirectory, 'status.json');
const driver = new PtyTestDriver.Class({
  workspaceRoot: process.cwd(),
  columns,
  rows,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_AGENT_BACKEND: 'echo',
  },
});

interface DragGeometry {
  readonly row: number;
  readonly drag: { readonly left: number; readonly width: number };
}

function separator(status: StatusSnapshot): DragGeometry {
  const geometry = status.panelSeparatorGeometry as
    DragGeometry | null | undefined;
  if (!geometry) throw new Error('Missing panel tab-bar geometry');
  return geometry;
}

function paintedMarkRun(
  row: number,
  left: number,
  width: number,
): { firstColumn: number; lastColumn: number } {
  const rowText = driver.snapshot().rowText(row);
  const span = Array.from(rowText.slice(left, left + width));
  const markCharacters = ['─', '-'];
  const first = span.findIndex((cell) => markCharacters.includes(cell));
  const last =
    span.length -
    1 -
    [...span].reverse().findIndex((cell) => markCharacters.includes(cell));
  if (first < 0) throw new Error(`No splitter mark painted on row ${row}`);
  return { firstColumn: left + first, lastColumn: left + last };
}

function sample(label: string): void {
  const status = HarnessSmoke.Class.readStatus(statusPath);
  const geometry = separator(status);
  console.log(
    `SAMPLE ${label}: statusFrame=${status.frame} separatorRow=${geometry.row} ` +
      `dragLeft=${geometry.drag.left} dragWidth=${geometry.drag.width}`,
  );
}

let sawTimeout = false;
try {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'probe application is ready',
    (status) => status.ready === true,
    15_000,
  );
  driver.sendKeys('Control+j');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'probe panel opens',
    (candidate) => candidate.panelVisible === true,
  );

  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    const startedMilliseconds = performance.now();
    const status = HarnessSmoke.Class.readStatus(statusPath);
    const geometry = separator(status);
    const rowBefore = geometry.row;
    const expectedMarks = '─'.repeat(geometry.drag.width);
    await driver.awaitGridCondition(
      `iteration ${iteration} splitter paints before the drag`,
      (candidate) => {
        const painted = candidate
          .rowText(rowBefore)
          .slice(geometry.drag.left, geometry.drag.left + geometry.drag.width);
        return (
          painted === expectedMarks ||
          painted === '-'.repeat(geometry.drag.width)
        );
      },
    );
    const markRun = paintedMarkRun(
      rowBefore,
      geometry.drag.left,
      geometry.drag.width,
    );
    const useLastCell = iteration % 2 === 0;
    const edgeColumn = useLastCell ? markRun.lastColumn : markRun.firstColumn;
    // Alternate shrink (down) and grow (up), so the panel never walks to a bound.
    const rowDelta = iteration % 2 === 0 ? -1 : 1;
    const targetRow = Math.max(0, rowBefore + rowDelta);
    if (!blindMode) {
      // Hover-first gesture (the fix under test): the reveal proves the renderer's
      // hit grid resolves the splitter at this cell before the press relies on it.
      // Park OFF the strip and await the reveal DROPPING first — the previous drag
      // leaves the pointer on the moved strip, which would pre-satisfy the wait.
      driver.sendMouse({
        kind: 'move',
        column: edgeColumn,
        row: Math.max(0, rowBefore - 3),
        button: 'none',
      });
      await driver.awaitGridCondition(
        `iteration ${iteration} splitter drops its hover tone`,
        (candidate) =>
          candidate.cell(rowBefore, edgeColumn)?.foreground !==
          splitterHoverTone,
      );
      driver.sendMouse({
        kind: 'move',
        column: edgeColumn,
        row: rowBefore,
        button: 'none',
      });
      await driver.awaitGridCondition(
        `iteration ${iteration} splitter reveals its hover tone`,
        (candidate) =>
          candidate.cell(rowBefore, edgeColumn)?.foreground ===
          splitterHoverTone,
      );
    }
    driver.sendMouse({
      kind: 'press',
      column: edgeColumn,
      row: rowBefore,
      button: 'left',
    });
    driver.sendMouse({
      kind: 'move',
      column: edgeColumn,
      row: targetRow,
      button: 'left',
    });
    driver.sendMouse({
      kind: 'release',
      column: edgeColumn,
      row: targetRow,
      button: 'left',
    });
    try {
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `iteration ${iteration} drag from ${useLastCell ? 'last' : 'first'} cell resizes`,
        (candidate) => separator(candidate).row !== rowBefore,
        30_000,
      );
    } catch (error) {
      sawTimeout = true;
      console.log(String(error));
      console.log(`AUTOPSY iteration ${iteration}`);
      sample('at timeout');
      await Bun.sleep(2000);
      sample('after 2s idle');
      console.log(
        `AUTOPSY retrying the same drag: edgeColumn=${edgeColumn} rowBefore=${rowBefore} targetRow=${targetRow}`,
      );
      driver.sendMouse({
        kind: 'press',
        column: edgeColumn,
        row: rowBefore,
        button: 'left',
      });
      driver.sendMouse({
        kind: 'move',
        column: edgeColumn,
        row: targetRow,
        button: 'left',
      });
      driver.sendMouse({
        kind: 'release',
        column: edgeColumn,
        row: targetRow,
        button: 'left',
      });
      let retryMoved = false;
      try {
        await HarnessSmoke.Class.awaitStatus(
          driver,
          statusPath,
          'retry drag resizes',
          (candidate) => separator(candidate).row !== rowBefore,
          5000,
        );
        retryMoved = true;
      } catch {
        retryMoved = false;
      }
      console.log(
        `VERDICT retry of the same drag moved the panel: ${retryMoved}`,
      );
      sample('after retry');
      const logText = await Bun.file(driver.diagnosticLogPath)
        .text()
        .catch(() => '(no diagnostic log)');
      const tail = logText.split('\n').slice(-40).join('\n');
      console.log(`DIAGNOSTIC LOG TAIL:\n${tail}`);
      break;
    }
    console.log(
      `iteration ${iteration} ok (${useLastCell ? 'last' : 'first'} cell, delta ${rowDelta}) in ${Math.round(performance.now() - startedMilliseconds)}ms`,
    );
  }
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}

process.exit(sawTimeout ? 1 : 0);
