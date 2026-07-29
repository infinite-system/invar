#!/usr/bin/env bun
// Byte-level Markdown split-preview contract: task metadata line breaks, heading styles in both
// themes, dead-link painting, the auto-opened LEFT preview, bidirectional user-led scroll sync and
// its contributed switch, per-document hand-close memory, the contributed side setting, rendered
// links, persisted splitter, edge-selection autoscroll/copy/paste, and independent source/preview
// find all cross the real PTY.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Metadata fields preserve authored lines (src/modules/markdown/markdown.invariants.md)
// invariant: Markdown presentation resolves through one stylesheet (src/modules/markdown/markdown.invariants.md)
// invariant: The Markdown preview opens itself and sits on the configured side (src/modules/markdown/markdown.invariants.md)
// invariant: Explicit jumps use one reading position (src/modules/text/text.invariants.md)
// invariant: A controlling PTY resize reaches the renderer (src/modules/terminal/terminal.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextCoordinates } from '../../src/modules/text/TextCoordinates';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
import { ThemePalettes } from '../../src/modules/theme/ThemePalettes';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function previewBorder(snapshot: HarnessSnapshot.Model): {
  row: number;
  column: number;
} {
  const position = snapshot.findText('╭─Preview');
  if (!position)
    throw new Error(`FAIL preview border missing\n${snapshot.text()}`);
  return position;
}

/** The column of the preview pane's own closing corner on its border row. The preview no longer
 *  ends at the terminal edge — the source pane sits to its RIGHT by default — so every scan of
 *  preview content must stop here or it silently matches raw source text. */
function previewPaneRightColumn(snapshot: HarnessSnapshot.Model): number {
  const preview = previewBorder(snapshot);
  const rowText = snapshot.rowText(preview.row);
  // The LAST closing corner before the source pane's opening corner, not the first: after a
  // layout change (the concealed structure dock returning its columns) a stale `╮` from the
  // narrower layout can linger mid-row for a frame, and anchoring on it truncates every
  // preview scan (paint residue reported as bycatch; the source `╭` is repainted reliably).
  const sourceOpeningColumn = rowText.indexOf('╭', preview.column + 1);
  const scanEndColumn =
    sourceOpeningColumn >= 0 ? sourceOpeningColumn : rowText.length;
  const closingColumn = rowText.lastIndexOf('╮', scanEndColumn);
  return closingColumn > preview.column ? closingColumn : rowText.length;
}

/** The source pane's opening border corner: the next box corner right of the preview pane. */
function sourceBorderColumn(snapshot: HarnessSnapshot.Model): number {
  const preview = previewBorder(snapshot);
  return snapshot.rowText(preview.row).indexOf('╭', preview.column + 1);
}

function sourcePaneRightColumn(snapshot: HarnessSnapshot.Model): number {
  const preview = previewBorder(snapshot);
  const sourceColumn = sourceBorderColumn(snapshot);
  return snapshot.rowText(preview.row).indexOf('╮', sourceColumn + 1);
}

function paneLastBodyRow(
  snapshot: HarnessSnapshot.Model,
  paneColumn: number,
): number {
  const openingRow = previewBorder(snapshot).row;
  for (let row = openingRow + 1; row < snapshot.rows; row++) {
    if (snapshot.cell(row, paneColumn)?.characters === '╰') return row - 1;
  }
  throw new Error(`FAIL pane closing border missing\n${snapshot.text()}`);
}

function sourceMarkerPosition(
  snapshot: HarnessSnapshot.Model,
  marker: string,
): { row: number; column: number } {
  const sourceColumn = sourceBorderColumn(snapshot);
  const rightColumn = sourcePaneRightColumn(snapshot);
  for (let row = 0; row < snapshot.rows; row++) {
    const column = snapshot.rowText(row).indexOf(marker, sourceColumn);
    if (column >= 0 && column < rightColumn) return { row, column };
  }
  throw new Error(`FAIL source marker missing: ${marker}\n${snapshot.text()}`);
}

function structureMarkerPosition(
  snapshot: HarnessSnapshot.Model,
  marker: string,
): { row: number; column: number } {
  const sourceRightColumn = sourcePaneRightColumn(snapshot);
  for (let row = 0; row < snapshot.rows; row++) {
    const column = snapshot.rowText(row).lastIndexOf(marker);
    if (column > sourceRightColumn) return { row, column };
  }
  throw new Error(
    `FAIL structure marker missing: ${marker}\n${snapshot.text()}`,
  );
}

function requireReadingPosition(
  snapshot: HarnessSnapshot.Model,
  targetRow: number,
  paneColumn: number,
  label: string,
): void {
  const firstBodyRow = previewBorder(snapshot).row + 1;
  const lastBodyRow = paneLastBodyRow(snapshot, paneColumn);
  const topThirdLastRow =
    firstBodyRow + Math.floor((lastBodyRow - firstBodyRow) / 3);
  HarnessSmoke.Class.requireCondition(
    targetRow >= firstBodyRow &&
      targetRow <= topThirdLastRow &&
      targetRow < lastBodyRow,
    `${label} paints in the top third and never on the trailing body row ` +
      `(target ${String(targetRow)}, body ${String(firstBodyRow)}-${String(lastBodyRow)}, ` +
      `top third through ${String(topThirdLastRow)})`,
  );
}

function previewMarkerPosition(
  snapshot: HarnessSnapshot.Model,
  marker: string,
): { row: number; column: number } {
  const previewColumn = previewBorder(snapshot).column;
  const rightColumn = previewPaneRightColumn(snapshot);
  for (let row = 0; row < snapshot.rows; row++) {
    const column = snapshot.rowText(row).indexOf(marker, previewColumn);
    if (column >= 0 && column < rightColumn) return { row, column };
  }
  throw new Error(`FAIL preview marker missing: ${marker}\n${snapshot.text()}`);
}

function previewHasMarker(
  snapshot: HarnessSnapshot.Model,
  marker: string,
): boolean {
  const previewPosition = snapshot.findText('╭─Preview');
  if (!previewPosition) return false;
  const rightColumn = previewPaneRightColumn(snapshot);
  return snapshot.textRows().some((rowText) => {
    const column = rowText.indexOf(marker, previewPosition.column);
    return column >= 0 && column < rightColumn;
  });
}

function previewRowContaining(
  snapshot: HarnessSnapshot.Model,
  marker: string,
): number {
  const previewColumn = previewBorder(snapshot).column;
  const rightColumn = previewPaneRightColumn(snapshot);
  for (let row = 0; row < snapshot.rows; row++) {
    if (
      snapshot.rowText(row).slice(previewColumn, rightColumn).includes(marker)
    )
      return row;
  }
  throw new Error(`FAIL preview row missing: ${marker}\n${snapshot.text()}`);
}

/** Table cell boundaries INSIDE the preview pane: every table vertical between the pane's own
 *  left and right borders (both excluded). */
function tableBoundaryColumns(
  snapshot: HarnessSnapshot.Model,
  row: number,
): number[] {
  const previewColumn = previewBorder(snapshot).column;
  const rightColumn = previewPaneRightColumn(snapshot);
  const verticalBorder = ThemeIcons.Class.tableBordersFor('unicode').vertical;
  return snapshot
    .rowCells(row)
    .filter(
      (cell) =>
        cell.column > previewColumn &&
        cell.column < rightColumn &&
        cell.characters === verticalBorder,
    )
    .map((cell) => cell.column);
}

/** The GRID column where needle starts, at or after fromColumn. Snapshot row text carries one
 *  GRAPHEME per grid cell (wide glyphs already carry their spacer cell, combining marks merge
 *  into their base cell), so the grid column is the grapheme index — a raw String.indexOf
 *  drifts by one UTF-16 unit for every surrogate pair (emoji) and every combining mark painted
 *  earlier in the same screen row, while rowCells columns do not. */
function displayColumnOfText(
  rowText: string,
  needle: string,
  fromColumn: number,
): number {
  const graphemes = TextCoordinates.Class.graphemes(rowText);
  let utf16Offset = 0;
  for (let column = 0; column < graphemes.length; column++) {
    if (column >= fromColumn && rowText.startsWith(needle, utf16Offset)) {
      return column;
    }
    utf16Offset += graphemes[column]!.length;
  }
  return -1;
}

function findPreviewButton(
  snapshot: HarnessSnapshot.Model,
): { row: number; column: number } | null {
  for (let row = 0; row < snapshot.rows; row++) {
    const rowText = snapshot.rowText(row);
    const countMatch = rowText.match(/\d+\/\d+/);
    const countColumn = countMatch?.index ?? -1;
    if (countColumn >= 3 && rowText.includes('README.md')) {
      return { row, column: countColumn - 3 };
    }
  }
  return null;
}

function previewButton(snapshot: HarnessSnapshot.Model): {
  row: number;
  column: number;
} {
  const button = findPreviewButton(snapshot);
  if (button) return button;
  throw new Error(`FAIL Markdown preview button missing\n${snapshot.text()}`);
}

