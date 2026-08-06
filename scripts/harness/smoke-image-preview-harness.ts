#!/usr/bin/env bun
// Byte-level image-preview port: real PNG/JPEG bytes cross quick-open and render as half-block cells
// whose glyph and truecolor lanes are asserted through the production terminal emulator.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Focus owns the keystroke (src/modules/keybindings/keybindings.invariants.md)
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encode as encodeJpeg } from 'jpeg-js';
import { ImageDecoders } from '../../src/modules/image/ImageDecoders';
import { PngDecoder } from '../../src/modules/image/PngDecoder';
import { GraphClient } from './GraphClient';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function halfBlockCount(snapshot: HarnessSnapshot.Model): number {
  return snapshot
    .textRows()
    .reduce(
      (count, rowText) =>
        count +
        Array.from(rowText).filter((character) => character === '▀').length,
      0,
    );
}

function distinctImageColors(snapshot: HarnessSnapshot.Model): {
  foregroundCount: number;
  backgroundCount: number;
} {
  const foregrounds = new Set<number>();
  const backgrounds = new Set<number>();
  for (let row = 2; row < Math.min(34, snapshot.rows); row++) {
    for (let column = 30; column < Math.min(115, snapshot.columns); column++) {
      const cell = snapshot.cell(row, column);
      if (cell?.isForegroundRgb) foregrounds.add(cell.foreground);
      if (cell?.isBackgroundRgb) backgrounds.add(cell.background);
    }
  }
  return {
    foregroundCount: foregrounds.size,
    backgroundCount: backgrounds.size,
  };
}

function dominantColorRows(snapshot: HarnessSnapshot.Model): string[] {
  const dominantRows: string[] = [];
  for (let row = 2; row < Math.min(34, snapshot.rows); row++) {
    let red = 0;
    let green = 0;
    let blue = 0;
    let cellCount = 0;
    for (let column = 35; column < Math.min(110, snapshot.columns); column++) {
      const cell = snapshot.cell(row, column);
      if (!cell?.isForegroundRgb) continue;
      red += (cell.foreground >> 16) & 0xff;
      green += (cell.foreground >> 8) & 0xff;
      blue += cell.foreground & 0xff;
      cellCount++;
    }
    if (cellCount === 0) continue;
    if (red > 2 * green && red > 2 * blue) dominantRows.push('red');
    else if (green > 2 * red && green > 2 * blue) dominantRows.push('green');
    else if (blue > 2 * red && blue > 2 * green) dominantRows.push('blue');
  }
  return dominantRows;
}

async function openThroughQuickOpen(
  driver: PtyTestDriver.Model,
  query: string,
  expectedPath: string,
): Promise<void> {
  driver.sendKeys('Control+p');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Go to File') !== null,
  );
  driver.sendText(query);
  await GraphClient.Class.awaitValue(statusPath, 'quickOpen.query', query);
  await GraphClient.Class.awaitValue(
    statusPath,
    'quickOpen.matches.0.path',
    expectedPath,
  );
  driver.sendKeys('Enter');
}

const pngPath = '/tmp/ivue-cart-dark.png';

HarnessSmoke.Class.requireCondition(
  await Bun.file(pngPath).exists(),
  `real PNG fixture exists at ${pngPath}`,
);

console.log('== harness image-preview: decoder and half-block unit layer ==');

HarnessSmoke.Class.requireChildSuccess('image module unit tests', [
  process.execPath,
  'test',
  'src/modules/image/',
]);

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-image-preview-harness-'));

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-image-preview-harness-home-'),
);

const statusPath = join(homeDirectory, 'status.json');

copyFileSync(pngPath, join(fixtureRoot, 'picture.png'));

await Bun.write(
  join(fixtureRoot, 'sample.ts'),
  'export const answer = 42;\nconst greeting = "hello";\n',
);

await Bun.write(
  join(fixtureRoot, 'data.bin'),
  new Uint8Array([66, 73, 78, 0, 0, 68, 65, 84, 65, 0, 1, 2, 3]),
);

const jpegWidth = 600;

const jpegHeight = 399;

const jpegPixels = new Uint8Array(jpegWidth * jpegHeight * 4);

