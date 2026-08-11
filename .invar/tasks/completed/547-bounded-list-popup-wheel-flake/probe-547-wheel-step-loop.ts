#!/usr/bin/env bun
// probe-547-wheel-step-loop.ts — loop the bounded-list-popup wheel step and autopsy a stall.
//
// What it finds out: which clock is wrong when the smoke's wait
// "wheel scrolling changes the visible popup list or reveals its tail" times out.
// It boots ONE app with the same 103-buffer fixture as the smoke, then loops:
// open the popup by clicking the buffer badge, wheel the list to its tail one
// notch at a time (the exact smoke step), Escape to close. Every wheel waits for
// the visible list to change. On a timeout it does NOT die: it runs an autopsy
// and keeps looping.
//
// The autopsy asks the three clocks (the #529 writeup's method):
//   1. the emulator screen — the popup viewport text right now,
//   2. the settled status file — boundedListPopupGeometry.firstVisible,
//      animationFrameCadenceTimerCount, workspaceScrollMomentumAtRest,
//   3. liveness — send one mouse MOVE (no wheel) and watch 2 s: if the list
//      then jumps with no new wheel, the impulse was PARKED (queued with no
//      frame to advance it — the "Wheel impulses start their own frame
//      sequence" record's impossible state). If nothing moves, the wheel
//      event itself was LOST before the viewport.
//
// Run: bun .invar/tasks/in-progress/547-bounded-list-popup-wheel-flake/probe-547-wheel-step-loop.ts [iterations] [waitMs]
// Defaults: 30 iterations, 10000 ms per-wheel wait.
// Output: one line per iteration (wheel count to tail); on a stall, an AUTOPSY
// block. Exit 1 if any stall was seen, 0 if all iterations reached the tail.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../../../src/modules/system/StatusChannel';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import type { HarnessSnapshot } from '../../../../scripts/harness/HarnessSnapshot';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const iterations = Number(process.argv[2] ?? 30);
const wheelWaitMilliseconds = Number(process.argv[3] ?? 10_000);

interface PopupGeometryStatus {
  listLeft: number;
  listTop: number;
  listColumns: number;
  listRows: number;
  firstVisible: number;
}

function popupGeometry(status: StatusSnapshot): PopupGeometryStatus | null {
  return status.boundedListPopupGeometry as PopupGeometryStatus | null;
}

function popupListViewportText(
  snapshot: HarnessSnapshot.Model,
  geometry: PopupGeometryStatus,
): string {
  const visibleRows: string[] = [];
  for (
    let row = geometry.listTop;
    row < geometry.listTop + geometry.listRows;
    row++
  ) {
    visibleRows.push(
      Array.from(snapshot.rowText(row))
        .slice(geometry.listLeft, geometry.listLeft + geometry.listColumns)
        .join(''),
    );
  }
  return visibleRows.join('\n');
}

function popupListContains(
  snapshot: HarnessSnapshot.Model,
  geometry: PopupGeometryStatus,
  text: string,
): boolean {
  return popupListViewportText(snapshot, geometry).includes(text);
}

function badgePosition(
  snapshot: HarnessSnapshot.Model,
  totalTabCount: number,
): { column: number; row: number } | null {
  const totalText = String(totalTabCount);
  for (let row = 0; row < snapshot.rows; row++) {
    const cells = Array.from(snapshot.rowText(row));
    const slashColumn = cells.findIndex(
      (cell, column) =>
        cell === '/' &&
        cells.slice(column + 1, column + 1 + totalText.length).join('') ===
          totalText,
    );
    if (slashColumn < 0) continue;
    let startColumn = slashColumn;
    while (startColumn > 0 && /[0-9]/.test(cells[startColumn - 1] ?? '')) {
      startColumn--;
    }
    return { column: startColumn, row };
  }
  return null;
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'probe-547-wheel-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'probe-547-wheel-home-'));
const statusPath = join(homeDirectory, 'status.json');
const totalFixtureBufferCount = 103;

for (let fileNumber = 1; fileNumber <= 100; fileNumber++) {
  const paddedFileNumber = String(fileNumber).padStart(3, '0');
  await Bun.write(
    join(fixtureRoot, `file-${paddedFileNumber}.txt`),
    `buffer ${paddedFileNumber}\n`,
  );
}
for (const fileName of ['a-ordinary.txt', 'b-picture.png', 'bun.lock']) {
  await Bun.write(join(fixtureRoot, fileName), `${fileName}\n`);
}
HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q', '-b', 'main']);
HarnessSmoke.Class.runGit(fixtureRoot, ['add', '-A']);
HarnessSmoke.Class.runGit(fixtureRoot, [
  '-c',
  'user.email=a@b.c',
  '-c',
  'user.name=x',
  'commit',
  '-q',
  '-m',
  'probe fixture root',
]);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

let stallCount = 0;

async function readStatus(): Promise<StatusSnapshot> {
  return await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status file readable for the autopsy',
    () => true,
    5_000,
  );
}

function statusClockLine(status: StatusSnapshot): string {
  const geometry = popupGeometry(status);
  return (
    `firstVisible=${geometry ? geometry.firstVisible : 'no-geometry'} ` +
    `open=${String(status.boundedListPopupOpen)} ` +
    `cadenceTimer=${String(status.animationFrameCadenceTimerCount)} ` +
    `workspaceMomentumAtRest=${String(status.workspaceScrollMomentumAtRest)}`
  );
}

