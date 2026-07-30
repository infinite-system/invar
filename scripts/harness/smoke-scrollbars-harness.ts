#!/usr/bin/env bun
// Byte-level scrollbar showcase: the thumb is proven as a contiguous truecolor background run on
// blank cells in the actual terminal stream—the assertion tmux capture text cannot express.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { HarnessInput } from './HarnessInput';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';
import { HarnessSmoke } from './HarnessSmoke';
import {
  deriveMarkdownPreviewScrollbarThumbDragTargets,
  deriveScrollbarThumbDragTargets,
  dragScrollbarThumb,
  type ScrollbarThumbDragTarget,
} from './ScrollbarThumbDrag';

interface VerticalScrollBarProof {
  column: number;
  thumbBackground: number;
  thumbStartRow: number;
  thumbEndRow: number;
  thumbLength: number;
  trackStartRow: number;
  trackLength: number;
}

interface HorizontalScrollBarProof {
  thumbLength: number;
  thumbStartColumn: number;
  trackLength: number;
}

interface DiffHorizontalScrollbarFrame {
  readonly rowBytes: Uint8Array;
  readonly rowHash: string;
  readonly thumbLength: number;
}

interface VerticalThumbFrame {
  thumbLength: number;
  viewportRows?: number;
  totalRows?: number;
  scrollTop?: number;
}

interface Rectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface AgentThumbFrame {
  readonly frame: number;
  readonly viewportRows: number;
  readonly contentRows: number;
  readonly scrollTop: number;
  readonly paintedThumbRows: number;
}

interface PanelHeadingGeometryStatus {
  readonly contentId: string;
  readonly row: number;
  readonly controls: readonly {
    readonly action: 'add' | 'expand' | 'close';
    readonly startColumn: number;
    readonly endColumnExclusive: number;
  }[];
}

const DARK_SCROLLBAR_COLORS = [0x16161e, 0x787c99] as const;
const LIGHT_SCROLLBAR_COLORS = [0x848cb5, 0xd4d6e4] as const;

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

function requireEditorTwoAxisBarOwnershipAndColors(
  snapshot: HarnessSnapshot.Model,
  targets: readonly ScrollbarThumbDragTarget[],
  label: string,
): readonly number[] {
  const horizontalTarget = targets.find(
    (target) => target.name === 'editorHorizontal',
  );
  const verticalTarget = targets.find(
    (target) => target.name === 'editorVertical',
  );
  requireCondition(
    horizontalTarget !== undefined && verticalTarget !== undefined,
    `${label} exposes both editor scrollbar axes`,
  );

  const horizontalTrackCells = snapshot
    .rowCells(horizontalTarget.pressRow)
    .slice(horizontalTarget.pressColumn, verticalTarget.pressColumn);
  requireCondition(
    horizontalTrackCells.length >= 2 &&
      horizontalTrackCells.every((cell) => cell.characters === '▄') &&
      horizontalTrackCells.at(-1)?.column === verticalTarget.pressColumn - 1,
    `${label} horizontal track ends one column before the vertical track`,
  );

  const verticalTrackCells = Array.from(
    {
      length: horizontalTarget.pressRow - verticalTarget.pressRow + 1,
    },
    (_unusedValue, rowOffset) =>
      snapshot.cell(
        verticalTarget.pressRow + rowOffset,
        verticalTarget.pressColumn,
      ),
  );
  const verticalBackgroundColors = new Set(
    verticalTrackCells
      .filter((cell) => cell?.isBackgroundRgb === true)
      .map((cell) => cell!.background),
  );
  const cornerCell = verticalTrackCells.at(-1);
  requireCondition(
    cornerCell?.characters === ' ' &&
      cornerCell.isBackgroundRgb &&
      verticalBackgroundColors.has(cornerCell.background),
    `${label} corner cell paints vertical-bar content`,
  );

  const horizontalForegroundColors = new Set(
    horizontalTrackCells
      .filter((cell) => cell.isForegroundRgb)
      .map((cell) => cell.foreground),
  );
  requireCondition(
    verticalBackgroundColors.size === 2 &&
      horizontalForegroundColors.size === 2 &&
      [...verticalBackgroundColors].every((color) =>
        horizontalForegroundColors.has(color),
      ),
    `${label} horizontal and vertical bars use the same track and thumb colours`,
  );
  return [...verticalBackgroundColors].sort(
    (firstColor, secondColor) => firstColor - secondColor,
  );
}

function scrollbarColorsMatch(
  colors: readonly number[],
  expectedColors: readonly number[],
): boolean {
  return (
    colors.length === expectedColors.length &&
    colors.every((color, colorIndex) => color === expectedColors[colorIndex])
  );
}

function editorVerticalScrollbarColors(
  snapshot: HarnessSnapshot.Model,
  targets: readonly ScrollbarThumbDragTarget[],
): readonly number[] {
  const verticalTarget = targets.find(
    (target) => target.name === 'editorVertical',
  );
  const horizontalTarget = targets.find(
    (target) => target.name === 'editorHorizontal',
  );
  if (!verticalTarget || !horizontalTarget) return [];
  return [
    ...new Set(
      Array.from(
        {
          length: horizontalTarget.pressRow - verticalTarget.pressRow + 1,
        },
        (_unusedValue, rowOffset) =>
          snapshot.cell(
            verticalTarget.pressRow + rowOffset,
            verticalTarget.pressColumn,
          ),
      )
        .filter((cell) => cell?.isBackgroundRgb === true)
        .map((cell) => cell!.background),
    ),
  ].sort((firstColor, secondColor) => firstColor - secondColor);
}