const bandColors = [
  [255, 0, 0],
  [0, 255, 0],
  [0, 0, 255],
] as const;

for (let row = 0; row < jpegHeight; row++) {
  const bandIndex = Math.min(2, Math.floor(row / (jpegHeight / 3)));
  const bandColor = bandColors[bandIndex] ?? bandColors[2];
  for (let column = 0; column < jpegWidth; column++) {
    const pixelOffset = (row * jpegWidth + column) * 4;
    jpegPixels[pixelOffset] = bandColor[0];
    jpegPixels[pixelOffset + 1] = bandColor[1];
    jpegPixels[pixelOffset + 2] = bandColor[2];
    jpegPixels[pixelOffset + 3] = 255;
  }
}

await Bun.write(
  join(fixtureRoot, 'photo.jpg'),
  encodeJpeg({ data: jpegPixels, width: jpegWidth, height: jpegHeight }, 95)
    .data,
);

HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);

console.log(
  '== harness image-preview: independent real-file decode cross-checks ==',
);

const decodedPng = PngDecoder.Class.decode(
  new Uint8Array(await Bun.file(pngPath).arrayBuffer()),
);

const pngDistinctColors = new Set<string>();

for (
  let pixelOffset = 0;
  pixelOffset < decodedPng.rgba.length && pngDistinctColors.size < 5;
  pixelOffset += 4
) {
  pngDistinctColors.add(
    `${decodedPng.rgba[pixelOffset]},${decodedPng.rgba[pixelOffset + 1]},` +
      `${decodedPng.rgba[pixelOffset + 2]}`,
  );
}

HarnessSmoke.Class.requireCondition(
  decodedPng.width > 0 &&
    decodedPng.height > 0 &&
    decodedPng.rgba.length === decodedPng.width * decodedPng.height * 4 &&
    pngDistinctColors.size >= 2,
  `real PNG decodes to ${decodedPng.width}x${decodedPng.height} varied RGBA pixels`,
);

const jpegDecoder = ImageDecoders.Class.decoderFor('.jpg');

HarnessSmoke.Class.requireCondition(
  jpegDecoder !== null,
  'registry supplies the .jpg decoder',
);

if (!jpegDecoder) throw new Error('FAIL .jpg decoder disappeared');

const decodedJpeg = jpegDecoder(
  new Uint8Array(await Bun.file(join(fixtureRoot, 'photo.jpg')).arrayBuffer()),
);

function jpegBandPixelOffset(bandIndex: number): number {
  const row =
    Math.floor(jpegHeight / 6) + bandIndex * Math.floor(jpegHeight / 3);
  return (row * jpegWidth + Math.floor(jpegWidth / 2)) * 4;
}

const redBandOffset = jpegBandPixelOffset(0);

const greenBandOffset = jpegBandPixelOffset(1);

const blueBandOffset = jpegBandPixelOffset(2);

HarnessSmoke.Class.requireCondition(
  decodedJpeg.width === jpegWidth &&
    decodedJpeg.height === jpegHeight &&
    decodedJpeg.rgba.length === jpegWidth * jpegHeight * 4 &&
    Number(decodedJpeg.rgba[redBandOffset]) > 200 &&
    Number(decodedJpeg.rgba[redBandOffset + 1]) < 60 &&
    Number(decodedJpeg.rgba[greenBandOffset + 1]) > 200 &&
    Number(decodedJpeg.rgba[greenBandOffset]) < 60 &&
    Number(decodedJpeg.rgba[blueBandOffset + 2]) > 200 &&
    Number(decodedJpeg.rgba[blueBandOffset]) < 60,
  'generated JPEG registry decode preserves dimensions and red/green/blue bands',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    COLORTERM: 'truecolor',
  },
});

