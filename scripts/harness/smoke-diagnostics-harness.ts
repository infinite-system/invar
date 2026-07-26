#!/usr/bin/env bun
// Byte-level diagnostics parity port. Both supported real TypeScript servers feed the same cached
// decoration snapshot. The real terminal proves diagnostics in the body + overview, version control
// alone in the gutter, and a far-off-screen diagnostic at its proportional overview position.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

const errorColor = 0xdb4b4b;

function diagnosticRangeCellCount(
  snapshot: HarnessSnapshot.Model,
  sourceMarker: string,
): number {
  const errorLinePosition = snapshot.findText(sourceMarker);
  if (!errorLinePosition) return 0;
  let rangeCellCount = 0;
  for (const cell of snapshot.rowCells(errorLinePosition.row)) {
    if (
      cell.isForegroundRgb &&
      cell.foreground === errorColor &&
      cell.isUnderline &&
      cell.characters.trim() &&
      cell.characters !== '▎' &&
      cell.characters !== '▁' &&
      cell.characters !== '•' &&
      cell.characters !== '.'
    )
      rangeCellCount++;
  }
  return rangeCellCount;
}

function gutterCharacter(
  snapshot: HarnessSnapshot.Model,
  sourceMarker: string,
): string | null {
  const sourcePosition = snapshot.findText(sourceMarker);
  if (!sourcePosition || sourcePosition.column === 0) return null;
  const rowCells = snapshot.rowCells(sourcePosition.row);
  for (let column = sourcePosition.column - 1; column >= 0; column -= 1) {
    const characters = rowCells[column]?.characters;
    if (characters === '▎' || characters === '▁') return characters;
  }
  return null;
}

function overviewErrorCells(
  snapshot: HarnessSnapshot.Model,
): Array<{ row: number; column: number }> {
  const cells: Array<{ row: number; column: number }> = [];
  for (let row = 0; row < snapshot.rows; row++) {
    for (const cell of snapshot.rowCells(row)) {
      if (
        (cell.characters === '•' || cell.characters === '.') &&
        cell.isForegroundRgb &&
        cell.foreground === errorColor
      ) {
        cells.push({ row, column: cell.column });
      }
    }
  }
  return cells;
}

function visibleFarLinesHaveNoGutterMark(
  snapshot: HarnessSnapshot.Model,
): boolean {
  let visibleFarLineCount = 0;
  for (let row = 0; row < snapshot.rows; row++) {
    const rowText = snapshot.rowText(row);
    const sourceColumn = rowText.indexOf('const farLine');
    if (sourceColumn < 1) continue;
    visibleFarLineCount += 1;
    const character = snapshot.cell(row, sourceColumn - 1)?.characters;
    if (character === '▎' || character === '▁') return false;
  }
  return visibleFarLineCount > 0;
}

function diagnosticCardVisible(snapshot: HarnessSnapshot.Model): boolean {
  return snapshot
    .textRows()
    .some(
      (rowText) =>
        rowText.includes('│') &&
        (rowText.toLowerCase().includes('error:') ||
          rowText.includes('not assignable')),
    );
}

