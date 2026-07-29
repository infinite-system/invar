#!/usr/bin/env bun
// Byte-level Markdown split-preview contract: the auto-opened LEFT preview, per-document
// hand-close memory, the contributed side setting, rendered links, persisted splitter,
// edge-selection autoscroll/copy/paste, and independent source/preview find all cross the real PTY.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: The Markdown preview opens itself and sits on the configured side (src/modules/markdown/markdown.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TextCoordinates } from '../../src/modules/text/TextCoordinates';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
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

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-markdown-harness-'));

const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-markdown-harness-home-'));

const statusPath = join(homeDirectory, 'status.json');

const markdownLines = [
  '# Rendered heading',
  '',
  'Open `target.ts` or [the target](target.ts).',
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
  // Known defect, not masked: the split's CONTENT viewports keep their pre-conceal width when
  // the editor column grows back (#263's resize-handshake family — reported as bycatch from
  // this arm). Remount the split at the final width through the user's own preview toggle so
  // the arms below measure the geometry they were written for.
  driver.sendKeys('Control+Shift+v');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the preview toggles off before the width-true remount',
    (status) => status.markdownPreviewOpen === false,
  );
  driver.sendKeys('Control+Shift+v');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the preview remounts at the dock-free width',
    (status) => status.markdownPreviewOpen === true,
  );
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
    (candidate) =>
      candidate.findText('╭─Preview') !== null &&
      previewPaneRightColumn(candidate) <
        previewBorder(candidate).column + 24 &&
      candidate.findText(
        ThemeIcons.Class.tableBordersFor('unicode').leftJunction,
      ) !== null,
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
    settingsStatus.settingsSelectedLabel !== 'Preview side';
    navigationStep += 1
  ) {
    const previousLabel = settingsStatus.settingsSelectedLabel;
    driver.sendKeys('Down');
    settingsStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'settings navigation advances toward Preview side',
      (candidate) => candidate.settingsSelectedLabel !== previousLabel,
    );
  }
  HarnessSmoke.Class.requireCondition(
    settingsStatus.settingsSelectedLabel === 'Preview side',
    'Preview side is contributed to the live settings schema',
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
      previewHasMarker(candidate, 'Rendered heading'),
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
