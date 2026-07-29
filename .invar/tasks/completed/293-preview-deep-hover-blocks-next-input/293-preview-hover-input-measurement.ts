#!/usr/bin/env bun
// Measures the next input after a Markdown preview reference hover at 10, 500, and 100,000 lines.
//
// Run from the worktree root:
// bun .invar/tasks/in-progress/293-preview-deep-hover-blocks-next-input/293-preview-hover-input-measurement.ts
//
// Set PREVIEW_HOVER_REPOSITORY_ROOT to drive another checkout through this instrument.
//
// Each RESULT reports the time until the hover publishes and the time until the next input lands.
// PASS means both changes landed before the existing 15-second deadline. TIMEOUT means the named
// input missed that deadline. The 100,000-line pointer and Escape arms reproduce the two reported
// failures independently.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { HarnessSnapshot } from '../../../../scripts/harness/HarnessSnapshot';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

const INPUT_DEADLINE_MILLISECONDS = 15_000;
const repositoryRoot = resolve(
  process.env.PREVIEW_HOVER_REPOSITORY_ROOT ?? '.',
);

function previewBorder(snapshot: HarnessSnapshot.Model): {
  row: number;
  column: number;
} {
  const position = snapshot.findText('╭─Preview');
  if (!position)
    throw new Error(`FAIL preview border missing\n${snapshot.text()}`);
  return position;
}

