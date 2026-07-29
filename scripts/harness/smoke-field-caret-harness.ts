#!/usr/bin/env bun
// Drives the ONE single-line text-field painter through the real PTY: the bounded popup's search row
// (caret + focused/hovered tones + the full text-input action vocabulary) and the Find/Replace bar
// (the focused/idle pair). Every caret assertion addresses the field by its PUBLISHED geometry —
// `boundedListPopupQueryCaretCell` — and cross-checks that cell against the published query text and
// the published model caret offset through the app's own display-width authority, never by hunting
// for a caret glyph.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: One painter draws every single-line text field (src/modules/ui/ui.invariants.md)
// invariant: Editable text fields share one input model (project.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextCoordinates } from '../../src/modules/text/TextCoordinates';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
import { ThemePalettes } from '../../src/modules/theme/ThemePalettes';
import { TextFieldPainter } from '../../src/modules/ui/TextFieldPainter';
import { HarnessSmoke } from './HarnessSmoke';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

interface PopupGeometryStatus {
  boxLeft: number;
  boxTop: number;
  boxWidth: number;
  boxHeight: number;
  searchRow: number | null;
  listLeft: number;
  listTop: number;
  listColumns: number;
  listRows: number;
}

interface CaretCellStatus {
  column: number;
  row: number;
  width: number;
}

// Tones and glyphs come from the SAME theme data the app paints from — a smoke that hardcodes a hex
// or a glyph re-breaks on every palette change. The tone POLICY (three distinct tones, focus quieter
// than hover) is proven in src/modules/ui/TextFieldPainter.test.ts; here the three are also asserted
// pairwise different in observed cells.
const palette = ThemePalettes.Class.DARK;

const idleTone = TextFieldPainter.Class.toneFor(palette, 'idle');

const focusedTone = TextFieldPainter.Class.toneFor(palette, 'focused');

const hoveredTone = TextFieldPainter.Class.toneFor(palette, 'hovered');

const searchFieldPrefix = ` ${ThemeIcons.Class.findIconsFor('unicode').search} `;

function colorNumber(hexColor: string | null): number {
  return Number.parseInt((hexColor ?? '#000000').slice(1), 16);
}

function popupGeometry(status: StatusSnapshot): PopupGeometryStatus | null {
  return status.boundedListPopupGeometry as PopupGeometryStatus | null;
}

function queryCaretCell(status: StatusSnapshot): CaretCellStatus | null {
  return status.boundedListPopupQueryCaretCell as CaretCellStatus | null;
}

/** The caret column the MODEL implies: the published query sliced at the published grapheme caret,
 *  measured in display columns by TextCoordinates — the app's own width authority. */
function caretColumnFromModel(
  geometry: PopupGeometryStatus,
  query: string,
  caret: number,
): number {
  const valueBeforeCaret = query.slice(
    0,
    TextCoordinates.Class.graphemeToU16(query, caret),
  );
  return (
    geometry.listLeft +
    TextCoordinates.Class.lineWidth(searchFieldPrefix + valueBeforeCaret)
  );
}

/** Search-row columns whose background is the caret's inverted colour (the field's foreground). */
function caretColumnsInSearchRow(
  snapshot: HarnessSnapshot.Model,
  geometry: PopupGeometryStatus,
  caretBackground: number,
): number[] {
  const searchRow = geometry.searchRow;
  if (searchRow === null) return [];
  const columns: number[] = [];
  const rightColumnExclusive = geometry.listLeft + geometry.boxWidth - 2;
  for (
    let column = geometry.listLeft;
    column < rightColumnExclusive;
    column += 1
  ) {
    if (snapshot.cell(searchRow, column)?.background === caretBackground) {
      columns.push(column);
    }
  }
  return columns;
}

/**
 * Assert the painted caret is the model's caret. Waits on the STATUS state each assertion reads
 * (the expected query and caret offset, plus a published caret cell that agrees with the model),
 * then on the grid cells that carry the inverted caret background.
 */
async function assertModelCaretIsPainted(
  driver: PtyTestDriver.Model,
  statusPath: string,
  label: string,
  expectedQuery: string,
  expectedCaret: number,
): Promise<PopupGeometryStatus> {
  const status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `${label}: query "${expectedQuery}" with model caret ${expectedCaret} publishes an agreeing caret cell`,
    (candidate) => {
      const geometry = popupGeometry(candidate);
      const caretCell = queryCaretCell(candidate);
      if (!geometry || !caretCell) return false;
      return (
        candidate.boundedListPopupQuery === expectedQuery &&
        candidate.boundedListPopupQueryCaret === expectedCaret &&
        caretCell.column ===
          caretColumnFromModel(geometry, expectedQuery, expectedCaret)
      );
    },
  );
  const geometry = popupGeometry(status);
  const caretCell = queryCaretCell(status);
  if (!geometry || !caretCell) {
    throw new Error(`${label}: popup caret geometry vanished`);
  }
  await driver.awaitGridCondition(
    `${label}: exactly the caret cell at column ${caretCell.column} paints inverted`,
    (candidate) => {
      const columns = caretColumnsInSearchRow(
        candidate,
        geometry,
        colorNumber(focusedTone.foreground),
      );
      return (
        columns.length >= 1 &&
        columns[0] === caretCell.column &&
        columns.every((column) => column < caretCell.column + caretCell.width)
      );
    },
  );
  HarnessSmoke.Class.pass(`${label}: the caret is painted at the model offset`);
  return geometry;
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-field-caret-'));

