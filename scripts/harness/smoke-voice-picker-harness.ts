#!/usr/bin/env bun
// Byte-level port of voice discovery and mouse-editable narration settings, with isolated HOME/data
// fixtures and the mock TTS backend.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function runVoiceUnitTests(repositoryRoot: string): void {
  const result = Bun.spawnSync([
    process.execPath,
    'test',
    'src/modules/narration/VoiceDiscovery.test.ts',
    'src/modules/settings/SettingsPanel.test.ts',
  ], {
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  HarnessSmoke.Class.requireCondition(
    result.exitCode === 0,
    'voice discovery and dynamic-enum unit tests pass',
  );
}

function widgetPosition(
  snapshot: HarnessSnapshot.Model,
  rowLabel: string,
  widgetGlyph: string,
): { row: number; column: number } {
  const rowPosition = snapshot.findText(rowLabel);
  if (!rowPosition) throw new Error(`Settings row is not visible: ${rowLabel}`);
  const column = snapshot.rowText(rowPosition.row).indexOf(widgetGlyph);
  if (column < 0) throw new Error(`Widget ${widgetGlyph} is not visible on ${rowLabel}`);
  return { row: rowPosition.row, column };
}

async function clickWidget(
  driver: PtyTestDriver.Model,
  rowLabel: string,
  widgetGlyph: string,
): Promise<void> {
  const position = widgetPosition(driver.snapshot(), rowLabel, widgetGlyph);
  driver.sendMouse({
    kind: 'press',
    column: position.column,
    row: position.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: position.column,
    row: position.row,
    button: 'left',
  });
  await driver.awaitQuiescence();
}

const repositoryRoot = process.cwd();
const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-voice-picker-harness-fixture-'));
const dataDirectory = mkdtempSync(join(tmpdir(), 'tui-voice-picker-harness-data-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-voice-picker-harness-home-'));
mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
mkdirSync(join(dataDirectory, 'piper-voices', 'library'), { recursive: true });
await Bun.write(join(dataDirectory, 'piper-voices', 'aaa.onnx'), '');
await Bun.write(join(dataDirectory, 'piper-voices', 'bbb.onnx'), '');
await Bun.write(join(dataDirectory, 'piper-voices', 'library', 'ccc.onnx'), '');
const statusPath = join(homeDirectory, 'status.json');

console.log('== harness voice picker: deterministic discovery and settings tests ==');
runVoiceUnitTests(repositoryRoot);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  repositoryRoot,
  columns: 120,
  rows: 44,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    XDG_DATA_HOME: dataDirectory,
    INVAR_TTS_BACKEND: 'mock',
  },
});

try {
  console.log('== harness voice picker: command registration ==');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.ready === true,
    20_000,
  );
  driver.sendKeys('F1');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('Command Palette') !== null);
  driver.sendText('Test Voice');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => Number(status.paletteMatches) >= 1,
  );
  HarnessSmoke.Class.pass('Narration Test Voice is registered in the command palette');
  driver.sendKeys('Escape');
  await driver.awaitQuiescence();

  console.log('== harness voice picker: keyboard dynamic-enum edit ==');
  driver.sendKeys('Control+,');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.settingsOpen === true,
  );
  for (let navigationStep = 0; navigationStep < 30; navigationStep++) {
    if (HarnessSmoke.Class.readStatus(statusPath).settingsSelectedLabel === 'Narration voice') break;
    driver.sendKeys('Down');
    await driver.awaitQuiescence();
  }
  let status = HarnessSmoke.Class.readStatus(statusPath);
  HarnessSmoke.Class.requireCondition(
    status.settingsSelectedLabel === 'Narration voice'
      && status.settingsSelectedValue === 'auto (first found)',
    'Narration voice dynamic enum starts at auto',
  );
  driver.sendKeys('Right');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.narrationVoice === 'aaa'
      && candidate.settingsSelectedValue === 'aaa',
  );
  HarnessSmoke.Class.pass('Right cycles to the first discovered voice');

  console.log('== harness voice picker: mouse enum, number, and boolean edits ==');
  await clickWidget(driver, 'Narration voice', '>');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    (candidate) => candidate.narrationVoice === 'bbb',
  );
  HarnessSmoke.Class.pass('voice arrow advances from aaa to bbb');

  await clickWidget(driver, 'Narration speed', '+');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    (candidate) => candidate.narrationRate === 1.1,
  );
  HarnessSmoke.Class.pass('speed stepper raises narration rate from 1.0 to 1.1');

  status = HarnessSmoke.Class.readStatus(statusPath);
  const narrationEnabledBefore = status.narrationEnabled;
  await clickWidget(driver, 'Speak agent replies', ']');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    (candidate) => candidate.narrationEnabled !== narrationEnabledBefore,
  );
  HarnessSmoke.Class.pass('audio narration checkbox flips through a mouse click');

  driver.sendKeys('Control+q');
  console.log('smoke-voice-picker-harness: ALL-PASS');
} finally {
  driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(dataDirectory, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