try {
  console.log(
    '== harness image-preview: PNG renders a varied half-block projection ==',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.ready === true && status.activeFileIsImage === false',
    (status) => status.ready === true && status.activeFileIsImage === false,
    15_000,
  );
  await openThroughQuickOpen(driver, 'picture', 'picture.png');
  const pngStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.activeFileIsImage === true && String(status.activeBuffer).endsWith('/picture.png')",
    (status) =>
      status.activeFileIsImage === true &&
      String(status.activeBuffer).endsWith('/picture.png'),
  );
  HarnessSmoke.Class.pass(
    `quick-open selected ${String(pngStatus.activeBuffer).split('/').at(-1)}`,
  );
  driver.sendKeys('Control+p');
  await GraphClient.Class.awaitValue(statusPath, 'quickOpen.open', true);
  driver.sendKeys('Escape');
  await GraphClient.Class.awaitValue(statusPath, 'quickOpen.open', false);
  HarnessSmoke.Class.requireCondition(
    HarnessSmoke.Class.readStatus(statusPath).activeFileIsImage === true,
    'Ctrl+P opens Quick Open and returns to the image viewer',
  );
  let snapshot = await driver.awaitSnapshot(
    (candidate) => halfBlockCount(candidate) > 500,
  );
  HarnessSmoke.Class.pass(
    `PNG paints ${halfBlockCount(snapshot)} half-block cells`,
  );
  const pngColors = distinctImageColors(snapshot);
  HarnessSmoke.Class.requireCondition(
    pngColors.foregroundCount > 15 && pngColors.backgroundCount > 15,
    `PNG carries varied cell colors (fg=${pngColors.foregroundCount}, bg=${pngColors.backgroundCount})`,
  );

  console.log(
    '== harness image-preview: text and binary routing remain distinct ==',
  );
  await openThroughQuickOpen(driver, 'sample', 'sample.ts');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.activeFileIsImage === false && String(status.activeBuffer).endsWith('/sample.ts')",
    (status) =>
      status.activeFileIsImage === false &&
      String(status.activeBuffer).endsWith('/sample.ts'),
  );
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('answer') !== null,
  );
  HarnessSmoke.Class.pass('text file renders as source after the image');

  console.log(
    '== harness image-preview: JPEG preserves expected band colors ==',
  );
  await openThroughQuickOpen(driver, 'photo', 'photo.jpg');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.activeFileIsImage === true && String(status.activeBuffer).endsWith('/photo.jpg')",
    (status) =>
      status.activeFileIsImage === true &&
      String(status.activeBuffer).endsWith('/photo.jpg'),
  );
  // AWAIT THE BANDS, not a cell count. `halfBlockCount(candidate) > 500` is an ADJACENT fact: a
  // partially painted JPEG can exceed 500 half-block cells while the bottom third is still blank, so
  // the assertion below then reads two bands instead of three. That is exactly how this failed inside a
  // gate on 2026-07-26 ("9/8/0 rows") while passing solo at 9/8/8. The wait now evaluates the SAME
  // predicate the claim asserts, through one shared helper so the two cannot drift apart.
  const bandsArePainted = (candidate: HarnessSnapshot.Model): boolean => {
    const rows = dominantColorRows(candidate);
    return (
      [...new Set(rows)].join(',') === 'red,green,blue' &&
      rows.filter((color) => color === 'red').length >= 4 &&
      rows.filter((color) => color === 'green').length >= 4 &&
      rows.filter((color) => color === 'blue').length >= 4
    );
  };
  snapshot = await driver.awaitSnapshot(bandsArePainted);
  const dominantRows = dominantColorRows(snapshot);
  const dominantOrder = [...new Set(dominantRows)].join(',');
  const redRows = dominantRows.filter((color) => color === 'red').length;
  const greenRows = dominantRows.filter((color) => color === 'green').length;
  const blueRows = dominantRows.filter((color) => color === 'blue').length;
  HarnessSmoke.Class.requireCondition(
    dominantOrder === 'red,green,blue' &&
      redRows >= 4 &&
      greenRows >= 4 &&
      blueRows >= 4,
    `JPEG bands render red/green/blue in order (${redRows}/${greenRows}/${blueRows} rows)`,
  );

  await openThroughQuickOpen(driver, 'data', 'data.bin');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.activeFileIsImage === false && String(status.activeBuffer).endsWith('/data.bin')",
    (status) =>
      status.activeFileIsImage === false &&
      String(status.activeBuffer).endsWith('/data.bin'),
  );
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('(binary file not shown)') !== null,
  );
  HarnessSmoke.Class.pass('non-image binary still uses the binary guard');

  driver.sendKeys('Control+q');
  console.log('smoke-image-preview-harness: ALL-PASS');
} finally {
  driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
