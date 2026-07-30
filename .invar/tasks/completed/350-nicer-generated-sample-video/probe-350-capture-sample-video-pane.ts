// What this script finds out: what the demo sample video really looks like in
// the running app. It drives the real app in a pseudo terminal, opens the
// generated sample video from the command palette, waits until the pane paints
// half blocks, then rebuilds the picture from the terminal cells themselves.
// Each painted cell holds two pixels: the upper half block colour is the top
// pixel, the cell background is the bottom pixel. The result is written as a
// PNG, so the picture can be judged by eye instead of by a text grid.
//
// Run it:
//   bun .invar/tasks/in-progress/350-nicer-generated-sample-video/probe-350-capture-sample-video-pane.ts <output.png> [capture-count] [changed-cell-share] [terminal-columns] [terminal-rows]
//
// How to read the output: with a capture count above one you get
// <output>-1.png, <output>-2.png and so on. Each later capture waits until the
// named share of the painted cells changed colour, so the files show the
// picture at clearly different moments. Compare them: the picture must move,
// and each one must show large readable shapes at the pane size. The script
// prints the pane pixel size and the count of painted cells for every capture.
// It fails loudly if the pane never paints, or if the picture stops moving.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { HarnessSnapshot } from '../../../../scripts/harness/HarnessSnapshot';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const outputPath = process.argv[2];
if (!outputPath) {
  console.error('give an output PNG path as the first argument');
  process.exit(2);
}
const captureCount = Number(process.argv[3] ?? 1);
// A later capture is taken only after this share of the painted cells changed
// colour. That makes the wait a condition on visible motion.
const changedCellShareForNextCapture = Number(process.argv[4] ?? 0.35);
const terminalColumns = Number(process.argv[5] ?? 120);
const terminalRows = Number(process.argv[6] ?? 40);

const upperHalfBlock = '▀';

function paintedCells(
  snapshot: HarnessSnapshot.Model,
): { row: number; column: number; foreground: number; background: number }[] {
  const cells: {
    row: number;
    column: number;
    foreground: number;
    background: number;
  }[] = [];
  for (let row = 0; row < snapshot.rows; row++) {
    for (let column = 0; column < snapshot.columns; column++) {
      const cell = snapshot.cell(row, column);
      if (
        cell?.characters === upperHalfBlock &&
        cell.isForegroundRgb &&
        cell.isBackgroundRgb
      ) {
        cells.push({
          row,
          column,
          foreground: cell.foreground,
          background: cell.background,
        });
      }
    }
  }
  return cells;
}

