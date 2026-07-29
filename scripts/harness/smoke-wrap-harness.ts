#!/usr/bin/env bun
// Byte-level wrap canary: the real app runs on the PTY slave, and the production terminal emulator
// supplies both the wrapped text rows and native cursor coordinates.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)
// invariant: Wrapped surfaces share one break generator (project.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PtyTestDriver } from './PtyTestDriver';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';

function pass(label: string): void {
  console.log(`  PASS  ${label}`);
}

function requireCondition(
  condition: unknown,
  label: string,
): asserts condition {
  if (!condition) throw new Error(`FAIL ${label}`);
  pass(label);
}

function linePositions(snapshot: HarnessSnapshot.Model): {
  firstFixtureLineRow: number;
  shortLineRow: number;
} | null {
  const firstFixtureLinePosition = snapshot.findText('// prosealpha');
  const shortLinePosition = snapshot.findText('short tail line');
  if (!firstFixtureLinePosition || !shortLinePosition) return null;
  return {
    firstFixtureLineRow: firstFixtureLinePosition.row,
    shortLineRow: shortLinePosition.row,
  };
}

function gutterRow(
  snapshot: HarnessSnapshot.Model,
  lineNumber: number,
): number {
  const marker = `${String(lineNumber).padStart(3, ' ')} `;
  for (let row = 0; row < snapshot.rows; row++) {
    if (snapshot.rowText(row).includes(marker)) return row;
  }
  return -1;
}

// The wrapped line lives in the CODE BODY's cells only. The editor's vertical scrollbar owns the
// columns just inside the pane's right border, and — being painted as a whole-cell BACKGROUND fill —
// its cells never carry the code body's background, which is what distinguishes them here. Reading up
// to the border instead swept the bar in: it read as blank while the track was empty, so trimEnd()
// erased it, and the moment the overview ruler painted a semantic pip on the track's trailing cell the
// `last visual row reaches <token>` claim started reading the PIP as the row's last character. The
// claim is unchanged; this only stops it reading a neighbouring widget. Walking in from the border
// (rather than subtracting a constant) keeps it correct when scrollbarThickness is not 1, and when the
// bar is hidden the first column already carries the body background so the window is the full width.
function codeBodyEndColumnExclusive(
  snapshot: HarnessSnapshot.Model,
  bodyStartRow: number,
  bodyEndRowExclusive: number,
  codeBodyBackground: number,
): number {
  let endColumnExclusive = snapshot.columns - 1;
  while (endColumnExclusive > 0) {
    const candidateColumn = endColumnExclusive - 1;
    let everyBodyRowIsBarBackground = true;
    for (let row = bodyStartRow; row < bodyEndRowExclusive; row += 1) {
      const cell = snapshot.cell(row, candidateColumn);
      if (!cell || cell.background === codeBodyBackground) {
        everyBodyRowIsBarBackground = false;
        break;
      }
    }
    if (!everyBodyRowIsBarBackground) break;
    endColumnExclusive = candidateColumn;
  }
  return endColumnExclusive;
}

function wrappedRowsForFixtureLine(
  snapshot: HarnessSnapshot.Model,
  lineStartMarker: string,
  followingLineStartMarker: string,
): string[] | null {
  const lineStartPosition = snapshot.findText(lineStartMarker);
  const followingLineRow =
    snapshot.findText(followingLineStartMarker)?.row ?? -1;
  if (lineStartPosition === null || followingLineRow <= lineStartPosition.row) {
    return null;
  }
  const codeBodyBackground = snapshot.cell(
    lineStartPosition.row,
    lineStartPosition.column,
  )?.background;
  if (codeBodyBackground === undefined) return null;
  const endColumnExclusive = codeBodyEndColumnExclusive(
    snapshot,
    lineStartPosition.row,
    followingLineRow,
    codeBodyBackground,
  );
  const wrappedRows: string[] = [];
  for (let row = lineStartPosition.row; row < followingLineRow; row += 1) {
    wrappedRows.push(
      snapshot
        .rowText(row)
        .slice(lineStartPosition.column, endColumnExclusive)
        .trimEnd(),
    );
  }
  return wrappedRows;
}