function clickCell(
  driver: PtyTestDriver.Model,
  column: number,
  row: number,
): void {
  driver.sendMouse({ kind: 'press', column, row, button: 'left' });
  driver.sendMouse({ kind: 'release', column, row, button: 'left' });
}

function packedThemeColor(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

async function driveTaskPresentationInTheme(
  theme: 'dark' | 'light',
): Promise<void> {
  const taskFixtureRoot = mkdtempSync(
    join(tmpdir(), `tui-markdown-task-${theme}-`),
  );
  const taskHomeDirectory = mkdtempSync(
    join(tmpdir(), `tui-markdown-task-home-${theme}-`),
  );
  const taskStatusPath = join(taskHomeDirectory, 'status.json');
  const settingsDirectory = join(taskHomeDirectory, '.config', 'invar');
  mkdirSync(settingsDirectory, { recursive: true });
  await Bun.write(
    join(settingsDirectory, 'settings.json'),
    JSON.stringify({ theme }),
  );
  await Bun.write(
    join(taskFixtureRoot, 'README.md'),
    [
      '# Task presentation',
      '',
      'State: IN-PROGRESS',
      'Created: 2026-07-29',
      'Engine: codex',
      '',
      'Prose joins',
      'across source lines.',
      '',
      '[current link](README.md)',
      '',
      '[dead link](missing-link-target.md)',
      '',
      '[external link](https://example.com/docs)',
      '',
      '## Existing section',
      '',
    ].join('\n'),
  );
  const taskDriver = new PtyTestDriver.Class({
    workspaceRoot: taskFixtureRoot,
    columns: 180,
    rows: 36,
    homeDirectory: taskHomeDirectory,
    environment: {
      TUI_STATUS_PATH: taskStatusPath,
      LANG: 'C.UTF-8',
      NERD_FONT: '0',
    },
  });

  try {
    await taskDriver.awaitSnapshot(
      (candidate) => candidate.findText('README.md') !== null,
      15_000,
    );
    taskDriver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      taskDriver,
      taskStatusPath,
      `${theme} task preview opens and finishes parsing`,
      (status) =>
        String(status.activeBuffer).endsWith('/README.md') &&
        status.markdownPreviewOpen === true &&
        status.markdownParsing === false,
    );
    const snapshot = await taskDriver.awaitGridCondition(
      `${theme} task metadata and prose paint in the preview`,
      (candidate) =>
        candidate.findText('╭─Preview') !== null &&
        previewHasMarker(candidate, 'Task presentation') &&
        previewHasMarker(candidate, 'State: IN-PROGRESS') &&
        previewHasMarker(candidate, 'Created: 2026-07-29') &&
        previewHasMarker(candidate, 'Engine: codex') &&
        previewHasMarker(candidate, 'Prose joins across source lines.') &&
        previewHasMarker(candidate, 'current link') &&
        previewHasMarker(candidate, 'dead link') &&
        previewHasMarker(candidate, 'external link') &&
        previewHasMarker(candidate, 'Existing section'),
    );
    const state = previewMarkerPosition(snapshot, 'State: IN-PROGRESS');
    const created = previewMarkerPosition(snapshot, 'Created: 2026-07-29');
    const engine = previewMarkerPosition(snapshot, 'Engine: codex');
    HarnessSmoke.Class.requireCondition(
      created.row === state.row + 1 && engine.row === created.row + 1,
      `${theme} task metadata keeps one authored field per preview row`,
    );

    const heading1 = previewMarkerPosition(snapshot, 'Task presentation');
    const heading2 = previewMarkerPosition(snapshot, 'Existing section');
    const prose = previewMarkerPosition(
      snapshot,
      'Prose joins across source lines.',
    );
    const heading1Cell = snapshot.cell(heading1.row, heading1.column);
    const heading2Cell = snapshot.cell(heading2.row, heading2.column);
    const proseCell = snapshot.cell(prose.row, prose.column);
    HarnessSmoke.Class.requireCondition(
      heading1Cell?.isUnderline === false &&
        heading1Cell.isBold === true &&
        heading1Cell.foreground !== proseCell?.foreground,
      `${theme} H1 uses bold distinct color without an underline`,
    );
    HarnessSmoke.Class.requireCondition(
      heading2Cell?.isUnderline === false &&
        heading2Cell.isBold === true &&
        heading2Cell.foreground !== heading1Cell?.foreground &&
        heading2Cell.foreground !== proseCell?.foreground,
      `${theme} H2 keeps its bold accent treatment`,
    );
    const palette =
      theme === 'dark' ? ThemePalettes.Class.DARK : ThemePalettes.Class.LIGHT;
    const currentLink = previewMarkerPosition(snapshot, 'current link');
    const deadLink = previewMarkerPosition(snapshot, 'dead link');
    const externalLink = previewMarkerPosition(snapshot, 'external link');
    HarnessSmoke.Class.requireCondition(
      snapshot.cell(currentLink.row, currentLink.column)?.foreground ===
        packedThemeColor(palette.accent) &&
        snapshot.cell(deadLink.row, deadLink.column)?.foreground ===
          packedThemeColor(palette.error) &&
        snapshot.cell(externalLink.row, externalLink.column)?.foreground ===
          packedThemeColor(palette.accent),
      `${theme} paints dead relative links red and leaves resolving or external links normal`,
    );
  } finally {
    await taskDriver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(taskFixtureRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(taskHomeDirectory);
  }
}

console.log(
  '== harness markdown: task fields and heading styles hold in both themes ==',
);
await driveTaskPresentationInTheme('dark');
await driveTaskPresentationInTheme('light');

async function driveTerminalShrinkAtScale(
  fixtureLineCount: number,
): Promise<void> {
  const scaleFixtureRoot = mkdtempSync(
    join(tmpdir(), `tui-markdown-resize-${fixtureLineCount}-`),
  );
  const scaleHomeDirectory = mkdtempSync(
    join(tmpdir(), `tui-markdown-resize-home-${fixtureLineCount}-`),
  );
  const scaleStatusPath = join(scaleHomeDirectory, 'status.json');
  const jumpSourceLine =
    fixtureLineCount <= 40
      ? Math.max(7, Math.floor(fixtureLineCount * 0.7))
      : Math.floor(fixtureLineCount * 0.75);
  const jumpMarker = `Jump ${fixtureLineCount}`;
  const scrollDepths = [0.2, 0.45, 0.65].map((depthRatio, depthIndex) => ({
    sourceLine: Math.max(3, Math.floor(fixtureLineCount * depthRatio)),
    marker: `Depth ${depthIndex + 1} ${fixtureLineCount}`,
  }));
  const scrollMarkerBySourceLine = new Map(
    scrollDepths.map((depth) => [depth.sourceLine, depth.marker]),
  );
  const scaleFixtureLines = Array.from(
    { length: fixtureLineCount },
    (_unusedValue, lineIndex) => {
      if (lineIndex === 0) return `# Scale fixture ${fixtureLineCount}`;
      if (lineIndex === 1) return '[current scale link](README.md)';
      if (lineIndex === 2 || lineIndex === 4 || lineIndex === 6) return '';
      if (lineIndex === 3) return '[dead scale link](missing-scale.md)';
      if (lineIndex === 5)
        return '[external scale link](https://example.com/docs)';
      if (lineIndex === 7) return '| Left | Center | Right |';
      if (lineIndex === 8) return '| :--- | :---: | ---: |';
      if (lineIndex === 9) return '| alpha | middle | 7 |';
      if (lineIndex === 10) return '';
      if (lineIndex === jumpSourceLine) return `## [${jumpMarker}](README.md)`;
      const scrollMarker = scrollMarkerBySourceLine.get(lineIndex);
      return scrollMarker
        ? `## ${scrollMarker}`
        : `Scale line ${String(lineIndex + 1).padStart(6, '0')} content`;
    },
  );
  await Bun.write(
    join(scaleFixtureRoot, 'README.md'),
    `${scaleFixtureLines.join('\n')}\n`,
  );
  const scaleDriver = new PtyTestDriver.Class({
    workspaceRoot: scaleFixtureRoot,
    columns: 120,
    rows: 40,
    homeDirectory: scaleHomeDirectory,
    environment: {
      TUI_STATUS_PATH: scaleStatusPath,
      LANG: 'C.UTF-8',
      NERD_FONT: '0',
    },
  });

  try {
    await scaleDriver.awaitSnapshot(
      (candidate) => candidate.findText('README.md') !== null,
      30_000,
    );
    scaleDriver.resize(60, 25);
    await HarnessSmoke.Class.awaitStatus(
      scaleDriver,
      scaleStatusPath,
      `${fixtureLineCount}-line no-input resize publishes 60 by 25`,
      (status) => status.width === 60 && status.height === 25,
    );
    scaleDriver.resize(120, 40);
    await HarnessSmoke.Class.awaitStatus(
      scaleDriver,
      scaleStatusPath,
      `${fixtureLineCount}-line no-input resize restores 120 by 40`,
      (status) => status.width === 120 && status.height === 40,
    );
    await scaleDriver.awaitGridCondition(
      `${fixtureLineCount}-line file tree settles inside 120 columns`,
      (candidate) =>
        candidate.columns === 120 &&
        candidate.rows === 40 &&
        candidate.findText('README.md') !== null,
    );
    scaleDriver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      scaleDriver,
      scaleStatusPath,
      `${fixtureLineCount}-line Markdown preview opens`,
      (status) =>
        String(status.activeBuffer).endsWith('/README.md') &&
        status.markdownPreviewOpen === true,
      60_000,
    );
    const dockVisibleStatus = await HarnessSmoke.Class.awaitStatus(
      scaleDriver,
      scaleStatusPath,
      `${fixtureLineCount}-line parent-growth arm starts with the right dock visible`,
      (status) =>
        status.width === 120 &&
        status.height === 40 &&
        status.rightDockVisible === true &&
        Number(status.markdownPreviewViewportColumns) > 0 &&
        Number(status.markdownPreviewViewportColumns) < 30,
    );
    const dockVisiblePreviewColumns = Number(
      dockVisibleStatus.markdownPreviewViewportColumns,
    );
    await HarnessSmoke.Class.concealAutoRevealedRightDock(
      scaleDriver,
      scaleStatusPath,
    );
    await HarnessSmoke.Class.awaitStatus(
      scaleDriver,
      scaleStatusPath,
      `${fixtureLineCount}-line preview finishes parsing after parent growth`,
      (status) =>
        status.rightDockVisible === false && status.markdownParsing === false,
    );
    const dockConcealedSnapshot = await scaleDriver.awaitGridCondition(
      `${fixtureLineCount}-line table reflows after parent growth without a preview remount`,
      (candidate) =>
        previewHasMarker(candidate, 'Left') &&
        previewHasMarker(candidate, 'alpha'),
    );
    const dockConcealedPreviewColumns =
      previewPaneRightColumn(dockConcealedSnapshot) -
      previewBorder(dockConcealedSnapshot).column -
      1;
    const currentScaleLink = previewMarkerPosition(
      dockConcealedSnapshot,
      'current scale link',
    );
    const deadScaleLink = previewMarkerPosition(
      dockConcealedSnapshot,
      'dead scale link',
    );
    const externalScaleLink = previewMarkerPosition(
      dockConcealedSnapshot,
      'external scale link',
    );
    HarnessSmoke.Class.requireCondition(
      dockConcealedSnapshot.cell(currentScaleLink.row, currentScaleLink.column)
        ?.foreground === packedThemeColor(ThemePalettes.Class.DARK.accent) &&
        dockConcealedSnapshot.cell(deadScaleLink.row, deadScaleLink.column)
          ?.foreground === packedThemeColor(ThemePalettes.Class.DARK.error) &&
        dockConcealedSnapshot.cell(
          externalScaleLink.row,
          externalScaleLink.column,
        )?.foreground === packedThemeColor(ThemePalettes.Class.DARK.accent),
      `${fixtureLineCount}-line preview paints dead links red without changing current or external links`,
    );
    HarnessSmoke.Class.requireCondition(
      dockConcealedPreviewColumns > dockVisiblePreviewColumns,
      `${fixtureLineCount}-line parent growth widens the live preview body viewport`,
    );
    scaleDriver.sendKeys('Control+Alt+b');
    await HarnessSmoke.Class.awaitStatus(
      scaleDriver,
      scaleStatusPath,
      `${fixtureLineCount}-line right dock restoration shrinks the preview viewport`,
      (status) => status.rightDockVisible === true,
    );
    const dockRestoredSnapshot = await scaleDriver.awaitGridCondition(
      `${fixtureLineCount}-line table reflows after parent shrink`,
      (candidate) =>
        previewHasMarker(candidate, 'Left') &&
        previewHasMarker(candidate, 'alph') &&
        !previewHasMarker(candidate, 'alpha'),
    );
    const dockRestoredPreviewColumns =
      previewPaneRightColumn(dockRestoredSnapshot) -
      previewBorder(dockRestoredSnapshot).column -
      1;
    HarnessSmoke.Class.requireCondition(
      dockRestoredPreviewColumns < dockConcealedPreviewColumns,
      `${fixtureLineCount}-line parent shrink narrows the live preview body viewport`,
    );
    HarnessSmoke.Class.pass(
      `${fixtureLineCount}-line preview body tracks parent growth and shrink without remounting`,
    );
    scaleDriver.resize(140, 40);
    await HarnessSmoke.Class.awaitStatus(
      scaleDriver,
      scaleStatusPath,
      `${fixtureLineCount}-line TOC arm restores 140 by 40`,
      (status) => status.width === 140 && status.height === 40,
    );
    const restoredScaleSnapshot = await scaleDriver.awaitGridCondition(
      `${fixtureLineCount}-line structure pane returns after the viewport contract`,
      (candidate) => {
        if (candidate.columns !== 140) return false;
        try {
          structureMarkerPosition(candidate, jumpMarker);
          return true;
        } catch {
          return false;
        }
      },
    );
    const tocMarker = structureMarkerPosition(
      restoredScaleSnapshot,
      jumpMarker,
    );
    clickCell(scaleDriver, tocMarker.column, tocMarker.row);
    const followedStatus = await HarnessSmoke.Class.awaitStatus(
      scaleDriver,
      scaleStatusPath,
      `${fixtureLineCount}-line TOC click moves the source cursor`,
      (status) => Number(status.cursorLineIndex) === jumpSourceLine,
    );
    if (fixtureLineCount > 40) {
      HarnessSmoke.Class.requireCondition(
        Number(followedStatus.editorScrollTop) > 0 &&
          Number(followedStatus.markdownPreviewScrollTop) > 0,
        `${fixtureLineCount}-line TOC click scrolls source and preview away from the opening section`,
      );
    }
    const followedSnapshot = await scaleDriver.awaitGridCondition(
      `${fixtureLineCount}-line TOC target paints in source and preview`,
      (candidate) => {
        try {
          sourceMarkerPosition(candidate, jumpMarker);
          previewMarkerPosition(candidate, jumpMarker);
          return true;
        } catch {
          return false;
        }
      },
    );
    const followedSource = sourceMarkerPosition(followedSnapshot, jumpMarker);
    const followedPreview = previewMarkerPosition(followedSnapshot, jumpMarker);
    requireReadingPosition(
      followedSnapshot,
      followedSource.row,
      sourceBorderColumn(followedSnapshot),
      `${fixtureLineCount}-line source target`,
    );
    requireReadingPosition(
      followedSnapshot,
      followedPreview.row,
      previewBorder(followedSnapshot).column,
      `${fixtureLineCount}-line preview target`,
    );

    if (fixtureLineCount === 500 || fixtureLineCount === 100_000) {
      console.log(
        `== harness markdown: ${fixtureLineCount}-line trailing body row hit boundary ==`,
      );
      scaleDriver.sendMouse({
        kind: 'press',
        column: followedPreview.column,
        row: followedPreview.row,
        button: 'left',
      });
      scaleDriver.sendMouse({
        kind: 'release',
        column: followedPreview.column,
        row: followedPreview.row,
        button: 'left',
      });
      let previewFocusStatus = await HarnessSmoke.Class.awaitStatus(
        scaleDriver,
        scaleStatusPath,
        `${fixtureLineCount}-line preview target takes pane focus`,
        (status) => status.markdownPaneFocus === 'preview',
      );
      const trailingBodyRow = paneLastBodyRow(
        scaleDriver.snapshot(),
        previewBorder(scaleDriver.snapshot()).column,
      );
      const firstPreviewBodyRow = previewBorder(scaleDriver.snapshot()).row + 1;
      const targetRenderedRow =
        Number(previewFocusStatus.markdownPreviewScrollTop) +
        followedPreview.row -
        firstPreviewBodyRow;
      const targetScrollTop =
        targetRenderedRow - (trailingBodyRow - firstPreviewBodyRow);
      for (
        let correctionCount = 0;
        Number(previewFocusStatus.markdownPreviewScrollTop) !== targetScrollTop;
        correctionCount++
      ) {
        if (correctionCount >= 50) {
          throw new Error(
            `FAIL ${fixtureLineCount}-line preview did not reach the exact trailing-row scroll position within 50 corrections`,
          );
        }
        const previousScrollTop = Number(
          previewFocusStatus.markdownPreviewScrollTop,
        );
        scaleDriver.sendKeys(
          previousScrollTop > targetScrollTop ? 'Up' : 'Down',
        );
        previewFocusStatus = await HarnessSmoke.Class.awaitStatus(
          scaleDriver,
          scaleStatusPath,
          `${fixtureLineCount}-line preview moves the target toward the trailing body row`,
          (status) =>
            Number(status.markdownPreviewScrollTop) !== previousScrollTop,
        );
      }
      const trailingSnapshot = await scaleDriver.awaitGridCondition(
        `${fixtureLineCount}-line reference paints on the trailing preview body row`,
        (candidate) => {
          try {
            return (
              previewMarkerPosition(candidate, jumpMarker).row ===
              paneLastBodyRow(candidate, previewBorder(candidate).column)
            );
          } catch {
            return false;
          }
        },
      );
      const trailingReference = previewMarkerPosition(
        trailingSnapshot,
        jumpMarker,
      );
      scaleDriver.sendMouse({
        kind: 'move',
        column: trailingReference.column,
        row: trailingReference.row,
        button: 'none',
      });
      await HarnessSmoke.Class.awaitStatus(
        scaleDriver,
        scaleStatusPath,
        `${fixtureLineCount}-line trailing preview body row publishes its reference`,
        (status) =>
          String(status.markdownHoveredReference).endsWith('/README.md'),
      );
      HarnessSmoke.Class.pass(
        `${fixtureLineCount}-line trailing preview body row hit-tests its painted reference`,
      );
      scaleDriver.sendMouse({
        kind: 'move',
        column: trailingReference.column,
        row: trailingReference.row + 1,
        button: 'none',
      });
      await HarnessSmoke.Class.awaitStatus(
        scaleDriver,
        scaleStatusPath,
        `${fixtureLineCount}-line row below the preview body clears its reference`,
        (status) => status.markdownHoveredReference === null,
      );
      HarnessSmoke.Class.pass(
        `${fixtureLineCount}-line row below the preview body remains outside the hit extent`,
      );
      scaleDriver.sendKeys('Escape');
      await HarnessSmoke.Class.awaitStatus(
        scaleDriver,
        scaleStatusPath,
        `${fixtureLineCount}-line boundary arm returns keyboard focus to the source`,
        (status) =>
          status.markdownPaneFocus === 'source' &&
          status.markdownHoveredReference === null,
      );
    }

    console.log(
      `== harness markdown: ${fixtureLineCount}-line source wheel leads at three depths ==`,
    );
    for (const scrollDepth of scrollDepths) {
      const depthSnapshot = scaleDriver.snapshot();
      const depthMarker = structureMarkerPosition(
        depthSnapshot,
        scrollDepth.marker,
      );
      clickCell(scaleDriver, depthMarker.column, depthMarker.row);
      await HarnessSmoke.Class.awaitStatus(
        scaleDriver,
        scaleStatusPath,
        `${fixtureLineCount}-line depth ${scrollDepth.marker} lands before wheel input`,
        (status) =>
          Number(status.cursorLineIndex) === scrollDepth.sourceLine &&
          status.markdownPaneFocus === 'source',
      );
      const scrollPositionBefore =
        HarnessSmoke.Class.readStatus(scaleStatusPath);
      const sourceSnapshot = scaleDriver.snapshot();
      for (let wheelNotch = 0; wheelNotch < 4; wheelNotch++) {
        scaleDriver.sendMouseWithoutFrameExpectation({
          kind: 'wheel',
          direction: 'down',
          column: sourceBorderColumn(sourceSnapshot) + 5,
          row: previewBorder(sourceSnapshot).row + 5,
        });
      }
      await HarnessSmoke.Class.awaitStatus(
        scaleDriver,
        scaleStatusPath,
        `${fixtureLineCount}-line source wheel moves both panes at ${scrollDepth.marker}`,
        (status) =>
          status.markdownPaneFocus === 'source' &&
          Number(status.editorScrollTop) >
            Number(scrollPositionBefore.editorScrollTop) &&
          Number(status.markdownPreviewScrollTop) >
            Number(scrollPositionBefore.markdownPreviewScrollTop),
      );
      const settledScrollStatus = await HarnessSmoke.Class.awaitStatus(
        scaleDriver,
        scaleStatusPath,
        `${fixtureLineCount}-line source-led wheel settles at ${scrollDepth.marker}`,
        (status) =>
          status.workspaceScrollMomentumAtRest === true &&
          status.contributedSurfaceAnimationAtRest === true,
      );
      HarnessSmoke.Class.pass(
        `${fixtureLineCount}-line source wheel moved source ` +
          `${String(scrollPositionBefore.editorScrollTop)} to ` +
          `${String(settledScrollStatus.editorScrollTop)} and preview ` +
          `${String(scrollPositionBefore.markdownPreviewScrollTop)} to ` +
          `${String(settledScrollStatus.markdownPreviewScrollTop)} at ${scrollDepth.marker}`,
      );
    }

    const previewLedPositionBefore =
      HarnessSmoke.Class.readStatus(scaleStatusPath);
    const previewLedSnapshot = scaleDriver.snapshot();
    for (let wheelNotch = 0; wheelNotch < 4; wheelNotch++) {
      scaleDriver.sendMouseWithoutFrameExpectation({
        kind: 'wheel',
        direction: 'up',
        column: previewBorder(previewLedSnapshot).column + 5,
        row: previewBorder(previewLedSnapshot).row + 5,
      });
    }
    await HarnessSmoke.Class.awaitStatus(
      scaleDriver,
      scaleStatusPath,
      `${fixtureLineCount}-line preview wheel moves both panes`,
      (status) =>
        status.markdownPaneFocus === 'preview' &&
        Number(status.markdownPreviewScrollTop) <
          Number(previewLedPositionBefore.markdownPreviewScrollTop) &&
        Number(status.editorScrollTop) <
          Number(previewLedPositionBefore.editorScrollTop),
    );
    const previewLedSettledStatus = await HarnessSmoke.Class.awaitStatus(
      scaleDriver,
      scaleStatusPath,
      `${fixtureLineCount}-line preview-led wheel settles`,
      (status) =>
        status.workspaceScrollMomentumAtRest === true &&
        status.contributedSurfaceAnimationAtRest === true,
    );
    HarnessSmoke.Class.pass(
      `${fixtureLineCount}-line preview wheel moved preview ` +
        `${String(previewLedPositionBefore.markdownPreviewScrollTop)} to ` +
        `${String(previewLedSettledStatus.markdownPreviewScrollTop)} and source ` +
        `${String(previewLedPositionBefore.editorScrollTop)} to ` +
        `${String(previewLedSettledStatus.editorScrollTop)}`,
    );
    scaleDriver.resize(120, 40);
    await HarnessSmoke.Class.awaitStatus(
      scaleDriver,
      scaleStatusPath,
      `${fixtureLineCount}-line TOC drive restores 120 by 40`,
      (status) => status.width === 120 && status.height === 40,
    );
    await HarnessSmoke.Class.concealAutoRevealedRightDock(
      scaleDriver,
      scaleStatusPath,
    );
    await scaleDriver.awaitGridCondition(
      `${fixtureLineCount}-line Markdown split paints at 120 columns`,
      (candidate) =>
        candidate.columns === 120 &&
        candidate.findText('╭─Preview') !== null &&
        sourceBorderColumn(candidate) > previewBorder(candidate).column,
    );

    scaleDriver.resize(60, 25);
    await HarnessSmoke.Class.awaitStatus(
      scaleDriver,
      scaleStatusPath,
      `${fixtureLineCount}-line terminal resize publishes 60 by 25`,
      (status) => status.width === 60 && status.height === 25,
    );
    const narrowScaleSnapshot = await scaleDriver.awaitGridCondition(
      `${fixtureLineCount}-line Markdown split fits the 60-column viewport`,
      (candidate) => {
        if (candidate.columns !== 60 || candidate.rows !== 25) return false;
        const candidatePreviewBorder = candidate.findText('╭─Preview');
        if (!candidatePreviewBorder) return false;
        const candidatePreviewRightColumn = previewPaneRightColumn(candidate);
        const candidateSourceColumn = sourceBorderColumn(candidate);
        const candidateSourceRightColumn = candidate
          .rowText(candidatePreviewBorder.row)
          .lastIndexOf('╮');
        if (
          candidatePreviewRightColumn <= candidatePreviewBorder.column ||
          candidateSourceColumn <= candidatePreviewRightColumn ||
          candidateSourceRightColumn <= candidateSourceColumn ||
          candidateSourceRightColumn >= candidate.columns
        ) {
          return false;
        }
        const previewContainsRenderedHeading = candidate
          .textRows()
          .some((rowText) =>
            rowText
              .slice(candidatePreviewBorder.column, candidatePreviewRightColumn)
              .includes('Scale'),
          );
        return previewContainsRenderedHeading;
      },
    );
    const narrowPreviewBorder = previewBorder(narrowScaleSnapshot);
    const narrowPreviewRightColumn =
      previewPaneRightColumn(narrowScaleSnapshot);
    const narrowSourceColumn = sourceBorderColumn(narrowScaleSnapshot);
    const narrowSourceRightColumn = narrowScaleSnapshot
      .rowText(narrowPreviewBorder.row)
      .lastIndexOf('╮');
    HarnessSmoke.Class.requireCondition(
      narrowPreviewRightColumn < 60 &&
        narrowSourceColumn < 60 &&
        narrowSourceRightColumn < 60,
      `${fixtureLineCount}-line preview, divider, and source stay inside 60 columns`,
    );
  } finally {
    await scaleDriver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(scaleFixtureRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(scaleHomeDirectory);
  }
}

console.log(
  '== harness markdown: terminal shrink reflows the split at small and large scale ==',
);
await driveTerminalShrinkAtScale(500);
await driveTerminalShrinkAtScale(100_000);

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-markdown-harness-'));

const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-markdown-harness-home-'));

const statusPath = join(homeDirectory, 'status.json');

const markdownLines = [
  '# Rendered heading',
  '',
  'Open `target.ts` or [the target](target.ts).',
  '',
  'See [the docs](https://example.com/docs) or [the missing note](missing-note.md).',
  '',
  'Rendered preview find term.',
  '',
  '| Left | Center | Right |',
  '| :--- | :---: | ---: |',
  '| alpha | middle | 7 |',
  '| 漢字 | 🙂 é | 42 |',
  '| content wider than one cell can hold | centered | 9000 |',
  '',
  '| Missing | separator |',
  '| remains | visible |',
  '',
  '| Ragged | header |',
  '| --- | --- |',
  '| row | has | extra |',
  '',
];

for (let sectionNumber = 1; sectionNumber < 90; sectionNumber++) {
  markdownLines.push(
    `## Section ${String(sectionNumber).padStart(2, '0')}`,
    `Rendered row ${String(sectionNumber).padStart(2, '0')} carries selectable preview text.`,
    '',
  );
}

markdownLines.push('TRUE MARKDOWN TAIL');

await Bun.write(
  join(fixtureRoot, 'README.md'),
  `${markdownLines.join('\n')}\n`,
);

await Bun.write(
  join(fixtureRoot, 'target.ts'),
  'export const openedFromMarkdown = true;\n',
);

// A second Markdown document for the per-document dismissal arm. The name sorts AFTER README.md
// and target.ts so the boot selection still lands on README.md.
await Bun.write(
  join(fixtureRoot, 'zebra-notes.md'),
  '# Zebra notes\n\nA second Markdown document.\n',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    LANG: 'C.UTF-8',
    NERD_FONT: '0',
  },
});

