#!/usr/bin/env bun
// Drive the breadcrumb at 10 and 100,000 lines. Run with:
// `COLORTERM=truecolor bun scripts/harness/smoke-breadcrumb-harness.ts`.
// PASS means the breadcrumb has no history controls, its separator uses the active theme's readable
// secondary-text token instead of the border token, a live theme switch repaints that cell, and
// hovering a segment paints the theme hover background over the segment text plus exactly one cell
// on each side while nothing on the row moves.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Appearance comes only from theme data (src/modules/theme/theme.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  ThemePalettes,
  type Palette,
} from '../../src/modules/theme/ThemePalettes';
import { HarnessSmoke } from './HarnessSmoke';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

// The promise this smoke gates, written here as a LITERAL on purpose: hovering a breadcrumb
// segment paints one cell beyond the text on each side, and the row always carries the first
// segment's left pad so hover never reflows the text. Reading the renderer's own constant instead
// would only prove the code agrees with itself.
const HOVER_PAD_COLUMNS = 1;

function packedColor(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

function colorDistance(left: string, right: string): number {
  const leftValue = packedColor(left);
  const rightValue = packedColor(right);
  const redDifference = (leftValue >> 16) - (rightValue >> 16);
  const greenDifference =
    ((leftValue >> 8) & 0xff) - ((rightValue >> 8) & 0xff);
  const blueDifference = (leftValue & 0xff) - (rightValue & 0xff);
  return Math.sqrt(
    redDifference ** 2 + greenDifference ** 2 + blueDifference ** 2,
  );
}

function requireBreadcrumb(
  snapshot: HarnessSnapshot.Model,
  workspaceLabel: string,
  fileLabel: string,
  palette: Palette,
  description: string,
): void {
  const marker = `${workspaceLabel} › ${fileLabel}`;
  const markerPosition = snapshot.findText(marker);
  HarnessSmoke.Class.requireCondition(
    markerPosition !== null,
    `${description} paints ${marker}`,
  );
  if (!markerPosition) throw new Error(`${description} breadcrumb vanished`);
  const status = HarnessSmoke.Class.readStatus(statusPath);
  const editorLeft = Number(
    (status.layoutSlots as { editorCenter?: { left?: number } } | undefined)
      ?.editorCenter?.left,
  );
  const prefix = snapshot
    .rowText(markerPosition.row)
    .slice(editorLeft, markerPosition.column);
  HarnessSmoke.Class.requireCondition(
    prefix.trim() === '',
    `${description} starts with the path and has no breadcrumb history controls`,
  );
  // The one-column shift: the row keeps its single margin cell AND the first segment carries its
  // own left hover pad, so the first glyph sits two columns inside the editor column. The pad is
  // there whether or not the mouse is on the row, so hover never reflows the text.
  HarnessSmoke.Class.requireCondition(
    prefix.length === 1 + HOVER_PAD_COLUMNS,
    `${description} keeps one margin cell plus the first segment's hover pad ` +
      `(prefix ${prefix.length} columns)`,
  );
  const separatorColumn = markerPosition.column + workspaceLabel.length + 1;
  const separatorCell = snapshot.cell(markerPosition.row, separatorColumn);
  HarnessSmoke.Class.requireCondition(
    separatorCell?.characters === '›' &&
      separatorCell.isForegroundRgb &&
      separatorCell.foreground === packedColor(palette.dim),
    `${description} paints the separator with the active theme dim token`,
  );
  if (!separatorCell) throw new Error(`${description} separator cell vanished`);
  HarnessSmoke.Class.requireCondition(
    separatorCell.foreground !== packedColor(palette.bg) &&
      colorDistance(palette.dim, palette.bg) >
        colorDistance(palette.border, palette.bg),
    `${description} separator differs from the row background and has more contrast than the old border token`,
  );
}

function isHighlighted(
  snapshot: HarnessSnapshot.Model,
  row: number,
  column: number,
  palette: Palette,
): boolean {
  const cell = snapshot.cell(row, column);
  return (
    cell !== null &&
    cell.isBackgroundRgb &&
    cell.background === packedColor(palette.cursorLine)
  );
}

async function awaitNoBreadcrumbHighlight(
  driver: PtyTestDriver.Model,
  breadcrumbRow: number,
  palette: Palette,
  description: string,
): Promise<void> {
  driver.sendMouse({
    kind: 'move',
    column: 1,
    row: breadcrumbRow + 6,
    button: 'none',
  });
  await driver.awaitGridCondition(
    `${description} drops the hover highlight when the mouse leaves the row`,
    (candidate) =>
      !candidate
        .rowCells(breadcrumbRow)
        .some((cell) =>
          isHighlighted(candidate, breadcrumbRow, cell.column, palette),
        ),
  );
}

// Hover every breadcrumb segment and require the highlight to cover the segment text plus one cell
// on each side, with nothing on the row moving. Each segment is hovered TWICE: once on the middle
// of its text and once on its left pad cell. The pad hover proves the hit test reads the same span
// the paint used — the renderer publishes one segment geometry and both sides read it.
async function driveBreadcrumbHover(
  driver: PtyTestDriver.Model,
  restingSnapshot: HarnessSnapshot.Model,
  workspaceLabel: string,
  fileLabel: string,
  palette: Palette,
  description: string,
): Promise<void> {
  const markerPosition = restingSnapshot.findText(
    `${workspaceLabel} › ${fileLabel}`,
  );
  if (!markerPosition) throw new Error(`${description} breadcrumb vanished`);
  const breadcrumbRow = markerPosition.row;
  const restingRowText = restingSnapshot.rowText(breadcrumbRow);
  const separatorColumn = markerPosition.column + workspaceLabel.length + 1;
  const labelSpans = [
    { label: workspaceLabel, textStart: markerPosition.column },
    { label: fileLabel, textStart: separatorColumn + 2 },
  ];
  for (const { label, textStart } of labelSpans) {
    const textEnd = textStart + label.length;
    const highlightStart = textStart - HOVER_PAD_COLUMNS;
    const highlightEnd = textEnd + HOVER_PAD_COLUMNS;
    const hoverColumns = [
      textStart + Math.floor(label.length / 2),
      highlightStart,
    ];
    for (const hoverColumn of hoverColumns) {
      const reachedFrom =
        hoverColumn === highlightStart ? 'its left pad cell' : 'its text';
      driver.sendMouse({
        kind: 'move',
        column: hoverColumn,
        row: breadcrumbRow,
        button: 'none',
      });
      const hovered = await driver.awaitGridCondition(
        `${description} highlights "${label}" when the mouse rests on ${reachedFrom}`,
        (candidate) =>
          isHighlighted(candidate, breadcrumbRow, highlightStart, palette) &&
          isHighlighted(candidate, breadcrumbRow, highlightEnd - 1, palette),
      );
      const paintedColumns: number[] = [];
      for (let column = highlightStart; column < highlightEnd; column += 1) {
        if (isHighlighted(hovered, breadcrumbRow, column, palette)) {
          paintedColumns.push(column);
        }
      }
      HarnessSmoke.Class.requireCondition(
        paintedColumns.length === highlightEnd - highlightStart,
        `${description} paints every cell of "${label}" plus one cell each side ` +
          `(columns ${highlightStart}..${highlightEnd - 1}, painted ${paintedColumns.length})`,
      );
      HarnessSmoke.Class.requireCondition(
        !isHighlighted(hovered, breadcrumbRow, highlightStart - 1, palette) &&
          !isHighlighted(hovered, breadcrumbRow, highlightEnd, palette),
        `${description} stops the "${label}" highlight exactly one cell past the text`,
      );
      HarnessSmoke.Class.requireCondition(
        hovered.rowText(breadcrumbRow) === restingRowText,
        `${description} moves nothing on the row while "${label}" is hovered`,
      );
      const separatorCell = hovered.cell(breadcrumbRow, separatorColumn);
      HarnessSmoke.Class.requireCondition(
        separatorCell?.characters === '›' &&
          !isHighlighted(hovered, breadcrumbRow, separatorColumn, palette),
        `${description} leaves the separator unhighlighted while "${label}" is hovered`,
      );
      // Clear the highlight before the next hover, so the next wait starts from a screen where
      // its condition is FALSE. A predicate already true would launder a no-op into a pass.
      await awaitNoBreadcrumbHighlight(
        driver,
        breadcrumbRow,
        palette,
        `${description} after "${label}" reached by ${reachedFrom}`,
      );
    }
  }
  // Click behaviour is unchanged, and the pad cell is part of the segment: pressing the first
  // segment's LEFT PAD opens the same folder picker the text opens.
  HarnessSmoke.Class.requireCondition(
    HarnessSmoke.Class.readStatus(statusPath).boundedListPopupOpen !== true,
    `${description} shows no folder picker before the click`,
  );
  const padColumn = markerPosition.column - HOVER_PAD_COLUMNS;
  driver.sendMouse({
    kind: 'press',
    column: padColumn,
    row: breadcrumbRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: padColumn,
    row: breadcrumbRow,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `${description} opens the folder picker from the first segment's pad cell`,
    (status) => status.boundedListPopupOpen === true,
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `${description} closes the folder picker`,
    (status) => status.boundedListPopupOpen === false,
  );
}

async function driveBreadcrumbAtScale(lineCount: number): Promise<void> {
  const fixtureRoot = mkdtempSync(
    join(tmpdir(), `tui-breadcrumb-${lineCount}-`),
  );
  const homeDirectory = mkdtempSync(
    join(tmpdir(), `tui-breadcrumb-home-${lineCount}-`),
  );
  statusPath = join(homeDirectory, 'status.json');
  const generated = Bun.spawnSync([
    'bun',
    'scripts/make-scale-workspace.ts',
    '--lines',
    String(lineCount),
    '--directory',
    fixtureRoot,
  ]);
  HarnessSmoke.Class.requireCondition(
    generated.exitCode === 0,
    `${lineCount}-line shared scale fixture generated`,
  );
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: {
      COLORTERM: 'truecolor',
      TUI_STATUS_PATH: statusPath,
    },
  });
  const workspaceLabel = basename(fixtureRoot);
  try {
    await driver.awaitGridCondition(
      `${lineCount}-line scale workspace paints`,
      (snapshot) => snapshot.findText('huge.ts') !== null,
    );
    driver.sendKeys('Control+p');
    await driver.awaitGridCondition(
      `${lineCount}-line scale workspace opens Quick Open`,
      (snapshot) => snapshot.findText('Go to File') !== null,
    );
    driver.sendText('huge.ts');
    await driver.awaitScreenChange();
    driver.sendKeys('Enter');
    const darkSnapshot = await driver.awaitGridCondition(
      `${lineCount}-line breadcrumb paints in the dark theme`,
      (snapshot) => snapshot.findText(`${workspaceLabel} › huge.ts`) !== null,
      60_000,
    );
    requireBreadcrumb(
      darkSnapshot,
      workspaceLabel,
      'huge.ts',
      ThemePalettes.Class.DARK,
      `${lineCount}-line dark theme`,
    );
    await driveBreadcrumbHover(
      driver,
      darkSnapshot,
      workspaceLabel,
      'huge.ts',
      ThemePalettes.Class.DARK,
      `${lineCount}-line dark theme`,
    );

    driver.sendKeys('Control+,');
    let settingsStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line drive opens Settings`,
      (candidate) =>
        candidate.settingsOpen === true &&
        typeof candidate.settingsSelectedLabel === 'string',
    );
    for (
      let navigationStep = 0;
      navigationStep < 40 && settingsStatus.settingsSelectedLabel !== 'Theme';
      navigationStep += 1
    ) {
      const previousLabel = settingsStatus.settingsSelectedLabel;
      driver.sendKeys('Down');
      settingsStatus = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${lineCount}-line Settings advances toward Theme`,
        (candidate) => candidate.settingsSelectedLabel !== previousLabel,
      );
    }
    HarnessSmoke.Class.requireCondition(
      settingsStatus.settingsSelectedLabel === 'Theme',
      `${lineCount}-line drive finds the Theme setting`,
    );
    driver.sendKeys('Right');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line drive switches the live theme to light`,
      (candidate) =>
        candidate.settingsSelectedLabel === 'Theme' &&
        candidate.settingsSelectedValue === 'light',
    );
    driver.sendKeys('Escape');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line drive closes Settings`,
      (candidate) => candidate.settingsOpen === false,
    );
    const lightSnapshot = await driver.awaitGridCondition(
      `${lineCount}-line breadcrumb repaints in the light theme`,
      (snapshot) => {
        const markerPosition = snapshot.findText(`${workspaceLabel} › huge.ts`);
        if (!markerPosition) return false;
        const separatorColumn =
          markerPosition.column + workspaceLabel.length + 1;
        return (
          snapshot.cell(markerPosition.row, separatorColumn)?.foreground ===
          packedColor(ThemePalettes.Class.LIGHT.dim)
        );
      },
    );
    requireBreadcrumb(
      lightSnapshot,
      workspaceLabel,
      'huge.ts',
      ThemePalettes.Class.LIGHT,
      `${lineCount}-line live light theme`,
    );
    await driveBreadcrumbHover(
      driver,
      lightSnapshot,
      workspaceLabel,
      'huge.ts',
      ThemePalettes.Class.LIGHT,
      `${lineCount}-line live light theme`,
    );
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

let statusPath = '';
await driveBreadcrumbAtScale(10);
await driveBreadcrumbAtScale(100_000);
console.log('smoke-breadcrumb-harness: ALL-PASS');
