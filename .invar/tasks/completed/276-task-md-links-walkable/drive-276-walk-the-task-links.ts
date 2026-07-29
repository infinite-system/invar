#!/usr/bin/env bun
// Drives the #276 loop in the REAL repo workspace: open the generated
// project.active-tasks.md, Ctrl-click the #205 task line's markdown link to land in
// the task record, Ctrl-click the record's sibling brief reference to land in the
// brief, then jump Back twice (Alt+[) to return through the record to the view.
//
// Run from the worktree root:  bun .invar/tasks/in-progress/276-task-md-links-walkable/drive-276-walk-the-task-links.ts
//
// Reads: PASS lines, one per proven leg. Any FAIL or timeout means the walk broke at
// that leg; the timeout message names the condition that never became true.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const workspaceRoot = resolve('.');
const homeDirectory = mkdtempSync(join(tmpdir(), 'drive-276-home-'));
const statusPath = join(homeDirectory, 'status.json');
const driver = new PtyTestDriver.Class({
  workspaceRoot,
  columns: 140,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath, LANG: 'C.UTF-8', NERD_FONT: '0' },
});

// The first grid position of `needle` INSIDE the preview pane (left of the source pane).
function previewPosition(
  needle: string,
): { row: number; column: number } | null {
  const grid = driver.snapshot();
  const border = grid.findText('╭─Preview');
  if (!border) return null;
  const sourceColumn = grid.rowText(border.row).indexOf('╭', border.column + 1);
  const rightEdge = sourceColumn >= 0 ? sourceColumn : grid.columns;
  for (let row = 0; row < grid.rows; row++) {
    const column = grid.rowText(row).indexOf(needle, border.column);
    if (column >= 0 && column < rightEdge) return { row, column };
  }
  return null;
}

function ctrlClick(position: { row: number; column: number }): void {
  driver.sendMouse({
    kind: 'press',
    column: position.column,
    row: position.row,
    button: 'left',
    control: true,
  });
  driver.sendMouse({
    kind: 'release',
    column: position.column,
    row: position.row,
    button: 'left',
    control: true,
  });
}