function runGit(repositoryRoot: string, commandArguments: string[]): void {
  const result = Bun.spawnSync(['git', ...commandArguments], {
    cwd: repositoryRoot,
    stdout: 'ignore',
    stderr: 'pipe',
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        ([key, value]) => value !== undefined && !key.startsWith('GIT_'),
      ),
    ) as Record<string, string>,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${commandArguments.join(' ')} failed: ${new TextDecoder().decode(result.stderr)}`,
    );
  }
}

async function proveContinuousScrollbarThumbDrag(
  lineCount: number,
): Promise<void> {
  const fixtureRoot = mkdtempSync(
    join(tmpdir(), `tui-scrollbar-drag-${lineCount}-`),
  );
  const homeDirectory = mkdtempSync(
    join(tmpdir(), `tui-scrollbar-drag-home-${lineCount}-`),
  );
  const statusPath = join(homeDirectory, 'status.json');
  const symbolLineCount = Math.min(500, lineCount);
  const lines = Array.from({ length: lineCount }, (_unusedValue, lineIndex) => {
    if (lineIndex >= symbolLineCount) return '// scale filler';
    const symbolName = `symbol${String(lineIndex).padStart(6, '0')}`;
    return `export const ${symbolName} = "${'x'.repeat(180)}";`;
  });
  await Bun.write(
    join(fixtureRoot, 'scrollbar-drag-scale.ts'),
    `${lines.join('\n')}\n`,
  );
  const markdownLines = [
    '# Preview scrollbar drag',
    '',
    '```text',
    `horizontal-${'x'.repeat(180)}`,
    '```',
    '',
    ...Array.from(
      { length: lineCount },
      (_unusedValue, lineIndex) => `Preview row ${lineIndex}`,
    ),
  ];
  await Bun.write(
    join(fixtureRoot, 'scrollbar-drag-scale.md'),
    `${markdownLines.join('\n')}\n`,
  );
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
    },
  });
  try {
    await driver.awaitGridCondition(
      `${lineCount}-line drag fixture workspace paints`,
      (snapshot) => snapshot.findText('Files') !== null,
    );
    driver.sendKeys('Control+p');
    await driver.awaitGridCondition(
      `${lineCount}-line drag fixture opens Quick Open`,
      (snapshot) => snapshot.findText('Go to File') !== null,
    );
    driver.sendText('scrollbar-drag-scale.ts');
    await driver.awaitScreenChange();
    driver.sendKeys('Enter');
    await driver.awaitGridCondition(
      `${lineCount}-line drag fixture paints in the editor`,
      (snapshot) => snapshot.findText('symbol000000') !== null,
      60_000,
    );
    const status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line drag fixture publishes both editor extents and structure rows`,
      (candidate) =>
        Number(candidate.editorMaximumScrollTop) > 0 &&
        Number(candidate.editorMaximumScrollLeft) > 0 &&
        Number(candidate.structureRows) > Number(candidate.rightDockRows),
      60_000,
    );
    const snapshot = await driver.awaitGridCondition(
      `${lineCount}-line drag fixture paints editor and structure rows together`,
      (candidate) =>
        candidate.findText('▪ symbol000000') !== null &&
        candidate.findText('symbol000000 :1') === null &&
        candidate.findText('export const symbol000000') !== null,
      60_000,
    );
    const targets = deriveScrollbarThumbDragTargets(snapshot, status);
    const targetNames = targets.map((target) => target.name).join(',');
    requireCondition(
      targetNames === 'editorHorizontal,editorVertical,rightDockVertical',
      `${lineCount}-line drive finds both editor axes and the right-dock bar (${targetNames})`,
    );
    const darkThemeScrollbarColors = requireEditorTwoAxisBarOwnershipAndColors(
      snapshot,
      targets,
      `${lineCount}-line dark theme`,
    );
    requireCondition(
      scrollbarColorsMatch(darkThemeScrollbarColors, DARK_SCROLLBAR_COLORS),
      `${lineCount}-line dark theme uses the live panel and dim pair`,
    );
    const horizontalTarget = targets[0];
    requireCondition(
      horizontalTarget !== undefined &&
        snapshot
          .rowCells(horizontalTarget.pressRow)
          .filter((cell) => cell.characters === '▄').length >= 10 &&
        snapshot
          .rowCells(horizontalTarget.pressRow)
          .every((cell) => cell.characters !== '█' && cell.characters !== '▀'),
      `${lineCount}-line editor horizontal bar is lower-half cells only`,
    );
    driver.sendKeys('Control+,');
    let settingsStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line drive opens Settings before the live theme switch`,
      (candidate) =>
        candidate.settingsOpen === true &&
        typeof candidate.settingsSelectedLabel === 'string',
    );
    for (
      let navigationStep = 0;
      navigationStep < 40 && settingsStatus.settingsSelectedLabel !== 'Theme';
      navigationStep++
    ) {
      const previousSelectedLabel = settingsStatus.settingsSelectedLabel;
      driver.sendKeys('Down');
      settingsStatus = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${lineCount}-line settings navigation advances toward Theme`,
        (candidate) =>
          candidate.settingsSelectedLabel !== previousSelectedLabel,
      );
    }
    requireCondition(
      settingsStatus.settingsSelectedLabel === 'Theme',
      `${lineCount}-line drive finds the live Theme setting`,
    );
    const previousThemeValue = settingsStatus.settingsSelectedValue;
    driver.sendKeys('Right');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line drive switches the live theme to light`,
      (candidate) =>
        candidate.settingsSelectedLabel === 'Theme' &&
        candidate.settingsSelectedValue === 'light' &&
        candidate.settingsSelectedValue !== previousThemeValue,
    );
    driver.sendKeys('Escape');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line drive closes Settings after the live theme switch`,
      (candidate) => candidate.settingsOpen === false,
    );
    let lightThemeTargets: readonly ScrollbarThumbDragTarget[] = [];
    const lightThemeSnapshot = await driver.awaitGridCondition(
      `${lineCount}-line editor repaints after the live theme switch`,
      (candidate) => {
        if (
          candidate.findText('▪ symbol000000') === null ||
          candidate.findText('symbol000000 :1') !== null ||
          candidate.findText('export const symbol000000') === null
        ) {
          return false;
        }
        try {
          lightThemeTargets = deriveScrollbarThumbDragTargets(
            candidate,
            HarnessSmoke.Class.readStatus(statusPath),
          );
          return (
            lightThemeTargets.map((target) => target.name).join(',') ===
            'editorHorizontal,editorVertical,rightDockVertical'
          );
        } catch {
          return false;
        }
      },
    );
    const lightThemeScrollbarColors = requireEditorTwoAxisBarOwnershipAndColors(
      lightThemeSnapshot,
      lightThemeTargets,
      `${lineCount}-line light theme switch`,
    );
    requireCondition(
      scrollbarColorsMatch(lightThemeScrollbarColors, LIGHT_SCROLLBAR_COLORS),
      `${lineCount}-line light theme switch uses the live panel and dim pair`,
    );
    requireCondition(
      darkThemeScrollbarColors.every(
        (darkColor) => !lightThemeScrollbarColors.includes(darkColor),
      ),
      `${lineCount}-line light theme switch removes the dark pair`,
    );

    driver.sendKeys('Control+,');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line drive reopens Settings before the dark switch`,
      (candidate) =>
        candidate.settingsOpen === true &&
        candidate.settingsSelectedLabel === 'Theme' &&
        candidate.settingsSelectedValue === 'light',
    );
    driver.sendKeys('Right');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line drive switches the live theme back to dark`,
      (candidate) =>
        candidate.settingsSelectedLabel === 'Theme' &&
        candidate.settingsSelectedValue === 'dark',
    );
    driver.sendKeys('Escape');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line drive closes Settings after the live dark switch`,
      (candidate) => candidate.settingsOpen === false,
    );
    let returnedDarkThemeTargets: readonly ScrollbarThumbDragTarget[] = [];
    const returnedDarkThemeSnapshot = await driver.awaitGridCondition(
      `${lineCount}-line editor repaints after the live dark switch`,
      (candidate) => {
        try {
          returnedDarkThemeTargets = deriveScrollbarThumbDragTargets(
            candidate,
            HarnessSmoke.Class.readStatus(statusPath),
          );
          return scrollbarColorsMatch(
            editorVerticalScrollbarColors(candidate, returnedDarkThemeTargets),
            DARK_SCROLLBAR_COLORS,
          );
        } catch {
          return false;
        }
      },
    );
    const returnedDarkThemeScrollbarColors =
      requireEditorTwoAxisBarOwnershipAndColors(
        returnedDarkThemeSnapshot,
        returnedDarkThemeTargets,
        `${lineCount}-line returned dark theme`,
      );
    requireCondition(
      scrollbarColorsMatch(
        returnedDarkThemeScrollbarColors,
        DARK_SCROLLBAR_COLORS,
      ),
      `${lineCount}-line returned dark theme restores the panel and dim pair`,
    );
    requireCondition(
      lightThemeScrollbarColors.every(
        (lightColor) => !returnedDarkThemeScrollbarColors.includes(lightColor),
      ),
      `${lineCount}-line returned dark theme removes the light pair`,
    );

    for (const target of returnedDarkThemeTargets) {
      const positions = await dragScrollbarThumb(driver, statusPath, target);
      requireCondition(
        positions.length === 4 &&
          positions.every(
            (position, positionIndex) =>
              positionIndex === 0 ||
              position > (positions[positionIndex - 1] ?? position),
          ),
        `${lineCount}-line ${target.name} drag advances after every pressed-pointer move ` +
          `(${positions.join('→')})`,
      );
    }
    const finalStatus = HarnessSmoke.Class.readStatus(statusPath);
    requireCondition(
      !(
        finalStatus.primaryDockFocused === true &&
        finalStatus.rightDockFocused === true
      ) &&
        !(
          finalStatus.primaryDockFocused === true &&
          finalStatus.terminalFocused === true
        ) &&
        !(
          finalStatus.rightDockFocused === true &&
          finalStatus.terminalFocused === true
        ),
      `${lineCount}-line scrollbar drags leave one panel host focused`,
    );

    driver.sendKeys('Control+p');
    await driver.awaitGridCondition(
      `${lineCount}-line preview drag fixture opens Quick Open`,
      (candidate) => candidate.findText('Go to File') !== null,
    );
    driver.sendText('scrollbar-drag-scale.md');
    await driver.awaitScreenChange();
    driver.sendKeys('Enter');
    const previewStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line Markdown preview publishes both overflowing axes`,
      (candidate) =>
        candidate.markdownPreviewOpen === true &&
        candidate.markdownParsing === false &&
        Number(candidate.markdownPreviewContentRows) >
          Number(candidate.markdownPreviewViewportRows) &&
        Number(candidate.markdownPreviewContentColumns) >
          Number(candidate.markdownPreviewViewportColumns),
      60_000,
    );
    const previewSnapshot = await driver.awaitGridCondition(
      `${lineCount}-line Markdown preview paints its long fenced row`,
      (candidate) =>
        candidate.findText('╭─Preview') !== null &&
        candidate.findText('Preview scrollbar') !== null,
      60_000,
    );
    const armedPreviewStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line Markdown preview settles after its bars paint`,
      (candidate) =>
        candidate.renderQuiescent === true &&
        Number(candidate.frame) > Number(previewStatus.frame),
      60_000,
    );
    const previewBorder = previewSnapshot.findText('╭─Preview');
    if (!previewBorder) {
      throw new Error('The Markdown preview border disappeared.');
    }
    const previewTargets = deriveMarkdownPreviewScrollbarThumbDragTargets(
      previewSnapshot,
      armedPreviewStatus,
    );
    requireCondition(
      previewTargets.map((target) => target.name).join(',') ===
        'markdownPreviewHorizontal,markdownPreviewVertical',
      `${lineCount}-line drive finds both Markdown preview bars`,
    );
    const previewHorizontalTarget = previewTargets[0];
    requireCondition(
      previewHorizontalTarget !== undefined &&
        previewSnapshot
          .rowCells(previewHorizontalTarget.pressRow)
          .filter((cell) => cell.characters === '▄').length >= 10 &&
        previewSnapshot
          .rowCells(previewHorizontalTarget.pressRow)
          .every((cell) => cell.characters !== '█' && cell.characters !== '▀'),
      `${lineCount}-line Markdown preview horizontal bar is lower-half cells only`,
    );
    const visibleSourceMarker = driver.snapshot().findEditorText('Preview row');
    if (!visibleSourceMarker) {
      throw new Error('The visible Markdown source marker disappeared.');
    }
    driver.sendMouseClick({
      column: visibleSourceMarker.column,
      row: visibleSourceMarker.row,
    });
    driver.sendKeys('Control+Home');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line source returns to its first row before preview bar input`,
      (candidate) =>
        candidate.markdownPaneFocus === 'source' &&
        Number(candidate.editorScrollTop) === 0,
    );
    const horizontalPositions = await dragScrollbarThumb(
      driver,
      statusPath,
      previewHorizontalTarget,
    );
    requireCondition(
      horizontalPositions.length === 4 &&
        horizontalPositions.every(
          (position, positionIndex) =>
            positionIndex === 0 ||
            position > (horizontalPositions[positionIndex - 1] ?? position),
        ),
      `${lineCount}-line ${previewHorizontalTarget.name} drag advances after every pressed-pointer move ` +
        `(${horizontalPositions.join('→')})`,
    );
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line horizontal preview bar input claims preview leadership`,
      (candidate) => candidate.markdownPaneFocus === 'preview',
    );
    const sourceMarker = driver.snapshot().findEditorText('Preview row');
    if (!sourceMarker) {
      throw new Error('The Markdown source marker disappeared.');
    }
    driver.sendMouseClick({
      column: sourceMarker.column,
      row: sourceMarker.row,
    });
    const sourceLedStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line source regains leadership before vertical bar input`,
      (candidate) => candidate.markdownPaneFocus === 'source',
    );
    const sourcePositionBeforePreviewDrag = Number(
      sourceLedStatus.editorScrollTop,
    );
    const previewVerticalTarget = previewTargets[1];
    if (!previewVerticalTarget) {
      throw new Error('The Markdown preview vertical drag target is absent.');
    }
    const verticalPositions = await dragScrollbarThumb(
      driver,
      statusPath,
      previewVerticalTarget,
    );
    requireCondition(
      verticalPositions.length === 4 &&
        verticalPositions.every(
          (position, positionIndex) =>
            positionIndex === 0 ||
            position > (verticalPositions[positionIndex - 1] ?? position),
        ),
      `${lineCount}-line ${previewVerticalTarget.name} drag advances after every pressed-pointer move ` +
        `(${verticalPositions.join('→')})`,
    );
    const previewDragStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line preview scrollbar drag leads source follow`,
      (candidate) =>
        candidate.markdownPaneFocus === 'preview' &&
        Number(candidate.editorScrollTop) > sourcePositionBeforePreviewDrag,
    );
    const settledPreviewDragStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line preview vertical drag settles before track input`,
      (candidate) =>
        candidate.renderQuiescent === true &&
        Number(candidate.frame) > Number(previewDragStatus.frame),
      60_000,
    );
    driver.sendMouseClick({
      column: previewVerticalTarget.pressColumn,
      row: (previewVerticalTarget.moveRows.at(-1) ?? 0) + 3,
    });
    const previewTrackClickStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line preview scrollbar track click moves preview`,
      (candidate) =>
        candidate.markdownPaneFocus === 'preview' &&
        Number(candidate.markdownPreviewScrollTop) >
          Number(settledPreviewDragStatus.markdownPreviewScrollTop),
    );
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line preview scrollbar track click leads source follow`,
      (candidate) =>
        Number(candidate.editorScrollTop) >
          Number(settledPreviewDragStatus.editorScrollTop) &&
        Number(candidate.markdownPreviewScrollTop) ===
          Number(previewTrackClickStatus.markdownPreviewScrollTop),
    );
    driver.sendKeys('Control+q');
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

function verticalScrollBarProof(
  snapshot: HarnessSnapshot.Model,
): VerticalScrollBarProof | null {
  let verticalTrackColumn = -1;
  let longestHorizontalTrackLength = 0;
  for (let row = 0; row < snapshot.rows; row++) {
    if (!snapshot.rowText(row).startsWith('│')) continue;
    let currentHorizontalTrackLength = 0;
    for (let column = 1; column < Math.min(27, snapshot.columns); column++) {
      if (snapshot.cell(row, column)?.characters === '▄') {
        currentHorizontalTrackLength++;
        if (currentHorizontalTrackLength > longestHorizontalTrackLength) {
          longestHorizontalTrackLength = currentHorizontalTrackLength;
          verticalTrackColumn = column + 1;
        }
      } else {
        currentHorizontalTrackLength = 0;
      }
    }
  }
  if (verticalTrackColumn < 0 || longestHorizontalTrackLength < 4) return null;

  const trackRows: Array<{ row: number; background: number }> = [];
  for (let row = 0; row < snapshot.rows; row++) {
    if (!snapshot.rowText(row).startsWith('│')) continue;
    const cell = snapshot.cell(row, verticalTrackColumn);
    if (cell?.characters === ' ' && cell.isBackgroundRgb) {
      trackRows.push({ row, background: cell.background });
    }
  }
  if (trackRows.length < 10) return null;

  const colorCounts = new Map<number, number>();
  for (const paintedCell of trackRows) {
    colorCounts.set(
      paintedCell.background,
      (colorCounts.get(paintedCell.background) ?? 0) + 1,
    );
  }
  if (colorCounts.size !== 2) return null;
  const orderedColors = [...colorCounts.entries()].sort(
    (firstColor, secondColor) => firstColor[1] - secondColor[1],
  );
  const thumbBackground = orderedColors[0]?.[0];
  if (thumbBackground === undefined) return null;
  const thumbRows = trackRows
    .filter((paintedCell) => paintedCell.background === thumbBackground)
    .map((paintedCell) => paintedCell.row);
  if (thumbRows.length < 2 || thumbRows.length >= trackRows.length) return null;
  const thumbStartRow = thumbRows[0];
  const thumbEndRow = thumbRows.at(-1);
  if (
    thumbStartRow === undefined ||
    thumbEndRow === undefined ||
    thumbEndRow - thumbStartRow + 1 !== thumbRows.length
  ) {
    return null;
  }
  return {
    column: verticalTrackColumn,
    thumbBackground,
    thumbStartRow,
    thumbEndRow,
    thumbLength: thumbRows.length,
    trackStartRow: trackRows[0]?.row ?? 0,
    trackLength: trackRows.length,
  };
}

/** The editor SOURCE pane's column range, measured from a gutter row at call time. At the app's
 *  defaults the structure dock occupies the columns right of the editor, so the old fixed
 *  columns-to-screen-edge scans would crown a dock column as the editor's own scrollbar. The
 *  gutter row anchors the pane's left border; the next `│` is its right border (the scrollbar
 *  fixtures fold nothing, so no fold-range guide can sit in between). */
function editorPaneColumnBounds(
  snapshot: HarnessSnapshot.Model,
): { startColumn: number; endColumnExclusive: number } | null {
  for (let row = 0; row < snapshot.rows; row++) {
    const text = snapshot.rowText(row);
    const gutterStart = /\u2502(?=\s*\d+[ \u258E\u258F\u203A\u2304])/.exec(
      text,
    );
    if (!gutterStart) continue;
    const startColumn = gutterStart.index + 1;
    const endColumnExclusive = text.indexOf('\u2502', startColumn);
    if (endColumnExclusive > startColumn) {
      return { startColumn, endColumnExclusive };
    }
  }
  return null;
}

function dominantEditorBackground(
  snapshot: HarnessSnapshot.Model,
): number | null {
  const backgroundCounts = new Map<number, number>();
  const paneBounds = editorPaneColumnBounds(snapshot);
  if (!paneBounds) return null;
  for (let row = 4; row < snapshot.rows - 3; row++) {
    for (
      let column = paneBounds.startColumn;
      column < paneBounds.endColumnExclusive;
      column++
    ) {
      const cell = snapshot.cell(row, column);
      if (!cell?.isBackgroundRgb) continue;
      backgroundCounts.set(
        cell.background,
        (backgroundCounts.get(cell.background) ?? 0) + 1,
      );
    }
  }
  return (
    [...backgroundCounts.entries()].sort(
      (firstBackground, secondBackground) =>
        secondBackground[1] - firstBackground[1],
    )[0]?.[0] ?? null
  );
}

function verticalEditorScrollBarProof(
  snapshot: HarnessSnapshot.Model,
  startRow = 4,
  endRowExclusive = snapshot.rows - 3,
): VerticalScrollBarProof | null {
  const editorBackground = dominantEditorBackground(snapshot);
  if (editorBackground === null) return null;
  const paneBounds = editorPaneColumnBounds(snapshot);
  if (!paneBounds) return null;
  let bestColumn = -1;
  let bestPaintedRows: Array<{
    row: number;
    background: number;
    characters: string;
  }> = [];
  for (
    let column = paneBounds.startColumn;
    column < paneBounds.endColumnExclusive;
    column++
  ) {
    const paintedRows: Array<{
      row: number;
      background: number;
      characters: string;
    }> = [];
    for (let row = startRow; row < endRowExclusive; row++) {
      const cell = snapshot.cell(row, column);
      if (cell?.isBackgroundRgb && cell.background !== editorBackground) {
        paintedRows.push({
          row,
          background: cell.background,
          characters: cell.characters,
        });
      }
    }
    if (paintedRows.length > bestPaintedRows.length) {
      bestColumn = column;
      bestPaintedRows = paintedRows;
    }
  }
  if (bestColumn < 0 || bestPaintedRows.length < 10) return null;

  const blockThumbRows = bestPaintedRows.filter((paintedCell) => {
    const codePoint = paintedCell.characters.codePointAt(0);
    return (
      codePoint !== undefined && codePoint >= 0x2580 && codePoint <= 0x259f
    );
  });
  if (blockThumbRows.length > 0) {
    const thumbStartRow = blockThumbRows[0]?.row;
    const thumbEndRow = blockThumbRows.at(-1)?.row;
    if (thumbStartRow === undefined || thumbEndRow === undefined) return null;
    const thumbLength = blockThumbRows.reduce(
      (length, paintedCell) =>
        length +
        (paintedCell.characters === '█'
          ? 1
          : paintedCell.characters === '▀' || paintedCell.characters === '▄'
            ? 0.5
            : 0),
      0,
    );
    if (thumbLength <= 0) return null;
    return {
      column: bestColumn,
      thumbBackground: blockThumbRows[0]?.background ?? 0,
      thumbStartRow,
      thumbEndRow,
      thumbLength,
      trackStartRow: bestPaintedRows[0]?.row ?? 0,
      trackLength: bestPaintedRows.length,
    };
  }

  const colorCounts = new Map<number, number>();
  for (const paintedCell of bestPaintedRows) {
    colorCounts.set(
      paintedCell.background,
      (colorCounts.get(paintedCell.background) ?? 0) + 1,
    );
  }
  if (colorCounts.size !== 2) return null;
  const thumbBackground = [...colorCounts.entries()].sort(
    (firstColor, secondColor) => firstColor[1] - secondColor[1],
  )[0]?.[0];
  if (thumbBackground === undefined) return null;
  const thumbRows = bestPaintedRows
    .filter((paintedCell) => paintedCell.background === thumbBackground)
    .map((paintedCell) => paintedCell.row);
  const thumbStartRow = thumbRows[0];
  const thumbEndRow = thumbRows.at(-1);
  if (
    thumbStartRow === undefined ||
    thumbEndRow === undefined ||
    thumbRows.length < 2 ||
    thumbRows.length >= bestPaintedRows.length ||
    thumbEndRow - thumbStartRow + 1 !== thumbRows.length
  ) {
    return null;
  }
  return {
    column: bestColumn,
    thumbBackground,
    thumbStartRow,
    thumbEndRow,
    thumbLength: thumbRows.length,
    trackStartRow: bestPaintedRows[0]?.row ?? 0,
    trackLength: bestPaintedRows.length,
  };
}

function verticalDiffScrollBarProof(
  snapshot: HarnessSnapshot.Model,
): VerticalScrollBarProof | null {
  const startRow = 1;
  const endRowExclusive = snapshot.rows - 2;
  const rightEdgeBackground = snapshot.cell(
    startRow,
    snapshot.columns - 1,
  )?.background;
  if (rightEdgeBackground === undefined) return null;
  let bestColumn = -1;
  let bestPaintedRows: Array<{ row: number; background: number }> = [];
  for (
    let column = Math.max(0, snapshot.columns - 5);
    column < snapshot.columns;
    column++
  ) {
    const paintedRows: Array<{ row: number; background: number }> = [];
    for (let row = startRow; row < endRowExclusive; row++) {
      const cell = snapshot.cell(row, column);
      if (
        cell?.characters === ' ' &&
        cell.isBackgroundRgb &&
        cell.background !== rightEdgeBackground
      ) {
        paintedRows.push({ row, background: cell.background });
      }
    }
    if (paintedRows.length >= bestPaintedRows.length) {
      bestColumn = column;
      bestPaintedRows = paintedRows;
    }
  }
  if (bestColumn < 0 || bestPaintedRows.length < 10) return null;
  const colorCounts = new Map<number, number>();
  for (const paintedCell of bestPaintedRows) {
    colorCounts.set(
      paintedCell.background,
      (colorCounts.get(paintedCell.background) ?? 0) + 1,
    );
  }
  if (colorCounts.size !== 2) return null;
  const thumbBackground = [...colorCounts.entries()].sort(
    (firstColor, secondColor) => firstColor[1] - secondColor[1],
  )[0]?.[0];
  if (thumbBackground === undefined) return null;
  const thumbRows = bestPaintedRows
    .filter((paintedCell) => paintedCell.background === thumbBackground)
    .map((paintedCell) => paintedCell.row);
  const thumbStartRow = thumbRows[0];
  const thumbEndRow = thumbRows.at(-1);
  if (
    thumbStartRow === undefined ||
    thumbEndRow === undefined ||
    thumbRows.length < 2 ||
    thumbRows.length >= bestPaintedRows.length ||
    thumbEndRow - thumbStartRow + 1 !== thumbRows.length
  ) {
    return null;
  }
  return {
    column: bestColumn,
    thumbBackground,
    thumbStartRow,
    thumbEndRow,
    thumbLength: thumbRows.length,
    trackStartRow: bestPaintedRows[0]?.row ?? 0,
    trackLength: bestPaintedRows.length,
  };
}

function verticalThumbGeometryMatches(
  firstProof: VerticalScrollBarProof,
  secondProof: VerticalScrollBarProof,
): boolean {
  return (
    firstProof.column === secondProof.column &&
    firstProof.trackStartRow === secondProof.trackStartRow &&
    firstProof.trackLength === secondProof.trackLength &&
    firstProof.thumbStartRow === secondProof.thumbStartRow &&
    firstProof.thumbEndRow === secondProof.thumbEndRow &&
    firstProof.thumbLength === secondProof.thumbLength
  );
}

function editorOverviewMarkIsPainted(
  snapshot: HarnessSnapshot.Model,
  scrollBarProof: VerticalScrollBarProof,
): boolean {
  const trackEndRowExclusive =
    scrollBarProof.trackStartRow + scrollBarProof.trackLength;
  for (
    let row = scrollBarProof.trackStartRow;
    row < trackEndRowExclusive;
    row++
  ) {
    for (
      let column = scrollBarProof.column;
      column < snapshot.columns;
      column++
    ) {
      const characters = snapshot.cell(row, column)?.characters;
      if (characters === '•' || characters === '.') return true;
    }
  }
  return false;
}

function horizontalScrollBarRowCount(snapshot: HarnessSnapshot.Model): number {
  let barRowCount = 0;
  for (let row = 0; row < snapshot.rows; row++) {
    if (!snapshot.rowText(row).startsWith('│')) continue;
    const sidebarCells = snapshot
      .rowCells(row)
      .slice(1, Math.min(27, snapshot.columns));
    let longestLowerHalfRun = 0;
    let currentLowerHalfRun = 0;
    for (const cell of sidebarCells) {
      if (cell.characters === '▄') {
        currentLowerHalfRun++;
        longestLowerHalfRun = Math.max(
          longestLowerHalfRun,
          currentLowerHalfRun,
        );
      } else {
        currentLowerHalfRun = 0;
      }
    }
    if (longestLowerHalfRun >= 4 && longestLowerHalfRun < sidebarCells.length)
      barRowCount++;
  }
  return barRowCount;
}

function horizontalEditorScrollBarProof(
  snapshot: HarnessSnapshot.Model,
): HorizontalScrollBarProof | null {
  const paneBounds = editorPaneColumnBounds(snapshot);
  if (!paneBounds) return null;
  const editorStartColumn = paneBounds.startColumn;
  const editorEndColumnExclusive = paneBounds.endColumnExclusive;
  const barCells = snapshot
    .rowCells(snapshot.rows - 3)
    .slice(editorStartColumn, editorEndColumnExclusive);
  const foregroundCounts = new Map<number, number>();
  for (const cell of barCells) {
    if (cell.characters !== '▄') continue;
    foregroundCounts.set(
      cell.foreground,
      (foregroundCounts.get(cell.foreground) ?? 0) + 1,
    );
  }
  if (foregroundCounts.size !== 2) return null;
  const thumbForeground = [...foregroundCounts.entries()].sort(
    (firstForeground, secondForeground) =>
      firstForeground[1] - secondForeground[1],
  )[0]?.[0];
  if (thumbForeground === undefined) return null;
  let longestThumbStartColumn = -1;
  let longestThumbLength = 0;
  let currentThumbStartColumn = -1;
  let currentThumbLength = 0;
  for (const cell of barCells) {
    const isThumbCell =
      cell.characters === '▄' && cell.foreground === thumbForeground;
    if (isThumbCell && currentThumbLength > 0) {
      currentThumbLength++;
    } else if (isThumbCell) {
      currentThumbStartColumn = cell.column;
      currentThumbLength = 1;
    } else {
      currentThumbLength = 0;
    }
    if (currentThumbLength > longestThumbLength) {
      longestThumbStartColumn = currentThumbStartColumn;
      longestThumbLength = currentThumbLength;
    }
  }
  if (longestThumbLength < 2) return null;
  return {
    thumbLength: longestThumbLength,
    thumbStartColumn: longestThumbStartColumn,
    trackLength: barCells.length,
  };
}

function diffHorizontalScrollbarFrame(
  snapshot: HarnessSnapshot.Model,
): DiffHorizontalScrollbarFrame | null {
  const verticalProof = verticalDiffScrollBarProof(snapshot);
  const baseTitlePosition = snapshot.findText('Base (HEAD)');
  if (!verticalProof || !baseTitlePosition) return null;
  const horizontalBarRow =
    verticalProof.trackStartRow + verticalProof.trackLength;
  const horizontalBarStartColumn = Math.max(0, baseTitlePosition.column - 1);
  const horizontalBarCells = snapshot
    .rowCells(horizontalBarRow)
    .slice(horizontalBarStartColumn, verticalProof.column);
  if (
    horizontalBarCells.length < 10 ||
    horizontalBarCells.some((cell) => cell.characters !== '▄')
  ) {
    return null;
  }
  const firstForeground = horizontalBarCells[0]?.foreground;
  if (firstForeground === undefined) return null;
  let thumbLength = 0;
  for (const cell of horizontalBarCells) {
    if (!cell.isForegroundRgb || cell.foreground !== firstForeground) {
      break;
    }
    thumbLength += 1;
  }
  if (thumbLength < 2 || thumbLength >= horizontalBarCells.length) {
    return null;
  }
  const rowBytes = new TextEncoder().encode(
    JSON.stringify(
      horizontalBarCells.map((cell) => ({
        characters: cell.characters,
        foreground: cell.foreground,
        background: cell.background,
        isForegroundDefault: cell.isForegroundDefault,
        isForegroundRgb: cell.isForegroundRgb,
        isForegroundPalette: cell.isForegroundPalette,
        isBackgroundDefault: cell.isBackgroundDefault,
        isBackgroundRgb: cell.isBackgroundRgb,
        isBackgroundPalette: cell.isBackgroundPalette,
        isBold: cell.isBold,
        isDim: cell.isDim,
        isItalic: cell.isItalic,
        isUnderline: cell.isUnderline,
        isBlink: cell.isBlink,
        isInverse: cell.isInverse,
        isInvisible: cell.isInvisible,
        isStrikethrough: cell.isStrikethrough,
        isOverline: cell.isOverline,
        width: cell.width,
      })),
    ),
  );
  return {
    rowBytes,
    rowHash: createHash('sha256').update(rowBytes).digest('hex'),
    thumbLength,
  };
}

function byteArraysEqual(
  firstBytes: Uint8Array,
  secondBytes: Uint8Array,
): boolean {
  if (firstBytes.length !== secondBytes.length) return false;
  return firstBytes.every(
    (byteValue, byteIndex) => byteValue === secondBytes[byteIndex],
  );
}

function bottomPanelSlot(status: StatusSnapshot): Rectangle {
  const layoutSlots = status.layoutSlots as
    Record<string, Rectangle> | undefined;
  const bottomPanel = layoutSlots?.bottomPanel;
  if (!bottomPanel) throw new Error('Bottom-panel slot geometry disappeared');
  return bottomPanel;
}

async function clickPanelHeadingAction(
  driver: PtyTestDriver.Model,
  statusPath: string,
  action: 'add' | 'expand' | 'close',
  contentId?: string,
): Promise<void> {
  const status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `the ${action} panel heading action has published geometry before the scrollbar drive`,
    (candidate) => {
      const headings = candidate.panelHeadingGeometry;
      if (!Array.isArray(headings)) return false;
      return (
        headings as unknown as readonly PanelHeadingGeometryStatus[]
      ).some(
        (heading) =>
          (contentId === undefined || heading.contentId === contentId) &&
          heading.controls.some((control) => control.action === action),
      );
    },
  );
  const headings =
    status.panelHeadingGeometry as unknown as readonly PanelHeadingGeometryStatus[];
  const heading = headings.find(
    (candidate) => contentId === undefined || candidate.contentId === contentId,
  );
  const control = heading?.controls.find(
    (candidate) => candidate.action === action,
  );
  if (!heading || !control) {
    throw new Error(`Missing ${action} panel heading geometry`);
  }
  const column =
    control.startColumn +
    Math.floor((control.endColumnExclusive - control.startColumn) / 2);
  driver.sendMouse({
    kind: 'press',
    column,
    row: heading.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column,
    row: heading.row,
    button: 'left',
  });
}

function agentThumbRowCount(
  snapshot: HarnessSnapshot.Model,
  panelRectangle: Rectangle,
): number {
  const paneRows = snapshot
    .textRows()
    .map((rowText, row) => ({
      rowText: rowText.slice(
        panelRectangle.left,
        panelRectangle.left + panelRectangle.width,
      ),
      row,
    }))
    .filter(
      ({ rowText, row }) =>
        row > panelRectangle.top &&
        row < panelRectangle.top + panelRectangle.height - 1 &&
        rowText.startsWith('│') &&
        rowText.endsWith('│'),
    );
  if (paneRows.length === 0) return 0;
  const rightBorderColumn =
    panelRectangle.left +
    Math.max(
      ...paneRows.map(({ rowText }) => rowText.trimEnd().lastIndexOf('│')),
    );
  const scrollBarColumn = rightBorderColumn - 1;
  const blankBackgrounds = paneRows.map(({ rowText, row }) => {
    const cell = snapshot.cell(row, scrollBarColumn);
    return rowText[scrollBarColumn - panelRectangle.left] === ' '
      ? (cell?.background ?? null)
      : null;
  });
  const backgroundCounts = new Map<number, number>();
  for (const background of blankBackgrounds) {
    if (background === null) continue;
    backgroundCounts.set(
      background,
      (backgroundCounts.get(background) ?? 0) + 1,
    );
  }
  const paneBackground = [...backgroundCounts.entries()].sort(
    (firstBackground, secondBackground) =>
      secondBackground[1] - firstBackground[1],
  )[0]?.[0];
  let longestThumbRun = 0;
  let currentThumbRun = 0;
  let currentThumbBackground: number | null = null;
  for (const background of [...blankBackgrounds, null]) {
    if (
      background !== null &&
      background !== paneBackground &&
      background === currentThumbBackground
    ) {
      currentThumbRun += 1;
    } else {
      longestThumbRun = Math.max(longestThumbRun, currentThumbRun);
      currentThumbBackground =
        background !== paneBackground ? background : null;
      currentThumbRun = currentThumbBackground === null ? 0 : 1;
    }
  }
  return longestThumbRun;
}

async function collectAgentThumbFrames(
  driver: PtyTestDriver.Model,
  statusPath: string,
  panelRectangle: Rectangle,
  wheelColumn: number,
  wheelRow: number,
): Promise<readonly AgentThumbFrame[]> {
  const frames: AgentThumbFrame[] = [];
  const scrollTopBeforeWheelBurst = Number(
    HarnessSmoke.Class.readStatus(statusPath).agentScrollTop,
  );
  await driver.collectCompletedFrameObservationsUntil({
    conditionDescription:
      'the agent transcript moves upward and its momentum rests',
    condition: () => {
      const status = HarnessSmoke.Class.readStatus(statusPath);
      return (
        Number(status.agentScrollTop) < scrollTopBeforeWheelBurst &&
        status.panelScrollMomentumAtRest === true
      );
    },
    performAction: () => {
      sendRepeatedWheel(driver, 'up', 18, wheelColumn, wheelRow);
    },
    observeFrame: (completed) => {
      const status = HarnessSmoke.Class.readStatus(statusPath);
      frames.push({
        frame: Number(status.frame),
        viewportRows: Number(status.agentViewportRows),
        contentRows: Number(status.agentContentLineCount),
        scrollTop: Number(status.agentScrollTop),
        paintedThumbRows: agentThumbRowCount(
          completed.snapshot,
          panelRectangle,
        ),
      });
    },
    timeoutMilliseconds: 2_000,
  });
  return frames;
}

function sendRepeatedWheel(
  driver: PtyTestDriver.Model,
  direction: 'up' | 'down' | 'left' | 'right',
  repeatCount: number,
  column: number,
  row: number,
  alt = false,
): void {
  for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex++) {
    driver.sendMouse({ kind: 'wheel', column, row, direction, alt });
  }
}

function latestVerticalScrollInputs(
  repositoryRoot: string,
  scrollbarIdentifier: string,
): Omit<VerticalThumbFrame, 'thumbLength'> | null {
  let logText: string;
  try {
    logText = readFileSync(
      join(repositoryRoot, 'artifacts', 'tui.log'),
      'utf8',
    );
  } catch {
    return null;
  }
  const matchingLines = logText
    .split('\n')
    .filter((line) => line.includes(`bar ${scrollbarIdentifier}:`));
  const latestLine = matchingLines.at(-1);
  if (!latestLine) return null;
  const match =
    /scrollSize=(?<totalRows>-?\d+(?:\.\d+)?) viewportSize=(?<viewportRows>-?\d+(?:\.\d+)?) scrollPosition=(?<scrollTop>-?\d+(?:\.\d+)?)/.exec(
      latestLine,
    );
  if (!match?.groups) return null;
  return {
    totalRows: Number(match.groups.totalRows),
    viewportRows: Number(match.groups.viewportRows),
    scrollTop: Number(match.groups.scrollTop),
  };
}

async function collectVerticalThumbFrames(
  driver: PtyTestDriver.Model,
  repositoryRoot: string,
  scrollbarIdentifier: string,
  modeLabel: string,
  diagnosticsRequired: boolean,
  scrollBarProof: (
    snapshot: HarnessSnapshot.Model,
  ) => VerticalScrollBarProof | null = verticalEditorScrollBarProof,
  observeFrame?: (snapshot: HarnessSnapshot.Model) => void,
): Promise<VerticalThumbFrame[]> {
  const thumbFrames: VerticalThumbFrame[] = [];
  let reachedBottom = false;
  await driver.collectCompletedFrameObservationsUntil({
    conditionDescription: `${modeLabel} vertical thumb reaches the bottom`,
    condition: (snapshot) => {
      const frameProof = scrollBarProof(snapshot);
      return (
        frameProof !== null &&
        frameProof.thumbEndRow >=
          frameProof.trackStartRow + frameProof.trackLength - 1
      );
    },
    performAction: async () => {
      for (
        let wheelBurst = 1;
        wheelBurst <= 40 && !reachedBottom;
        wheelBurst++
      ) {
        const beforeBurstProof = scrollBarProof(driver.snapshot());
        sendRepeatedWheel(driver, 'down', 12, 80, 10);
        await driver.awaitGridCondition(
          `${modeLabel} wheel burst ${wheelBurst} advances its thumb`,
          (snapshot) => {
            const frameProof = scrollBarProof(snapshot);
            return (
              frameProof !== null &&
              (frameProof.thumbStartRow !== beforeBurstProof?.thumbStartRow ||
                frameProof.thumbEndRow >=
                  frameProof.trackStartRow + frameProof.trackLength - 1)
            );
          },
          2_000,
        );
      }
    },
    observeFrame: (scrollFrame) => {
      const frameProof = scrollBarProof(scrollFrame.snapshot);
      if (!frameProof) {
        const snapshot = scrollFrame.snapshot;
        for (
          let column = Math.max(0, snapshot.columns - 3);
          column < snapshot.columns;
          column++
        ) {
          const cells = [];
          for (let row = 1; row < snapshot.rows - 1; row++) {
            const cell = snapshot.cell(row, column);
            cells.push(
              `${row}:${cell?.characters === ' ' ? '_' : (cell?.characters ?? '?')}@` +
                `${cell?.isBackgroundRgb ? cell.background.toString(16) : 'none'}`,
            );
          }
          console.log(
            `  DIAG  ${modeLabel} column ${column}: ${cells.join(' ')}`,
          );
        }
        throw new Error(
          `FAIL ${modeLabel} vertical thumb remains present in every scroll frame`,
        );
      }
      const scrollInputs = latestVerticalScrollInputs(
        repositoryRoot,
        scrollbarIdentifier,
      );
      if (diagnosticsRequired && !scrollInputs) {
        throw new Error(
          `FAIL ${modeLabel} frame records viewportRows, totalRows, and scrollTop`,
        );
      }
      thumbFrames.push({
        thumbLength: frameProof.thumbLength,
        ...scrollInputs,
      });
      observeFrame?.(scrollFrame.snapshot);
      reachedBottom =
        frameProof.thumbEndRow >=
        frameProof.trackStartRow + frameProof.trackLength - 1;
    },
    timeoutMilliseconds: 30_000,
  });
  requireCondition(
    reachedBottom,
    `${modeLabel} wheel drive reaches the document bottom`,
  );
  requireCondition(
    thumbFrames.length > 10,
    `${modeLabel} wheel drive observes ${thumbFrames.length} complete scroll frames`,
  );
  return thumbFrames;
}

function proveStableVerticalThumbInputsAndExtent(
  thumbFrames: VerticalThumbFrame[],
  modeLabel: string,
  diagnosticsRequired: boolean,
): void {
  const distinctThumbLengths = [
    ...new Set(thumbFrames.map((frame) => frame.thumbLength)),
  ];
  if (diagnosticsRequired) {
    const distinctViewportRows = [
      ...new Set(thumbFrames.map((frame) => frame.viewportRows)),
    ];
    const distinctTotalRows = [
      ...new Set(thumbFrames.map((frame) => frame.totalRows)),
    ];
    const distinctScrollTops = [
      ...new Set(thumbFrames.map((frame) => frame.scrollTop)),
    ];
    requireCondition(
      distinctViewportRows.length === 1,
      `${modeLabel} viewportRows stays exact and constant (${distinctViewportRows[0]})`,
    );
    requireCondition(
      distinctTotalRows.length === 1,
      `${modeLabel} totalRows stays exact and constant (${distinctTotalRows[0]})`,
    );
    requireCondition(
      distinctScrollTops.length > 10,
      `${modeLabel} scrollTop moves through ${distinctScrollTops.length} observed positions`,
    );
  }
  requireCondition(
    distinctThumbLengths.length === 1,
    `${modeLabel} vertical thumb length is byte-identical through the document ` +
      `(extent ${distinctThumbLengths.join(',')} across ${thumbFrames.length} frames)`,
  );
}

async function proveVerticalEditorThumbStability(
  fixtureRoot: string,
  homeDirectory: string,
  wordWrapEnabled: boolean,
): Promise<void> {
  const modeLabel = wordWrapEnabled ? 'wrap-on' : 'wrap-off';
  const repositoryRoot =
    process.env.INVAR_PROBE_REPOSITORY_ROOT ?? process.cwd();
  const diagnosticsRequired =
    process.env.INVAR_PROBE_REPOSITORY_ROOT === undefined;
  const probeStatusPath = join(
    homeDirectory,
    `${modeLabel}-editor-status.json`,
  );
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    repositoryRoot,
    columns: 120,
    rows: 28,
    homeDirectory,
    environment: {
      TUI_DEBUG_BARS: '1',
      TUI_STATUS_PATH: probeStatusPath,
    },
  });
  try {
    await driver.awaitGridCondition(
      `the ${modeLabel} probe fixture is ready`,
      (candidate) => candidate.findText('horizontal-thumb-stabi') !== null,
    );
    driver.sendKeys('Control+p');
    await driver.awaitGridCondition(
      `the ${modeLabel} probe opens Go to File`,
      (candidate) => candidate.findText('Go to File') !== null,
    );
    driver.sendText('horizontal-thumb-stability');
    await driver.awaitScreenChange();
    driver.sendKeys('Enter');
    await driver.awaitGridCondition(
      `the ${modeLabel} probe opens the mixed-width tall file`,
      (candidate) => candidate.findText('HORIZONTAL-TH') !== null,
    );
    driver.sendKeys('Tab');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      probeStatusPath,
      `the ${modeLabel} probe focuses the opened editor`,
      (status) => status.focus === 'editor',
    );
    // The thumb-stability properties were sized for the editor width these fixtures had before
    // the structure dock's default-ON: with the dock open, wrap-on doubles the virtual rows and
    // a wheel burst no longer moves the thumb a full cell. Concealing the dock through the
    // user's own gesture restores the measured geometry without touching the default.
    await HarnessSmoke.Class.concealAutoRevealedRightDock(
      driver,
      probeStatusPath,
    );
    // The status flips before the relayout paints; baselines captured against the still-narrow
    // frame would disagree on the thumb column with every later frame.
    await driver.awaitGridCondition(
      `the ${modeLabel} editor reclaims the concealed dock's columns`,
      (candidate) => {
        const paneBounds = editorPaneColumnBounds(candidate);
        return (
          paneBounds !== null &&
          paneBounds.endColumnExclusive >= candidate.columns - 3
        );
      },
    );
    if (wordWrapEnabled) {
      driver.sendKeys('Alt+z');
      await driver.awaitScreenChange();
    }
    // AWAIT THE THUMB, not the file text. The wait above observes the document's content; this claim
    // reads the SCROLLBAR THUMB, which the debug-bars probe paints in a later frame under load. Sampling
    // here failed a gate on 2026-07-26 (`editor vertical thumb is present with wrap-off`) while passing
    // solo, and it fails HARD rather than timing out, so retry-once cannot even mask it.
    await driver.awaitGridCondition(
      `the ${modeLabel} editor vertical thumb is painted`,
      (candidate) => {
        // The thumb must sit at the pane's right edge: for a short window after the dock
        // conceals, the narrow editor's old scrollbar column keeps its stale track and thumb
        // backgrounds, and a proof that crowns the stale column poisons every geometry
        // comparison below (bycatch: the stale column is a real paint artifact, reported).
        const candidateThumbProof = verticalEditorScrollBarProof(candidate);
        const paneBounds = editorPaneColumnBounds(candidate);
        return (
          candidateThumbProof !== null &&
          paneBounds !== null &&
          candidateThumbProof.column >= paneBounds.endColumnExclusive - 2
        );
      },
    );
    const unmarkedSnapshot = driver.snapshot();
    const unmarkedThumbProof = verticalEditorScrollBarProof(unmarkedSnapshot);
    const firstLineText = '// HORIZONTAL-THUMB-STABILITY';
    if (!unmarkedSnapshot.findText(firstLineText)) {
      throw new Error(`FAIL ${modeLabel} first-line marker disappeared`);
    }
    driver.sendKeys('End');
    const lineEndStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      probeStatusPath,
      `the ${modeLabel} editor caret reaches the first line end`,
      (status) =>
        status.cursor?.line === 0 && status.cursor.col === firstLineText.length,
    );
    driver.sendText('X');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      probeStatusPath,
      `the ${modeLabel} editor publishes the completed first-line edit`,
      (status) =>
        Number(status.bufferRevision) > Number(lineEndStatus.bufferRevision) &&
        status.dirty === true &&
        status.cursor?.line === 0 &&
        status.cursor.col === firstLineText.length + 1,
    );
    const markedSnapshot = await driver.awaitGridCondition(
      `the ${modeLabel} editor paints an overview mark without changing ` +
        `track or thumb geometry`,
      (candidate) => {
        const candidateThumbProof = verticalEditorScrollBarProof(candidate);
        return (
          unmarkedThumbProof !== null &&
          candidateThumbProof !== null &&
          verticalThumbGeometryMatches(
            unmarkedThumbProof,
            candidateThumbProof,
          ) &&
          editorOverviewMarkIsPainted(candidate, candidateThumbProof)
        );
      },
    );
    const markedThumbProof = verticalEditorScrollBarProof(markedSnapshot);
    requireCondition(
      unmarkedThumbProof !== null &&
        markedThumbProof !== null &&
        verticalThumbGeometryMatches(unmarkedThumbProof, markedThumbProof) &&
        editorOverviewMarkIsPainted(markedSnapshot, markedThumbProof),
      `${modeLabel} overview marks leave track and thumb geometry unchanged`,
    );
    const thumbFrames = await collectVerticalThumbFrames(
      driver,
      repositoryRoot,
      'editor-scrollbar-v',
      modeLabel,
      diagnosticsRequired,
    );
    proveStableVerticalThumbInputsAndExtent(
      thumbFrames,
      modeLabel,
      diagnosticsRequired,
    );
    driver.sendKeys('Control+q');
  } finally {
    await driver.dispose();
  }
}

