#!/usr/bin/env bun
// Byte-level modal-slot port: every overlay title comes from the grid and mode flags from StatusChannel.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  awaitStatusPublication,
  pass,
  requireCondition,
} from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';

async function openDocument(driver: PtyTestDriver.Model): Promise<void> {
  await driver.awaitSnapshot((snapshot) => snapshot.findText('document.txt') !== null, 15_000);
  driver.sendKeys('Enter');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('beta target') !== null);
}

async function assertOnlyOverlay(
  driver: PtyTestDriver.Model,
  statusPath: string,
  expectedOverlay: string,
  expectedTitle: string,
): Promise<void> {
  await driver.awaitSnapshot((snapshot) => snapshot.findText(expectedTitle) !== null);
  await awaitStatusPublication(
    statusPath,
    `only the ${expectedOverlay} overlay is published`,
    (status) => status.inputOverlay === expectedOverlay
      && status.inputOverlayCount === 1,
  );
  pass(`only ${expectedOverlay} is active and ${expectedTitle} paints`);
}

async function proveQuitFromOverlay(
  workspaceRoot: string,
  overlayLabel: string,
  openingKey: string,
  expectedOverlay: string,
): Promise<void> {
  const sessionRoot = mkdtempSync(join(tmpdir(), 'tui-mode-quit-harness-'));
  const statusPath = join(sessionRoot, 'status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot,
    columns: 100,
    rows: 32,
    homeDirectory: sessionRoot,
    environment: { TUI_STATUS_PATH: statusPath },
  });
  try {
    await openDocument(driver);
    driver.sendKeys(openingKey);
    await awaitStatusPublication(
      statusPath,
      `${expectedOverlay} is active before the reserved quit command`,
      (status) => status.inputOverlay === expectedOverlay,
    );
    driver.sendKeys('Control+q');
    const exitResult = await Promise.race([
      driver.exitCode().then(() => 'exited'),
      Bun.sleep(3_000).then(() => 'timeout'),
    ]);
    requireCondition(exitResult === 'exited', `reserved Ctrl+Q quits from ${overlayLabel}`);
  } finally {
    await driver.dispose();
    rmSync(sessionRoot, { recursive: true, force: true });
  }
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-mode-coherence-harness-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-mode-coherence-harness-home-'));
const statusPath = join(homeDirectory, 'status.json');
await Bun.write(join(fixtureRoot, 'document.txt'), 'alpha\nbeta target\ngamma target\n');

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== harness mode coherence: Find to Quick Open to Palette to Settings ==');
  await openDocument(driver);
  driver.sendKeys('Control+f');
  await assertOnlyOverlay(driver, statusPath, 'findBar', 'Find');
  driver.sendKeys('Control+p');
  await assertOnlyOverlay(driver, statusPath, 'quickOpen', 'Go to File');
  await awaitStatusPublication(
    statusPath,
    'Quick Open publishes Find as closed',
    (status) => status.findOpen === false,
  );
  pass('Quick Open closed Find');
  driver.sendKeys('F1');
  await assertOnlyOverlay(driver, statusPath, 'commandPalette', 'Command Palette');
  await awaitStatusPublication(
    statusPath,
    'the command palette publishes Quick Open as closed',
    (status) => status.quickOpenOpen === false,
  );
  pass('command palette closed Quick Open');
  driver.sendKeys('Control+,');
  await assertOnlyOverlay(driver, statusPath, 'settingsPanel', 'Settings');
  await awaitStatusPublication(
    statusPath,
    'Settings publishes the command palette as closed',
    (status) => status.paletteOpen === false,
  );
  pass('Settings closed the command palette');

  console.log('== harness mode coherence: Ctrl+H changes the one FindBar in place ==');
  driver.sendKeys('Escape');
  await driver.awaitQuiescence();
  driver.sendKeys('Control+f');
  await driver.awaitQuiescence();
  driver.sendKeys('Control+h');
  await assertOnlyOverlay(driver, statusPath, 'findBar', 'Find / Replace');
  await awaitStatusPublication(
    statusPath,
    'FindBar publishes replace mode',
    (status) => status.findMode === 'replace',
  );
  pass('FindBar mode is replace');

  console.log('== harness mode coherence: context menu and palette share the same slot ==');
  driver.sendKeys('F1');
  await assertOnlyOverlay(driver, statusPath, 'commandPalette', 'Command Palette');
  const tabStatus = await awaitStatusPublication(
    statusPath,
    'the buffer tab count is published before opening its popup',
    (status) => typeof status.bufferTabCount === 'number',
  );
  const tabCount = Number(tabStatus.bufferTabCount);
  const badgeMarker = `/${tabCount}`;
  const snapshot = await driver.awaitGridCondition(
    'the buffer-count badge is visible behind the command palette',
    (candidate) => candidate.findText(badgeMarker) !== null,
  );
  const badgePosition = snapshot.findText(badgeMarker);
  requireCondition(badgePosition !== null, 'buffer-count badge is visible');
  driver.sendMouse({
    kind: 'press',
    column: badgePosition.column,
    row: badgePosition.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: badgePosition.column,
    row: badgePosition.row,
    button: 'left',
  });
  await assertOnlyOverlay(driver, statusPath, 'boundedListPopup', 'document.txt');
  await awaitStatusPublication(
    statusPath,
    'the bounded list popup publishes the command palette as closed',
    (status) => status.paletteOpen === false,
  );
  pass('bounded list popup closed the command palette');
  driver.sendKeys('F1');
  await assertOnlyOverlay(driver, statusPath, 'commandPalette', 'Command Palette');
  await awaitStatusPublication(
    statusPath,
    'F1 publishes the bounded list popup as closed',
    (status) => status.boundedListPopupOpen === false,
  );
  pass('F1 switched the bounded-list-popup slot to the palette');
  await driver.dispose();

  console.log('== harness mode coherence: reserved quit bypasses each input capture ==');
  await proveQuitFromOverlay(fixtureRoot, 'Find', 'Control+f', 'findBar');
  await proveQuitFromOverlay(fixtureRoot, 'Quick Open', 'Control+p', 'quickOpen');
  await proveQuitFromOverlay(fixtureRoot, 'Command Palette', 'F1', 'commandPalette');
  console.log('smoke-mode-coherence-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
