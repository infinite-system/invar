#!/usr/bin/env bun
// Byte-level scrollbar showcase: the thumb is proven as a contiguous truecolor background run on
// blank cells in the actual terminal stream—the assertion tmux capture text cannot express.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';
import { HarnessSmoke } from './HarnessSmoke';

interface VerticalScrollBarProof {
  column: number;
  thumbBackground: number;
  thumbStartRow: number;
  thumbLength: number;
  trackLength: number;
}

interface HorizontalScrollBarProof {
  thumbLength: number;
  thumbStartColumn: number;
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

function horizontalEditorScrollBarProof(
  snapshot: HarnessSnapshot.Model,
): HorizontalScrollBarProof | null {
  const editorStartColumn = Math.min(30, snapshot.columns - 2);
  const editorEndColumnExclusive = Math.max(editorStartColumn, snapshot.columns - 2);
  const editorBackgroundCounts = new Map<number, number>();
  for (let row = 4; row < snapshot.rows - 3; row++) {
    for (
      const cell of snapshot.rowCells(row).slice(
        editorStartColumn,
        editorEndColumnExclusive,
      )
    ) {
      if (!cell.isBackgroundRgb) continue;
      editorBackgroundCounts.set(
        cell.background,
        (editorBackgroundCounts.get(cell.background) ?? 0) + 1,
      );
    }
  }
  const editorBackground = [...editorBackgroundCounts.entries()].sort(
    (firstBackground, secondBackground) => secondBackground[1] - firstBackground[1],
  )[0]?.[0];
  if (editorBackground === undefined) return null;

  const barCells = snapshot.rowCells(snapshot.rows - 3).slice(
    editorStartColumn,
    editorEndColumnExclusive,
  );
  let longestThumbStartColumn = -1;
  let longestThumbLength = 0;
  let currentThumbStartColumn = -1;
  let currentThumbLength = 0;
  let currentThumbBackground: number | null = null;
  for (const cell of barCells) {
    const isThumbCell = cell.isBackgroundRgb && cell.background !== editorBackground;
    if (isThumbCell && cell.background === currentThumbBackground) {
      currentThumbLength++;
    } else if (isThumbCell) {
      currentThumbStartColumn = cell.column;
      currentThumbLength = 1;
      currentThumbBackground = cell.background;
    } else {
      currentThumbLength = 0;
      currentThumbBackground = null;
    }
    if (currentThumbLength > longestThumbLength) {
      longestThumbStartColumn = currentThumbStartColumn;
      longestThumbLength = currentThumbLength;
    }
  }
  if (longestThumbLength < 2) return null;
  return {
    thumbLength: longestThumbLength,
    thumbStartColumn: longestThumbStartColumn,
    trackLength: barCells.length,
  };
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
  const widthOscillationLines = ['// HORIZONTAL-THUMB-STABILITY'];
  for (let lineNumber = 1; lineNumber <= 500; lineNumber++) {
    const blockNumber = Math.floor((lineNumber - 1) / 50) % 3;
    const targetWidth = lineNumber === 400
      ? 140
      : blockNumber === 0
        ? 42
        : blockNumber === 1
          ? 68
          : 54;
    const prefix = `const stableLine${String(lineNumber).padStart(3, '0')} = '`;
    const suffix = lineNumber === 400 ? "DEEP-WIDEST-END-MARKER';" : "';";
    widthOscillationLines.push(
      `${prefix}${'x'.repeat(Math.max(1, targetWidth - prefix.length - suffix.length))}${suffix}`,
    );
  }
  await Bun.write(
    join(fixtureRoot, 'horizontal-thumb-stability.ts'),
    `${widthOscillationLines.join('\n')}\n`,
  );
  for (let fileNumber = 1; fileNumber <= 50; fileNumber++) {
    await Bun.write(
      join(fixtureRoot, `short-${String(fileNumber).padStart(2, '0')}.txt`),
      'short\n',
    );
  }
  runGit(fixtureRoot, ['init', '-q']);
  runGit(fixtureRoot, ['config', 'user.name', 'scrollbar-harness']);
  runGit(fixtureRoot, ['config', 'user.email', 'scrollbar-harness@example.test']);
  runGit(fixtureRoot, ['add', '.gitignore', 'base.txt', 'horizontal-thumb-stability.ts', ...Array.from(
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
  columns: 120,
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

  console.log('== harness scrollbars: thumb length stays stable through every scroll frame ==');
  overflowDriver.sendKeys('Control+p');
  await overflowDriver.awaitSnapshot((candidate) => candidate.findText('Go to File') !== null);
  overflowDriver.sendText('horizontal-thumb-stability');
  await overflowDriver.awaitQuiescence();
  overflowDriver.sendKeys('Enter');
  snapshot = await overflowDriver.awaitSnapshot(
    (candidate) => candidate.findText('HORIZONTAL-TH') !== null,
  );
  const initialHorizontalThumb = horizontalEditorScrollBarProof(snapshot);
  requireCondition(initialHorizontalThumb !== null, 'editor horizontal thumb is present');
  const horizontalThumbLengths: number[] = [];
  let nextScrollFrame = overflowDriver.awaitNextCompletedFrameSnapshot(2_000);
  sendRepeatedWheel(overflowDriver, 'down', 25, 40, 10);
  for (let frameNumber = 1; frameNumber <= 300; frameNumber++) {
    let scrollFrame: Awaited<typeof nextScrollFrame>;
    try {
      scrollFrame = await nextScrollFrame;
    } catch (error) {
      if (
        error instanceof Error
        && error.message.startsWith('Timed out waiting for the next complete synchronized frame')
      ) {
        break;
      }
      throw error;
    }
    const frameProof = horizontalEditorScrollBarProof(scrollFrame.snapshot);
    requireCondition(
      frameProof !== null,
      `editor horizontal thumb remains present in scroll frame ${frameNumber}`,
    );
    horizontalThumbLengths.push(frameProof.thumbLength);
    if (frameNumber < 300) {
      nextScrollFrame = overflowDriver.awaitNextCompletedFrameSnapshot(150);
    }
  }
  const distinctHorizontalThumbLengths = [...new Set(horizontalThumbLengths)];
  requireCondition(
    horizontalThumbLengths.length > 2,
    `wheel burst emitted ${horizontalThumbLengths.length - 1} observed scroll frames`,
  );
  requireCondition(
    distinctHorizontalThumbLengths.length === 1,
    `horizontal thumb length is stable while content size is unchanged `
      + `(${horizontalThumbLengths.join(',')})`,
  );

  console.log('== harness scrollbars: the deep widest line is reachable at the stable extent ==');
  snapshot = await sendWheelUntil(
    overflowDriver,
    (candidate) => {
      const proof = horizontalEditorScrollBarProof(candidate);
      return proof !== null
        && proof.thumbStartColumn + proof.thumbLength >= candidate.columns - 2;
    },
    'right',
    80,
    80,
    10,
    true,
  );
  const maximumHorizontalThumb = horizontalEditorScrollBarProof(snapshot);
  requireCondition(
    maximumHorizontalThumb !== null,
    'editor horizontal thumb reaches its right extreme before the deep line is visible',
  );
  let deepWidestLineReached = false;
  for (let wheelEvent = 1; wheelEvent <= 180; wheelEvent++) {
    overflowDriver.sendMouse({
      kind: 'wheel',
      column: 80,
      row: 10,
      direction: 'down',
    });
    await overflowDriver.awaitQuiescence();
    snapshot = overflowDriver.snapshot();
    if (snapshot.findText('DEEP-WIDEST-END-MARKER') !== null) {
      deepWidestLineReached = true;
      break;
    }
  }
  requireCondition(
    deepWidestLineReached,
    'the line-400 widest tail is visible at the unchanged full-document horizontal extent',
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
  const clippedTreeSnapshot = await overflowDriver.awaitGridCondition(
    'the tree filename tail is clipped at the leftmost horizontal offset',
    (candidate) => {
      const proof = verticalScrollBarProof(candidate);
      return proof !== null
        && proof.thumbStartRow === initialThumb.thumbStartRow
        && candidate.findText('CHANGES-END-MARKER') === null;
    },
  );
  requireCondition(
    clippedTreeSnapshot.findText('CHANGES-END-MARKER') === null,
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
  await overflowDriver.dispose();
  await fitsDriver?.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(overflowFixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(fitsFixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