function assertFixtureLineWrap(
  snapshot: HarnessSnapshot.Model,
  lineStartMarker: string,
  followingLineStartMarker: string,
  indivisibleFragments: readonly string[],
  trueLineEnd: string,
  label: string,
): void {
  const wrappedRows = wrappedRowsForFixtureLine(
    snapshot,
    lineStartMarker,
    followingLineStartMarker,
  );
  requireCondition(
    wrappedRows !== null && wrappedRows.length > 1,
    `${label} control is wider than the observed editor viewport`,
  );
  if (wrappedRows === null) throw new Error(`${label} rows are not visible`);
  for (const fragment of indivisibleFragments) {
    requireCondition(
      wrappedRows.some((rowText) => rowText.includes(fragment)),
      `${label} keeps ${fragment} whole in observed cells`,
    );
  }
  requireCondition(
    wrappedRows[wrappedRows.length - 1]?.endsWith(trueLineEnd) === true,
    `${label} last visual row reaches ${trueLineEnd}`,
  );
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-wrap-harness-'));

const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-wrap-harness-home-'));

const proseWords = [
  'prosealpha',
  'prosebravo',
  'prosecharlie',
  'prosedelta',
  'proseecho',
  'prosefoxtrot',
  'prosegolf',
  'prosehotel',
  'proseindia',
  'prosejuliet',
  'proseterminalend',
] as const;

const pathComponents = [
  'repositoryalpha',
  'repositorybravo',
  'repositorycharlie',
  'repositorydelta',
  'repositoryecho',
  'repositoryfoxtrot',
  'pathterminalend',
] as const;

const camelCaseComponents = [
  'calculate',
  'Integrated',
  'Terminal',
  'Workspace',
  'Navigation',
  'History',
  'Boundary',
  'Without',
  'Splitting',
  'Readable',
  'Identifier',
  'Camel',
  'Terminal',
  'Endmarker',
] as const;

const operatorOperands = [
  'alphaoperandvalue',
  'bravooperandvalue',
  'charlieoperandvalue',
  'deltaoperandvalue',
  'operatorterminalend',
] as const;

const operatorRuns = ['&&', '===', '||', '=>'] as const;

const proseLine = `// ${proseWords.join(' ')}`;

const pathLine = pathComponents
  .map((pathComponent, pathComponentIndex) =>
    pathComponentIndex === 0
      ? pathComponent
      : `${pathComponentIndex % 2 === 0 ? '.' : '/'}${pathComponent}`,
  )
  .join('');

const camelCaseLine = camelCaseComponents.join('');

const operatorLine = operatorOperands
  .map((operatorOperand, operatorOperandIndex) =>
    operatorOperandIndex === 0
      ? operatorOperand
      : `${operatorRuns[operatorOperandIndex - 1]}${operatorOperand}`,
  )
  .join('');

const fillerLines = Array.from(
  { length: 60 },
  (_unused, fillerIndex) =>
    `filler body line ${String(fillerIndex).padStart(3, '0')}`,
);

await Bun.write(
  join(fixtureRoot, 'long.txt'),
  [
    proseLine,
    pathLine,
    camelCaseLine,
    operatorLine,
    'short tail line',
    ...fillerLines,
  ].join('\n') + '\n',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
});

