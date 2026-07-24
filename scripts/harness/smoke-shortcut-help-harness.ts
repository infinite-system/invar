#!/usr/bin/env bun
// Byte-level shortcut-help port: the clickable status affordance, effective binding rows, exclusive
// overlay slot, advertised chord, scrolling, and reserved quit all cross the real harness PTY.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: The shortcut sheet lists the effective bindings (src/modules/ui/ui.invariants.md)
// invariant: Input overlays share one modal slot (src/modules/ui/ui.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function advertisedQuickOpenKey(snapshot: HarnessSnapshot.Model): string | null {
  for (const rowText of snapshot.textRows()) {
    const match = rowText.match(/(\S+)\s{2,}Go to File/);
    if (!match) continue;
    const chordLabel = match[1];
    if (!chordLabel) continue;
    const controlMatch = chordLabel.match(/^Ctrl\+(.)$/);
    const controlCharacter = controlMatch?.[1];
    if (controlCharacter) return `Control+${controlCharacter.toLowerCase()}`;
    const shiftedFunctionMatch = chordLabel.match(/^Shift\+F(\d+)$/);
    const functionNumber = shiftedFunctionMatch?.[1];
    if (functionNumber) return `Shift+F${functionNumber}`;
    return chordLabel;
  }
  return null;
}

async function scrollUntilVisible(
  driver: PtyTestDriver.Model,
  marker: string,
): Promise<HarnessSnapshot.Model> {
  for (let scrollAttempt = 0; scrollAttempt < 8; scrollAttempt++) {
    const snapshot = driver.snapshot();
    if (snapshot.findText(marker)) return snapshot;
    driver.sendKeys('PageDown');
    await driver.awaitQuiescence();
  }
  throw new Error(`FAIL shortcut sheet never showed ${marker}`);
}

async function scrollToTop(driver: PtyTestDriver.Model, statusPath: string): Promise<void> {
  for (let scrollAttempt = 0; scrollAttempt < 8; scrollAttempt++) {
    driver.sendKeysWithoutFrameExpectation('PageUp');
  }
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.shortcutHelpScrollTop === 0,
  );
}

async function openWithShiftF1(
  driver: PtyTestDriver.Model,
  statusPath: string,
): Promise<void> {
  for (let deliveryAttempt = 0; deliveryAttempt < 3; deliveryAttempt++) {
    driver.sendKeysWithoutFrameExpectation('Shift+F1');
    try {
      await HarnessSmoke.Class.awaitStatusWithoutFrame(
        driver,
        statusPath,
        (status) => status.shortcutHelpOpen === true,
        750,
      );
      await driver.awaitSnapshot((snapshot) => snapshot.findText('Keyboard Shortcuts') !== null);
      return;
    } catch {
      await Bun.sleep(200);
    }
  }
  throw new Error('FAIL Shift+F1 did not open the shortcut sheet after three PTY deliveries');
}

async function assertSheetStatus(
  driver: PtyTestDriver.Model,
  statusPath: string,
  label: string,
): Promise<void> {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.shortcutHelpOpen === true
      && status.inputOverlay === 'shortcutHelp'
      && status.inputOverlayCount === 1,
  );
  HarnessSmoke.Class.pass(`${label}: shortcut sheet is the only input overlay`);
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-shortcut-help-harness-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-shortcut-help-harness-home-'));
const statusPath = join(homeDirectory, 'status.json');
await Bun.write(join(fixtureRoot, 'document.txt'), 'alpha\nbeta\ngamma\n');
const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== harness shortcut-help: status-bar question mark opens effective bindings ==');
  let snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('document.txt') !== null,
    15_000,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => String(status.activeBuffer).endsWith('/document.txt'),
  );
  snapshot = driver.snapshot();
  const statusBarRow = snapshot.rows - 1;
  const helpButtonColumn = snapshot.rowText(statusBarRow).lastIndexOf('?');
  HarnessSmoke.Class.requireCondition(helpButtonColumn >= 0, 'status-bar question-mark button is visible');
  driver.sendMouse({
    kind: 'press',
    column: helpButtonColumn,
    row: statusBarRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: helpButtonColumn,
    row: statusBarRow,
    button: 'left',
  });
  snapshot = await driver.awaitSnapshot((candidate) => candidate.findText('Keyboard Shortcuts') !== null);
  await assertSheetStatus(driver, statusPath, 'click');
  HarnessSmoke.Class.requireCondition(snapshot.findText('Quit') !== null, 'sheet shows the Quit action');
  snapshot = await scrollUntilVisible(driver, 'Go to File');
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('Ctrl+P') !== null,
    'Go to File row shows its effective Ctrl+P binding',
  );
  await scrollToTop(driver, statusPath);
  await scrollUntilVisible(driver, 'Shift+F1');
  HarnessSmoke.Class.pass('sheet scroll window lists its own Shift+F1 binding');

  console.log('== harness shortcut-help: Escape closes and Shift+F1 reopens ==');
  driver.sendKeys('Escape');
  await driver.awaitSnapshot((candidate) => candidate.findText('Keyboard Shortcuts') === null);
  HarnessSmoke.Class.requireCondition(
    HarnessSmoke.Class.readStatus(statusPath).shortcutHelpOpen === false,
    'Escape closes the sheet in state and cells',
  );
  await openWithShiftF1(driver, statusPath);
  await assertSheetStatus(driver, statusPath, 'Shift+F1');

  console.log('== harness shortcut-help: advertised binding delivers through the exclusive slot ==');
  snapshot = await scrollUntilVisible(driver, 'Go to File');
  const advertisedKey = advertisedQuickOpenKey(snapshot);
  HarnessSmoke.Class.requireCondition(
    advertisedKey !== null,
    'sheet advertises a chord for Go to File',
  );
  if (!advertisedKey) throw new Error('FAIL advertised Go to File chord disappeared');
  driver.sendKeys(advertisedKey);
  await driver.awaitSnapshot((candidate) => candidate.findText('Go to File') !== null);
  let status = HarnessSmoke.Class.readStatus(statusPath);
  HarnessSmoke.Class.requireCondition(
    status.quickOpenOpen === true && status.shortcutHelpOpen === false,
    'advertised chord opens Quick Open and closes the sheet',
  );
  await openWithShiftF1(driver, statusPath);
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.shortcutHelpOpen === true && candidate.quickOpenOpen === false,
  );
  HarnessSmoke.Class.pass('reopening the sheet closes Quick Open');

  console.log('== harness shortcut-help: reserved Ctrl+Q quits inside the sheet ==');
  driver.sendKeys('Control+q');
  HarnessSmoke.Class.requireCondition(
    await driver.exitCode() === 0,
    'reserved Ctrl+Q quits from inside the shortcut sheet',
  );
  console.log('smoke-shortcut-help-harness: ALL-PASS');
} finally {
  driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