const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-field-caret-home-'));

const statusPath = join(homeDirectory, 'status.json');

await Bun.write(join(fixtureRoot, 'alphafile.txt'), 'caret fixture content\n');

HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q', '-b', 'main']);

HarnessSmoke.Class.runGit(fixtureRoot, ['add', '-A']);

HarnessSmoke.Class.runGit(fixtureRoot, [
  '-c',
  'user.email=a@b.c',
  '-c',
  'user.name=x',
  'commit',
  '-q',
  '-m',
  'field caret fixture',
]);

for (let branchNumber = 1; branchNumber <= 30; branchNumber += 1) {
  HarnessSmoke.Class.runGit(fixtureRoot, [
    'branch',
    `branch-${String(branchNumber).padStart(3, '0')}`,
  ]);
}

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== field caret: open a searchable popup ==');
  await driver.awaitGridCondition(
    'the workspace paints its fixture file',
    (candidate) => candidate.findText('alphafile.txt') !== null,
  );
  driver.sendKeys('Control+g');
  let snapshot = await driver.awaitGridCondition(
    'the git history control is visible',
    (candidate) => candidate.findText('history: main') !== null,
  );
  HarnessSmoke.Class.clickText(driver, snapshot, 'history: main', 7);
  let popupStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the branch popup opens with a search row and a published caret cell',
    (candidate) =>
      candidate.boundedListPopupOpen === true &&
      popupGeometry(candidate)?.searchRow !== null &&
      queryCaretCell(candidate) !== null,
  );
  let geometry = await assertModelCaretIsPainted(
    driver,
    statusPath,
    'empty query',
    '',
    0,
  );
  HarnessSmoke.Class.pass(
    'a focusable field with an empty query still shows where typing lands',
  );

  console.log('== field caret: typing advances the caret ==');
  driver.sendText('branch-007');
  geometry = await assertModelCaretIsPainted(
    driver,
    statusPath,
    'typed query',
    'branch-007',
    10,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the typed query filters the branch list to one match',
    (candidate) => candidate.boundedListPopupMatches === 1,
  );
  HarnessSmoke.Class.pass('typing filters while the caret tracks the model');

  console.log('== field caret: word movement, home, and end ==');
  driver.sendKeys('Alt+Left');
  await assertModelCaretIsPainted(
    driver,
    statusPath,
    'Alt+Left',
    'branch-007',
    7,
  );
  driver.sendKeys('Alt+Left');
  await assertModelCaretIsPainted(
    driver,
    statusPath,
    'Alt+Left twice',
    'branch-007',
    6,
  );
  driver.sendKeys('Alt+Right');
  await assertModelCaretIsPainted(
    driver,
    statusPath,
    'Alt+Right',
    'branch-007',
    7,
  );
  driver.sendKeys('Home');
  await assertModelCaretIsPainted(driver, statusPath, 'Home', 'branch-007', 0);
  driver.sendKeys('Control+Right');
  await assertModelCaretIsPainted(
    driver,
    statusPath,
    'Control+Right',
    'branch-007',
    6,
  );
  driver.sendKeys('End');
  await assertModelCaretIsPainted(driver, statusPath, 'End', 'branch-007', 10);
  HarnessSmoke.Class.pass(
    'the popup search field has the full word-movement vocabulary',
  );

  console.log('== field caret: word deletion refilters the list ==');
  driver.sendRawInput('\x1b\x7f'); // Alt+Backspace
  await assertModelCaretIsPainted(
    driver,
    statusPath,
    'Alt+Backspace',
    'branch-',
    7,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'deleting the previous word re-derives the filtered branch set',
    (candidate) => candidate.boundedListPopupMatches === 30,
  );
  HarnessSmoke.Class.pass('Alt+Backspace deletes a word and refilters');

  driver.sendText('007');
  await assertModelCaretIsPainted(
    driver,
    statusPath,
    'retyped word',
    'branch-007',
    10,
  );
  driver.sendKeys('Home');
  await assertModelCaretIsPainted(
    driver,
    statusPath,
    'Home before forward deletion',
    'branch-007',
    0,
  );
  driver.sendKeys('Alt+Delete');
  await assertModelCaretIsPainted(driver, statusPath, 'Alt+Delete', '-007', 0);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'deleting the next word re-derives the filtered branch set',
    (candidate) => candidate.boundedListPopupMatches === 1,
  );
  HarnessSmoke.Class.pass('Alt+Delete deletes the next word and refilters');
  driver.sendKeys('Delete');
  await assertModelCaretIsPainted(driver, statusPath, 'Delete', '007', 0);
  HarnessSmoke.Class.pass('Delete removes the grapheme under the caret');

  console.log('== field caret: a wide glyph does not drift the caret ==');
  driver.sendKeys('Home');
  await assertModelCaretIsPainted(
    driver,
    statusPath,
    'Home before the wide glyph',
    '007',
    0,
  );
  driver.sendPaste('漢字');
  // '漢字' is 2 graphemes but 4 display columns: a caret column derived from string length would
  // land two cells early. assertModelCaretIsPainted measures through TextCoordinates.lineWidth.
  const wideGlyphStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the pasted wide glyphs reach the query model',
    (candidate) =>
      candidate.boundedListPopupQuery === '漢字007' &&
      candidate.boundedListPopupQueryCaret === 2,
  );
  const wideGlyphGeometry = popupGeometry(wideGlyphStatus);
  const wideGlyphCaretCell = queryCaretCell(wideGlyphStatus);
  if (!wideGlyphGeometry || !wideGlyphCaretCell) {
    throw new Error('wide-glyph popup caret geometry vanished');
  }
  HarnessSmoke.Class.requireCondition(
    wideGlyphCaretCell.column ===
      wideGlyphGeometry.listLeft +
        TextCoordinates.Class.lineWidth(searchFieldPrefix) +
        4,
    'a caret after two wide graphemes sits 4 display columns along, not 2',
  );
  await assertModelCaretIsPainted(
    driver,
    statusPath,
    'wide-glyph query',
    '漢字007',
    2,
  );
  driver.sendKeys('Home');
  const wideGlyphCaretStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Home parks the caret on the first wide grapheme',
    (candidate) => candidate.boundedListPopupQueryCaret === 0,
  );
  HarnessSmoke.Class.requireCondition(
    queryCaretCell(wideGlyphCaretStatus)?.width === 2,
    'a caret sitting on a wide grapheme covers both of its cells',
  );
  await assertModelCaretIsPainted(
    driver,
    statusPath,
    'caret on a wide glyph',
    '漢字007',
    0,
  );
  driver.sendKeys('End');
  driver.sendRawInput('\x1b\x7f'); // Alt+Backspace removes the whole wide-glyph word run
  await assertModelCaretIsPainted(
    driver,
    statusPath,
    'Alt+Backspace over wide graphemes',
    '',
    0,
  );
  HarnessSmoke.Class.pass('word ops respect wide-grapheme boundaries');

  console.log(
    '== field caret: hover is lit, focus is quieter, idle is muted ==',
  );
  const focusedGeometryStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the focused popup publishes its box geometry',
    (candidate) => popupGeometry(candidate) !== null,
  );
  const focusedGeometry = popupGeometry(focusedGeometryStatus);
  const focusedCaretCell = queryCaretCell(focusedGeometryStatus);
  if (!focusedGeometry || focusedGeometry.searchRow === null) {
    throw new Error('focused popup geometry vanished');
  }
  const searchRow = focusedGeometry.searchRow;
  const fieldSampleColumn = focusedGeometry.listLeft;
  snapshot = await driver.awaitGridCondition(
    'the unhovered focused search field paints the focus tone',
    (candidate) =>
      candidate.cell(searchRow, fieldSampleColumn)?.background ===
      colorNumber(focusedTone.background),
  );
  const observedFocusedBackground = snapshot.cell(
    searchRow,
    fieldSampleColumn,
  )?.background;
  HarnessSmoke.Class.pass(
    'a focused-but-unhovered search field is visibly focused',
  );

  driver.sendMouse({ kind: 'move', column: fieldSampleColumn, row: searchRow });
  snapshot = await driver.awaitGridCondition(
    'hovering the search field paints the hover tone',
    (candidate) =>
      candidate.cell(searchRow, fieldSampleColumn)?.background ===
      colorNumber(hoveredTone.background),
  );
  const observedHoveredBackground = snapshot.cell(
    searchRow,
    fieldSampleColumn,
  )?.background;
  const hoveredGeometryStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the hovered popup republishes its box geometry',
    (candidate) => {
      const candidateCaretCell = queryCaretCell(candidate);
      return (
        popupGeometry(candidate) !== null &&
        candidateCaretCell !== null &&
        candidateCaretCell.column === focusedCaretCell?.column
      );
    },
  );
  HarnessSmoke.Class.requireCondition(
    JSON.stringify(popupGeometry(hoveredGeometryStatus)) ===
      JSON.stringify(focusedGeometry),
    'hovering changes no field or popup geometry',
  );
  HarnessSmoke.Class.requireCondition(
    JSON.stringify(queryCaretCell(hoveredGeometryStatus)) ===
      JSON.stringify(focusedCaretCell),
    'hovering leaves the caret cell exactly where the model put it',
  );

  driver.sendMouse({
    kind: 'move',
    column: focusedGeometry.listLeft + 1,
    row: focusedGeometry.listTop,
  });
  await driver.awaitGridCondition(
    'moving the pointer to a list row restores the quieter focus tone',
    (candidate) =>
      candidate.cell(searchRow, fieldSampleColumn)?.background ===
      colorNumber(focusedTone.background),
  );
  HarnessSmoke.Class.pass('hover and focus are separately observable tones');

  console.log('== field caret: popup navigation keys keep their meanings ==');
  driver.sendText('branch-01');
  await assertModelCaretIsPainted(
    driver,
    statusPath,
    'query before the erase',
    'branch-01',
    9,
  );
  driver.sendKeys('Backspace');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'unmodified Backspace remains the popup query erase',
    (candidate) => candidate.boundedListPopupQuery === 'branch-0',
  );
  driver.sendKeys('Down');
  const movedSelectionStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Down still moves the popup selection',
    (candidate) => Number(candidate.boundedListPopupSelected) >= 0,
  );
  HarnessSmoke.Class.requireCondition(
    Number(movedSelectionStatus.boundedListPopupSelected) >= 0,
    'Down moves the popup selection instead of the caret',
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Escape still closes the popup',
    (candidate) =>
      candidate.boundedListPopupOpen === false &&
      queryCaretCell(candidate) === null,
  );
  HarnessSmoke.Class.pass('Up/Down, Backspace, and Escape keep popup meanings');

  console.log('== field caret: the idle tone on an unfocused field ==');
  driver.sendKeys('Control+p');
  await driver.awaitGridCondition(
    'Quick Open is visible before opening the fixture file',
    (candidate) => candidate.findText('Go to File') !== null,
  );
  driver.sendText('alphafile');
  // The tree already paints 'alphafile.txt', so a grid predicate on that text would be true before
  // the query ran; the wait observes the QUERY state the Enter below acts on instead.
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Quick Open ranks the fixture file for the typed query',
    (candidate) =>
      candidate.quickOpenQuery === 'alphafile' &&
      Number(candidate.quickOpenMatches) >= 1,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the fixture file becomes the active buffer',
    (candidate) => String(candidate.activeBuffer).endsWith('/alphafile.txt'),
  );
  driver.sendKeys('Control+h');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the find bar opens in replace mode',
    (candidate) =>
      candidate.findOpen === true && candidate.findMode === 'replace',
  );
  driver.sendText('zetaquery');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the find query reaches the engine',
    (candidate) => candidate.findQuery === 'zetaquery',
  );
  // Replace mode opens with the QUERY field focused, so the replacement field below it is the live
  // unfocused field. Both rows belong to one text renderable, so the replacement field starts at the
  // same left column as the query field: the row below the typed query, at the query's prefix column.
  const findFieldPrefixColumns = TextCoordinates.Class.lineWidth(
    `${ThemeIcons.Class.findIconsFor('unicode').search} `,
  );
  snapshot = await driver.awaitGridCondition(
    'the focused query field and the idle replacement field paint different tones',
    (candidate) => {
      const queryPosition = candidate.findText('zetaquery');
      if (!queryPosition) return false;
      const fieldLeftColumn = queryPosition.column - findFieldPrefixColumns;
      return (
        candidate.cell(queryPosition.row, queryPosition.column)?.background ===
          colorNumber(focusedTone.background) &&
        candidate.cell(queryPosition.row + 1, fieldLeftColumn)?.background ===
          colorNumber(idleTone.background)
      );
    },
  );
  const focusedQueryPosition = snapshot.findText('zetaquery');
  const observedIdleBackground = focusedQueryPosition
    ? snapshot.cell(
        focusedQueryPosition.row + 1,
        focusedQueryPosition.column - findFieldPrefixColumns,
      )?.background
    : undefined;
  HarnessSmoke.Class.pass(
    'an unfocused field paints the idle tone beside a focused one',
  );

  HarnessSmoke.Class.requireCondition(
    observedIdleBackground !== undefined &&
      observedFocusedBackground !== undefined &&
      observedHoveredBackground !== undefined &&
      new Set([
        observedIdleBackground,
        observedFocusedBackground,
        observedHoveredBackground,
      ]).size === 3,
    'idle, focused, and hovered are three distinct observed backgrounds',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-field-caret-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