function previewPaneRightColumn(snapshot: HarnessSnapshot.Model): number {
  const preview = previewBorder(snapshot);
  const rowText = snapshot.rowText(preview.row);
  const sourceOpeningColumn = rowText.indexOf('╭', preview.column + 1);
  const scanEndColumn =
    sourceOpeningColumn >= 0 ? sourceOpeningColumn : rowText.length;
  const closingColumn = rowText.lastIndexOf('╮', scanEndColumn);
  return closingColumn > preview.column ? closingColumn : rowText.length;
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

function structureMarkerPosition(
  snapshot: HarnessSnapshot.Model,
  marker: string,
): { row: number; column: number } {
  const previewRightColumn = previewPaneRightColumn(snapshot);
  const rowCount = snapshot.rows;
  for (let row = 0; row < rowCount; row++) {
    const column = snapshot.rowText(row).lastIndexOf(marker);
    if (column > previewRightColumn) return { row, column };
  }
  throw new Error(
    `FAIL structure marker missing: ${marker}\n${snapshot.text()}`,
  );
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.round((performance.now() - startedAt) * 10) / 10;
}

async function driveMeasurement(
  fixtureLineCount: number,
  nextInput: 'pointer' | 'Escape',
): Promise<MeasurementResult> {
  let hoverMilliseconds: number | null = null;
  let nextInputMilliseconds: number | null = null;
  let measuredPhase = 'launch';
  let hoverFrame: number | null = null;
  const fixtureRoot = mkdtempSync(
    join(tmpdir(), `preview-hover-${fixtureLineCount}-${nextInput}-`),
  );
  const homeDirectory = mkdtempSync(
    join(tmpdir(), `preview-hover-home-${fixtureLineCount}-${nextInput}-`),
  );
  const statusPath = join(homeDirectory, 'status.json');
  const jumpSourceLine =
    fixtureLineCount <= 40
      ? Math.max(7, Math.floor(fixtureLineCount * 0.7))
      : Math.floor(fixtureLineCount * 0.75);
  const jumpMarker = `Jump ${fixtureLineCount}`;
  const fixtureLines = Array.from(
    { length: fixtureLineCount },
    (_unusedValue, lineIndex) => {
      if (lineIndex === 0) return `# Scale fixture ${fixtureLineCount}`;
      if (lineIndex === 1 || lineIndex === 3 || lineIndex === 5) return '';
      if (lineIndex === 2) return '[current scale link](README.md)';
      if (lineIndex === 4) return 'ordinary preview content';
      if (lineIndex === jumpSourceLine) return `## [${jumpMarker}](README.md)`;
      return `Scale line ${String(lineIndex + 1).padStart(6, '0')} content`;
    },
  );
  await Bun.write(
    join(fixtureRoot, 'README.md'),
    `${fixtureLines.join('\n')}\n`,
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
      (candidate) => candidate.findText('README.md') !== null,
      30_000,
    );
    driver.sendKeys('Enter');
    const hoverStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${fixtureLineCount}-line Markdown preview opens and finishes parsing`,
      (status) =>
        String(status.activeBuffer).endsWith('/README.md') &&
        status.markdownPreviewOpen === true &&
        status.markdownParsing === false,
      60_000,
    );
    const structureSnapshot = await driver.awaitGridCondition(
      `${fixtureLineCount}-line deep heading appears in the structure pane`,
      (candidate) => {
        try {
          structureMarkerPosition(candidate, jumpMarker);
          return true;
        } catch {
          return false;
        }
      },
      30_000,
    );
    const structureMarker = structureMarkerPosition(
      structureSnapshot,
      jumpMarker,
    );
    driver.sendMouse({
      kind: 'press',
      column: structureMarker.column,
      row: structureMarker.row,
      button: 'left',
    });
    driver.sendMouse({
      kind: 'release',
      column: structureMarker.column,
      row: structureMarker.row,
      button: 'left',
    });
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${fixtureLineCount}-line structure jump reaches the source target`,
      (status) => Number(status.cursorLineIndex) === jumpSourceLine,
    );
    const followedSnapshot = await driver.awaitGridCondition(
      `${fixtureLineCount}-line structure target paints in the preview`,
      (candidate) => {
        try {
          previewMarkerPosition(candidate, jumpMarker);
          return true;
        } catch {
          return false;
        }
      },
    );
    let trailingReference = previewMarkerPosition(followedSnapshot, jumpMarker);
    driver.sendMouse({
      kind: 'press',
      column: trailingReference.column,
      row: trailingReference.row,
      button: 'left',
    });
    driver.sendMouse({
      kind: 'release',
      column: trailingReference.column,
      row: trailingReference.row,
      button: 'left',
    });
    let previewFocusStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${fixtureLineCount}-line preview target takes pane focus`,
      (status) => status.markdownPaneFocus === 'preview',
    );
    if (fixtureLineCount > 40) {
      const previewColumn = previewBorder(driver.snapshot()).column;
      const trailingBodyRow = paneLastBodyRow(driver.snapshot(), previewColumn);
      const firstPreviewBodyRow = previewBorder(driver.snapshot()).row + 1;
      const targetRenderedRow =
        Number(previewFocusStatus.markdownPreviewScrollTop) +
        trailingReference.row -
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
            `FAIL ${fixtureLineCount}-line preview did not reach the trailing-row position`,
          );
        }
        const previousScrollTop = Number(
          previewFocusStatus.markdownPreviewScrollTop,
        );
        driver.sendKeys(previousScrollTop > targetScrollTop ? 'Up' : 'Down');
        previewFocusStatus = await HarnessSmoke.Class.awaitStatus(
          driver,
          statusPath,
          `${fixtureLineCount}-line preview moves the target to the trailing row`,
          (status) =>
            Number(status.markdownPreviewScrollTop) !== previousScrollTop,
        );
      }

      const trailingSnapshot = await driver.awaitGridCondition(
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
      trailingReference = previewMarkerPosition(trailingSnapshot, jumpMarker);
    }
    measuredPhase = 'hover';
    const hoverStartedAt = performance.now();
    driver.sendMouse({
      kind: 'move',
      column: trailingReference.column,
      row: trailingReference.row,
      button: 'none',
    });
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${fixtureLineCount}-line trailing hover publishes its reference`,
      (status) =>
        String(status.markdownHoveredReference).endsWith('/README.md'),
      INPUT_DEADLINE_MILLISECONDS,
    );
    hoverFrame = Number(hoverStatus.frame);
    hoverMilliseconds = elapsedMilliseconds(hoverStartedAt);

    measuredPhase = nextInput;
    const nextInputStartedAt = performance.now();
    if (nextInput === 'pointer') {
      const pointerLeavesPane =
        process.env.PREVIEW_HOVER_POINTER_TARGET === 'outside';
      const pointerStaysInBody =
        process.env.PREVIEW_HOVER_POINTER_TARGET === 'body';
      driver.sendMouse({
        kind: 'move',
        column: pointerLeavesPane
          ? 0
          : pointerStaysInBody
            ? previewBorder(driver.snapshot()).column + 2
            : trailingReference.column,
        row: pointerLeavesPane
          ? 0
          : pointerStaysInBody
            ? trailingReference.row
            : trailingReference.row + 1,
        button: 'none',
      });
    } else {
      driver.sendKeys('Escape');
    }
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${fixtureLineCount}-line ${nextInput} input lands after the hover`,
      (status) =>
        nextInput === 'pointer'
          ? status.markdownHoveredReference === null
          : status.markdownPaneFocus === 'source',
      INPUT_DEADLINE_MILLISECONDS,
    );
    nextInputMilliseconds = elapsedMilliseconds(nextInputStartedAt);
    return {
      fixtureLineCount,
      nextInput,
      hoverMilliseconds,
      nextInputMilliseconds,
      outcome: 'PASS',
      finalStatus: null,
      hoverFrame,
    };
  } catch (error) {
    const finalStatus = HarnessSmoke.Class.readStatus(statusPath);
    return {
      fixtureLineCount,
      nextInput,
      hoverMilliseconds,
      nextInputMilliseconds,
      outcome: `TIMEOUT phase=${measuredPhase} ${error instanceof Error ? error.message : String(error)}`,
      finalStatus: {
        frame: finalStatus.frame,
        markdownHoveredReference: finalStatus.markdownHoveredReference ?? null,
        markdownPaneFocus: finalStatus.markdownPaneFocus ?? null,
        markdownPreviewScrollTop: finalStatus.markdownPreviewScrollTop ?? null,
        mouse: finalStatus.mouse ?? null,
        tooltipVisible: finalStatus.tooltipVisible ?? null,
      },
      hoverFrame,
    };
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

const measurements: MeasurementResult[] = [];
const requestedLineCounts = (
  process.env.PREVIEW_HOVER_LINE_COUNTS ?? '10,500,100000'
)
  .split(',')
  .map((value) => Number(value));
if (process.env.PREVIEW_HOVER_SKIP_POINTER !== '1') {
  for (const fixtureLineCount of requestedLineCounts) {
    const measurement = await driveMeasurement(fixtureLineCount, 'pointer');
    measurements.push(measurement);
    console.log(`RESULT ${JSON.stringify(measurement)}`);
  }
}
if (process.env.PREVIEW_HOVER_SKIP_ESCAPE !== '1') {
  const escapeMeasurement = await driveMeasurement(100_000, 'Escape');
  measurements.push(escapeMeasurement);
  console.log(`RESULT ${JSON.stringify(escapeMeasurement)}`);
}

if (measurements.some((measurement) => measurement.outcome !== 'PASS')) {
  process.exitCode = 1;
} else {
  console.log('preview-hover-input-measurement: ALL-PASS');
}

interface MeasurementResult {
  fixtureLineCount: number;
  nextInput: 'pointer' | 'Escape';
  hoverMilliseconds: number | null;
  nextInputMilliseconds: number | null;
  outcome: string;
  finalStatus: {
    frame: unknown;
    markdownHoveredReference: unknown;
    markdownPaneFocus: unknown;
    markdownPreviewScrollTop: unknown;
    mouse: unknown;
    tooltipVisible: unknown;
  } | null;
  hoverFrame: number | null;
}