async function runServerCase(
  repositoryRoot: string,
  serverName: 'tsgo' | 'typescript-language-server',
  serverBinary: string,
): Promise<void> {
  if (!Bun.file(serverBinary).size) {
    console.log(
      `SKIP  ${serverName} not installed (${serverBinary}) — diagnostics case skipped`,
    );
    return;
  }
  const fixtureRoot = mkdtempSync(
    join(tmpdir(), `tui-diagnostics-${serverName}-harness-`),
  );
  const homeDirectory = mkdtempSync(
    join(tmpdir(), `tui-diagnostics-${serverName}-home-`),
  );
  const statusPath = join(homeDirectory, 'status.json');
  mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
  await Bun.write(
    join(homeDirectory, '.config', 'invar', 'settings.json'),
    JSON.stringify({ typescriptServer: serverName }),
  );
  symlinkSync(
    join(repositoryRoot, 'node_modules'),
    join(fixtureRoot, 'node_modules'),
  );
  await Bun.write(
    join(fixtureRoot, 'tsconfig.json'),
    '{ "compilerOptions": { "target": "ES2022", "module": "ESNext", ' +
      '"moduleResolution": "bundler", "strict": true }, "include": ["*.ts"] }\n',
  );
  const combinedHeadLines = [
    'const okValue: number = 42;',
    'const removedValue: number = 7;',
    'const badValue: number = "not a number";',
    ...Array.from(
      { length: 117 },
      (_unusedValue, lineIndex) =>
        `const combinedLine${String(lineIndex).padStart(3, '0')} = ${lineIndex};`,
    ),
  ];
  const combinedWorkingLines = combinedHeadLines.filter(
    (lineText) => !lineText.includes('removedValue'),
  );
  const farLines = Array.from({ length: 1_000 }, (_unusedValue, lineIndex) =>
    lineIndex === 998
      ? 'const farBadValue: number = "far below";'
      : `const farLine${String(lineIndex).padStart(4, '0')} = ${lineIndex};`,
  );
  await Bun.write(
    join(fixtureRoot, 'e.ts'),
    `${combinedHeadLines.join('\n')}\n`,
  );
  await Bun.write(join(fixtureRoot, 'far.ts'), `${farLines.join('\n')}\n`);
  HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);
  HarnessSmoke.Class.runGit(fixtureRoot, [
    'add',
    'e.ts',
    'far.ts',
    'tsconfig.json',
  ]);
  HarnessSmoke.Class.runGit(fixtureRoot, [
    '-c',
    'user.email=diagnostics@example.test',
    '-c',
    'user.name=Diagnostics Smoke',
    'commit',
    '-qm',
    'fixture',
  ]);
  await Bun.write(
    join(fixtureRoot, 'e.ts'),
    `${combinedWorkingLines.join('\n')}\n`,
  );
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    repositoryRoot,
    columns: 120,
    rows: 36,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      COLORTERM: 'truecolor',
    },
  });

  try {
    console.log(`== harness diagnostics: ${serverName} ==`);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'status condition: status.ready === true',
      (status) => status.ready === true,
      20_000,
    );
    const treeSnapshot = await driver.awaitSnapshot(
      (candidate) => candidate.findText('e.ts') !== null,
      15_000,
    );
    HarnessSmoke.Class.clickText(driver, treeSnapshot, 'e.ts');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      "status condition: String(status.activeBuffer).endsWith('/e.ts')",
      (status) => String(status.activeBuffer).endsWith('/e.ts'),
    );
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the diagnostics provider publishes at least one diagnostic',
      (status) => Number(status.diagnosticsCount) > 0,
      55_000,
    );
    const snapshot = await driver.awaitSnapshot(
      (candidate) =>
        gutterCharacter(candidate, 'badValue') === '▎' &&
        diagnosticRangeCellCount(candidate, 'badValue') >= 1 &&
        overviewErrorCells(candidate).length >= 1,
      55_000,
    );
    HarnessSmoke.Class.requireCondition(
      gutterCharacter(snapshot, 'badValue') === '▎',
      `[${serverName}] deletion uses the diff-only ▎ gutter shape`,
    );
    HarnessSmoke.Class.requireCondition(
      gutterCharacter(snapshot, 'badValue') !== '▁',
      `[${serverName}] deletion never uses the ambiguous underline shape`,
    );
    HarnessSmoke.Class.requireCondition(
      diagnosticRangeCellCount(snapshot, 'badValue') >= 1,
      `[${serverName}] error remains a red in-body underline`,
    );
    HarnessSmoke.Class.requireCondition(
      overviewErrorCells(snapshot).length >= 1,
      `[${serverName}] error also paints a red overview pip`,
    );

    const deletionPlacementPosition = snapshot.findText('badValue');
    if (!deletionPlacementPosition)
      throw new Error('Deletion placement marker disappeared');
    const deletionGutterColumn = snapshot
      .rowText(deletionPlacementPosition.row)
      .lastIndexOf('▎', deletionPlacementPosition.column);
    if (deletionGutterColumn < 0)
      throw new Error('Deletion gutter marker disappeared');
    driver.sendMouse({
      kind: 'move',
      column: deletionGutterColumn,
      row: deletionPlacementPosition.row,
      button: 'none',
    });
    await driver.awaitSnapshot(
      (candidate) =>
        candidate
          .textRows()
          .some((rowText) => rowText.includes('1 line deleted above')),
      10_000,
    );
    HarnessSmoke.Class.pass(
      `[${serverName}] deletion gutter hover names the mark`,
    );

    driver.sendKeys('Control+p');
    await driver.awaitGridCondition(
      'Go to File opens for the far-diagnostic fixture',
      (candidate) => candidate.findText('Go to File') !== null,
    );
    driver.sendText('far.ts');
    driver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      "status condition: String(status.activeBuffer).endsWith('/far.ts')",
      (status) => String(status.activeBuffer).endsWith('/far.ts'),
    );
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the far document publishes at least one diagnostic',
      (status) => Number(status.diagnosticsCount) > 0,
      55_000,
    );
    const farSnapshot = await driver.awaitSnapshot(
      (candidate) =>
        candidate.findText('farBadValue') === null &&
        visibleFarLinesHaveNoGutterMark(candidate) &&
        overviewErrorCells(candidate).some(
          (cell) => cell.row > candidate.rows * 0.65,
        ),
      55_000,
    );
    HarnessSmoke.Class.requireCondition(
      farSnapshot.findText('farBadValue') === null,
      `[${serverName}] the only error is below the viewport`,
    );
    HarnessSmoke.Class.requireCondition(
      visibleFarLinesHaveNoGutterMark(farSnapshot),
      `[${serverName}] diagnostic-only visible lines have no gutter mark`,
    );
    HarnessSmoke.Class.requireCondition(
      overviewErrorCells(farSnapshot).some(
        (cell) => cell.row > farSnapshot.rows * 0.65,
      ),
      `[${serverName}] line-999 error paints near the overview bottom`,
    );

    driver.sendKeys('Control+End');
    const farErrorSnapshot = await driver.awaitSnapshot(
      (candidate) =>
        candidate.findText('farBadValue') !== null &&
        diagnosticRangeCellCount(candidate, 'farBadValue') >= 1,
      20_000,
    );
    HarnessSmoke.Class.requireCondition(
      !['▎', '▁'].includes(
        gutterCharacter(farErrorSnapshot, 'farBadValue') ?? '',
      ),
      `[${serverName}] a visible diagnostic still paints no gutter glyph`,
    );

    driver.sendMouse({
      kind: 'move',
      column: farErrorSnapshot.findText('farBadValue')?.column ?? 0,
      row: farErrorSnapshot.findText('farBadValue')?.row ?? 0,
      button: 'none',
    });
    await driver.awaitSnapshot(diagnosticCardVisible, 30_000);
    HarnessSmoke.Class.pass(
      `[${serverName}] hover card surfaces the diagnostic message`,
    );
    driver.sendKeys('Control+q');
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

const repositoryRoot = process.cwd();
if (
  !Bun.file(join(repositoryRoot, 'node_modules', 'typescript', 'package.json'))
    .size
) {
  console.log('SKIP  typescript not installed — diagnostics smoke skipped');
  process.exit(0);
}

await runServerCase(
  repositoryRoot,
  'tsgo',
  join(repositoryRoot, 'node_modules', '.bin', 'tsgo'),
);
await runServerCase(
  repositoryRoot,
  'typescript-language-server',
  join(repositoryRoot, 'node_modules', '.bin', 'typescript-language-server'),
);
console.log('smoke-diagnostics-harness: ALL-PASS');
