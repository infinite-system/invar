#!/usr/bin/env bun
// Byte-level scrollbar showcase: the thumb is proven as a contiguous truecolor background run on
// blank cells in the actual terminal stream—the assertion tmux capture text cannot express.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

interface VerticalScrollBarProof {
  column: number;
  thumbBackground: number;
  thumbStartRow: number;
  thumbLength: number;
  trackLength: number;
}

function pass(label: string): void {
  console.log(`  PASS  ${label}`);
}

function requireCondition(condition: unknown, label: string): asserts condition {
  if (!condition) throw new Error(`FAIL ${label}`);
  pass(label);
}

function runGit(repositoryRoot: string, commandArguments: string[]): void {
  const result = Bun.spawnSync(['git', ...commandArguments], {
    cwd: repositoryRoot,
    stdout: 'ignore',
    stderr: 'pipe',
    env: Object.fromEntries(
      Object.entries(process.env).filter(([key, value]) => value !== undefined && !key.startsWith('GIT_')),
    ) as Record<string, string>,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${commandArguments.join(' ')} failed: ${new TextDecoder().decode(result.stderr)}`,
    );
  }
}

function dominantSidebarBackground(snapshot: HarnessSnapshot.Model): number | null {
  const backgroundCounts = new Map<number, number>();
  for (let row = 0; row < snapshot.rows; row++) {
    for (let column = 1; column < Math.min(27, snapshot.columns); column++) {
      const cell = snapshot.cell(row, column);
      if (!cell?.isBackgroundRgb) continue;
      backgroundCounts.set(cell.background, (backgroundCounts.get(cell.background) ?? 0) + 1);
    }
  }
  let dominantBackground: number | null = null;
  let dominantCount = 0;
  for (const [background, count] of backgroundCounts) {
    if (count <= dominantCount) continue;
    dominantBackground = background;
    dominantCount = count;
  }
  return dominantBackground;
}

function verticalScrollBarProof(snapshot: HarnessSnapshot.Model): VerticalScrollBarProof | null {
  const paneBackground = dominantSidebarBackground(snapshot);
  if (paneBackground === null) return null;
  let bestColumn = -1;
  let bestPaintedRows: Array<{ row: number; background: number }> = [];
  for (let column = 1; column < Math.min(27, snapshot.columns); column++) {
    const paintedRows: Array<{ row: number; background: number }> = [];
    for (let row = 0; row < snapshot.rows; row++) {
      if (!snapshot.rowText(row).startsWith('│')) continue;
      const cell = snapshot.cell(row, column);
      if (
        cell?.characters === ' '
        && cell.isBackgroundRgb
        && cell.background !== paneBackground
      ) {
        paintedRows.push({ row, background: cell.background });
      }
    }
    if (paintedRows.length > bestPaintedRows.length) {
      bestColumn = column;
      bestPaintedRows = paintedRows;
    }
  }
  if (bestColumn < 0 || bestPaintedRows.length < 10) return null;

  const colorCounts = new Map<number, number>();
  for (const paintedCell of bestPaintedRows) {
    colorCounts.set(
      paintedCell.background,
      (colorCounts.get(paintedCell.background) ?? 0) + 1,
    );
  }
  if (colorCounts.size !== 2) return null;
  const orderedColors = [...colorCounts.entries()].sort(
    (firstColor, secondColor) => firstColor[1] - secondColor[1],
  );
  const thumbBackground = orderedColors[0]?.[0];
  if (thumbBackground === undefined) return null;
  const thumbRows = bestPaintedRows
    .filter((paintedCell) => paintedCell.background === thumbBackground)
    .map((paintedCell) => paintedCell.row);
  if (thumbRows.length < 2 || thumbRows.length >= bestPaintedRows.length) return null;
  const thumbStartRow = thumbRows[0];
  const thumbEndRow = thumbRows.at(-1);
  if (
    thumbStartRow === undefined
    || thumbEndRow === undefined
    || thumbEndRow - thumbStartRow + 1 !== thumbRows.length
  ) {
    return null;
  }
  return {
    column: bestColumn,
    thumbBackground,
    thumbStartRow,
    thumbLength: thumbRows.length,
    trackLength: bestPaintedRows.length,
  };
}

function horizontalScrollBarRowCount(snapshot: HarnessSnapshot.Model): number {
  const paneBackground = dominantSidebarBackground(snapshot);
  if (paneBackground === null) return 0;
  let barRowCount = 0;
  for (let row = 0; row < snapshot.rows; row++) {
    if (!snapshot.rowText(row).startsWith('│')) continue;
    const sidebarCells = snapshot.rowCells(row).slice(1, Math.min(27, snapshot.columns));
    if (sidebarCells.some((cell) => cell.characters.trim().length > 0)) continue;
    let longestBackgroundRun = 0;
    let currentBackgroundRun = 0;
    for (const cell of sidebarCells) {
      if (cell.isBackgroundRgb && cell.background !== paneBackground) {
        currentBackgroundRun++;
        longestBackgroundRun = Math.max(longestBackgroundRun, currentBackgroundRun);
      } else {
        currentBackgroundRun = 0;
      }
    }
    if (longestBackgroundRun >= 4 && longestBackgroundRun < sidebarCells.length) barRowCount++;
  }
  return barRowCount;
}

function sendRepeatedWheel(
  driver: PtyTestDriver.Model,
  direction: 'up' | 'down' | 'left' | 'right',
  repeatCount: number,
  column: number,
  row: number,
  alt = false,
): void {
  for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex++) {
    driver.sendMouse({ kind: 'wheel', column, row, direction, alt });
  }
}

async function sendWheelUntil(
  driver: PtyTestDriver.Model,
  predicate: (snapshot: HarnessSnapshot.Model) => boolean,
  direction: 'up' | 'down' | 'left' | 'right',
  maximumRepeatCount: number,
  column: number,
  row: number,
  alt = false,
): Promise<HarnessSnapshot.Model> {
  for (let repeatIndex = 0; repeatIndex < maximumRepeatCount; repeatIndex++) {
    driver.sendMouse({ kind: 'wheel', column, row, direction, alt });
    await driver.awaitQuiescence();
    const snapshot = driver.snapshot();
    if (predicate(snapshot)) return snapshot;
  }
  throw new Error(`Wheel condition did not become visible after ${maximumRepeatCount} events`);
}

async function buildOverflowFixture(fixtureRoot: string): Promise<void> {
  mkdirSync(join(fixtureRoot, '.invar'));
  await Bun.write(
    join(fixtureRoot, '.invar', 'settings.json'),
    JSON.stringify({
      sidebarWidth: 28,
      scrollbarThickness: 1,
      horizontalScrollModifier: 'alt',
      linesPerNotch: 3,
      gitSplitRatio: 0.5,
      showActivityBar: false,
    }),
  );
  await Bun.write(join(fixtureRoot, '.gitignore'), '.invar/\n');
  await Bun.write(join(fixtureRoot, 'base.txt'), 'base\n');
  for (let fileNumber = 1; fileNumber <= 50; fileNumber++) {
    await Bun.write(
      join(fixtureRoot, `short-${String(fileNumber).padStart(2, '0')}.txt`),
      'short\n',
    );
  }
  runGit(fixtureRoot, ['init', '-q']);
  runGit(fixtureRoot, ['config', 'user.name', 'scrollbar-harness']);
  runGit(fixtureRoot, ['config', 'user.email', 'scrollbar-harness@example.test']);
  runGit(fixtureRoot, ['add', '.gitignore', 'base.txt', ...Array.from(
    { length: 50 },
    (_unused, fileIndex) => `short-${String(fileIndex + 1).padStart(2, '0')}.txt`,
  )]);
  runGit(fixtureRoot, ['commit', '-qm', 'base']);
  for (let commitNumber = 1; commitNumber <= 22; commitNumber++) {
    const basePath = join(fixtureRoot, 'base.txt');
    await Bun.write(basePath, `${await Bun.file(basePath).text()}${commitNumber}\n`);
    runGit(fixtureRoot, ['add', 'base.txt']);
    runGit(fixtureRoot, ['commit', '-qm', `short-${commitNumber}`]);
  }
  const longFileName = '000-VERY-LONG-CHANGES-FILENAME-THAT-ENDS-WITH-CHANGES-END-MARKER.txt';
  await Bun.write(join(fixtureRoot, longFileName), 'one\n');
  runGit(fixtureRoot, ['add', longFileName]);
  runGit(fixtureRoot, [
    'commit',
    '-qm',
    'VERY-LONG-COMMIT-SUBJECT-THAT-ENDS-WITH-LOG-END-MARKER',
  ]);
  await Bun.write(join(fixtureRoot, longFileName), 'one\ntwo\n');
}

async function buildFitsFixture(fixtureRoot: string): Promise<void> {
  mkdirSync(join(fixtureRoot, '.invar'));
  await Bun.write(
    join(fixtureRoot, '.invar', 'settings.json'),
    JSON.stringify({
      sidebarWidth: 28,
      scrollbarThickness: 1,
      gitSplitRatio: 0.5,
      showActivityBar: false,
    }),
  );
  await Bun.write(join(fixtureRoot, '.gitignore'), '.invar/\n');
  await Bun.write(join(fixtureRoot, 'a.txt'), 'one\n');
  runGit(fixtureRoot, ['init', '-q']);
  runGit(fixtureRoot, ['config', 'user.name', 'scrollbar-harness']);
  runGit(fixtureRoot, ['config', 'user.email', 'scrollbar-harness@example.test']);
  runGit(fixtureRoot, ['add', '.gitignore', 'a.txt']);
  runGit(fixtureRoot, ['commit', '-qm', 'fit']);
  await Bun.write(join(fixtureRoot, 'a.txt'), 'one\ntwo\n');
}

const overflowFixtureRoot = mkdtempSync(join(tmpdir(), 'tui-scrollbars-harness-overflow-'));
const fitsFixtureRoot = mkdtempSync(join(tmpdir(), 'tui-scrollbars-harness-fits-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-scrollbars-harness-home-'));
await buildOverflowFixture(overflowFixtureRoot);
await buildFitsFixture(fitsFixtureRoot);

const overflowDriver = new PtyTestDriver.Class({
  workspaceRoot: overflowFixtureRoot,
  columns: 54,
  rows: 28,
  homeDirectory,
});

let fitsDriver: PtyTestDriver.Model | null = null;
try {
  console.log('== harness scrollbars: prove the vertical thumb from cell backgrounds ==');
  let snapshot = await overflowDriver.awaitSnapshot(
    (candidate) => verticalScrollBarProof(candidate) !== null,
    15_000,
  );
  const initialThumb = verticalScrollBarProof(snapshot);
  requireCondition(initialThumb !== null, 'vertical scrollbar is present');
  requireCondition(
    initialThumb.thumbLength >= 2
      && initialThumb.thumbLength < initialThumb.trackLength,
    `thumb is a proportional multi-cell run (${initialThumb.thumbLength}/${initialThumb.trackLength})`,
  );
  for (
    let thumbRow = initialThumb.thumbStartRow;
    thumbRow < initialThumb.thumbStartRow + initialThumb.thumbLength;
    thumbRow++
  ) {
    const thumbCell = snapshot.cell(thumbRow, initialThumb.column);
    requireCondition(
      thumbCell?.characters === ' '
        && thumbCell.isBackgroundRgb
        && thumbCell.background === initialThumb.thumbBackground,
      `thumb cell ${thumbRow} is blank with RGB background ${initialThumb.thumbBackground.toString(16)}`,
    );
  }
  pass(
    `contiguous BG-color thumb run starts at row ${initialThumb.thumbStartRow}, `
    + `column ${initialThumb.column}`,
  );
  requireCondition(
    horizontalScrollBarRowCount(snapshot) === 1,
    'overflowing tree paints one horizontal background bar row',
  );

  sendRepeatedWheel(overflowDriver, 'down', 8, 9, 9);
  snapshot = await overflowDriver.awaitSnapshot((candidate) => {
    const proof = verticalScrollBarProof(candidate);
    return proof !== null && proof.thumbStartRow > initialThumb.thumbStartRow;
  });
  const movedThumb = verticalScrollBarProof(snapshot);
  requireCondition(
    movedThumb !== null && movedThumb.thumbStartRow > initialThumb.thumbStartRow,
    `wheel moves the same BG thumb down (${initialThumb.thumbStartRow} to ${movedThumb?.thumbStartRow})`,
  );

  console.log('== harness scrollbars: horizontal bars reveal clipped content independently ==');
  sendRepeatedWheel(overflowDriver, 'up', 40, 9, 9);
  await overflowDriver.awaitSnapshot((candidate) => {
    const proof = verticalScrollBarProof(candidate);
    return proof !== null && proof.thumbStartRow === initialThumb.thumbStartRow;
  });
  requireCondition(
    overflowDriver.snapshot().findText('CHANGES-END-MARKER') === null,
    'tree filename tail starts clipped',
  );
  await sendWheelUntil(
    overflowDriver,
    (candidate) => candidate.findText('CHANGES-END-MARKER') !== null,
    'right',
    30,
    9,
    4,
    true,
  );
  pass('Alt-wheel reveals the tree filename tail through raw SGR input');

  overflowDriver.sendKeys('Control+g');
  snapshot = await overflowDriver.awaitSnapshot(
    (candidate) => candidate.findText('VERY-LONG-COMM') !== null,
    15_000,
  );
  pass('changes and log panes loaded as independent horizontal viewports');
  requireCondition(snapshot.findText('END-MARKER.txt') === null, 'changes tail starts clipped');
  requireCondition(snapshot.findText('LOG-END-MARKER') === null, 'log tail starts clipped');
  snapshot = await sendWheelUntil(
    overflowDriver,
    (candidate) => candidate.findText('END-MARKER.txt') !== null,
    'right',
    30,
    9,
    4,
    true,
  );
  requireCondition(
    snapshot.findText('LOG-END-MARKER') === null,
    'changes horizontal scrolling leaves the log pane untouched',
  );
  await sendWheelUntil(
    overflowDriver,
    (candidate) => candidate.findText('LOG-END-MARKER') !== null,
    'right',
    30,
    9,
    21,
    true,
  );
  pass('log horizontal bar reveals its own clipped subject tail');

  console.log('== harness scrollbars: fitting panes paint no horizontal bar ==');
  fitsDriver = new PtyTestDriver.Class({
    workspaceRoot: fitsFixtureRoot,
    columns: 54,
    rows: 28,
    homeDirectory,
  });
  snapshot = await fitsDriver.awaitSnapshot((candidate) => candidate.findText('a.txt') !== null);
  requireCondition(
    horizontalScrollBarRowCount(snapshot) === 0,
    'fitting tree paints no horizontal bar',
  );
  fitsDriver.sendKeys('Control+g');
  snapshot = await fitsDriver.awaitSnapshot((candidate) => candidate.findText('fit') !== null);
  requireCondition(
    horizontalScrollBarRowCount(snapshot) === 0,
    'fitting git panes paint no horizontal bars',
  );

  overflowDriver.sendKeys('Control+q');
  fitsDriver.sendKeys('Control+q');
  console.log('smoke-scrollbars-harness: ALL-PASS');
} finally {
  overflowDriver.dispose();
  fitsDriver?.dispose();
  rmSync(overflowFixtureRoot, { recursive: true, force: true });
  rmSync(fitsFixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
