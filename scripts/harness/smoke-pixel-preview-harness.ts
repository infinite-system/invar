#!/usr/bin/env bun
// Byte-level graphics-tier port: kitty APC and sixel DCS payloads are asserted directly from the
// harness PTY stream, while the half-block floor is asserted from production-emulator cells.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Modal focus withdraws host terminal projections (src/modules/ui/ui.invariants.md)
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

async function openThroughQuickOpen(
  driver: PtyTestDriver.Model,
  statusPath: string,
  query: string,
): Promise<void> {
  driver.sendKeys('Control+p');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Go to File') !== null,
  );
  driver.sendText(query);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `Quick Open publishes the exact ${query} query before Enter`,
    (status) => status.quickOpenQuery === query,
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
    (status) =>
      status.activeFileIsImage === true &&
      String(status.activeBuffer).endsWith('/picture.png'),
    15_000,
  );
}

async function awaitOutputSequenceCountAbove(
  driver: PtyTestDriver.Model,
  sequence: string,
  previousCount: number,
  description: string,
  timeoutMilliseconds = 10_000,
): Promise<number> {
  const deadline = performance.now() + timeoutMilliseconds;
  while (performance.now() < deadline) {
    const currentCount = driver.outputSequenceCount(sequence);
    if (currentCount > previousCount) return currentCount;
    await Bun.sleep(10);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function requireOutputSequenceCountRemainsUnchangedFor(
  driver: PtyTestDriver.Model,
  sequence: string,
  expectedCount: number,
  observationMilliseconds: number,
  description: string,
): Promise<void> {
  const deadline = performance.now() + observationMilliseconds;
  let sequenceCountRemainedUnchanged = true;
  while (performance.now() < deadline) {
    if (driver.outputSequenceCount(sequence) !== expectedCount) {
      sequenceCountRemainedUnchanged = false;
      break;
    }
    await Bun.sleep(Math.min(10, deadline - performance.now()));
  }
  HarnessSmoke.Class.requireCondition(
    sequenceCountRemainedUnchanged,
    description,
  );
}

const pngPath = '/tmp/ivue-cart-dark.png';
HarnessSmoke.Class.requireCondition(
  await Bun.file(pngPath).exists(),
  `PNG fixture exists at ${pngPath}`,
);

console.log(
  '== harness pixel-preview: encoders, mount, and tier precedence unit layer ==',
);
const unitResult = Bun.spawnSync(
  [
    process.execPath,
    'test',
    'src/modules/image/',
    'src/modules/theme/GraphicsTier.test.ts',
  ],
  { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' },
);
HarnessSmoke.Class.requireCondition(
  unitResult.exitCode === 0,
  'image and graphics-tier unit tests',
);

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-pixel-preview-harness-'));
copyFileSync(pngPath, join(fixtureRoot, 'picture.png'));
await Bun.write(join(fixtureRoot, 'sample.ts'), 'export const answer = 42;\n');
await Bun.write(
  join(fixtureRoot, 'data.bin'),
  new Uint8Array([66, 73, 78, 0, 0, 1, 2, 3]),
);
HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);

async function driveLateKittyCapabilityUpgrade(): Promise<void> {
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'tui-pixel-late-capability-harness-home-'),
  );
  const statusPath = join(homeDirectory, 'status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      COLORTERM: 'truecolor',
      TUI_GRAPHICS_TIER: undefined,
      TMUX: undefined,
      KITTY_WINDOW_ID: undefined,
      TERM_PROGRAM: undefined,
    },
    retainFullOutput: true,
  });
  driver.outputSequenceCount('\x1b_Ga=T');
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'status condition: status.ready === true',
      (status) => status.ready === true,
      15_000,
    );
    await openThroughQuickOpen(driver, statusPath, 'picture');
    await awaitImageStatus(driver, statusPath);
    const halfBlockSnapshot = await driver.awaitGridCondition(
      'the unforced image paints at the half-block floor before the capability answer',
      (candidate) => halfBlockCount(candidate) > 500,
    );
    HarnessSmoke.Class.requireCondition(
      halfBlockCount(halfBlockSnapshot) > 500,
      'the unforced image paints at the half-block floor before the capability answer',
    );
    HarnessSmoke.Class.requireCondition(
      driver.outputSequenceCount('\x1b_Ga=T') === 0,
      'no kitty placement is emitted before the terminal reports kitty graphics',
    );

    const graphicsQueryPrefix = '\x1b_Gi=';
    const graphicsQuerySuffix = ',s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\';
    const rawOutput = driver.recordedOutput();
    const graphicsQueryStart = rawOutput.indexOf(graphicsQueryPrefix);
    const graphicsQuerySuffixStart = rawOutput.indexOf(
      graphicsQuerySuffix,
      graphicsQueryStart,
    );
    const graphicsQueryIdentifier =
      graphicsQueryStart >= 0 && graphicsQuerySuffixStart >= 0
        ? rawOutput.slice(
            graphicsQueryStart + graphicsQueryPrefix.length,
            graphicsQuerySuffixStart,
          )
        : '';
    HarnessSmoke.Class.requireCondition(
      /^\d+$/.test(graphicsQueryIdentifier),
      'the graphics capability query is discovered in the raw PTY output',
    );
    const graphicsCapabilityQuery =
      graphicsQueryPrefix + graphicsQueryIdentifier + graphicsQuerySuffix;
    const graphicsCapabilityReply =
      graphicsQueryPrefix + graphicsQueryIdentifier + ';OK\x1b\\';
    console.log(
      `graphics capability query ${JSON.stringify(graphicsCapabilityQuery)}`,
    );
    console.log(
      `graphics capability reply ${JSON.stringify(graphicsCapabilityReply)}`,
    );

    const placementCountBeforeCapabilityReply =
      driver.outputSequenceCount('\x1b_Ga=T');
    const outputLengthBeforeCapabilityReply = driver.recordedOutput().length;
    driver.sendRawInputWithoutFrameExpectation(graphicsCapabilityReply);
    const upgradedProjectionSnapshot = await driver.awaitGridCondition(
      'the late capability answer replaces half-block cells with a pixel-tier projection',
      (candidate) => halfBlockCount(candidate) === 0,
    );
    HarnessSmoke.Class.requireCondition(
      halfBlockCount(upgradedProjectionSnapshot) === 0,
      'the late capability answer clears the stale half-block projection',
    );
    await driver.awaitOutputCondition(
      'a kitty placement appears after the late capability reply without user input',
      () =>
        driver.outputSequenceCount('\x1b_Ga=T') >
        placementCountBeforeCapabilityReply,
    );
    HarnessSmoke.Class.requireCondition(
      driver.outputSequenceCount('\x1b_Ga=T') >
        placementCountBeforeCapabilityReply,
      'the late kitty capability answer schedules its own placement frame',
    );
    const outputAfterCapabilityReply = driver
      .recordedOutput()
      .slice(outputLengthBeforeCapabilityReply);
    const latePlacementOffset = outputAfterCapabilityReply.indexOf('\x1b_Ga=T');
    const precedingFrameEndOffset = outputAfterCapabilityReply
      .slice(0, latePlacementOffset)
      .lastIndexOf('\x1b[?2026l');
    HarnessSmoke.Class.requireCondition(
      precedingFrameEndOffset >= 0 &&
        precedingFrameEndOffset < latePlacementOffset,
      'the blanking frame settles before the late kitty placement is emitted',
    );
    driver.sendKeys('Control+q');
    HarnessSmoke.Class.requireCondition(
      (await driver.exitCode()) === 0,
      'late-capability session quits cleanly',
    );
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

