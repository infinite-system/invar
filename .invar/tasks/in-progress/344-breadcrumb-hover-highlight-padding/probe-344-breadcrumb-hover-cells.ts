#!/usr/bin/env bun
// Probe #344 (breadcrumb hover highlight with one-cell side padding).
//
// What it finds out: where the breadcrumb row starts, and which cells carry a
// highlight background while the mouse rests on each folder segment.
//
// Run with:
//   COLORTERM=truecolor bun .invar/tasks/in-progress/344-breadcrumb-hover-highlight-padding/probe-344-breadcrumb-hover-cells.ts
//
// How to read the output: for every hover position it prints two lines. The
// first is the breadcrumb row text from the editor column left edge. The
// second marks every cell whose background is the theme cursor-line token
// with `#`, and every other cell with `.`. A correct highlight covers the
// segment text plus exactly one cell on each side. The header line reports
// the column of the first breadcrumb glyph, which proves the leading pad.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { ThemePalettes } from '../../../../src/modules/theme/ThemePalettes';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import type { HarnessSnapshot } from '../../../../scripts/harness/HarnessSnapshot';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

function packedColor(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

const highlightColor = packedColor(ThemePalettes.Class.DARK.cursorLine);

function printBreadcrumbRow(
  snapshot: HarnessSnapshot.Model,
  breadcrumbRow: number,
  label: string,
): void {
  const cells = snapshot.rowCells(breadcrumbRow).slice(0, 110);
  const text = cells.map((cell) => cell.characters || ' ').join('');
  const marks = cells
    .map((cell) =>
      cell.isBackgroundRgb && cell.background === highlightColor ? '#' : '.',
    )
    .join('');
  console.log(`${label}`);
  console.log(`  text |${text}|`);
  console.log(`  high |${marks}|`);
}

const fixtureParent = mkdtempSync(join(tmpdir(), 'probe-344-breadcrumb-'));
const fixtureRoot = join(fixtureParent, 'invar');
const homeDirectory = mkdtempSync(join(tmpdir(), 'probe-344-home-'));
mkdirSync(join(fixtureRoot, 'subfolder', 'sub2'), { recursive: true });
writeFileSync(
  join(fixtureRoot, 'subfolder', 'sub2', 'leaf.ts'),
  'export const leaf = 1;\n',
);
const workspaceLabel = basename(fixtureRoot);
const statusPath = join(homeDirectory, 'status.json');

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 160,
  rows: 40,
  homeDirectory,
  environment: { COLORTERM: 'truecolor', TUI_STATUS_PATH: statusPath },
});

try {
  await driver.awaitGridCondition(
    'probe workspace paints',
    (snapshot) => snapshot.findText('subfolder') !== null,
  );
  driver.sendKeys('Control+p');
  await driver.awaitGridCondition(
    'quick open appears',
    (snapshot) => snapshot.findText('Go to File') !== null,
  );
  driver.sendText('leaf.ts');
  await driver.awaitScreenChange();
  driver.sendKeys('Enter');
  const restingSnapshot = await driver.awaitGridCondition(
    'breadcrumb paints the nested path',
    (snapshot) => snapshot.findText(`${workspaceLabel} › subfolder`) !== null,
    60_000,
  );
  const breadcrumbPosition = restingSnapshot.findText(
    `${workspaceLabel} › subfolder`,
  );
  if (!breadcrumbPosition) throw new Error('breadcrumb vanished');
  const breadcrumbRow = breadcrumbPosition.row;
  const status = HarnessSmoke.Class.readStatus(statusPath);
  const editorLeft = Number(
    (status.layoutSlots as { editorCenter?: { left?: number } } | undefined)
      ?.editorCenter?.left,
  );
  console.log(
    `breadcrumb row=${breadcrumbRow} editorColumnLeft=${editorLeft} ` +
      `firstGlyphColumn=${breadcrumbPosition.column} ` +
      `leadingPadColumns=${breadcrumbPosition.column - editorLeft}`,
  );
  printBreadcrumbRow(restingSnapshot, breadcrumbRow, 'no hover');

  const segmentLabels = [workspaceLabel, 'subfolder', 'sub2', 'leaf.ts'];
  for (const segmentLabel of segmentLabels) {
    const rowText = restingSnapshot.rowText(breadcrumbRow);
    const segmentStart = rowText.indexOf(segmentLabel, editorLeft);
    if (segmentStart < 0) {
      console.log(`segment not found on the breadcrumb row: ${segmentLabel}`);
      continue;
    }
    const hoverColumn = segmentStart + Math.floor(segmentLabel.length / 2);
    driver.sendMouse({
      kind: 'move',
      column: hoverColumn,
      row: breadcrumbRow,
      button: 'none',
    });
    const hoveredSnapshot = await driver.awaitSnapshot((candidate) =>
      candidate
        .rowCells(breadcrumbRow)
        .some(
          (cell) => cell.isBackgroundRgb && cell.background === highlightColor,
        ),
    );
    printBreadcrumbRow(
      hoveredSnapshot,
      breadcrumbRow,
      `hover "${segmentLabel}" textSpan=[${segmentStart},${segmentStart + segmentLabel.length})`,
    );
    driver.sendMouse({
      kind: 'move',
      column: 5,
      row: breadcrumbRow + 6,
      button: 'none',
    });
    await driver.awaitSnapshot(
      (candidate) =>
        !candidate
          .rowCells(breadcrumbRow)
          .some(
            (cell) =>
              cell.isBackgroundRgb && cell.background === highlightColor,
          ),
    );
  }
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureParent);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