async function proveVerticalDiffThumbStability(
  fixtureRoot: string,
  homeDirectory: string,
): Promise<void> {
  const repositoryRoot = process.cwd();
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    repositoryRoot,
    columns: 120,
    rows: 28,
    homeDirectory,
    environment: { TUI_DEBUG_BARS: '1' },
  });
  try {
    await driver.awaitGridCondition(
      'the diff probe fixture is ready',
      (candidate) => candidate.findText('000-DIFF-BREATHING') !== null,
    );
    driver.sendKeys('Control+g');
    await driver.awaitGridCondition(
      'the diff probe opens the Git changes pane',
      (candidate) => candidate.findText('VERY-LONG-COMM') !== null,
    );
    driver.sendKeys('o');
    await driver.awaitGridCondition(
      'the changed tall file opens in the side-by-side diff view',
      (candidate) =>
        candidate.findText('Base (HEAD)') !== null &&
        candidate.findText('Current (working)') !== null,
    );
    // AWAIT THE DIFF BAR before collecting frames. The wait above observes the diff HEADERS ("Base
    // (HEAD)" / "Current (working)"), which appear before the pane has its scrollbar column — so the
    // collector could capture an early frame in which column 119 still holds diff TEXT, and then the
    // present-in-every-frame claim fails on a frame that predates the bar rather than on a bar that
    // vanished. Observed twice inside gates on 2026-07-26 (diagnostics showed text glyphs, not bar
    // cells) while passing solo. The claim itself is unchanged and still strict: once the bar exists, it
    // must be in EVERY subsequent scroll frame.
    await driver.awaitGridCondition(
      'the diff pane vertical thumb is painted before frame collection begins',
      (candidate) => verticalDiffScrollBarProof(candidate) !== null,
    );
    const initialHorizontalSnapshot = await driver.awaitGridCondition(
      'the diff pane horizontal thumb is painted before frame collection begins',
      (candidate) => diffHorizontalScrollbarFrame(candidate) !== null,
    );
    const initialHorizontalFrame = diffHorizontalScrollbarFrame(
      initialHorizontalSnapshot,
    );
    requireCondition(
      initialHorizontalFrame !== null,
      'the diff pane horizontal thumb is painted before frame collection begins',
    );
    const horizontalFrames: DiffHorizontalScrollbarFrame[] = [];
    const thumbFrames = await collectVerticalThumbFrames(
      driver,
      repositoryRoot,
      'diff-scrollbar-vertical',
      'diff',
      true,
      verticalDiffScrollBarProof,
      (snapshot) => {
        const horizontalFrame = diffHorizontalScrollbarFrame(snapshot);
        if (!horizontalFrame) {
          throw new Error(
            'FAIL diff horizontal scrollbar remains present in every scroll frame',
          );
        }
        horizontalFrames.push(horizontalFrame);
      },
    );
    pass('diff vertical thumb is present in the wheel-produced frames');
    proveStableVerticalThumbInputsAndExtent(thumbFrames, 'diff', true);
    const distinctHorizontalRowHashes = [
      ...new Set(horizontalFrames.map((frame) => frame.rowHash)),
    ];
    requireCondition(
      horizontalFrames.length > 10,
      `diff horizontal row observes ${horizontalFrames.length} complete scroll frames`,
    );
    const stableHorizontalFrame = horizontalFrames[0];
    if (!stableHorizontalFrame) {
      throw new Error(
        'FAIL diff horizontal row produced no stable reference frame',
      );
    }
    requireCondition(
      horizontalFrames.every((frame) =>
        byteArraysEqual(stableHorizontalFrame.rowBytes, frame.rowBytes),
      ),
      `diff horizontal scrollbar row cells stay byte-identical during vertical scroll ` +
        `(hashes ${distinctHorizontalRowHashes.join(',')})`,
    );

    driver.sendKeys('Enter');
    await driver.awaitGridCondition(
      'Open current replaces the diff with the editable working file',
      (candidate) =>
        candidate.findText('Base (HEAD)') === null &&
        candidate.findText('diff breathing line') !== null,
    );
    driver.sendKeys('Control+Home');
    driver.sendKeys('End');
    driver.sendText('X'.repeat(180));
    driver.sendKeys('Control+s');
    await driver.awaitScreenChange();
    driver.sendKeys('Control+g');
    await driver.awaitGridCondition(
      'the edited diff fixture returns to the Git changes pane',
      (candidate) => candidate.findText('VERY-LONG-COMM') !== null,
    );
    driver.sendKeys('o');
    await driver.awaitGridCondition(
      'the lengthened file reopens in a refreshed side-by-side diff',
      (candidate) =>
        candidate.findText('Base (HEAD)') !== null &&
        candidate.findText('Current (working)') !== null,
    );
    const lengthenedHorizontalFrame = await driver.awaitGridCondition(
      'the refreshed diff paints a shorter horizontal thumb',
      (candidate) => {
        const frame = diffHorizontalScrollbarFrame(candidate);
        return (
          frame !== null &&
          frame.thumbLength < stableHorizontalFrame.thumbLength
        );
      },
    );
    const lengthenedHorizontalProof = diffHorizontalScrollbarFrame(
      lengthenedHorizontalFrame,
    );
    requireCondition(
      lengthenedHorizontalProof !== null &&
        lengthenedHorizontalProof.thumbLength <
          stableHorizontalFrame.thumbLength,
      `lengthening the widest line refreshes the diff horizontal bar ` +
        `(${stableHorizontalFrame.thumbLength} to ` +
        `${lengthenedHorizontalProof?.thumbLength})`,
    );
    driver.sendKeys('Control+q');
  } finally {
    await driver.dispose();
  }
}

