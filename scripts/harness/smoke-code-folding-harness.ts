#!/usr/bin/env bun
// Driven code-folding canary: a real TypeScript file is folded through the number-gutter control,
// navigated through the shared visual-row mapping, and rehydrated through a file switch.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)
// invariant: One generator owns document-line-to-visual-row (src/modules/editor/editor.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-code-folding-harness-'));
const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-code-folding-harness-home-'),
);
const statusPath = join(homeDirectory, 'status.json');
const codePath = join(fixtureRoot, 'code.ts');
const companionPath = join(fixtureRoot, 'companion.ts');
const unicodeVocabulary =
  ThemeIcons.Class.interfaceGlyphVocabularyFor('unicode');

await Bun.write(
  codePath,
  [
    'const beforeFold = true;',
    'function foldedBlock() {',
    '  const hiddenNeedle = 1;',
    '  const anotherHidden = 2;',
    '}',
    'const afterFold = true;',
    'console.log(beforeFold, afterFold);',
    '',
  ].join('\n'),
);
await Bun.write(companionPath, 'export const companionValue = 2;\n');

function foldedLineStartsEqual(
  status: Record<string, unknown>,
  expected: readonly number[],
): boolean {
  return (
    Array.isArray(status.foldedLineStarts) &&
    status.foldedLineStarts.length === expected.length &&
    status.foldedLineStarts.every(
      (lineStart, index) => lineStart === expected[index],
    )
  );
}

function foldControlPosition(
  snapshot: HarnessSnapshot.Model,
  expectedGlyph: string,
): { row: number; column: number } | null {
  const headerPosition = snapshot.findText('function foldedBlock() {');
  if (!headerPosition || headerPosition.column < 2) return null;
  const position = {
    row: headerPosition.row,
    column: headerPosition.column - 2,
  };
  return snapshot.cell(position.row, position.column)?.characters ===
    expectedGlyph
    ? position
    : null;
}

function collapsedGrid(snapshot: HarnessSnapshot.Model): boolean {
  const controlPosition = foldControlPosition(
    snapshot,
    unicodeVocabulary.foldClosed,
  );
  if (!controlPosition) return false;
  const headerRow = snapshot.rowText(controlPosition.row);
  return (
    snapshot.findText('hiddenNeedle') === null &&
    snapshot.findText('anotherHidden') === null &&
    snapshot.findText('const afterFold = true;') !== null &&
    Array.from(headerRow).filter(
      (character) => character === unicodeVocabulary.foldClosed,
    ).length >= 2
  );
}

function expandedGrid(snapshot: HarnessSnapshot.Model): boolean {
  return (
    foldControlPosition(snapshot, unicodeVocabulary.foldOpen) !== null &&
    snapshot.findText('hiddenNeedle') !== null &&
    snapshot.findText('anotherHidden') !== null
  );
}

function clickFoldControl(
  driver: PtyTestDriver.Model,
  snapshot: HarnessSnapshot.Model,
  expectedGlyph: string,
): void {
  const position = foldControlPosition(snapshot, expectedGlyph);
  HarnessSmoke.Class.requireCondition(
    position !== null,
    `the ${expectedGlyph} fold control occupies the number-gutter edge`,
  );
  if (!position) return;
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

async function awaitActiveBuffer(
  driver: PtyTestDriver.Model,
  expectedPath: string,
  label: string,
): Promise<void> {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    label,
    (status) => status.activeBuffer === expectedPath,
  );
}

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 32,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    LANG: 'en_US.UTF-8',
    NERD_FONT: '0',
  },
});