// Write the painted cells as a PNG through ffmpeg. The intermediate raster has
// one pixel per half block, and ffmpeg scales it up with nearest neighbour so
// one source pixel stays one visible block.
async function writePicture(
  cells: ReturnType<typeof paintedCells>,
  path: string,
): Promise<{ width: number; height: number }> {
  const firstRow = Math.min(...cells.map((cell) => cell.row));
  const lastRow = Math.max(...cells.map((cell) => cell.row));
  const firstColumn = Math.min(...cells.map((cell) => cell.column));
  const lastColumn = Math.max(...cells.map((cell) => cell.column));
  const width = lastColumn - firstColumn + 1;
  const height = (lastRow - firstRow + 1) * 2;
  const raster = new Uint8Array(width * height * 3);
  for (const cell of cells) {
    const column = cell.column - firstColumn;
    const topRow = (cell.row - firstRow) * 2;
    const topOffset = (topRow * width + column) * 3;
    raster[topOffset] = (cell.foreground >> 16) & 0xff;
    raster[topOffset + 1] = (cell.foreground >> 8) & 0xff;
    raster[topOffset + 2] = cell.foreground & 0xff;
    const bottomOffset = ((topRow + 1) * width + column) * 3;
    raster[bottomOffset] = (cell.background >> 16) & 0xff;
    raster[bottomOffset + 1] = (cell.background >> 8) & 0xff;
    raster[bottomOffset + 2] = cell.background & 0xff;
  }
  const rasterPath = join(dirname(path), `${path.split('/').at(-1)}.rgb`);
  await Bun.write(rasterPath, raster);
  const result = Bun.spawnSync(
    [
      'ffmpeg',
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'rawvideo',
      '-pixel_format',
      'rgb24',
      '-video_size',
      `${width}x${height}`,
      '-i',
      rasterPath,
      '-vf',
      'scale=iw*8:ih*8:flags=neighbor',
      path,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );
  if (result.exitCode !== 0) {
    throw new Error(
      `could not write ${path}: ${new TextDecoder().decode(result.stderr)}`,
    );
  }
  return { width, height };
}

const workspaceRoot = mkdtempSync(join(tmpdir(), 'invar-350-capture-'));
await Bun.write(
  join(workspaceRoot, 'sample.ts'),
  'export const mediaFixture = "sample";\n',
);
const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-350-capture-home-'));
const driver = new PtyTestDriver.Class({
  workspaceRoot,
  columns: terminalColumns,
  rows: terminalRows,
  homeDirectory,
  environment: { TUI_GRAPHICS_TIER: 'halfblock', COLORTERM: 'truecolor' },
});

try {
  await driver.awaitGridCondition(
    'the app boots and shows the workspace file',
    (snapshot) => snapshot.findText('sample.ts') !== null,
  );
  driver.sendKeys('Control+Shift+p');
  await driver.awaitGridCondition(
    'the command palette is open',
    (snapshot) => snapshot.findText('Command Palette') !== null,
  );
  driver.sendText('generated sample video');
  await driver.awaitGridCondition(
    'the palette offers the generated sample video command',
    (snapshot) => snapshot.text().includes('Generated Sample Video'),
  );
  driver.sendKeys('Enter');
  let previousCells: ReturnType<typeof paintedCells> = [];
  for (let capture = 1; capture <= captureCount; capture += 1) {
    let latest: ReturnType<typeof paintedCells> = [];
    // A later capture waits for a picture that differs from the one already
    // captured. The wait observes visible motion instead of counting time.
    await driver.awaitGridCondition(
      `capture ${capture}: the sample video pane paints a picture that differs from the previous capture`,
      (snapshot) => {
        const cells = paintedCells(snapshot);
        if (cells.length <= 100) return false;
        // A half-painted pane would make a torn picture. Require the painted
        // cells to fill their whole bounding rectangle.
        const rowNumbers = cells.map((cell) => cell.row);
        const columnNumbers = cells.map((cell) => cell.column);
        const rectangleCellCount =
          (Math.max(...rowNumbers) - Math.min(...rowNumbers) + 1) *
          (Math.max(...columnNumbers) - Math.min(...columnNumbers) + 1);
        if (cells.length !== rectangleCellCount) return false;
        if (previousCells.length > 0) {
          const previousByPosition = new Map(
            previousCells.map((cell) => [
              `${cell.row},${cell.column}`,
              `${cell.foreground}:${cell.background}`,
            ]),
          );
          let changedCellCount = 0;
          for (const cell of cells) {
            if (
              previousByPosition.get(`${cell.row},${cell.column}`) !==
              `${cell.foreground}:${cell.background}`
            ) {
              changedCellCount += 1;
            }
          }
          if (
            changedCellCount <
            cells.length * changedCellShareForNextCapture
          ) {
            return false;
          }
        }
        latest = cells;
        previousCells = cells;
        return true;
      },
      30_000,
    );
    const size = await writePicture(
      latest,
      captureCount === 1
        ? outputPath
        : outputPath.replace(/\.png$/, `-${capture}.png`),
    );
    console.log(
      `capture ${capture}: ${latest.length} painted cells, ${size.width}x${size.height} pixels`,
    );
  }
} finally {
  await driver.dispose();
}