try {
  console.log('== harness wrap: boot and open the long line ==');
  await driver.awaitGridCondition(
    'the real file tree shows the wrap fixture',
    (snapshot) => snapshot.findText('long.txt') !== null,
    15_000,
  );
  pass('real app booted through OpenPty');
  driver.sendKeys('Enter');
  await driver.awaitGridCondition(
    'the editor opens all four wrap fixture lines without wrapping',
    (snapshot) => {
      const positions = linePositions(snapshot);
      return (
        positions !== null &&
        positions.shortLineRow === positions.firstFixtureLineRow + 4
      );
    },
  );
  pass('wrap-off renders one logical line per screen row');

  console.log('== harness wrap: palette enables wrapping ==');
  driver.sendKeys('F1');
  await driver.awaitGridCondition(
    'the command palette becomes visible',
    (snapshot) => snapshot.text().toLowerCase().includes('command palette'),
  );
  driver.sendText('word wrap');
  await driver.awaitGridCondition(
    'the word wrap query and matching command are both visible',
    (snapshot) => snapshot.text().toLowerCase().split('word wrap').length >= 3,
  );
  driver.sendKeys('Enter');
  await driver.awaitGridCondition(
    'word wrap changes the four logical fixture lines into more visual rows',
    (snapshot) => {
      const positions = linePositions(snapshot);
      return (
        positions !== null &&
        positions.shortLineRow > positions.firstFixtureLineRow + 4
      );
    },
  );
  const wrapOnSnapshot = await driver.awaitGridCondition(
    'all code-aware fixture lines expose their true terminal suffixes',
    (snapshot) => {
      const positions = linePositions(snapshot);
      return (
        positions !== null &&
        positions.shortLineRow > positions.firstFixtureLineRow + 4 &&
        snapshot.findText('proseterminalend') !== null &&
        snapshot.findText('pathterminalend') !== null &&
        snapshot.findText('Endmarker') !== null &&
        snapshot.findText('operatorterminalend') !== null
      );
    },
  );
  const wrapOnPositions = linePositions(wrapOnSnapshot);
  requireCondition(
    wrapOnPositions !== null &&
      wrapOnPositions.shortLineRow - wrapOnPositions.firstFixtureLineRow >= 8,
    'long line occupies multiple terminal rows',
  );

  console.log(
    '== harness wrap: code-aware boundaries preserve readable tokens ==',
  );
  assertFixtureLineWrap(
    wrapOnSnapshot,
    '// prosealpha',
    'repositoryalpha',
    proseWords,
    'proseterminalend',
    'prose comment',
  );
  assertFixtureLineWrap(
    wrapOnSnapshot,
    'repositoryalpha',
    'calculate',
    pathComponents,
    'pathterminalend',
    'dotted and slashed path',
  );
  assertFixtureLineWrap(
    wrapOnSnapshot,
    'calculate',
    'alphaoperandvalue',
    camelCaseComponents,
    'Endmarker',
    'camelCase identifier',
  );
  assertFixtureLineWrap(
    wrapOnSnapshot,
    'alphaoperandvalue',
    'short tail line',
    [...operatorOperands, ...operatorRuns],
    'operatorterminalend',
    'operator expression',
  );

  console.log('== harness wrap: native caret aligns on a continuation row ==');
  requireCondition(
    wrapOnPositions !== null,
    'wrapped line positions are visible',
  );
  const continuationRow = wrapOnPositions.firstFixtureLineRow + 1;
  driver.sendMouse({
    kind: 'press',
    column: 60,
    row: continuationRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: 60,
    row: continuationRow,
    button: 'left',
  });
  await driver.awaitScreenChange();
  driver.sendText('X');
  const caretSnapshot = await driver.awaitGridCondition(
    'the typed glyph appears immediately before the native caret',
    (snapshot) => {
      const precedingCell = snapshot.cell(
        snapshot.cursorRow,
        snapshot.cursorColumn - 1,
      );
      return precedingCell?.characters === 'X';
    },
  );
  const insertedGlyphPosition = {
    row: caretSnapshot.cursorRow,
    column: caretSnapshot.cursorColumn - 1,
  };
  pass('typed glyph appears in the byte-level grid');
  requireCondition(
    caretSnapshot.cursorColumn === insertedGlyphPosition.column + 1 &&
      caretSnapshot.cursorRow === insertedGlyphPosition.row,
    `caret matches glyph on wrapped row (${caretSnapshot.cursorColumn},${caretSnapshot.cursorRow})`,
  );

  console.log('== harness wrap: Alt+Z restores unwrapped rows ==');
  driver.sendKeys('Alt+z');
  await driver.awaitGridCondition(
    'wrap-off restores consecutive logical gutter rows',
    (snapshot) => {
      const firstLineRow = gutterRow(snapshot, 1);
      const secondLineRow = gutterRow(snapshot, 2);
      return firstLineRow >= 0 && secondLineRow === firstLineRow + 1;
    },
  );
  pass('wrap-off round trip restored consecutive logical rows');
  driver.sendKeys('Control+q');
  console.log('smoke-wrap-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
