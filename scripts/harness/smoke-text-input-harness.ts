#!/usr/bin/env bun
// Byte-level drive of the shared one-line input primitive through open-project, the command palette,
// and find. Every caret assertion reads the terminal-emulator grid at a discovered input position.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Editable text fields share one input model (project.invariants.md)
// invariant: The open-project path input is a live directory navigator (src/modules/search/search.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EditorCoordinates } from '../../src/modules/editor/EditorCoordinates';
import { ThemePalettes } from '../../src/modules/theme/ThemePalettes';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

interface DiscoveredInputPosition {
  row: number;
  column: number;
}

// The shared painter draws the caret by INVERTING the cell it sits on, so the caret cell carries the
// field's foreground as its background and the text around it never shifts. The colour comes from the
// same theme data the app paints from, never a literal.
const caretCellBackground = Number.parseInt(
  ThemePalettes.Class.DARK.fg.slice(1),
  16,
);

async function awaitInputValue(
  driver: PtyTestDriver.Model,
  inputPosition: DiscoveredInputPosition,
  beforeCaret: string,
  afterCaret: string,
  description: string,
): Promise<HarnessSnapshot.Model> {
  return driver.awaitGridCondition(description, (snapshot) => {
    const rowText = snapshot.rowText(inputPosition.row);
    const caretColumn =
      inputPosition.column + EditorCoordinates.Class.lineWidth(beforeCaret);
    const caretCell = snapshot.cell(inputPosition.row, caretColumn);
    return (
      rowText.slice(inputPosition.column, caretColumn) === beforeCaret &&
      caretCell?.background === caretCellBackground &&
      rowText.slice(caretColumn, caretColumn + afterCaret.length) === afterCaret
    );
  });
}

async function exerciseSharedInput(
  driver: PtyTestDriver.Model,
  surfaceName: string,
): Promise<DiscoveredInputPosition> {
  const inputValue = 'orbit amber quartz';
  driver.sendText(inputValue);
  let snapshot = await driver.awaitGridCondition(
    `${surfaceName} paints the typed value`,
    (candidate) => candidate.findText(inputValue) !== null,
  );
  const valuePosition = snapshot.findText(inputValue);
  if (!valuePosition)
    throw new Error(`${surfaceName} input value was not visible`);
  const caretCell = snapshot.cell(
    valuePosition.row,
    valuePosition.column + inputValue.length,
  );
  HarnessSmoke.Class.requireCondition(
    caretCell?.background === caretCellBackground,
    `${surfaceName} paints an inverted one-cell caret after inserted text`,
  );
  const inputPosition: DiscoveredInputPosition = {
    row: valuePosition.row,
    column: valuePosition.column,
  };

  driver.sendKeys('Left');
  snapshot = await awaitInputValue(
    driver,
    inputPosition,
    'orbit amber quart',
    'z',
    `${surfaceName} Left moves one grapheme`,
  );
  HarnessSmoke.Class.pass(`${surfaceName} Left moves one grapheme`);

  driver.sendKeys('Alt+Left');
  snapshot = await awaitInputValue(
    driver,
    inputPosition,
    'orbit amber ',
    'quartz',
    `${surfaceName} Alt+Left moves to the previous word boundary`,
  );
  HarnessSmoke.Class.pass(
    `${surfaceName} Alt+Left moves by the shared word boundary`,
  );

  driver.sendKeys('Alt+Right');
  snapshot = await awaitInputValue(
    driver,
    inputPosition,
    inputValue,
    '',
    `${surfaceName} Alt+Right moves to the next word boundary`,
  );
  HarnessSmoke.Class.pass(
    `${surfaceName} Alt+Right moves by the shared word boundary`,
  );

  driver.sendKeys('Home');
  snapshot = await awaitInputValue(
    driver,
    inputPosition,
    '',
    inputValue,
    `${surfaceName} Home moves to the input start`,
  );
  HarnessSmoke.Class.pass(`${surfaceName} Home moves to the input start`);

  driver.sendKeys('Right');
  snapshot = await awaitInputValue(
    driver,
    inputPosition,
    'o',
    'rbit amber quartz',
    `${surfaceName} Right moves one grapheme`,
  );
  HarnessSmoke.Class.pass(`${surfaceName} Right moves one grapheme`);

  driver.sendKeys('End');
  snapshot = await awaitInputValue(
    driver,
    inputPosition,
    inputValue,
    '',
    `${surfaceName} End moves to the input end`,
  );
  HarnessSmoke.Class.pass(`${surfaceName} End moves to the input end`);

  driver.sendRawInput('\x1b\x7f');
  snapshot = await awaitInputValue(
    driver,
    inputPosition,
    'orbit amber ',
    '',
    `${surfaceName} Alt+Backspace deletes the previous word`,
  );
  HarnessSmoke.Class.pass(
    `${surfaceName} Alt+Backspace deletes the previous word`,
  );

  driver.sendText('quartz');
  await awaitInputValue(
    driver,
    inputPosition,
    inputValue,
    '',
    `${surfaceName} inserts again at the caret`,
  );
  driver.sendKeys('Home');
  await awaitInputValue(
    driver,
    inputPosition,
    '',
    inputValue,
    `${surfaceName} returns to the input start`,
  );
  driver.sendKeys('Alt+Delete');
  snapshot = await awaitInputValue(
    driver,
    inputPosition,
    '',
    'amber quartz',
    `${surfaceName} Alt+Delete deletes the next word`,
  );
  HarnessSmoke.Class.pass(`${surfaceName} Alt+Delete deletes the next word`);
  return inputPosition;
}

