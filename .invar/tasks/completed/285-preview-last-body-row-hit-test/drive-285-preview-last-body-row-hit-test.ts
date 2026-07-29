#!/usr/bin/env bun
// Drives references on the final two preview body rows and the closing border below them.
//
// Run from the worktree root:
// bun .invar/tasks/in-progress/285-preview-last-body-row-hit-test/drive-285-preview-last-body-row-hit-test.ts
//
// PASS means the row above and the final body row both publish the target path. It also means the
// closing border clears that path. A timeout on the final body row exposes the dead-row defect.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import type { HarnessSnapshot } from '../../../../scripts/harness/HarnessSnapshot';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

function previewBounds(snapshot: HarnessSnapshot.Model): {
  leftColumn: number;
  rightColumn: number;
  firstBodyRow: number;
  lastBodyRow: number;
  closingBorderRow: number;
} {
  const opening = snapshot.findText('╭─Preview');
  if (!opening)
    throw new Error(`FAIL preview border missing\n${snapshot.text()}`);
  const openingRowText = snapshot.rowText(opening.row);
  const sourceOpeningColumn = openingRowText.indexOf('╭', opening.column + 1);
  const rightColumn = openingRowText.lastIndexOf('╮', sourceOpeningColumn);
  for (let row = opening.row + 1; row < snapshot.rows; row++) {
    if (snapshot.cell(row, opening.column)?.characters !== '╰') continue;
    return {
      leftColumn: opening.column,
      rightColumn,
      firstBodyRow: opening.row + 1,
      lastBodyRow: row - 1,
      closingBorderRow: row,
    };
  }
  throw new Error(`FAIL preview closing border missing\n${snapshot.text()}`);
}

function referenceColumn(
  snapshot: HarnessSnapshot.Model,
  row: number,
  leftColumn: number,
  rightColumn: number,
): number {
  for (let column = leftColumn + 1; column < rightColumn; column++) {
    if (snapshot.cell(row, column)?.characters === 'R') return column;
  }
  throw new Error(
    `FAIL reference label missing on row ${String(row)}\n${snapshot.text()}`,
  );
}

const repositoryRoot = resolve('.');
const fixtureRoot = mkdtempSync(join(tmpdir(), 'drive-285-fixture-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'drive-285-home-'));
const statusPath = join(homeDirectory, 'status.json');
const referenceParagraphs = Array.from(
  { length: 100 },
  (_unusedValue, rowIndex) =>
    `- [Reference ${String(rowIndex).padStart(3, '0')}](target.ts)`,
);

await Bun.write(
  join(fixtureRoot, 'README.md'),
  `${referenceParagraphs.join('\n')}\n`,
);
await Bun.write(
  join(fixtureRoot, 'target.ts'),
  'export const target = true;\n',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  repositoryRoot,
  columns: 140,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    LANG: 'C.UTF-8',
    NERD_FONT: '0',
  },
});

try {
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('README.md') !== null,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'README opens with a settled Markdown preview',
    (status) =>
      String(status.activeBuffer).endsWith('/README.md') &&
      status.markdownPreviewOpen === true &&
      status.markdownParsing === false,
  );
  const snapshot = await driver.awaitGridCondition(
    'references paint through the final preview body row',
    (candidate) => {
      const opening = candidate.findText('╭─Preview');
      if (!opening) return false;
      try {
        const bounds = previewBounds(candidate);
        return (
          referenceColumn(
            candidate,
            bounds.lastBodyRow,
            bounds.leftColumn,
            bounds.rightColumn,
          ) > bounds.leftColumn
        );
      } catch {
        return false;
      }
    },
  );
  const bounds = previewBounds(snapshot);
  const targetSuffix = '/target.ts';
  const rowAboveColumn = referenceColumn(
    snapshot,
    bounds.lastBodyRow - 1,
    bounds.leftColumn,
    bounds.rightColumn,
  );
  driver.sendMouse({
    kind: 'move',
    column: rowAboveColumn,
    row: bounds.lastBodyRow - 1,
    button: 'none',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the row above the final body row publishes its reference',
    (status) => String(status.markdownHoveredReference).endsWith(targetSuffix),
  );
  console.log(
    `PASS row ${String(bounds.lastBodyRow - 1)} publishes ${targetSuffix}`,
  );

  driver.sendMouse({
    kind: 'move',
    column: bounds.leftColumn + 2,
    row: bounds.closingBorderRow,
    button: 'none',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the closing border below the body clears the reference',
    (status) => status.markdownHoveredReference === null,
  );
  console.log(
    `PASS row ${String(bounds.closingBorderRow)} is outside the body and publishes null`,
  );

  const lastBodyColumn = referenceColumn(
    driver.snapshot(),
    bounds.lastBodyRow,
    bounds.leftColumn,
    bounds.rightColumn,
  );
  driver.sendMouse({
    kind: 'move',
    column: lastBodyColumn,
    row: bounds.lastBodyRow,
    button: 'none',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the final preview body row publishes its reference',
    (status) => String(status.markdownHoveredReference).endsWith(targetSuffix),
    2_000,
  );
  console.log(
    `PASS row ${String(bounds.lastBodyRow)} publishes ${targetSuffix}`,
  );
  console.log('drive-285: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