try {
  console.log('== harness code folding: open a real TypeScript document ==');
  let snapshot = await driver.awaitGridCondition(
    'the file tree paints both TypeScript fixtures',
    (candidate) =>
      candidate.findText('code.ts') !== null &&
      candidate.findText('companion.ts') !== null,
    15_000,
  );
  HarnessSmoke.Class.clickText(driver, snapshot, 'code.ts');
  await awaitActiveBuffer(
    driver,
    codePath,
    'code.ts is the active editor buffer',
  );
  snapshot = await driver.awaitGridCondition(
    'the expanded TypeScript block and its open gutter control paint',
    expandedGrid,
  );
  HarnessSmoke.Class.pass('opened the real TypeScript block with an open mark');

  console.log('== harness code folding: mouse toggles the gutter control ==');
  clickFoldControl(driver, snapshot, unicodeVocabulary.foldOpen);
  snapshot = await driver.awaitGridCondition(
    'the mouse drive hides the fold body and paints both closed indicators',
    collapsedGrid,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the mouse drive publishes line 2 as collapsed',
    (status) => foldedLineStartsEqual(status, [1]),
  );
  HarnessSmoke.Class.pass(
    'mouse folding paints one header plus a closed body indicator',
  );

  clickFoldControl(driver, snapshot, unicodeVocabulary.foldClosed);
  snapshot = await driver.awaitGridCondition(
    'the second mouse drive restores the hidden TypeScript lines',
    expandedGrid,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the mouse unfold publishes no collapsed line starts',
    (status) => foldedLineStartsEqual(status, []),
  );
  HarnessSmoke.Class.pass('mouse unfolding restores the complete block');

  console.log('== harness code folding: keyboard fold and caret skip-over ==');
  HarnessSmoke.Class.clickText(driver, snapshot, 'function foldedBlock', 4);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the pointer places the caret on the fold header',
    (status) => status.cursorLineIndex === 1,
  );
  driver.sendKeys('Control+k', '[');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Ctrl+K then [ collapses the fold header',
    (status) => foldedLineStartsEqual(status, [1]),
  );
  await driver.awaitGridCondition(
    'the keyboard-folded block paints its collapsed grid',
    collapsedGrid,
  );
  HarnessSmoke.Class.pass('the editor-context chord folds the block');

  driver.sendKeys('Down');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Down from the folded header lands after its hidden body',
    (status) => status.cursorLineIndex === 5,
  );
  HarnessSmoke.Class.pass('vertical caret movement skips every folded line');
  driver.sendKeys('Up');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Up from after the fold returns to its visible header',
    (status) => status.cursorLineIndex === 1,
  );

  console.log(
    '== harness code folding: navigation into a body auto-unfolds ==',
  );
  driver.sendKeys('Control+f');
  await driver.awaitGridCondition(
    'the editor Find field paints before its hidden-line query is entered',
    (candidate) => candidate.findText('Find') !== null,
  );
  driver.sendText('hiddenNeedle');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Find navigation reaches the hidden line and unfolds its containing range',
    (status) =>
      status.cursorLineIndex === 2 &&
      status.findMatchCount === 1 &&
      foldedLineStartsEqual(status, []),
  );
  await driver.awaitGridCondition(
    'the navigated hidden line is visible in the editor grid',
    (candidate) => candidate.findText('const hiddenNeedle = 1;') !== null,
  );
  HarnessSmoke.Class.pass('navigation into a folded body auto-unfolds it');
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Escape closes Find before the persistence drive',
    (status) => status.findOpen === false,
  );

  console.log(
    '== harness code folding: document state survives a file switch ==',
  );
  driver.sendKeys('Control+k', '[');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'folding from inside the block collapses its containing range',
    (status) => foldedLineStartsEqual(status, [1]),
  );
  snapshot = await driver.awaitGridCondition(
    'the refolded block is collapsed before switching files',
    collapsedGrid,
  );
  HarnessSmoke.Class.clickText(driver, snapshot, 'companion.ts');
  await awaitActiveBuffer(
    driver,
    companionPath,
    'companion.ts becomes the active editor buffer',
  );
  snapshot = await driver.awaitGridCondition(
    'the companion TypeScript document paints after the file switch',
    (candidate) => candidate.findText('companionValue = 2') !== null,
  );
  HarnessSmoke.Class.clickText(driver, snapshot, 'code.ts');
  await awaitActiveBuffer(
    driver,
    codePath,
    'code.ts becomes active again after the file switch',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the rehydrated code.ts handle retains its collapsed line start',
    (status) => foldedLineStartsEqual(status, [1]),
  );
  await driver.awaitGridCondition(
    'the rehydrated TypeScript document repaints its collapsed form',
    collapsedGrid,
  );
  HarnessSmoke.Class.pass(
    'fold state survives file dehydration and rehydration',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-code-folding-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
