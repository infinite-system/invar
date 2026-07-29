#!/usr/bin/env bun
// Driven code-folding canary: a real TypeScript file is folded through the number-gutter control,
// navigated through the shared visual-row mapping, and rehydrated through a file switch.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)
// invariant: One generator owns document-line-to-visual-row (src/modules/editor/editor.invariants.md)
// invariant: A fold toggle preserves the viewport anchor (src/modules/editor/editor.invariants.md)
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

const deepCodePath = join(fixtureRoot, 'deep.ts');

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

const deepCodeLines = Array.from(
  { length: 600 },
  (_unusedValue, lineIndex) =>
    `const deepLine${String(lineIndex).padStart(3, '0')} = ${lineIndex};`,
);

deepCodeLines[530] = 'function deepFold() {';

deepCodeLines[531] = '  const deepHiddenNeedle = 1;';

deepCodeLines[532] = '  const deepHiddenSecond = 2;';

deepCodeLines[533] = '}';

await Bun.write(deepCodePath, `${deepCodeLines.join('\n')}\n`);

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
  headerText = 'function foldedBlock() {',
): { row: number; column: number } | null {
  const headerPosition = snapshot.findEditorText(headerText);
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
    snapshot.findEditorText('hiddenNeedle') === null &&
    snapshot.findEditorText('anotherHidden') === null &&
    snapshot.findEditorText('const afterFold = true;') !== null &&
    Array.from(headerRow).filter(
      (character) => character === unicodeVocabulary.foldClosed,
    ).length >= 2
  );
}

function expandedGrid(snapshot: HarnessSnapshot.Model): boolean {
  return (
    foldControlPosition(snapshot, unicodeVocabulary.foldOpen) !== null &&
    snapshot.findEditorText('hiddenNeedle') !== null &&
    snapshot.findEditorText('anotherHidden') !== null
  );
}

function topmostDeepLine(snapshot: HarnessSnapshot.Model): number | null {
  let topmostLine: number | null = null;
  for (let row = 0; row < snapshot.rows; row++) {
    const rowText = snapshot.rowText(row);
    // Editor cells only: at defaults the structure outline lists the same deepLineNNN symbol
    // names in the right dock, and counting those would pin the "topmost" line to the outline's
    // scroll position instead of the editor's.
    const rowMatches = rowText.matchAll(/deepLine(\d{3})/g);
    for (const match of rowMatches) {
      if (!snapshot.isEditorCell(row, match.index ?? 0)) continue;
      const lineIndex = Number(match[1]);
      topmostLine =
        topmostLine === null ? lineIndex : Math.min(topmostLine, lineIndex);
    }
  }
  return topmostLine;
}