async function sendWheelUntil(
  driver: PtyTestDriver.Model,
  predicate: (snapshot: HarnessSnapshot.Model) => boolean,
  direction: 'up' | 'down' | 'left' | 'right',
  maximumRepeatCount: number,
  column: number,
  row: number,
  alt = false,
): Promise<HarnessSnapshot.Model> {
  for (let repeatIndex = 0; repeatIndex < maximumRepeatCount; repeatIndex++) {
    const currentSnapshot = driver.snapshot();
    if (predicate(currentSnapshot)) return currentSnapshot;
    const currentText = currentSnapshot.text();
    driver.sendMouse({ kind: 'wheel', column, row, direction, alt });
    const snapshot = await driver.awaitGridCondition(
      `${direction} wheel changes visible content or reaches its target`,
      (candidate) => predicate(candidate) || candidate.text() !== currentText,
      2_000,
    );
    if (predicate(snapshot)) return snapshot;
  }
  throw new Error(
    `Wheel condition did not become visible after ${maximumRepeatCount} events`,
  );
}

async function buildOverflowFixture(fixtureRoot: string): Promise<void> {
  mkdirSync(join(fixtureRoot, '.invar'));
  await Bun.write(
    join(fixtureRoot, '.invar', 'settings.json'),
    JSON.stringify({
      sidebarWidth: 28,
      scrollbarThickness: 1,
      horizontalScrollModifier: 'alt',
      linesPerNotch: 3,
      gitSplitRatio: 0.5,
      showActivityBar: false,
    }),
  );
  await Bun.write(join(fixtureRoot, '.gitignore'), '.invar/\n');
  await Bun.write(join(fixtureRoot, 'base.txt'), 'base\n');
  const widthOscillationLines = ['// HORIZONTAL-THUMB-STABILITY'];
  for (let lineNumber = 1; lineNumber <= 500; lineNumber++) {
    const blockNumber = Math.floor((lineNumber - 1) / 50) % 3;
    const targetWidth =
      lineNumber === 400
        ? 140
        : blockNumber === 0
          ? 42
          : blockNumber === 1
            ? 68
            : 54;
    const prefix = `const stableLine${String(lineNumber).padStart(3, '0')} = '`;
    const suffix = lineNumber === 400 ? "DEEP-WIDEST-END-MARKER';" : "';";
    widthOscillationLines.push(
      `${prefix}${'x'.repeat(Math.max(1, targetWidth - prefix.length - suffix.length))}${suffix}`,
    );
  }
  await Bun.write(
    join(fixtureRoot, 'horizontal-thumb-stability.ts'),
    `${widthOscillationLines.join('\n')}\n`,
  );
  const diffBreathingLines = Array.from(
    { length: 500 },
    (_unused, lineIndex) => {
      const lineNumber = lineIndex + 1;
      const blockNumber = Math.floor(lineIndex / 50) % 3;
      const targetWidth =
        lineNumber === 400
          ? 130
          : blockNumber === 0
            ? 48
            : blockNumber === 1
              ? 72
              : 56;
      const prefix = `diff breathing line ${String(lineNumber).padStart(3, '0')} `;
      return `${prefix}${'x'.repeat(targetWidth - prefix.length)}`;
    },
  );
  await Bun.write(
    join(fixtureRoot, '000-DIFF-BREATHING.txt'),
    `${diffBreathingLines.join('\n')}\n`,
  );
  for (let fileNumber = 1; fileNumber <= 50; fileNumber++) {
    await Bun.write(
      join(fixtureRoot, `short-${String(fileNumber).padStart(2, '0')}.txt`),
      'short\n',
    );
  }
  runGit(fixtureRoot, ['init', '-q']);
  runGit(fixtureRoot, ['config', 'user.name', 'scrollbar-harness']);
  runGit(fixtureRoot, [
    'config',
    'user.email',
    'scrollbar-harness@example.test',
  ]);
  runGit(fixtureRoot, [
    'add',
    '.gitignore',
    'base.txt',
    '000-DIFF-BREATHING.txt',
    'horizontal-thumb-stability.ts',
    ...Array.from(
      { length: 50 },
      (_unused, fileIndex) =>
        `short-${String(fileIndex + 1).padStart(2, '0')}.txt`,
    ),
  ]);
  runGit(fixtureRoot, ['commit', '-qm', 'base']);
  for (let commitNumber = 1; commitNumber <= 22; commitNumber++) {
    const basePath = join(fixtureRoot, 'base.txt');
    await Bun.write(
      basePath,
      `${await Bun.file(basePath).text()}${commitNumber}\n`,
    );
    runGit(fixtureRoot, ['add', 'base.txt']);
    runGit(fixtureRoot, ['commit', '-qm', `short-${commitNumber}`]);
  }
  const longFileName =
    '000-VERY-LONG-CHANGES-FILENAME-THAT-ENDS-WITH-CHANGES-END-MARKER.txt';
  await Bun.write(join(fixtureRoot, longFileName), 'one\n');
  runGit(fixtureRoot, ['add', longFileName]);
  runGit(fixtureRoot, [
    'commit',
    '-qm',
    'VERY-LONG-COMMIT-SUBJECT-THAT-ENDS-WITH-LOG-END-MARKER',
  ]);
  await Bun.write(join(fixtureRoot, longFileName), 'one\ntwo\n');
  const changedDiffBreathingLines = [...diffBreathingLines];
  for (const changedLineIndex of [4, 249, 489]) {
    changedDiffBreathingLines[changedLineIndex] =
      `${changedDiffBreathingLines[changedLineIndex]} modified`;
  }
  await Bun.write(
    join(fixtureRoot, '000-DIFF-BREATHING.txt'),
    `${changedDiffBreathingLines.join('\n')}\n`,
  );
}