async function driveKittyTier(): Promise<void> {
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'tui-pixel-kitty-harness-home-'),
  );
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
  for (const outputSequence of [
    '\x1b_Ga=T',
    'i=70',
    '\x1b_Ga=d,d=I',
    '\x1b_Ga=d,d=A',
  ]) {
    driver.outputSequenceCount(outputSequence);
  }
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'status condition: status.ready === true',
      (status) => status.ready === true,
      15_000,
    );
    await openThroughQuickOpen(driver, statusPath, 'picture');
    await awaitImageStatus(driver, statusPath);
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'status condition: status.activeFileIsImage === true',
      (status) => status.activeFileIsImage === true,
    );
    await driver.awaitOutputCondition(
      'the kitty transmit-and-place sequence reaches the raw PTY stream',
      () =>
        driver.outputSequenceCount('\x1b_Ga=T') > 0 &&
        driver.outputSequenceCount('i=70') > 0,
    );
    HarnessSmoke.Class.requireCondition(
      driver.outputSequenceCount('\x1b_Ga=T') > 0 &&
        driver.outputSequenceCount('i=70') > 0,
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

    console.log(
      '== harness pixel-preview: modal withdraws and restores kitty placement ==',
    );
    const placementCountWithoutOverlay =
      driver.outputSequenceCount('\x1b_Ga=T');
    const removalCountWithoutOverlay =
      driver.outputSequenceCount('\x1b_Ga=d,d=I');
    HarnessSmoke.Class.requireCondition(
      placementCountWithoutOverlay > 0,
      'graphics byte probe observes a kitty placement without an overlay',
    );
    driver.sendKeys('Control+,');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'status condition: status.settingsOpen === true',
      (status) => status.settingsOpen === true,
    );
    await driver.awaitGridCondition(
      'Settings is painted over the pixel preview',
      (candidate) => candidate.findText('Settings') !== null,
    );
    const removalCountWhileSettingsOpen = await awaitOutputSequenceCountAbove(
      driver,
      '\x1b_Ga=d,d=I',
      removalCountWithoutOverlay,
      'the kitty placement removal after Settings opens',
    );
    HarnessSmoke.Class.requireCondition(
      driver.outputSequenceCount('\x1b_Ga=T') === placementCountWithoutOverlay,
      'no kitty placement is emitted while Settings owns the screen',
    );
    driver.resize(96, 30);
    await driver.awaitGridCondition(
      'Settings remains painted after resize',
      (candidate) => candidate.findText('Settings') !== null,
    );
    await requireOutputSequenceCountRemainsUnchangedFor(
      driver,
      '\x1b_Ga=T',
      placementCountWithoutOverlay,
      100,
      'resize while Settings is open does not restore the kitty placement',
    );
    driver.sendKeys('Escape');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'status condition: status.settingsOpen === false',
      (status) => status.settingsOpen === false,
    );
    await driver.awaitGridCondition(
      'Settings is absent before the kitty placement returns',
      (candidate) => candidate.findText('Settings') === null,
    );
    const placementCountAfterSettingsClose =
      await awaitOutputSequenceCountAbove(
        driver,
        '\x1b_Ga=T',
        placementCountWithoutOverlay,
        'the kitty placement restoration after Settings closes',
      );
    HarnessSmoke.Class.requireCondition(
      removalCountWhileSettingsOpen > removalCountWithoutOverlay &&
        placementCountAfterSettingsClose > placementCountWithoutOverlay,
      'Settings withdraws the kitty placement and Escape restores it',
    );

    const placementCountBeforeCloseButton =
      driver.outputSequenceCount('\x1b_Ga=T');
    const removalCountBeforeCloseButton =
      driver.outputSequenceCount('\x1b_Ga=d,d=I');
    driver.sendKeys('Control+,');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'status condition: status.settingsOpen === true',
      (status) => status.settingsOpen === true,
    );
    const settingsSnapshot = await driver.awaitGridCondition(
      'Settings exposes its close control over the pixel preview',
      (candidate) =>
        candidate.findText('Settings') !== null &&
        candidate.findText('✕') !== null,
    );
    await awaitOutputSequenceCountAbove(
      driver,
      '\x1b_Ga=d,d=I',
      removalCountBeforeCloseButton,
      'the kitty placement removal before close-control dismissal',
    );
    HarnessSmoke.Class.requireCondition(
      driver.outputSequenceCount('\x1b_Ga=T') ===
        placementCountBeforeCloseButton,
      'the kitty placement stays absent before close-control dismissal',
    );
    const settingsTitlePosition = settingsSnapshot.findText('Settings');
    if (!settingsTitlePosition)
      throw new Error('FAIL Settings title disappeared before close');
    const settingsCloseColumn = settingsSnapshot
      .rowText(settingsTitlePosition.row)
      .indexOf('✕', settingsTitlePosition.column + 'Settings'.length);
    HarnessSmoke.Class.requireCondition(
      settingsCloseColumn >= 0,
      'Settings close control is discovered from painted cells',
    );
    driver.sendMouseWithoutFrameExpectation({
      kind: 'press',
      column: settingsCloseColumn,
      row: settingsTitlePosition.row,
      button: 'left',
    });
    driver.sendMouseWithoutFrameExpectation({
      kind: 'release',
      column: settingsCloseColumn,
      row: settingsTitlePosition.row,
      button: 'left',
    });
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'status condition: status.settingsOpen === false',
      (status) => status.settingsOpen === false,
    );
    await awaitOutputSequenceCountAbove(
      driver,
      '\x1b_Ga=T',
      placementCountBeforeCloseButton,
      'the kitty placement restoration after close-control dismissal',
    );
    HarnessSmoke.Class.pass(
      'Settings close control restores the withdrawn kitty placement',
    );

    const placementCountBeforeBackdrop =
      driver.outputSequenceCount('\x1b_Ga=T');
    const removalCountBeforeBackdrop =
      driver.outputSequenceCount('\x1b_Ga=d,d=I');
    const shortcutButtonSnapshot = await driver.awaitGridCondition(
      'the shortcut-help status control is visible over the pixel preview',
      (candidate) => candidate.rowText(candidate.rows - 1).includes('?'),
    );
    const shortcutButtonRow = shortcutButtonSnapshot.rows - 1;
    const shortcutButtonColumn = shortcutButtonSnapshot
      .rowText(shortcutButtonRow)
      .lastIndexOf('?');
    HarnessSmoke.Class.requireCondition(
      shortcutButtonColumn >= 0,
      'shortcut-help status control is discovered from painted cells',
    );
    driver.sendMouseWithoutFrameExpectation({
      kind: 'press',
      column: shortcutButtonColumn,
      row: shortcutButtonRow,
      button: 'left',
    });
    driver.sendMouseWithoutFrameExpectation({
      kind: 'release',
      column: shortcutButtonColumn,
      row: shortcutButtonRow,
      button: 'left',
    });
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'status condition: status.shortcutHelpOpen === true',
      (status) => status.shortcutHelpOpen === true,
    );
    await driver.awaitGridCondition(
      'Keyboard Shortcuts is painted over the pixel preview',
      (candidate) => candidate.findText('Keyboard Shortcuts') !== null,
    );
    await awaitOutputSequenceCountAbove(
      driver,
      '\x1b_Ga=d,d=I',
      removalCountBeforeBackdrop,
      'the kitty placement removal before backdrop dismissal',
    );
    HarnessSmoke.Class.requireCondition(
      driver.outputSequenceCount('\x1b_Ga=T') === placementCountBeforeBackdrop,
      'the kitty placement stays absent before backdrop dismissal',
    );
    driver.sendMouseWithoutFrameExpectation({
      kind: 'press',
      column: 0,
      row: 5,
      button: 'left',
    });
    driver.sendMouseWithoutFrameExpectation({
      kind: 'release',
      column: 0,
      row: 5,
      button: 'left',
    });
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'status condition: status.shortcutHelpOpen === false',
      (status) => status.shortcutHelpOpen === false,
    );
    await driver.awaitGridCondition(
      'Keyboard Shortcuts is absent before the kitty placement returns',
      (candidate) => candidate.findText('Keyboard Shortcuts') === null,
    );
    await awaitOutputSequenceCountAbove(
      driver,
      '\x1b_Ga=T',
      placementCountBeforeBackdrop,
      'the kitty placement restoration after backdrop dismissal',
    );
    HarnessSmoke.Class.pass(
      'shortcut backdrop dismissal restores the withdrawn kitty placement',
    );

    await openThroughQuickOpen(driver, statusPath, 'sample');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      "status condition: status.activeFileIsImage === false && String(status.activeBuffer).endsWith('/sample.ts')",
      (status) =>
        status.activeFileIsImage === false &&
        String(status.activeBuffer).endsWith('/sample.ts'),
    );
    await driver.awaitOutputCondition(
      'the kitty placement delete reaches the raw PTY stream',
      () => driver.outputSequenceCount('\x1b_Ga=d,d=I') > 0,
    );
    HarnessSmoke.Class.requireCondition(
      driver.outputSequenceCount('\x1b_Ga=d,d=I') > 0,
      'kitty placement delete is emitted on buffer switch',
    );
    await openThroughQuickOpen(driver, statusPath, 'picture');
    await awaitImageStatus(driver, statusPath);
    driver.sendKeys('Control+q');
    HarnessSmoke.Class.requireCondition(
      (await driver.exitCode()) === 0,
      'kitty session quits cleanly',
    );
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
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'tui-pixel-sixel-harness-home-'),
  );
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
  driver.outputSequenceCount('\x1bP0;1;0q"1;1;');
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'status condition: status.ready === true',
      (status) => status.ready === true,
      15_000,
    );
    await openThroughQuickOpen(driver, statusPath, 'picture');
    await awaitImageStatus(driver, statusPath);
    await driver.awaitOutputCondition(
      'the sixel DCS introducer and raster attributes reach the raw PTY stream',
      () => driver.outputSequenceCount('\x1bP0;1;0q"1;1;') > 0,
    );
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
    HarnessSmoke.Class.requireCondition(
      (await driver.exitCode()) === 0,
      'sixel session quits cleanly',
    );
  } finally {
    driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

async function driveHalfBlockFloor(): Promise<void> {
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'tui-pixel-floor-harness-home-'),
  );
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
  for (const outputSequence of ['\x1b_Ga=T', '\x1b_Ga=d', '\x1bP0;1;0q']) {
    driver.outputSequenceCount(outputSequence);
  }
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'status condition: status.ready === true',
      (status) => status.ready === true,
      15_000,
    );
    await openThroughQuickOpen(driver, statusPath, 'picture');
    await awaitImageStatus(driver, statusPath);
    const snapshot = await driver.awaitSnapshot(
      (candidate) => halfBlockCount(candidate) > 500,
    );
    HarnessSmoke.Class.pass(
      `half-block floor paints ${halfBlockCount(snapshot)} glyph cells`,
    );
    HarnessSmoke.Class.requireCondition(
      driver.outputSequenceCount('\x1b_Ga=T') === 0 &&
        driver.outputSequenceCount('\x1b_Ga=d') === 0 &&
        driver.outputSequenceCount('\x1bP0;1;0q') === 0,
      'half-block tier emits no graphics placement escape',
    );
    await openThroughQuickOpen(driver, statusPath, 'data');
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
  } finally {
    driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

try {
  console.log('== harness pixel-preview: late unforced kitty capability ==');
  await driveLateKittyCapabilityUpgrade();
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