function clickFoldControl(
  driver: PtyTestDriver.Model,
  snapshot: HarnessSnapshot.Model,
  expectedGlyph: string,
  headerText = 'function foldedBlock() {',
): void {
  const position = foldControlPosition(snapshot, expectedGlyph, headerText);
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
      candidate.findText('companion.ts') !== null &&
      candidate.findText('deep.ts') !== null,
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

  console.log(
    '== harness code folding: host setting expands and removes controls ==',
  );
  driver.sendKeys('Control+,');
  const settingsStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the settings schema publishes the default-on Code folding row',
    (status) =>
      status.settingsOpen === true &&
      status.codeFolding === true &&
      Array.isArray(status.settingsLabels) &&
      status.settingsLabels.includes('Code folding'),
  );
  const codeFoldingSettingIndex = (
    settingsStatus.settingsLabels as string[]
  ).indexOf('Code folding');
  driver.sendKeys(
    ...Array.from({ length: codeFoldingSettingIndex }, () => 'Down'),
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the contributed Code folding row receives settings selection',
    (status) => status.settingsSelectedLabel === 'Code folding',
  );
  driver.sendKeys('Right');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'disabling code folding expands state and publishes zero collapsed rows',
    (status) =>
      status.codeFolding === false && foldedLineStartsEqual(status, []),
  );
  driver.sendKeys('Escape');
  snapshot = await driver.awaitGridCondition(
    'disabled code folding shows the body without an open or closed control',
    (candidate) =>
      candidate.findEditorText('hiddenNeedle') !== null &&
      foldControlPosition(candidate, unicodeVocabulary.foldOpen) === null &&
      foldControlPosition(candidate, unicodeVocabulary.foldClosed) === null,
  );
  HarnessSmoke.Class.pass(
    'editor.codeFolding=false expands content and removes gutter controls',
  );

  driver.sendKeys('Control+,');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Code folding remains selected when settings reopens',
    (status) => status.settingsSelectedLabel === 'Code folding',
  );
  driver.sendKeys('Right');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    're-enabling code folding restores the retained collapsed projection',
    (status) =>
      status.codeFolding === true && foldedLineStartsEqual(status, [1]),
  );
  driver.sendKeys('Escape');
  snapshot = await driver.awaitGridCondition(
    're-enabled code folding restores the closed gutter control',
    collapsedGrid,
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
    (candidate) => candidate.findEditorText('const hiddenNeedle = 1;') !== null,
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
    (candidate) => candidate.findEditorText('companionValue = 2') !== null,
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

  console.log(
    '== harness code folding: deep pointer and keyboard toggles preserve the viewport anchor ==',
  );
  snapshot = await driver.awaitGridCondition(
    'deep.ts remains visible in the file tree',
    (candidate) => candidate.findText('deep.ts') !== null,
  );
  HarnessSmoke.Class.clickText(driver, snapshot, 'deep.ts');
  await awaitActiveBuffer(
    driver,
    deepCodePath,
    'deep.ts becomes the active editor buffer',
  );
  driver.sendKeys('Control+End', 'PageUp', 'PageUp', 'PageUp', 'PageUp');
  snapshot = await driver.awaitGridCondition(
    'the deep fold header is visible around document line 530',
    (candidate) =>
      candidate.findEditorText('function deepFold() {') !== null &&
      foldControlPosition(
        candidate,
        unicodeVocabulary.foldOpen,
        'function deepFold() {',
      ) !== null,
  );
  const pointerAnchorBefore = topmostDeepLine(snapshot);
  const pointerHeaderRowBefore =
    snapshot.findEditorText('function deepFold() {')?.row ?? -1;
  HarnessSmoke.Class.requireCondition(
    pointerAnchorBefore !== null && pointerAnchorBefore >= 490,
    `the pointer drive starts deep in the document (top line ${String(pointerAnchorBefore)})`,
  );
  clickFoldControl(
    driver,
    snapshot,
    unicodeVocabulary.foldOpen,
    'function deepFold() {',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the deep pointer control collapses line 531 without revealing line zero',
    (status) =>
      foldedLineStartsEqual(status, [530]) &&
      Number(status.editorScrollTop) > 0,
  );
  snapshot = await driver.awaitGridCondition(
    'the deep pointer fold paints at the same viewport anchor',
    (candidate) =>
      foldControlPosition(
        candidate,
        unicodeVocabulary.foldClosed,
        'function deepFold() {',
      ) !== null,
  );
  HarnessSmoke.Class.requireCondition(
    topmostDeepLine(snapshot) === pointerAnchorBefore &&
      snapshot.findEditorText('function deepFold() {')?.row ===
        pointerHeaderRowBefore,
    'pointer folding preserves the topmost document line and fold-header row',
  );
  clickFoldControl(
    driver,
    snapshot,
    unicodeVocabulary.foldClosed,
    'function deepFold() {',
  );
  snapshot = await driver.awaitGridCondition(
    'pointer unfolding restores the deep fold body',
    (candidate) =>
      candidate.findEditorText('deepHiddenNeedle') !== null &&
      foldControlPosition(
        candidate,
        unicodeVocabulary.foldOpen,
        'function deepFold() {',
      ) !== null,
  );
  HarnessSmoke.Class.requireCondition(
    topmostDeepLine(snapshot) === pointerAnchorBefore,
    'pointer unfolding restores without moving the deep viewport anchor',
  );

  HarnessSmoke.Class.clickText(driver, snapshot, 'function deepFold', 4);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the caret lands on the deep fold header before keyboard toggling',
    (status) => status.cursorLineIndex === 530,
  );
  const keyboardAnchorBefore = topmostDeepLine(snapshot);
  driver.sendKeys('Control+k', '[');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the deep keyboard chord collapses without revealing line zero',
    (status) =>
      foldedLineStartsEqual(status, [530]) &&
      Number(status.editorScrollTop) > 0,
  );
  snapshot = await driver.awaitGridCondition(
    'the keyboard-collapsed deep header remains visible',
    (candidate) =>
      foldControlPosition(
        candidate,
        unicodeVocabulary.foldClosed,
        'function deepFold() {',
      ) !== null,
  );
  HarnessSmoke.Class.requireCondition(
    topmostDeepLine(snapshot) === keyboardAnchorBefore,
    'keyboard folding preserves the topmost deep document line',
  );
  driver.sendKeys('Control+l', ']');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the deep keyboard unfold restores the body at the same anchor',
    (status) =>
      foldedLineStartsEqual(status, []) && Number(status.editorScrollTop) > 0,
  );
  snapshot = await driver.awaitGridCondition(
    'the keyboard-unfolded deep body is visible',
    (candidate) => candidate.findEditorText('deepHiddenNeedle') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    topmostDeepLine(snapshot) === keyboardAnchorBefore,
    'keyboard unfolding preserves the topmost deep document line',
  );
  HarnessSmoke.Class.pass(
    'pointer and keyboard fold toggles preserve a deep viewport anchor',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-code-folding-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