try {
  await driver.awaitSnapshot((c) => c.findText('AGENTS.md') !== null, 60_000);

  // Leg 1: open the generated view through Go to File.
  driver.sendKeys('Control+p');
  await driver.awaitSnapshot((c) => c.findText('Go to File') !== null, 15_000);
  driver.sendText('project.active-tasks.md');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File matches the generated view',
    (status) =>
      Number(status.quickOpenMatches) > 0 &&
      String(status.quickOpenQuery).endsWith('active-tasks.md'),
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the view opens with its preview',
    (status) =>
      String(status.activeBuffer).endsWith('/project.active-tasks.md') &&
      status.markdownPreviewOpen === true &&
      status.markdownParsing === false,
    30_000,
  );
  console.log('PASS  project.active-tasks.md opens; preview auto-opens');

  // Leg 2: the #205 task line renders as a link label; Ctrl-click lands in the record.
  // The USER-DIRECTED section sits below the first screen, so wheel the preview down to it.
  const scrollPreviewUntilVisible = async (
    needle: string,
  ): Promise<{ row: number; column: number }> => {
    for (let attempt = 0; attempt < 40; attempt++) {
      const position = previewPosition(needle);
      if (position) return position;
      const grid = driver.snapshot();
      const border = grid.findText('╭─Preview');
      if (!border) throw new Error('FAIL preview pane missing while scrolling');
      driver.sendMouseWithoutFrameExpectation({
        kind: 'wheel',
        direction: 'down',
        column: border.column + 5,
        row: 12,
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`FAIL never scrolled ${needle} into the preview`);
  };
  // The wheel scroll carries momentum: the pane keeps moving after the needle first shows, so a
  // position measured mid-glide clicks the wrong row. Settled = two consecutive equal scrollTops.
  const settledPreviewPosition = async (
    needle: string,
  ): Promise<{ row: number; column: number }> => {
    await scrollPreviewUntilVisible(needle);
    let previousScrollTop = -1;
    for (let attempt = 0; attempt < 40; attempt++) {
      const scrollTop = Number(
        HarnessSmoke.Class.readStatus(statusPath).markdownPreviewScrollTop,
      );
      if (scrollTop === previousScrollTop) {
        const position = previewPosition(needle);
        if (position) return position;
        return scrollPreviewUntilVisible(needle);
      }
      previousScrollTop = scrollTop;
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(`FAIL preview never settled while seeking ${needle}`);
  };
  // A wheel glide can shift rows between measure and click. Hover is the proof: move to the
  // measured cell and require the app to publish the expected hovered reference, then click
  // that exact cell.
  const ctrlClickHoverConfirmed = async (
    needle: string,
    hoverSuffix: string,
  ): Promise<void> => {
    for (let attempt = 0; attempt < 10; attempt++) {
      let position = await settledPreviewPosition(needle);
      if (position.row >= driver.snapshot().rows - 3) {
        // The pane's last body row does not hit-test (observed; reported as bycatch) — nudge the
        // line one step up and re-measure.
        const grid = driver.snapshot();
        const border = grid.findText('╭─Preview');
        if (border)
          driver.sendMouseWithoutFrameExpectation({
            kind: 'wheel',
            direction: 'down',
            column: border.column + 5,
            row: 12,
          });
        await new Promise((resolve) => setTimeout(resolve, 400));
        position = await settledPreviewPosition(needle);
      }
      driver.sendMouseWithoutFrameExpectation({
        kind: 'move',
        column: position.column,
        row: position.row,
        button: 'none',
      });
      const deadline = performance.now() + 2_000;
      let confirmed = false;
      while (performance.now() < deadline) {
        const hovered = String(
          HarnessSmoke.Class.readStatus(statusPath).markdownHoveredReference,
        );
        if (hovered.endsWith(hoverSuffix)) {
          confirmed = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (confirmed) {
        ctrlClick(position);
        return;
      }
      const grid = driver.snapshot();
      console.log(
        'DEBUG attempt',
        attempt,
        JSON.stringify(position),
        'hovered=',
        JSON.stringify(
          HarnessSmoke.Class.readStatus(statusPath).markdownHoveredReference,
        ),
      );
      for (
        let row = Math.max(0, position.row - 1);
        row <= Math.min(grid.rows - 1, position.row + 1);
        row++
      ) {
        console.log('DEBUG row', row, grid.rowText(row));
      }
    }
    throw new Error(
      `FAIL hover never confirmed ${hoverSuffix} under ${needle}`,
    );
  };
  await ctrlClickHoverConfirmed(
    'gate-launch',
    '/task-205-gate-launch-time-and-memory-ceiling.md',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the task record opens from the view link',
    (status) =>
      String(status.activeBuffer).endsWith(
        '/task-205-gate-launch-time-and-memory-ceiling.md',
      ),
    30_000,
  );
  console.log('PASS  Ctrl-click on the task line lands in the task record');

  // Leg 3: the record names its sibling brief in backticks; Ctrl-click walks to it.
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the record preview finishes parsing',
    (status) =>
      status.markdownPreviewOpen === true && status.markdownParsing === false,
    30_000,
  );
  await ctrlClickHoverConfirmed(
    'brief-205-1',
    '/brief-205-1-gate-launch-time-and-memory-ceiling.md',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the sibling brief opens from the record',
    (status) =>
      String(status.activeBuffer).endsWith(
        '/brief-205-1-gate-launch-time-and-memory-ceiling.md',
      ),
    30_000,
  );
  console.log(
    'PASS  Ctrl-click on the sibling brief reference walks to the brief',
  );

  // Legs 4+5: Back retraces brief -> record -> view. The link open left keyboard focus on the
  // editor, so the editor-context chord fires directly. Both jump ends are recorded (#35's
  // convention), so the first press can land on the same-buffer arrival entry; press until the
  // buffer actually changes, bounded. (No Escape here: Escape moves focus to the file TREE.)
  const backUntilBuffer = async (
    suffix: string,
    label: string,
  ): Promise<number> => {
    for (let presses = 1; presses <= 4; presses++) {
      driver.sendKeysWithoutFrameExpectation('Alt+[');
      const arrived = await (async () => {
        const deadline = performance.now() + 5_000;
        while (performance.now() < deadline) {
          const status = HarnessSmoke.Class.readStatus(statusPath);
          if (String(status.activeBuffer).endsWith(suffix)) return true;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        return false;
      })();
      if (arrived) {
        console.log(`PASS  ${label} (${presses} Back press(es))`);
        return presses;
      }
    }
    throw new Error(`FAIL Back never reached ${suffix}`);
  };
  await backUntilBuffer(
    '/task-205-gate-launch-time-and-memory-ceiling.md',
    'Back returns to the task record',
  );
  await backUntilBuffer(
    '/project.active-tasks.md',
    'Back returns to project.active-tasks.md',
  );
  console.log('drive-276: ALL-PASS');
} finally {
  driver.dispose();
}