async function autopsy(
  iteration: number,
  wheelNumber: number,
  geometry: PopupGeometryStatus,
  previousViewportText: string,
  wheelColumn: number,
  wheelRow: number,
): Promise<void> {
  stallCount += 1;
  console.log(`\n=== AUTOPSY iteration ${iteration} wheel ${wheelNumber} ===`);
  const frozenSnapshot = driver.snapshot();
  const frozenViewportText = popupListViewportText(frozenSnapshot, geometry);
  console.log(
    `screen clock: viewport ${
      frozenViewportText === previousViewportText ? 'UNCHANGED' : 'CHANGED'
    } since the wheel`,
  );
  console.log(`screen first list row: ${frozenViewportText.split('\n')[0]}`);
  const frozenStatus = await readStatus();
  console.log(`status clock: ${statusClockLine(frozenStatus)}`);
  // Liveness jiggle: one mouse MOVE, no wheel. A parked impulse drains on the
  // next frame any input causes; a lost wheel stays lost.
  driver.sendMouseWithoutFrameExpectation({
    kind: 'move',
    column: wheelColumn,
    row: wheelRow - 1,
  });
  let jiggleOutcome = 'screen did NOT move within 2 s of the jiggle';
  try {
    await driver.awaitGridCondition(
      'the popup list moves after a plain mouse move (parked impulse drains)',
      (candidate) =>
        popupListViewportText(candidate, geometry) !== frozenViewportText,
      2_000,
    );
    jiggleOutcome = 'screen MOVED after the jiggle: the impulse was PARKED';
  } catch {
    // Lost, not parked.
  }
  console.log(`liveness clock: ${jiggleOutcome}`);
  const postJiggleStatus = await readStatus();
  console.log(`status after jiggle: ${statusClockLine(postJiggleStatus)}`);
  console.log('=== END AUTOPSY ===\n');
}

try {
  // Open the 103-buffer fixture once, exactly as the smoke does.
  await driver.awaitGridCondition(
    'the file tree paints the fixture files',
    (candidate) => candidate.findText('file-001.txt') !== null,
    15_000,
  );
  for (let openAttempt = 0; openAttempt < 130; openAttempt++) {
    const openingStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the buffer count and focus are published',
      (status) =>
        typeof status.bufferTabCount === 'number' &&
        typeof status.focus === 'string',
    );
    const previousBufferCount = Number(openingStatus.bufferTabCount);
    if (previousBufferCount >= totalFixtureBufferCount) break;
    if (openingStatus.focus !== 'files') {
      driver.sendKeys('Control+Shift+j');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        "status.focus === 'files'",
        (status) => status.focus === 'files',
      );
    }
    driver.sendKeys('Down', 'Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the buffer count grows',
      (status) => Number(status.bufferTabCount) > previousBufferCount,
    );
  }
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'all 103 fixture buffers are open',
    (status) => status.bufferTabCount === totalFixtureBufferCount,
  );
  // Match the smoke: make the FIRST buffer active so the popup opens at the
  // top of the list and the wheel loop has the full distance to travel.
  driver.sendKeys('Control+PageDown');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the first buffer is active',
    (status) => status.activeBufferIndex === 0,
  );
  console.log(`fixture ready: ${totalFixtureBufferCount} buffers open`);

  for (let iteration = 1; iteration <= iterations; iteration++) {
    let snapshot = await driver.awaitGridCondition(
      'the buffer badge paints',
      (candidate) => badgePosition(candidate, totalFixtureBufferCount) !== null,
    );
    const badge = badgePosition(snapshot, totalFixtureBufferCount);
    if (!badge) throw new Error('badge vanished');
    driver.sendMouse({
      kind: 'press',
      column: badge.column,
      row: badge.row,
      button: 'left',
    });
    driver.sendMouse({
      kind: 'release',
      column: badge.column,
      row: badge.row,
      button: 'left',
    });
    const popupStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the popup opens with geometry',
      (status) =>
        status.boundedListPopupOpen === true && popupGeometry(status) !== null,
    );
    const geometry = popupGeometry(popupStatus);
    if (!geometry) throw new Error('geometry vanished');
    snapshot = await driver.awaitGridCondition(
      'the popup list paints its head',
      (candidate) => popupListContains(candidate, geometry, 'file-'),
    );
    const wheelColumn =
      geometry.listLeft + Math.max(0, geometry.listColumns - 2);
    const wheelRow = geometry.listTop + Math.floor(geometry.listRows / 2);
    let wheelNumber = 0;
    let stalledThisIteration = false;
    for (; wheelNumber < 80; wheelNumber++) {
      if (popupListContains(snapshot, geometry, 'file-100.txt')) break;
      const previousViewportText = popupListViewportText(snapshot, geometry);
      driver.sendMouseWithoutFrameExpectation({
        kind: 'wheel',
        column: wheelColumn,
        row: wheelRow,
        direction: 'down',
      });
      try {
        snapshot = await driver.awaitGridCondition(
          'wheel scrolling changes the visible popup list or reveals its tail',
          (candidate) =>
            popupListContains(candidate, geometry, 'file-100.txt') ||
            popupListViewportText(candidate, geometry) !== previousViewportText,
          wheelWaitMilliseconds,
        );
      } catch {
        await autopsy(
          iteration,
          wheelNumber,
          geometry,
          previousViewportText,
          wheelColumn,
          wheelRow,
        );
        stalledThisIteration = true;
        break;
      }
    }
    console.log(
      `iteration ${iteration}: ` +
        (stalledThisIteration
          ? `STALL at wheel ${wheelNumber}`
          : `tail after ${wheelNumber} wheels`),
    );
    driver.sendKeys('Escape');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the popup closes',
      (status) => status.boundedListPopupOpen === false,
    );
  }
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}

console.log(
  stallCount === 0
    ? `probe-547: ${iterations} iterations, no stall`
    : `probe-547: ${stallCount} stall(s) observed`,
);
process.exit(stallCount === 0 ? 0 : 1);