async function buildFitsFixture(fixtureRoot: string): Promise<void> {
  mkdirSync(join(fixtureRoot, '.invar'));
  await Bun.write(
    join(fixtureRoot, '.invar', 'settings.json'),
    JSON.stringify({
      sidebarWidth: 28,
      scrollbarThickness: 1,
      gitSplitRatio: 0.5,
      showActivityBar: false,
    }),
  );
  await Bun.write(join(fixtureRoot, '.gitignore'), '.invar/\n');
  await Bun.write(join(fixtureRoot, 'a.txt'), 'one\n');
  runGit(fixtureRoot, ['init', '-q']);
  runGit(fixtureRoot, ['config', 'user.name', 'scrollbar-harness']);
  runGit(fixtureRoot, [
    'config',
    'user.email',
    'scrollbar-harness@example.test',
  ]);
  runGit(fixtureRoot, ['add', '.gitignore', 'a.txt']);
  runGit(fixtureRoot, ['commit', '-qm', 'fit']);
  await Bun.write(join(fixtureRoot, 'a.txt'), 'one\ntwo\n');
}

const overflowFixtureRoot = mkdtempSync(
  join(tmpdir(), 'tui-scrollbars-harness-overflow-'),
);

const fitsFixtureRoot = mkdtempSync(
  join(tmpdir(), 'tui-scrollbars-harness-fits-'),
);

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-scrollbars-harness-home-'),
);