const navigatorBase = mkdtempSync(join(tmpdir(), 'tui-text-input-harness-'));

const fixtureRoot = join(navigatorBase, 'workspace');

const drillTarget = join(navigatorBase, 'drill-target');

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-text-input-harness-home-'),
);

const statusPath = join(homeDirectory, 'status.json');

mkdirSync(fixtureRoot);

mkdirSync(drillTarget);

await Bun.write(
  join(fixtureRoot, 'document.txt'),
  'The fixture deliberately does not contain the input smoke tokens.\n',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 130,
  rows: 44,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    NERD_FONT: '0',
    TERM_PROGRAM: 'xterm',
    LANG: 'C',
  },
});

try {
  console.log(
    '== harness text input: open the fixture through the real tree path ==',
  );
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('document.txt') !== null,
    15_000,
  );
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('fixture deliberately') !== null,
  );

  console.log(
    '== harness text input: open-project navigator uses the shared primitive ==',
  );
  driver.sendKeys('F1');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Command Palette') !== null,
  );
  driver.sendText('Open Folder');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Open Folder') !== null,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.quickOpenMode === 'workspacePath'",
    (status) => status.quickOpenMode === 'workspacePath',
  );
  driver.sendRawInput('\x7f'.repeat(160));
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.quickOpenQuery === ''",
    (status) => status.quickOpenQuery === '',
  );
  const navigatorInputPosition = await exerciseSharedInput(
    driver,
    'open-project',
  );

  driver.sendKeys('End');
  driver.sendRawInput('\x7f'.repeat(160));
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.quickOpenQuery === '' after line deletion",
    (status) => status.quickOpenQuery === '',
  );
  const navigatorPath = `${navigatorBase}/`;
  driver.sendText(navigatorPath);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: navigator lists drill-target',
    (status) =>
      status.quickOpenQuery === navigatorPath &&
      status.quickOpenMatches === 2 &&
      status.quickOpenSelected === 0,
  );
  await awaitInputValue(
    driver,
    navigatorInputPosition,
    navigatorPath,
    '',
    'open-project paints the caret at the path end',
  );

  driver.sendKeys('Left');
  await awaitInputValue(
    driver,
    navigatorInputPosition,
    navigatorPath.slice(0, -1),
    '/',
    'open-project Left exposes text to the caret right',
  );
  driver.sendKeys('Right');
  await awaitInputValue(
    driver,
    navigatorInputPosition,
    navigatorPath,
    '',
    'open-project Right moves within text before navigating',
  );
  const beforeDrillStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the open-project query remains the full navigator path',
    (status) => status.quickOpenQuery === navigatorPath,
  );
  HarnessSmoke.Class.requireCondition(
    beforeDrillStatus.quickOpenQuery === navigatorPath,
    'open-project Right with text to its right does not drill into a folder',
  );

  driver.sendKeys('Right');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: Right at end drills into drill-target',
    (status) => status.quickOpenQuery === `${drillTarget}/`,
  );
  HarnessSmoke.Class.pass(
    'open-project Right at end drills into the selected folder',
  );
  driver.sendKeys('Escape');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Open Project Folder') === null,
  );

  console.log(
    '== harness text input: command palette uses the same key set ==',
  );
  driver.sendKeys('F1');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Command Palette') !== null,
  );
  await exerciseSharedInput(driver, 'command palette');
  driver.sendKeys('Escape');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Command Palette') === null,
  );

  console.log('== harness text input: find query uses the same key set ==');
  driver.sendKeys('Control+f');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('Find') !== null);
  await exerciseSharedInput(driver, 'find');
  driver.sendKeys('Escape');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('Find') === null);

  driver.sendKeys('Control+q');
  console.log('smoke-text-input-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(navigatorBase);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