try {
  console.log(
    '== harness markdown: the preview auto-opens LEFT of the source ==',
  );
  let snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('README.md') !== null,
    15_000,
  );
  driver.sendKeys('Enter');
  const openedMarkdownStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: String(status.activeBuffer).endsWith('/README.md') && status.markdownPreviewOpen === true && status.markdownPreviewSide === 'left'",
    (status) =>
      String(status.activeBuffer).endsWith('/README.md') &&
      status.markdownPreviewOpen === true &&
      status.markdownPreviewSide === 'left',
  );
  HarnessSmoke.Class.pass(
    'opening a Markdown file auto-opens its preview without a keystroke',
  );
  // At defaults the structure dock ALSO opens (the markdown TOC answers this file) and the
  // preview+source panes shrink until table cells truncate below what the rendering arms
  // assert. Those properties were sized for the two-pane split; conceal the dock through the
  // user's own gesture and keep the property labels unchanged.
  await HarnessSmoke.Class.concealAutoRevealedRightDock(driver, statusPath);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the auto-opened preview publishes the current source revision as parsed',
    (status) =>
      status.markdownParsing === false &&
      Number(status.markdownRevision) ===
        Number(openedMarkdownStatus.bufferRevision) &&
      Number(status.bufferRevision) ===
        Number(openedMarkdownStatus.bufferRevision),
  );
  snapshot = await driver.awaitGridCondition(
    'the auto-opened preview paints rendered content and the tab-bar toggle',
    (candidate) =>
      candidate.findText('╭─Preview') !== null &&
      findPreviewButton(candidate) !== null &&
      previewHasMarker(candidate, 'Rendered row 01'),
  );
  HarnessSmoke.Class.requireCondition(
    previewBorder(snapshot).column < sourceBorderColumn(snapshot),
    'the preview pane sits LEFT of the source pane by default',
  );
  HarnessSmoke.Class.requireCondition(
    HarnessSmoke.Class.readStatus(statusPath).markdownPaneFocus === 'source',
    'auto-open keeps the keyboard on the source pane',
  );
  const renderedHeading = previewMarkerPosition(snapshot, 'Rendered heading');
  HarnessSmoke.Class.requireCondition(
    !snapshot
      .rowText(renderedHeading.row)
      .slice(renderedHeading.column - 2)
      .startsWith('# '),
    'preview heading omits raw Markdown punctuation',
  );

  console.log(
    '== harness markdown: tables align by display cells and clip inside narrow panes ==',
  );
  const headerTableRow = previewRowContaining(snapshot, 'Left');
  const asciiTableRow = previewRowContaining(snapshot, 'alpha');
  const wideTableRow = previewRowContaining(snapshot, '漢');
  const headerBoundaries = tableBoundaryColumns(snapshot, headerTableRow);
  const asciiBoundaries = tableBoundaryColumns(snapshot, asciiTableRow);
  const wideBoundaries = tableBoundaryColumns(snapshot, wideTableRow);
  HarnessSmoke.Class.requireCondition(
    headerBoundaries.length === 4 &&
      JSON.stringify(asciiBoundaries) === JSON.stringify(headerBoundaries) &&
      JSON.stringify(wideBoundaries) === JSON.stringify(headerBoundaries),
    'ASCII CJK emoji and combining-mark rows share table cell boundaries',
  );

  const asciiRowText = snapshot.rowText(asciiTableRow);
  const firstContentWidth = headerBoundaries[1]! - headerBoundaries[0]! - 3;
  const secondContentWidth = headerBoundaries[2]! - headerBoundaries[1]! - 3;
  const thirdContentWidth = headerBoundaries[3]! - headerBoundaries[2]! - 3;
  HarnessSmoke.Class.requireCondition(
    displayColumnOfText(asciiRowText, 'alpha', headerBoundaries[0]!) ===
      headerBoundaries[0]! + 2 &&
      displayColumnOfText(asciiRowText, 'middle', headerBoundaries[1]!) ===
        headerBoundaries[1]! +
          2 +
          Math.floor(
            (secondContentWidth - TextCoordinates.Class.lineWidth('middle')) /
              2,
          ) &&
      displayColumnOfText(asciiRowText, '7', headerBoundaries[2]!) ===
        headerBoundaries[2]! +
          2 +
          thirdContentWidth -
          TextCoordinates.Class.lineWidth('7') &&
      firstContentWidth >= TextCoordinates.Class.lineWidth('alpha'),
    'alignment markers place body cells left center and right',
  );
  const separatorRow = previewRowContaining(
    snapshot,
    ThemeIcons.Class.tableBordersFor('unicode').leftJunction,
  );
  HarnessSmoke.Class.requireCondition(
    tableBoundaryColumns(snapshot, separatorRow).length === 0 &&
      snapshot
        .rowText(separatorRow)
        .includes(ThemeIcons.Class.tableBordersFor('unicode').intersection),
    'the header separator is theme vocabulary rather than raw Markdown dashes',
  );
  const malformedRow = previewRowContaining(snapshot, '| Missing');
  HarnessSmoke.Class.requireCondition(
    snapshot
      .rowText(malformedRow)
      .slice(previewBorder(snapshot).column)
      .includes('| Missing | separator |'),
    'a missing table separator remains visible as raw paragraph text',
  );
  const raggedRow = previewRowContaining(snapshot, '| Ragged');
  HarnessSmoke.Class.requireCondition(
    snapshot
      .rowText(raggedRow)
      .slice(previewBorder(snapshot).column)
      .includes('| Ragged | header |'),
    'a ragged table keeps its raw header',
  );
  HarnessSmoke.Class.requireCondition(
    previewHasMarker(snapshot, '| --- | --- |'),
    'a ragged table keeps its raw separator',
  );
  HarnessSmoke.Class.requireCondition(
    previewHasMarker(snapshot, '| row') &&
      previewHasMarker(snapshot, '| has | extra |'),
    'a ragged table keeps its raw extra cell',
  );

  // The narrow-pane contract is tested by DRAGGING THE DIVIDER, not by resizing the terminal: a
  // terminal SHRINK never re-lays-out the split's pane widths (pre-existing host defect, present on
  // unmodified main when the preview is opened with the toggle chord — the old flow's tab-button
  // click masked it; see the #237 task-folder probes). The divider drag reaches the same narrow
  // preview through a driven, deterministic path.
  const wideRatioStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Markdown split ratio is published before the narrow-pane drag',
    (status) => typeof status.markdownSplitRatio === 'number',
  );
  const wideRatio = Number(wideRatioStatus.markdownSplitRatio);
  const narrowDragStartColumn = sourceBorderColumn(snapshot) - 1;
  const narrowDragRow = previewBorder(snapshot).row + 7;
  driver.sendMouse({
    kind: 'press',
    column: narrowDragStartColumn,
    row: narrowDragRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'move',
    column: previewBorder(snapshot).column + 16,
    row: narrowDragRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: previewBorder(snapshot).column + 16,
    row: narrowDragRow,
    button: 'left',
  });
  const narrowSnapshot = await driver.awaitGridCondition(
    'the aligned table repaints inside the dragged-narrow preview pane',
    (candidate) => {
      // The wait must observe a COHERENT narrow frame: pane narrowed AND the table's junction
      // row re-laid-out to end exactly on the pane border. Under gate load the drag's resize
      // and the table's re-layout land in separate frames, and sampling between them let the
      // border-intact assertion below read a mid-relayout grid.
      if (candidate.findText('╭─Preview') === null) return false;
      const candidatePreviewColumn = previewBorder(candidate).column;
      const candidateRightColumn = previewPaneRightColumn(candidate);
      if (candidateRightColumn >= candidatePreviewColumn + 24) return false;
      const junctionGlyph =
        ThemeIcons.Class.tableBordersFor('unicode').leftJunction;
      for (let row = 0; row < candidate.rows; row++) {
        const paneText = candidate
          .rowText(row)
          .slice(candidatePreviewColumn, candidateRightColumn);
        if (!paneText.includes(junctionGlyph)) continue;
        return (
          candidate.cell(row, candidateRightColumn)?.characters ===
          ThemeIcons.Class.tableBordersFor('unicode').vertical
        );
      }
      return false;
    },
  );
  const narrowHeaderRow = previewRowContaining(
    narrowSnapshot,
    ThemeIcons.Class.tableBordersFor('unicode').leftJunction,
  );
  HarnessSmoke.Class.requireCondition(
    narrowSnapshot.cell(narrowHeaderRow, previewPaneRightColumn(narrowSnapshot))
      ?.characters === ThemeIcons.Class.tableBordersFor('unicode').vertical,
    'a too-wide table leaves the preview pane outer border intact',
  );
  // Drag the divider back and confirm the wide table layout returns.
  const narrowSourceBorderColumn = sourceBorderColumn(narrowSnapshot);
  driver.sendMouse({
    kind: 'press',
    column: narrowSourceBorderColumn - 1,
    row: narrowDragRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'move',
    column: narrowDragStartColumn,
    row: narrowDragRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: narrowDragStartColumn,
    row: narrowDragRow,
    button: 'left',
  });
  snapshot = await driver.awaitGridCondition(
    'the aligned table returns at the restored split ratio',
    (candidate) =>
      candidate.findText('╭─Preview') !== null &&
      findPreviewButton(candidate) !== null &&
      Math.abs(sourceBorderColumn(candidate) - narrowDragStartColumn - 1) <=
        2 &&
      candidate.findText(
        ThemeIcons.Class.tableBordersFor('unicode').leftJunction,
      ) !== null,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the restored split ratio is published near its pre-drag value',
    (status) => Math.abs(Number(status.markdownSplitRatio) - wideRatio) <= 0.06,
  );

  console.log(
    '== harness markdown: a hand-close binds to its document; other tabs keep the default ==',
  );
  let button = previewButton(snapshot);
  clickCell(driver, button.column, button.row);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.markdownPreviewOpen === false',
    (status) => status.markdownPreviewOpen === false,
  );
  HarnessSmoke.Class.pass('the tab button closes the auto-opened preview');
  snapshot = await driver.awaitGridCondition(
    'the preview pane is absent after the hand-close',
    (candidate) =>
      candidate.findText('╭─Preview') === null &&
      findPreviewButton(candidate) !== null,
  );
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File opens for the second Markdown document',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText('zebra-notes.md');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File finds the second Markdown document',
    (status) =>
      status.quickOpenQuery === 'zebra-notes.md' &&
      Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: String(status.activeBuffer).endsWith('/zebra-notes.md') && status.markdownPreviewOpen === true",
    (status) =>
      String(status.activeBuffer).endsWith('/zebra-notes.md') &&
      status.markdownPreviewOpen === true,
  );
  HarnessSmoke.Class.pass(
    'another Markdown tab re-applies the open-by-default preview',
  );
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File opens for the return to the dismissed document',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText('README.md');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File finds the dismissed document',
    (status) =>
      status.quickOpenQuery === 'README.md' &&
      Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: String(status.activeBuffer).endsWith('/README.md') && status.markdownPreviewOpen === false",
    (status) =>
      String(status.activeBuffer).endsWith('/README.md') &&
      status.markdownPreviewOpen === false,
  );
  HarnessSmoke.Class.pass(
    'a hand-closed preview stays closed for its own document',
  );
  snapshot = await driver.awaitGridCondition(
    'the tab toggle is painted for the reopen',
    (candidate) => {
      // Returning to README also auto-hides the structure dock (its reader closed it for this
      // document), and the toggle button rides the editor column's right edge as it widens.
      // Clicking a pre-relayout position lands on empty tab row, so wait for the button at its
      // settled dock-free position before measuring the click target.
      const candidateButton = findPreviewButton(candidate);
      return (
        candidate.findText('╭─Preview') === null &&
        candidateButton !== null &&
        candidateButton.column > candidate.columns - 12
      );
    },
  );
  button = previewButton(snapshot);
  clickCell(driver, button.column, button.row);
  snapshot = await driver.awaitSnapshot((candidate) =>
    previewHasMarker(candidate, 'target.ts'),
  );

  console.log(
    '== harness markdown: rendered references hover and Ctrl+Enter open ==',
  );
  let markerPosition = previewMarkerPosition(snapshot, 'target.ts');
  driver.sendMouse({
    kind: 'move',
    column: markerPosition.column,
    row: markerPosition.row,
    button: 'none',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: String(status.markdownHoveredReference).endsWith('/target.ts')",
    (status) => String(status.markdownHoveredReference).endsWith('/target.ts'),
  );
  HarnessSmoke.Class.pass(
    'inline-code reference resolves inside the workspace',
  );
  markerPosition = previewMarkerPosition(driver.snapshot(), 'the target');
  driver.sendMouse({
    kind: 'move',
    column: markerPosition.column,
    row: markerPosition.row,
    button: 'none',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: String(status.markdownHoveredReference).endsWith('/target.ts')",
    (status) => String(status.markdownHoveredReference).endsWith('/target.ts'),
  );
  HarnessSmoke.Class.pass(
    'standard Markdown link resolves inside the workspace',
  );
  driver.sendRawInput('\x1b[13;5u');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: String(status.activeBuffer).endsWith('/target.ts')",
    (status) => String(status.activeBuffer).endsWith('/target.ts'),
  );
  HarnessSmoke.Class.pass('Ctrl+Enter opens the hovered reference');

  snapshot = await driver.awaitGridCondition(
    'the target file content is painted before returning to the README tab',
    (candidate) => candidate.findText('openedFromMarkdown') !== null,
  );
  const readmeTabPosition = snapshot.findText('README.md');
  if (!readmeTabPosition) throw new Error('FAIL README tab missing');
  clickCell(driver, readmeTabPosition.column + 2, readmeTabPosition.row);
  snapshot = await driver.awaitSnapshot((candidate) =>
    previewHasMarker(candidate, 'Rendered heading'),
  );

  console.log(
    '== harness markdown: an unresolvable link states why, never silently ==',
  );
  // invariant: An unresolvable Markdown link states why (src/modules/markdown/markdown.invariants.md)
  // Anchor on a RESOLVABLE hover first: layout may still be shifting after the tab return (the
  // structure dock re-reveals for the markdown TOC), and hovered-reference status is the one
  // signal that proves the measured grid coordinates are live before any click is spent.
  const anchorPosition = previewMarkerPosition(driver.snapshot(), 'the target');
  driver.sendMouse({
    kind: 'move',
    column: anchorPosition.column,
    row: anchorPosition.row,
    button: 'none',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the hover anchor resolves before the unresolvable-link clicks',
    (status) => String(status.markdownHoveredReference).endsWith('/target.ts'),
  );
  const externalLinkPosition = previewMarkerPosition(
    driver.snapshot(),
    'the docs',
  );
  const missingLinkPaintPosition = previewMarkerPosition(
    driver.snapshot(),
    'the missing note',
  );
  HarnessSmoke.Class.requireCondition(
    driver
      .snapshot()
      .cell(externalLinkPosition.row, externalLinkPosition.column)
      ?.foreground === packedThemeColor(ThemePalettes.Class.DARK.accent) &&
      driver
        .snapshot()
        .cell(missingLinkPaintPosition.row, missingLinkPaintPosition.column)
        ?.foreground === packedThemeColor(ThemePalettes.Class.DARK.error),
    'a missing relative link paints red while an external link stays normal',
  );
  driver.sendMouse({
    kind: 'move',
    column: externalLinkPosition.column,
    row: externalLinkPosition.row,
    button: 'none',
  });
  driver.sendMouse({
    kind: 'press',
    column: externalLinkPosition.column,
    row: externalLinkPosition.row,
    button: 'left',
    control: true,
  });
  driver.sendMouse({
    kind: 'release',
    column: externalLinkPosition.column,
    row: externalLinkPosition.row,
    button: 'left',
    control: true,
  });
  const externalNoticeStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Ctrl-clicking an external link states the no-op',
    (status) =>
      status.markdownLinkNotice ===
      'External link — not opened here: https://example.com/docs',
  );
  if (!String(externalNoticeStatus.activeBuffer).endsWith('/README.md')) {
    throw new Error(
      `FAIL external link changed the buffer: ${String(externalNoticeStatus.activeBuffer)}`,
    );
  }
  await driver.awaitGridCondition(
    'the external-link notice paints in the status bar',
    (candidate) =>
      candidate.findText('External link — not opened here') !== null,
  );
  HarnessSmoke.Class.pass(
    'an external link answers the click with a stated no-op, buffer unchanged',
  );

  const missingLinkPosition = previewMarkerPosition(
    driver.snapshot(),
    'the missing note',
  );
  driver.sendMouse({
    kind: 'press',
    column: missingLinkPosition.column,
    row: missingLinkPosition.row,
    button: 'left',
    control: true,
  });
  driver.sendMouse({
    kind: 'release',
    column: missingLinkPosition.column,
    row: missingLinkPosition.row,
    button: 'left',
    control: true,
  });
  const missingNoticeStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Ctrl-clicking a missing-target link states the miss',
    (status) =>
      status.markdownLinkNotice === 'Link target not found: missing-note.md',
  );
  if (!String(missingNoticeStatus.activeBuffer).endsWith('/README.md')) {
    throw new Error(
      `FAIL missing-target link changed the buffer: ${String(missingNoticeStatus.activeBuffer)}`,
    );
  }
  HarnessSmoke.Class.pass(
    'a missing-target link answers the click with the stated miss',
  );

  // Repair the same authored link through the source watcher. Its written state is stale
  // (`active`) while the task folder now lives under `completed`; the task name and file tail
  // are unchanged. The new parse revision must repaint the link normally before it opens.
  const movedTaskFolderName = '999-task-state-link-control';
  const movedTaskFolder = join(
    fixtureRoot,
    '.invar',
    'tasks',
    'completed',
    movedTaskFolderName,
  );
  mkdirSync(movedTaskFolder, { recursive: true });
  await Bun.write(
    join(movedTaskFolder, `task-${movedTaskFolderName}.md`),
    '# Moved task target\n',
  );
  const revisionBeforeRepair = Number(
    HarnessSmoke.Class.readStatus(statusPath).bufferRevision,
  );
  const repairedMarkdownText = `${markdownLines
    .map((line) =>
      line.replace(
        '[the missing note](missing-note.md)',
        `[the missing note](.invar/tasks/active/${movedTaskFolderName}/task-${movedTaskFolderName}.md)`,
      ),
    )
    .join('\n')}\n`;
  const repairSourceColumn = sourceBorderColumn(driver.snapshot()) + 8;
  clickCell(
    driver,
    repairSourceColumn,
    previewBorder(driver.snapshot()).row + 3,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the source pane receives focus before the repair edit',
    (status) => status.markdownPaneFocus === 'source',
  );
  driver.sendKeys('Control+a');
  driver.sendPaste(repairedMarkdownText);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the watcher repair reaches a matching parsed revision',
    (status) =>
      Number(status.bufferRevision) > revisionBeforeRepair &&
      status.markdownParsing === false &&
      Number(status.markdownRevision) === Number(status.bufferRevision),
  );
  // The full-document paste leaves the source cursor at the end. Scroll sync honestly follows
  // that user-led source position, so return to the repaired link before judging its new paint.
  driver.sendKeys('Control+Home');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the repaired source returns to its first row before its link paint is judged',
    (status) => Number(status.editorScrollTop) === 0,
  );
  const repairedSnapshot = await driver.awaitGridCondition(
    'the repaired moved-state link repaints with the normal link color',
    (candidate) => {
      const repairedPosition = previewMarkerPosition(
        candidate,
        'the missing note',
      );
      return (
        candidate.cell(repairedPosition.row, repairedPosition.column)
          ?.foreground === packedThemeColor(ThemePalettes.Class.DARK.accent)
      );
    },
  );
  HarnessSmoke.Class.pass(
    'a watcher revision repaints the repaired moved-state link normally',
  );
  driver.sendKeys('Control+s');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the repaired source saves before later tab-layout contracts run',
    (status) => status.dirty === false,
  );
  const resolvableLinkPosition = previewMarkerPosition(
    repairedSnapshot,
    'the missing note',
  );
  driver.sendMouse({
    kind: 'press',
    column: resolvableLinkPosition.column,
    row: resolvableLinkPosition.row,
    button: 'left',
    control: true,
  });
  driver.sendMouse({
    kind: 'release',
    column: resolvableLinkPosition.column,
    row: resolvableLinkPosition.row,
    button: 'left',
    control: true,
  });
  const movedTaskTargetStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the moved-state task link opens and clears the link notice',
    (status) =>
      String(status.activeBuffer).endsWith(`/task-${movedTaskFolderName}.md`) &&
      status.markdownLinkNotice === null,
  );
  HarnessSmoke.Class.pass(
    'a moved-state task link opens the current file and clears the stated notice',
  );
  driver.sendKeys('Control+w');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'closing the moved task target removes its tab',
    (status) =>
      !String(status.activeBuffer).endsWith(
        `/task-${movedTaskFolderName}.md`,
      ) &&
      Number(status.bufferTabCount) <
        Number(movedTaskTargetStatus.bufferTabCount),
  );
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File opens for the repaired README',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText('README.md');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File finds the repaired README',
    (status) =>
      status.quickOpenQuery === 'README.md' &&
      Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Go to File returns to the repaired source preview',
    (status) =>
      String(status.activeBuffer).endsWith('/README.md') &&
      status.markdownPreviewOpen === true,
  );
  snapshot = await driver.awaitSnapshot((candidate) =>
    previewHasMarker(candidate, 'Rendered heading'),
  );

  console.log(
    '== harness markdown: splitter moves and persists across preview remount ==',
  );
  const sourceColumnBefore = sourceBorderColumn(snapshot);
  const ratioBeforeStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Markdown split ratio is published before divider movement',
    (status) => typeof status.markdownSplitRatio === 'number',
  );
  const ratioBefore = Number(ratioBeforeStatus.markdownSplitRatio);
  // The divider sits between the LEFT preview pane and the source. The ratio names the SOURCE
  // pane's share, so a low ratio means the divider sits far right — drag away from the clamp.
  const dividerColumn = sourceColumnBefore - 1;
  const dividerTargetColumn =
    ratioBefore <= 0.3 ? dividerColumn - 10 : dividerColumn + 10;
  const dividerRow = previewBorder(snapshot).row + 7;
  driver.sendMouse({
    kind: 'press',
    column: dividerColumn,
    row: dividerRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'move',
    column: dividerTargetColumn,
    row: dividerRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: dividerTargetColumn,
    row: dividerRow,
    button: 'left',
  });
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('╭─Preview') !== null &&
      sourceBorderColumn(candidate) !== sourceColumnBefore,
  );
  const sourceColumnAfter = sourceBorderColumn(snapshot);
  const persistedRatioStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'divider movement publishes a changed Markdown split ratio',
    (status) =>
      typeof status.markdownSplitRatio === 'number' &&
      status.markdownSplitRatio !== ratioBefore,
  );
  const persistedRatio = Number(persistedRatioStatus.markdownSplitRatio);
  HarnessSmoke.Class.pass(
    `divider moved the source border ${sourceColumnBefore} to ${sourceColumnAfter} and changed the ratio`,
  );
  button = previewButton(snapshot);
  clickCell(driver, button.column, button.row);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.markdownPreviewOpen === false',
    (status) => status.markdownPreviewOpen === false,
  );
  snapshot = await driver.awaitGridCondition(
    'the remount action starts from a source-only Markdown editor',
    (candidate) =>
      candidate.findText('╭─Preview') === null &&
      findPreviewButton(candidate) !== null,
  );
  button = previewButton(snapshot);
  clickCell(driver, button.column, button.row);
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      previewHasMarker(candidate, 'Rendered heading') &&
      candidate.findText('╭─Preview') !== null &&
      sourceBorderColumn(candidate) === sourceColumnAfter,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the remounted preview publishes the persisted split ratio',
    (status) => Number(status.markdownSplitRatio) === persistedRatio,
  );
  HarnessSmoke.Class.pass('remounted preview reuses the persisted split ratio');

  console.log(
    '== harness markdown: edge drag autoscrolls, copies, and pastes into source ==',
  );
  const preview = previewBorder(snapshot);
  const selectionColumn = preview.column + 5;
  driver.sendMouse({
    kind: 'press',
    column: selectionColumn,
    row: preview.row + 3,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'move',
    column: selectionColumn,
    row: 34,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'move',
    column: selectionColumn,
    row: snapshot.rows - 1,
    button: 'left',
  });
  const selectionStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: Number(status.markdownPreviewScrollTop) > 0 && Number(status.markdownPreviewSelectionChars) > 100',
    (status) =>
      Number(status.markdownPreviewScrollTop) > 0 &&
      Number(status.markdownPreviewSelectionChars) > 100,
  );
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: selectionColumn,
    row: snapshot.rows - 1,
    button: 'left',
  });
  driver.sendKeysWithoutFrameExpectation('Control+c');
  const copiedStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'the copied character count matches the completed Markdown preview selection',
    (status) =>
      Number(status.lastCopyChars) > 0 &&
      Number(status.lastCopyChars) ===
        Number(status.markdownPreviewSelectionChars) &&
      Number(status.markdownPreviewSelectionChars) >=
        Number(selectionStatus.markdownPreviewSelectionChars),
  );
  const selectionCharacters = Number(
    copiedStatus.markdownPreviewSelectionChars,
  );
  HarnessSmoke.Class.pass(
    `edge drag scrolled to ${String(copiedStatus.markdownPreviewScrollTop)} and selected ` +
      `${selectionCharacters} rendered chars`,
  );
  HarnessSmoke.Class.requireCondition(
    Number(copiedStatus.lastCopyChars) === selectionCharacters &&
      typeof copiedStatus.lastCopyHash === 'string' &&
      copiedStatus.lastCopyHash.length > 0,
    'Ctrl+C copies exactly the rendered selection range',
  );

  snapshot = driver.snapshot();
  const sourceColumn = sourceBorderColumn(snapshot) + 8;
  clickCell(driver, sourceColumn, previewBorder(snapshot).row + 3);
  const sourceFocusStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Markdown source pane is focused with a published buffer revision',
    (status) =>
      status.markdownPaneFocus === 'source' &&
      typeof status.bufferRevision === 'number',
  );
  const revisionBeforePaste = Number(sourceFocusStatus.bufferRevision);
  driver.sendKeys('Control+v');
  const pastedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: Number(status.bufferRevision) > revisionBeforePaste && status.markdownPaneFocus === 'source'",
    (status) =>
      Number(status.bufferRevision) > revisionBeforePaste &&
      status.markdownPaneFocus === 'source',
  );
  HarnessSmoke.Class.pass(
    `Ctrl+V pastes into source (${revisionBeforePaste} to ${String(pastedStatus.bufferRevision)})`,
  );

  console.log(
    '== harness markdown: source and preview retain independent Find queries ==',
  );
  driver.sendKeys('Control+f');
  await driver.awaitSnapshot((candidate) => candidate.findText('Aa') !== null);
  driver.sendText('#');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.sourceFindQuery === '#'",
    (status) => status.sourceFindQuery === '#',
  );
  driver.sendKeys('Escape');
  snapshot = await driver.awaitGridCondition(
    'Escape closes source Find and reveals the Markdown preview border',
    (candidate) =>
      candidate.findText('╭─Find') === null &&
      candidate.findText('╭─Preview') !== null,
  );
  const reopenedPreview = previewBorder(snapshot);
  clickCell(driver, reopenedPreview.column + 5, reopenedPreview.row + 2);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.markdownPaneFocus === 'preview'",
    (status) => status.markdownPaneFocus === 'preview',
  );
  driver.sendKeys('Control+f');
  await driver.awaitSnapshot((candidate) => candidate.findText('Aa') !== null);
  driver.sendText('Rendered');
  const findStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.sourceFindQuery === '#' && status.markdownPreviewFindQuery === 'Rendered' && String(status.findTarget).endsWith(`markdown-preview:${fixtureRoot}/README.md`) && Number(status.findMatchCount) > 0",
    (status) =>
      status.sourceFindQuery === '#' &&
      status.markdownPreviewFindQuery === 'Rendered' &&
      String(status.findTarget).endsWith(
        `markdown-preview:${fixtureRoot}/README.md`,
      ) &&
      Number(status.findMatchCount) > 0,
  );
  HarnessSmoke.Class.pass(
    `independent preview Find owns ${String(findStatus.findMatchCount)} rendered matches`,
  );

  console.log(
    '== harness markdown: the contributed side setting flips the preview to the right ==',
  );
  driver.sendKeys('Escape');
  await driver.awaitGridCondition(
    'the preview Find bar closes before Settings opens',
    (candidate) => candidate.findText('╭─Find') === null,
  );
  driver.sendKeys('Control+,');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Settings opens over the contributed Markdown schema',
    (status) => status.settingsOpen === true,
  );
  let settingsStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the settings selection publishes its current label',
    (status) => typeof status.settingsSelectedLabel === 'string',
  );
  for (
    let navigationStep = 0;
    navigationStep < 60 &&
    settingsStatus.settingsSelectedLabel !==
      'Scroll source and preview together';
    navigationStep += 1
  ) {
    const previousLabel = settingsStatus.settingsSelectedLabel;
    driver.sendKeys('Down');
    settingsStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'settings navigation advances toward Markdown scroll sync',
      (candidate) => candidate.settingsSelectedLabel !== previousLabel,
    );
  }
  HarnessSmoke.Class.requireCondition(
    settingsStatus.settingsSelectedLabel ===
      'Scroll source and preview together',
    'Markdown scroll sync is contributed to the live settings schema',
  );
  driver.sendKeys('Right');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the contributed Markdown scroll-sync setting turns off',
    (status) => status.markdownPreviewScrollSync === false,
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Settings closes with Markdown scroll sync disabled',
    (status) =>
      status.settingsOpen === false &&
      status.markdownPreviewOpen === true &&
      status.markdownPreviewScrollSync === false,
  );

  snapshot = await driver.awaitGridCondition(
    'Settings paint clears before the disabled scroll probes',
    (candidate) =>
      candidate.findText('Settings') === null &&
      candidate.findText('╭─Preview') !== null,
  );
  const disabledSourcePositionBefore =
    HarnessSmoke.Class.readStatus(statusPath);
  for (let wheelNotch = 0; wheelNotch < 4; wheelNotch++) {
    driver.sendMouseWithoutFrameExpectation({
      kind: 'wheel',
      direction: 'down',
      column: sourceBorderColumn(snapshot) + 5,
      row: previewBorder(snapshot).row + 5,
    });
  }
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the source wheel still moves its own pane while sync is off',
    (status) =>
      status.markdownPaneFocus === 'source' &&
      Number(status.editorScrollTop) >
        Number(disabledSourcePositionBefore.editorScrollTop),
  );
  const disabledSourceSettled = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the independent source wheel settles',
    (status) =>
      status.workspaceScrollMomentumAtRest === true &&
      status.contributedSurfaceAnimationAtRest === true,
  );
  HarnessSmoke.Class.requireCondition(
    Number(disabledSourceSettled.markdownPreviewScrollTop) ===
      Number(disabledSourcePositionBefore.markdownPreviewScrollTop),
    'markdownPreviewScrollSync=false leaves the preview fixed during source wheel input',
  );

  const disabledPreviewPositionBefore =
    HarnessSmoke.Class.readStatus(statusPath);
  const focusedPreviewSnapshot = driver.snapshot();
  for (let wheelNotch = 0; wheelNotch < 4; wheelNotch++) {
    driver.sendMouseWithoutFrameExpectation({
      kind: 'wheel',
      direction: 'down',
      column: previewBorder(focusedPreviewSnapshot).column + 5,
      row: previewBorder(focusedPreviewSnapshot).row + 5,
    });
  }
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the preview wheel still moves its own pane while sync is off',
    (status) =>
      status.markdownPaneFocus === 'preview' &&
      Number(status.markdownPreviewScrollTop) >
        Number(disabledPreviewPositionBefore.markdownPreviewScrollTop),
  );
  const disabledPreviewSettled = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the independent preview wheel settles',
    (status) =>
      status.workspaceScrollMomentumAtRest === true &&
      status.contributedSurfaceAnimationAtRest === true,
  );
  HarnessSmoke.Class.requireCondition(
    Number(disabledPreviewSettled.editorScrollTop) ===
      Number(disabledPreviewPositionBefore.editorScrollTop),
    'markdownPreviewScrollSync=false leaves the source fixed during preview wheel input',
  );
  HarnessSmoke.Class.pass(
    'the contributed setting disables scroll follow in both directions',
  );

  driver.sendKeys('Control+,');
  settingsStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Settings reopens on the Markdown scroll-sync row',
    (status) =>
      status.settingsOpen === true &&
      status.settingsSelectedLabel === 'Scroll source and preview together',
  );
  driver.sendKeys('Right');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the contributed Markdown scroll-sync setting turns back on',
    (status) => status.markdownPreviewScrollSync === true,
  );
  driver.sendKeys('Up');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'settings navigation returns to Preview side',
    (status) => status.settingsSelectedLabel === 'Preview side',
  );
  driver.sendKeys('Right');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.markdownPreviewSide === 'right'",
    (status) => status.markdownPreviewSide === 'right',
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Settings closes with the preview still open on the right',
    (status) =>
      status.settingsOpen === false && status.markdownPreviewOpen === true,
  );
  const rightSnapshot = await driver.awaitGridCondition(
    'the right-side preview paints rendered content beside its source',
    (candidate) =>
      candidate.findText('╭─Preview') !== null &&
      previewHasMarker(candidate, 'Section 01'),
  );
  const rightPreview = previewBorder(rightSnapshot);
  const firstBoxCorner = rightSnapshot.rowText(rightPreview.row).indexOf('╭');
  HarnessSmoke.Class.requireCondition(
    firstBoxCorner >= 0 && firstBoxCorner < rightPreview.column,
    'markdownPreviewSide=right places the preview pane RIGHT of the source',
  );
  HarnessSmoke.Class.pass(
    'the contributed side setting flips the live preview to the right',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-markdown-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
