#!/usr/bin/env bun
// Byte-level port of voice discovery and mouse-editable narration settings, with isolated HOME/data
// fixtures and the mock TTS backend.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function runVoiceUnitTests(repositoryRoot: string): void {
  const result = Bun.spawnSync(
    [
      process.execPath,
      'test',
      'src/modules/narration/VoiceDiscovery.test.ts',
      'src/modules/settings/SettingsPanel.test.ts',
    ],
    {
      cwd: repositoryRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
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
  if (column < 0)
    throw new Error(`Widget ${widgetGlyph} is not visible on ${rowLabel}`);
  return { row: rowPosition.row, column };
}

function clickWidget(
  driver: PtyTestDriver.Model,
  rowLabel: string,
  widgetGlyph: string,
): void {
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
}

const repositoryRoot = process.cwd();

const fixtureRoot = mkdtempSync(
  join(tmpdir(), 'tui-voice-picker-harness-fixture-'),
);

const dataDirectory = mkdtempSync(
  join(tmpdir(), 'tui-voice-picker-harness-data-'),
);

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-voice-picker-harness-home-'),
);

mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });

mkdirSync(join(dataDirectory, 'piper-voices', 'library'), { recursive: true });

await Bun.write(join(dataDirectory, 'piper-voices', 'aaa.onnx'), '');

await Bun.write(join(dataDirectory, 'piper-voices', 'bbb.onnx'), '');

await Bun.write(join(dataDirectory, 'piper-voices', 'library', 'ccc.onnx'), '');

const statusPath = join(homeDirectory, 'status.json');

console.log(
  '== harness voice picker: deterministic discovery and settings tests ==',
);

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
    'status condition: status.ready === true',
    (status) => status.ready === true,
    20_000,
  );
  driver.sendKeys('F1');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Command Palette') !== null,
  );
  driver.sendText('Test Voice');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: Number(status.paletteMatches) >= 1',
    (status) => Number(status.paletteMatches) >= 1,
  );
  await driver.awaitGridCondition(
    'the Narration Test Voice command is visible in the command palette',
    (snapshot) => snapshot.findText('Narration: Test Voice') !== null,
  );
  HarnessSmoke.Class.pass(
    'Narration Test Voice is registered in the command palette',
  );
  driver.sendKeys('Escape');
  await driver.awaitGridCondition(
    'the command palette is closed before opening settings',
    (snapshot) => snapshot.findText('Command Palette') === null,
  );

  console.log('== harness voice picker: keyboard dynamic-enum edit ==');
  driver.sendKeys('Control+,');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.settingsOpen === true',
    (status) => status.settingsOpen === true,
  );
  await driver.awaitGridCondition(
    'the settings view is visible before keyboard navigation',
    (snapshot) => snapshot.findText('Settings') !== null,
  );
  let status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'a settings selection is published before voice-row navigation',
    (candidate) => typeof candidate.settingsSelectedLabel === 'string',
  );
  for (let navigationStep = 0; navigationStep < 30; navigationStep++) {
    if (status.settingsSelectedLabel === 'Narration voice') break;
    const previousSelectedLabel = status.settingsSelectedLabel;
    driver.sendKeys('Down');
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'Down publishes a different selected settings row',
      (candidate) => candidate.settingsSelectedLabel !== previousSelectedLabel,
    );
  }
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Narration voice row publishes its automatic initial value',
    (candidate) =>
      candidate.settingsSelectedLabel === 'Narration voice' &&
      candidate.settingsSelectedValue === 'auto (first found)',
  );
  HarnessSmoke.Class.pass('Narration voice dynamic enum starts at auto');
  driver.sendKeys('Right');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: candidate.narrationVoice === 'aaa' && candidate.settingsSelectedValue === 'aaa'",
    (candidate) =>
      candidate.narrationVoice === 'aaa' &&
      candidate.settingsSelectedValue === 'aaa',
  );
  await driver.awaitGridCondition(
    'the Narration voice row visibly shows aaa before mouse editing',
    (snapshot) => {
      const voicePosition = snapshot.findText('Narration voice');
      return (
        voicePosition !== null &&
        snapshot.rowText(voicePosition.row).includes('aaa')
      );
    },
  );
  HarnessSmoke.Class.pass('Right cycles to the first discovered voice');

  console.log(
    '== harness voice picker: mouse enum, number, and boolean edits ==',
  );
  clickWidget(driver, 'Narration voice', '>');
  const speedStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    "status condition: candidate.narrationVoice === 'bbb'",
    (candidate) => candidate.narrationVoice === 'bbb',
  );
  HarnessSmoke.Class.pass('voice arrow advances from aaa to bbb');

  clickWidget(driver, 'Narration speed', '+');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: candidate.narrationRate === 1.1',
    (candidate) => candidate.narrationRate === 1.1,
  );
  HarnessSmoke.Class.pass(
    'speed stepper raises narration rate from 1.0 to 1.1',
  );

  const narrationEnabledBefore = speedStatus.narrationEnabled;
  clickWidget(driver, 'Speak agent replies', ']');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: candidate.narrationEnabled !== narrationEnabledBefore',
    (candidate) => candidate.narrationEnabled !== narrationEnabledBefore,
  );
  HarnessSmoke.Class.pass(
    'audio narration checkbox flips through a mouse click',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-voice-picker-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(dataDirectory);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