const statusPath = join(homeDirectory, 'status.json');

console.log(
  '== harness scrollbars: thumb drags advance continuously at both scales ==',
);
await proveContinuousScrollbarThumbDrag(500);
await proveContinuousScrollbarThumbDrag(100_000);

if (process.env.INVAR_SCROLLBAR_DRAG_PROBE_ONLY === '1') {
  await HarnessSmoke.Class.removeTemporaryDirectory(overflowFixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(fitsFixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  console.log('smoke-scrollbars-harness drag probe: ALL-PASS');
  process.exit(0);
}

await buildOverflowFixture(overflowFixtureRoot);

await buildFitsFixture(fitsFixtureRoot);

const probeTarget = process.env.INVAR_SCROLLBAR_PROBE_TARGET ?? 'all';

if (
  probeTarget !== 'diff' &&
  process.env.INVAR_SCROLLBAR_PROBE_WRAP_MODE !== 'on'
) {
  console.log(
    '== harness scrollbars: editor vertical thumb does not breathe with wrap off ==',
  );
  await proveVerticalEditorThumbStability(
    overflowFixtureRoot,
    homeDirectory,
    false,
  );
}

if (
  probeTarget !== 'diff' &&
  process.env.INVAR_SCROLLBAR_PROBE_WRAP_MODE !== 'off'
) {
  console.log(
    '== harness scrollbars: editor vertical thumb does not breathe with wrap on ==',
  );
  await proveVerticalEditorThumbStability(
    overflowFixtureRoot,
    homeDirectory,
    true,
  );
}

if (
  probeTarget !== 'editor' &&
  process.env.INVAR_PROBE_REPOSITORY_ROOT === undefined
) {
  console.log(
    '== harness scrollbars: diff vertical thumb inputs and extent stay stable ==',
  );
  await proveVerticalDiffThumbStability(overflowFixtureRoot, homeDirectory);
}

if (process.env.INVAR_SCROLLBAR_BREATHING_PROBE_ONLY === '1') {
  await HarnessSmoke.Class.removeTemporaryDirectory(overflowFixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(fitsFixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  console.log('smoke-scrollbars-harness breathing probe: ALL-PASS');
  process.exit(0);
}

const overflowDriver = new PtyTestDriver.Class({
  workspaceRoot: overflowFixtureRoot,
  columns: 120,
  rows: 28,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_AGENT_BACKEND: 'echo',
    INVAR_AGENT_ECHO_DELAY_MS: '10',
  },
});

let fitsDriver: PtyTestDriver.Model | null = null;

try {
  console.log(
    '== harness scrollbars: prove the vertical thumb from cell backgrounds ==',
  );
  let snapshot = await overflowDriver.awaitSnapshot(
    (candidate) =>
      verticalScrollBarProof(candidate) !== null &&
      horizontalScrollBarRowCount(candidate) === 1,
    15_000,
  );
  const initialThumb = verticalScrollBarProof(snapshot);
  requireCondition(initialThumb !== null, 'vertical scrollbar is present');
  requireCondition(
    initialThumb.thumbLength >= 2 &&
      initialThumb.thumbLength < initialThumb.trackLength,
    `thumb is a proportional multi-cell run (${initialThumb.thumbLength}/${initialThumb.trackLength})`,
  );
  for (
    let thumbRow = initialThumb.thumbStartRow;
    thumbRow < initialThumb.thumbStartRow + initialThumb.thumbLength;
    thumbRow++
  ) {
    const thumbCell = snapshot.cell(thumbRow, initialThumb.column);
    requireCondition(
      thumbCell?.characters === ' ' &&
        thumbCell.isBackgroundRgb &&
        thumbCell.background === initialThumb.thumbBackground,
      `thumb cell ${thumbRow} is blank with RGB background ${initialThumb.thumbBackground.toString(16)}`,
    );
  }
  pass(
    `contiguous BG-color thumb run starts at row ${initialThumb.thumbStartRow}, ` +
      `column ${initialThumb.column}`,
  );
  requireCondition(
    horizontalScrollBarRowCount(snapshot) === 1,
    'overflowing tree paints one lower-half horizontal bar row',
  );

  console.log(
    '== harness scrollbars: thumb length stays stable through every scroll frame ==',
  );
  overflowDriver.sendKeys('Control+p');
  await overflowDriver.awaitGridCondition(
    'the Go to File popup is visible',
    (candidate) => candidate.findText('Go to File') !== null,
  );
  overflowDriver.sendText('horizontal-thumb-stability');
  await overflowDriver.awaitScreenChange();
  overflowDriver.sendKeys('Enter');
  snapshot = await overflowDriver.awaitGridCondition(
    'the mixed-width stability fixture is open in the editor',
    (candidate) => candidate.findText('HORIZONTAL-TH') !== null,
  );
  // Every horizontal-extent arm below was sized for the editor width this fixture had before
  // the structure dock's default-ON; conceal the dock through the user's own gesture and let
  // the editor reclaim its columns before any geometry baseline is captured.
  await HarnessSmoke.Class.concealAutoRevealedRightDock(
    overflowDriver,
    statusPath,
  );
  await overflowDriver.awaitGridCondition(
    'the overflow editor reclaims the concealed dock columns',
    (candidate) => {
      const paneBounds = editorPaneColumnBounds(candidate);
      return (
        paneBounds !== null &&
        paneBounds.endColumnExclusive >= candidate.columns - 3
      );
    },
  );

  // Same correction as the vertical thumb above: await the thumb the claim reads, never the file text
  // that merely precedes it.
  snapshot = await overflowDriver.awaitGridCondition(
    'the editor horizontal thumb is painted',
    (candidate) => horizontalEditorScrollBarProof(candidate) !== null,
  );
  const initialHorizontalThumb = horizontalEditorScrollBarProof(snapshot);
  requireCondition(
    initialHorizontalThumb !== null,
    'editor horizontal thumb is present',
  );
  const horizontalThumbLengths: number[] = [];
  const scrollTopBeforeWheelBurst = Number(
    HarnessSmoke.Class.readStatus(statusPath).editorScrollTop,
  );
  const horizontalThumbFrames =
    await overflowDriver.collectCompletedFrameObservationsUntil({
      conditionDescription:
        'the vertical wheel burst advances the editor and its momentum rests',
      condition: () => {
        const status = HarnessSmoke.Class.readStatus(statusPath);
        return (
          Number(status.editorScrollTop) > scrollTopBeforeWheelBurst &&
          status.workspaceScrollMomentumAtRest === true
        );
      },
      performAction: () => {
        sendRepeatedWheel(overflowDriver, 'down', 25, 40, 10);
      },
      timeoutMilliseconds: 2_000,
    });
  for (const [frameIndex, scrollFrame] of horizontalThumbFrames.entries()) {
    const frameProof = horizontalEditorScrollBarProof(scrollFrame.snapshot);
    requireCondition(
      frameProof !== null,
      `editor horizontal thumb remains present in scroll frame ${frameIndex + 1}`,
    );
    horizontalThumbLengths.push(frameProof.thumbLength);
  }
  const distinctHorizontalThumbLengths = [...new Set(horizontalThumbLengths)];
  requireCondition(
    horizontalThumbLengths.length > 2,
    `wheel burst emitted ${horizontalThumbLengths.length - 1} observed scroll frames`,
  );
  requireCondition(
    distinctHorizontalThumbLengths.length === 1,
    `horizontal thumb length is stable while content size is unchanged ` +
      `(${horizontalThumbLengths.join(',')})`,
  );

  console.log(
    '== harness scrollbars: the deep widest line is reachable at the stable extent ==',
  );
  snapshot = await sendWheelUntil(
    overflowDriver,
    (candidate) => {
      const proof = horizontalEditorScrollBarProof(candidate);
      return (
        proof !== null &&
        candidate.findText('stableLine') === null &&
        candidate
          .textRows()
          .filter((rowText) => rowText.includes("xxxxxxxxxx';")).length >= 3
      );
    },
    'right',
    80,
    80,
    10,
    true,
  );
  const maximumHorizontalThumb = horizontalEditorScrollBarProof(snapshot);
  requireCondition(
    maximumHorizontalThumb !== null,
    'editor horizontal viewport reaches the full-document right extent',
  );
  let deepWidestLineSnapshot: HarnessSnapshot.Model | null = null;
  const deepWidestLineObservation = overflowDriver
    .awaitGridCondition(
      'the deep widest line is visible during the wheel drive',
      (candidate) => candidate.findText('DEEP-WIDEST-END-MARKER') !== null,
      60_000,
    )
    .then((candidate) => {
      deepWidestLineSnapshot = candidate;
      return candidate;
    });
  for (
    let wheelEventNumber = 1;
    wheelEventNumber <= 180 && deepWidestLineSnapshot === null;
    wheelEventNumber++
  ) {
    // Sustain the drive while the state observer watches completed frames.
    // Cell quantization may legitimately emit no terminal diff for any one
    // impulse, so no per-input frame existence is assumed.
    overflowDriver.sendMouseWithoutFrameExpectation({
      kind: 'wheel',
      column: 80,
      row: 10,
      direction: 'down',
    });
    await Bun.sleep(20);
    if (
      Number(HarnessSmoke.Class.readStatus(statusPath).editorScrollTop) >= 340
    ) {
      break;
    }
  }
  if (deepWidestLineSnapshot === null) {
    // A sustained gained fling can cross the narrow line-400 observation window between completed
    // terminal frames. Halt through the real editor pointer path, then approach that same window
    // with settled two-notch wheel gestures. The visual assertion remains the oracle.
    overflowDriver.sendMouseWithoutFrameExpectation({
      kind: 'press',
      column: 80,
      row: 10,
      button: 'left',
    });
    overflowDriver.sendMouseWithoutFrameExpectation({
      kind: 'release',
      column: 80,
      row: 10,
      button: 'left',
    });
    await HarnessSmoke.Class.awaitStatus(
      overflowDriver,
      statusPath,
      'the coarse deep-line wheel drive is halted before precision approach',
      (status) => status.workspaceScrollMomentumAtRest === true,
    );
    for (
      let precisionWheelEventNumber = 1;
      precisionWheelEventNumber <= 80 && deepWidestLineSnapshot === null;
      precisionWheelEventNumber++
    ) {
      const currentStatus = HarnessSmoke.Class.readStatus(statusPath);
      const currentScrollTop = Number(currentStatus.editorScrollTop);
      const widestLineNumber = 401;
      const widestLineIsVerticallyVisible =
        overflowDriver.snapshot().findText(`${widestLineNumber}  `) !== null;
      const precisionDirection = widestLineIsVerticallyVisible
        ? 'right'
        : currentScrollTop < widestLineNumber - 1
          ? 'down'
          : 'up';
      const precisionUsesHorizontalModifier = widestLineIsVerticallyVisible;
      overflowDriver.sendRawInputWithoutFrameExpectation(
        Array.from({ length: 2 }, () =>
          HarnessInput.Class.mouse({
            kind: 'wheel',
            column: 80,
            row: 10,
            direction: precisionDirection,
            alt: precisionUsesHorizontalModifier,
          }),
        ).join(''),
      );
      await HarnessSmoke.Class.awaitStatus(
        overflowDriver,
        statusPath,
        'a precision wheel gesture starts before observing the deep widest line',
        (status) => status.workspaceScrollMomentumAtRest === false,
      );
      await HarnessSmoke.Class.awaitStatus(
        overflowDriver,
        statusPath,
        'a precision wheel gesture settles before the next approach gesture',
        (status) => status.workspaceScrollMomentumAtRest === true,
      );
    }
  }
  snapshot = await deepWidestLineObservation;
  requireCondition(
    deepWidestLineSnapshot !== null,
    'the line-400 widest tail is visible at the unchanged full-document horizontal extent',
  );

  sendRepeatedWheel(overflowDriver, 'down', 8, 9, 9);
  snapshot = await overflowDriver.awaitSnapshot((candidate) => {
    const proof = verticalScrollBarProof(candidate);
    return proof !== null && proof.thumbStartRow > initialThumb.thumbStartRow;
  });
  const movedThumb = verticalScrollBarProof(snapshot);
  requireCondition(
    movedThumb !== null &&
      movedThumb.thumbStartRow > initialThumb.thumbStartRow,
    `wheel moves the same BG thumb down (${initialThumb.thumbStartRow} to ${movedThumb?.thumbStartRow})`,
  );

  console.log(
    '== harness scrollbars: horizontal bars reveal clipped content independently ==',
  );
  sendRepeatedWheel(overflowDriver, 'up', 40, 9, 9);
  await overflowDriver.awaitSnapshot((candidate) => {
    const proof = verticalScrollBarProof(candidate);
    return proof !== null && proof.thumbStartRow === initialThumb.thumbStartRow;
  });
  const clippedTreeSnapshot = await overflowDriver.awaitGridCondition(
    'the tree filename tail is clipped at the leftmost horizontal offset',
    (candidate) => {
      const proof = verticalScrollBarProof(candidate);
      return (
        proof !== null &&
        proof.thumbStartRow === initialThumb.thumbStartRow &&
        candidate.findText('CHANGES-END-MARKER') === null
      );
    },
  );
  requireCondition(
    clippedTreeSnapshot.findText('CHANGES-END-MARKER') === null,
    'tree filename tail starts clipped',
  );
  await sendWheelUntil(
    overflowDriver,
    (candidate) => candidate.findText('CHANGES-END-MARKER') !== null,
    'right',
    30,
    9,
    4,
    true,
  );
  pass('Alt-wheel reveals the tree filename tail through raw SGR input');

  overflowDriver.sendKeys('Control+g');
  snapshot = await overflowDriver.awaitSnapshot(
    (candidate) => candidate.findText('VERY-LONG-COMM') !== null,
    15_000,
  );
  pass('changes and log panes loaded as independent horizontal viewports');
  requireCondition(
    snapshot.findText('END-MARKER.txt') === null,
    'changes tail starts clipped',
  );
  requireCondition(
    snapshot.findText('LOG-END-MARKER') === null,
    'log tail starts clipped',
  );
  const changesRow = snapshot.findText('000-VERY-LONG')?.row;
  if (changesRow === undefined)
    throw new Error('Changed-file row disappeared before horizontal drive');
  snapshot = await sendWheelUntil(
    overflowDriver,
    (candidate) => candidate.findText('END-MARKER.txt') !== null,
    'right',
    30,
    9,
    changesRow,
    true,
  );
  requireCondition(
    snapshot.findText('LOG-END-MARKER') === null,
    'changes horizontal scrolling leaves the log pane untouched',
  );
  const logRow = snapshot.findText('VERY-LONG-COMM')?.row;
  if (logRow === undefined)
    throw new Error('Log row disappeared before horizontal drive');
  await sendWheelUntil(
    overflowDriver,
    (candidate) => candidate.findText('LOG-END-MARKER') !== null,
    'right',
    30,
    9,
    logRow,
    true,
  );
  pass('log horizontal bar reveals its own clipped subject tail');

  console.log(
    '== harness scrollbars: fitting panes paint no horizontal bar ==',
  );
  fitsDriver = new PtyTestDriver.Class({
    workspaceRoot: fitsFixtureRoot,
    columns: 54,
    rows: 28,
    homeDirectory,
  });
  snapshot = await fitsDriver.awaitSnapshot(
    (candidate) => candidate.findText('a.txt') !== null,
  );
  requireCondition(
    horizontalScrollBarRowCount(snapshot) === 0,
    'fitting tree paints no horizontal bar',
  );
  fitsDriver.sendKeys('Control+g');
  snapshot = await fitsDriver.awaitSnapshot(
    (candidate) => candidate.findText('fit') !== null,
  );
  requireCondition(
    horizontalScrollBarRowCount(snapshot) === 0,
    'fitting git panes paint no horizontal bars',
  );

  console.log(
    '== harness scrollbars: agent thumb uses stable per-frame extent inputs ==',
  );
  overflowDriver.sendRawInput('\x1b[27;6;97~');
  const agentStatus = await HarnessSmoke.Class.awaitStatus(
    overflowDriver,
    statusPath,
    'the agent pane opens with its transcript extent published',
    (candidate) =>
      candidate.panelActiveContent === 'agent' &&
      Number(candidate.agentViewportRows) > 0,
  );
  await clickPanelHeadingAction(overflowDriver, statusPath, 'expand', 'panel');
  const expandedAgentStatus = await HarnessSmoke.Class.awaitStatus(
    overflowDriver,
    statusPath,
    'the agent panel expands before the per-frame thumb probe',
    (candidate) =>
      candidate.panelExpanded === true &&
      Number(candidate.agentViewportRows) >
        Number(agentStatus.agentViewportRows),
  );
  const panelRectangle = bottomPanelSlot(expandedAgentStatus);
  const wrappedTranscriptPrompt = Array.from(
    { length: 260 },
    (_unusedValue, wordIndex) =>
      `wrapped-transcript-word-${String(wordIndex).padStart(3, '0')}`,
  ).join(' ');
  overflowDriver.sendPaste(wrappedTranscriptPrompt);
  const wrappedComposerSnapshot = await overflowDriver.awaitGridCondition(
    'the wrapped transcript prompt is visible in the agent composer',
    (candidate) => candidate.findText('wrapped-transcript-word-259') !== null,
  );
  HarnessSmoke.Class.clickText(
    overflowDriver,
    wrappedComposerSnapshot,
    'Claude',
  );
  await HarnessSmoke.Class.awaitStatus(
    overflowDriver,
    statusPath,
    'the agent composer owns keyboard focus before submission',
    (candidate) =>
      candidate.panelActiveContent === 'agent' &&
      candidate.terminalFocused === true,
  );
  overflowDriver.sendKeys('Home');
  await overflowDriver.awaitGridCondition(
    'Home exposes the beginning of the wrapped agent composer',
    (candidate) => candidate.findText('wrapped-transcript-word-000') !== null,
  );
  overflowDriver.sendKeys('End');
  await overflowDriver.awaitGridCondition(
    'End restores the submitted end of the wrapped agent composer',
    (candidate) => candidate.findText('wrapped-transcript-word-259') !== null,
  );
  overflowDriver.sendKeys('Enter');
  await overflowDriver.awaitGridCondition(
    'the echo response to the wrapped prompt is visible',
    (candidate) => candidate.findText('local echo backend') !== null,
  );
  await HarnessSmoke.Class.awaitStatus(
    overflowDriver,
    statusPath,
    'the submitted prompt grows the agent transcript',
    (candidate) =>
      Number(candidate.agentContentLineCount) >
      Number(expandedAgentStatus.agentContentLineCount),
  );
  await HarnessSmoke.Class.awaitStatus(
    overflowDriver,
    statusPath,
    'the long wrapped transcript turn completes with an overflowing extent',
    (candidate) =>
      candidate.agentBusy === false &&
      Number(candidate.agentContentLineCount) >
        Number(candidate.agentViewportRows),
    30_000,
  );
  const agentBarSnapshot = await overflowDriver.awaitSnapshot(
    (candidate) => agentThumbRowCount(candidate, panelRectangle) >= 2,
  );
  const transcriptWheelPosition =
    agentBarSnapshot.findText('✓ 3 lines') ??
    agentBarSnapshot.findText('$ echo');
  requireCondition(
    transcriptWheelPosition !== null,
    'the stable agent probe identifies a visible transcript row',
  );
  const agentThumbFrames = await collectAgentThumbFrames(
    overflowDriver,
    statusPath,
    panelRectangle,
    transcriptWheelPosition.column,
    transcriptWheelPosition.row,
  );
  requireCondition(
    agentThumbFrames.length >= 3,
    `agent wheel burst emitted ${agentThumbFrames.length} completed scroll frames`,
  );
  const distinctViewportRows = [
    ...new Set(agentThumbFrames.map((frame) => frame.viewportRows)),
  ];
  const distinctContentRows = [
    ...new Set(agentThumbFrames.map((frame) => frame.contentRows)),
  ];
  const distinctThumbRows = [
    ...new Set(agentThumbFrames.map((frame) => frame.paintedThumbRows)),
  ];
  requireCondition(
    distinctViewportRows.length === 1 && distinctContentRows.length === 1,
    `agent scrollbar inputs stay fixed per completed frame ` +
      `(viewport=${distinctViewportRows.join(',')}; content=${distinctContentRows.join(',')})`,
  );
  requireCondition(
    new Set(agentThumbFrames.map((frame) => frame.scrollTop)).size >= 2,
    `agent scroll position moves across synchronized frames ` +
      `(${agentThumbFrames.map((frame) => frame.scrollTop).join(',')})`,
  );
  requireCondition(
    distinctThumbRows.length === 1 && (distinctThumbRows[0] ?? 0) >= 2,
    `agent painted thumb extent stays fixed ` +
      `(${agentThumbFrames.map((frame) => frame.paintedThumbRows).join(',')})`,
  );
  pass(
    `agent frame probe: viewportRows=${distinctViewportRows[0]}, ` +
      `contentRows=${distinctContentRows[0]}, ` +
      `scrollTop=${agentThumbFrames.map((frame) => frame.scrollTop).join('→')}, ` +
      `paintedThumbRows=${distinctThumbRows[0]}`,
  );

  overflowDriver.sendKeys('Control+q');
  fitsDriver.sendKeys('Control+q');
  console.log('smoke-scrollbars-harness: ALL-PASS');
} finally {
  await overflowDriver.dispose();
  await fitsDriver?.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(overflowFixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(fitsFixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
