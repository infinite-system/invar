#!/usr/bin/env bun
// Byte-level graphics-tier port: kitty APC and sixel DCS payloads are asserted directly from the
// harness PTY stream, while the half-block floor is asserted from production-emulator cells.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function halfBlockCount(snapshot: HarnessSnapshot.Model): number {
  return snapshot.textRows().reduce(
    (count, rowText) => count + Array.from(rowText).filter((character) => character === '▀').length,
    0,
  );
}

async function openThroughQuickOpen(
  driver: PtyTestDriver.Model,
  query: string,
): Promise<void> {
  driver.sendKeys('Control+p');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('Go to File') !== null);
  driver.sendText(query);
  await driver.awaitSnapshot(
    (snapshot) => snapshot.textRows().some((rowText) => rowText.includes(query)),
  );
  driver.sendKeys('Enter');
}

async function awaitImageStatus(
  driver: PtyTestDriver.Model,
  statusPath: string,
): Promise<void> {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.activeFileIsImage === true && String(status.activeBuffer).endsWith('/picture.png')",
    (status) => status.activeFileIsImage === true
      && String(status.activeBuffer).endsWith('/picture.png'),
    15_000,
  );
}

const pngPath = '/tmp/ivue-cart-dark.png';
HarnessSmoke.Class.requireCondition(await Bun.file(pngPath).exists(), `PNG fixture exists at ${pngPath}`);

console.log('== harness pixel-preview: encoders, mount, and tier precedence unit layer ==');
const unitResult = Bun.spawnSync(
  [
    process.execPath,
    'test',
    'src/modules/image/',
    'src/modules/theme/__tests__/GraphicsTier.test.ts',
  ],
  { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' },
);
HarnessSmoke.Class.requireCondition(unitResult.exitCode === 0, 'image and graphics-tier unit tests');

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-pixel-preview-harness-'));
copyFileSync(pngPath, join(fixtureRoot, 'picture.png'));
await Bun.write(join(fixtureRoot, 'sample.ts'), 'export const answer = 42;\n');
await Bun.write(join(fixtureRoot, 'data.bin'), new Uint8Array([66, 73, 78, 0, 0, 1, 2, 3]));
HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);

async function driveKittyTier(): Promise<void> {
  const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-pixel-kitty-harness-home-'));
  const statusPath = join(homeDirectory, 'status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      COLORTERM: 'truecolor',
      TUI_GRAPHICS_TIER: 'kitty',
    },
  });
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      "status condition: status.ready === true",
      (status) => status.ready === true,
      15_000,
    );
    await openThroughQuickOpen(driver, 'picture');
    await awaitImageStatus(driver, statusPath);
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      "status condition: status.activeFileIsImage === true",
      (status) => status.activeFileIsImage === true,
    );
    await Bun.sleep(250);
    HarnessSmoke.Class.requireCondition(
      driver.outputSequenceCount('\x1b_Ga=T') > 0
        && driver.outputSequenceCount('i=70') > 0,
      'kitty transmit APC and image id reached the raw PTY stream',
    );
    const kittyProjectionSnapshot = await driver.awaitGridCondition(
      'the kitty projection leaves its underlying emulator cells blank',
      (candidate) => halfBlockCount(candidate) === 0,
    );
    HarnessSmoke.Class.requireCondition(
      halfBlockCount(kittyProjectionSnapshot) === 0,
      'kitty projection leaves the underlying cells blank',
    );

    await openThroughQuickOpen(driver, 'sample');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      "status condition: status.activeFileIsImage === false && String(status.activeBuffer).endsWith('/sample.ts')",
      (status) => status.activeFileIsImage === false
        && String(status.activeBuffer).endsWith('/sample.ts'),
    );
    await Bun.sleep(100);
    HarnessSmoke.Class.requireCondition(
      driver.outputSequenceCount('\x1b_Ga=d,d=I') > 0,
      'kitty placement delete is emitted on buffer switch',
    );
    await openThroughQuickOpen(driver, 'picture');
    await awaitImageStatus(driver, statusPath);
    driver.sendKeys('Control+q');
    HarnessSmoke.Class.requireCondition(await driver.exitCode() === 0, 'kitty session quits cleanly');
    HarnessSmoke.Class.requireCondition(
      driver.outputSequenceCount('\x1b_Ga=d,d=A') > 0,
      'kitty delete-all sweep is emitted on quit',
    );
  } finally {
    driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

async function driveSixelTier(): Promise<void> {
  const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-pixel-sixel-harness-home-'));
  const statusPath = join(homeDirectory, 'status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      COLORTERM: 'truecolor',
      TUI_GRAPHICS_TIER: 'sixel',
    },
  });
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      "status condition: status.ready === true",
      (status) => status.ready === true,
      15_000,
    );
    await openThroughQuickOpen(driver, 'picture');
    await awaitImageStatus(driver, statusPath);
    await Bun.sleep(750);
    HarnessSmoke.Class.requireCondition(
      driver.outputSequenceCount('\x1bP0;1;0q"1;1;') > 0,
      'sixel DCS introducer and raster attributes reached the raw PTY stream',
    );
    const sixelProjectionSnapshot = await driver.awaitGridCondition(
      'the sixel projection leaves its underlying emulator cells blank',
      (candidate) => halfBlockCount(candidate) === 0,
    );
    HarnessSmoke.Class.requireCondition(
      halfBlockCount(sixelProjectionSnapshot) === 0,
      'sixel projection leaves the underlying cells blank',
    );
    driver.sendKeys('Control+q');
    HarnessSmoke.Class.requireCondition(await driver.exitCode() === 0, 'sixel session quits cleanly');
  } finally {
    driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

async function driveHalfBlockFloor(): Promise<void> {
  const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-pixel-floor-harness-home-'));
  const statusPath = join(homeDirectory, 'status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      COLORTERM: 'truecolor',
      TUI_GRAPHICS_TIER: 'halfblock',
    },
  });
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      "status condition: status.ready === true",
      (status) => status.ready === true,
      15_000,
    );
    await openThroughQuickOpen(driver, 'picture');
    await awaitImageStatus(driver, statusPath);
    const snapshot = await driver.awaitSnapshot((candidate) => halfBlockCount(candidate) > 500);
    HarnessSmoke.Class.pass(`half-block floor paints ${halfBlockCount(snapshot)} glyph cells`);
    HarnessSmoke.Class.requireCondition(
      driver.outputSequenceCount('\x1b_Ga=T') === 0
        && driver.outputSequenceCount('\x1b_Ga=d') === 0
        && driver.outputSequenceCount('\x1bP0;1;0q') === 0,
      'half-block tier emits no graphics placement escape',
    );
    await openThroughQuickOpen(driver, 'data');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      "status condition: status.activeFileIsImage === false && String(status.activeBuffer).endsWith('/data.bin')",
      (status) => status.activeFileIsImage === false
        && String(status.activeBuffer).endsWith('/data.bin'),
    );
    await driver.awaitSnapshot((candidate) => candidate.findText('(binary file not shown)') !== null);
    HarnessSmoke.Class.pass('non-image binary still uses the binary guard');
    driver.sendKeys('Control+q');
  } finally {
    driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

try {
  console.log('== harness pixel-preview: forced kitty tier ==');
  await driveKittyTier();
  console.log('== harness pixel-preview: forced sixel tier ==');
  await driveSixelTier();
  console.log('== harness pixel-preview: forced half-block floor ==');
  await driveHalfBlockFloor();
  console.log('smoke-pixel-preview-harness: ALL-PASS');
} finally {
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
}
