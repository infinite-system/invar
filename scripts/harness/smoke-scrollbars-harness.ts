#!/usr/bin/env bun
// Byte-level scrollbar showcase: the thumb is proven as a contiguous truecolor background run on
// blank cells in the actual terminal stream—the assertion tmux capture text cannot express.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { HarnessInput } from './HarnessInput';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';
import { HarnessSmoke } from './HarnessSmoke';

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

function dominantSidebarBackground(
  snapshot: HarnessSnapshot.Model,
): number | null {
  const backgroundCounts = new Map<number, number>();
  for (let row = 0; row < snapshot.rows; row++) {
    for (let column = 1; column < Math.min(27, snapshot.columns); column++) {
      const cell = snapshot.cell(row, column);
      if (!cell?.isBackgroundRgb) continue;
      backgroundCounts.set(
        cell.background,
        (backgroundCounts.get(cell.background) ?? 0) + 1,
      );
    }
  }
  let dominantBackground: number | null = null;
  let dominantCount = 0;
  for (const [background, count] of backgroundCounts) {
    if (count <= dominantCount) continue;
    dominantBackground = background;
    dominantCount = count;
  }
  return dominantBackground;
}

function verticalScrollBarProof(
  snapshot: HarnessSnapshot.Model,
): VerticalScrollBarProof | null {
  const paneBackground = dominantSidebarBackground(snapshot);
  if (paneBackground === null) return null;
  let bestColumn = -1;
  let bestPaintedRows: Array<{ row: number; background: number }> = [];
  for (let column = 1; column < Math.min(27, snapshot.columns); column++) {
    const paintedRows: Array<{ row: number; background: number }> = [];
    for (let row = 0; row < snapshot.rows; row++) {
      if (!snapshot.rowText(row).startsWith('│')) continue;
      const cell = snapshot.cell(row, column);
      if (
        cell?.characters === ' ' &&
        cell.isBackgroundRgb &&
        cell.background !== paneBackground
      ) {
        paintedRows.push({ row, background: cell.background });
      }
    }
    if (paintedRows.length > bestPaintedRows.length) {
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
  const orderedColors = [...colorCounts.entries()].sort(
    (firstColor, secondColor) => firstColor[1] - secondColor[1],
  );
  const thumbBackground = orderedColors[0]?.[0];
  if (thumbBackground === undefined) return null;
  const thumbRows = bestPaintedRows
    .filter((paintedCell) => paintedCell.background === thumbBackground)
    .map((paintedCell) => paintedCell.row);
  if (thumbRows.length < 2 || thumbRows.length >= bestPaintedRows.length)
    return null;
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
    column: bestColumn,
    thumbBackground,
    thumbStartRow,
    thumbEndRow,
    thumbLength: thumbRows.length,
    trackStartRow: bestPaintedRows[0]?.row ?? 0,
    trackLength: bestPaintedRows.length,
  };
}

function dominantEditorBackground(
  snapshot: HarnessSnapshot.Model,
): number | null {
  const backgroundCounts = new Map<number, number>();
  const editorStartColumn = Math.min(30, snapshot.columns - 2);
  for (let row = 4; row < snapshot.rows - 3; row++) {
    for (
      let column = editorStartColumn;
      column < snapshot.columns - 1;
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
  const editorStartColumn = Math.min(30, snapshot.columns - 2);
  let bestColumn = -1;
  let bestPaintedRows: Array<{
    row: number;
    background: number;
    characters: string;
  }> = [];
  for (let column = editorStartColumn; column < snapshot.columns; column++) {
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

function horizontalScrollBarRowCount(snapshot: HarnessSnapshot.Model): number {
  const paneBackground = dominantSidebarBackground(snapshot);
  if (paneBackground === null) return 0;
  let barRowCount = 0;
  for (let row = 0; row < snapshot.rows; row++) {
    if (!snapshot.rowText(row).startsWith('│')) continue;
    const sidebarCells = snapshot
      .rowCells(row)
      .slice(1, Math.min(27, snapshot.columns));
    if (sidebarCells.some((cell) => cell.characters.trim().length > 0))
      continue;
    let longestBackgroundRun = 0;
    let currentBackgroundRun = 0;
    for (const cell of sidebarCells) {
      if (cell.isBackgroundRgb && cell.background !== paneBackground) {
        currentBackgroundRun++;
        longestBackgroundRun = Math.max(
          longestBackgroundRun,
          currentBackgroundRun,
        );
      } else {
        currentBackgroundRun = 0;
      }
    }
    if (longestBackgroundRun >= 4 && longestBackgroundRun < sidebarCells.length)
      barRowCount++;
  }
  return barRowCount;
}

function horizontalEditorScrollBarProof(
  snapshot: HarnessSnapshot.Model,
): HorizontalScrollBarProof | null {
  const editorStartColumn = Math.min(30, snapshot.columns - 2);
  const editorEndColumnExclusive = Math.max(
    editorStartColumn,
    snapshot.columns - 2,
  );
  const editorBackgroundCounts = new Map<number, number>();
  for (let row = 4; row < snapshot.rows - 3; row++) {
    for (const cell of snapshot
      .rowCells(row)
      .slice(editorStartColumn, editorEndColumnExclusive)) {
      if (!cell.isBackgroundRgb) continue;
      editorBackgroundCounts.set(
        cell.background,
        (editorBackgroundCounts.get(cell.background) ?? 0) + 1,
      );
    }
  }
  const editorBackground = [...editorBackgroundCounts.entries()].sort(
    (firstBackground, secondBackground) =>
      secondBackground[1] - firstBackground[1],
  )[0]?.[0];
  if (editorBackground === undefined) return null;

  const barCells = snapshot
    .rowCells(snapshot.rows - 3)
    .slice(editorStartColumn, editorEndColumnExclusive);
  let longestThumbStartColumn = -1;
  let longestThumbLength = 0;
  let currentThumbStartColumn = -1;
  let currentThumbLength = 0;
  let currentThumbBackground: number | null = null;
  for (const cell of barCells) {
    const isThumbCell =
      cell.isBackgroundRgb && cell.background !== editorBackground;
    if (isThumbCell && cell.background === currentThumbBackground) {
      currentThumbLength++;
    } else if (isThumbCell) {
      currentThumbStartColumn = cell.column;
      currentThumbLength = 1;
      currentThumbBackground = cell.background;
    } else {
      currentThumbLength = 0;
      currentThumbBackground = null;
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
    horizontalBarCells.some((cell) => cell.characters !== ' ')
  ) {
    return null;
  }
  const firstBackground = horizontalBarCells[0]?.background;
  if (firstBackground === undefined) return null;
  let thumbLength = 0;
  for (const cell of horizontalBarCells) {
    if (!cell.isBackgroundRgb || cell.background !== firstBackground) {
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
  let nextFrame = driver.awaitNextCompletedFrameSnapshot(2_000);
  sendRepeatedWheel(driver, 'up', 18, wheelColumn, wheelRow);
  for (let frameIndex = 0; frameIndex < 120; frameIndex += 1) {
    let completed: Awaited<typeof nextFrame>;
    try {
      completed = await nextFrame;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith(
          'Timed out waiting for the next complete synchronized frame',
        )
      ) {
        break;
      }
      throw error;
    }
    const status = HarnessSmoke.Class.readStatus(statusPath);
    frames.push({
      frame: Number(status.frame),
      viewportRows: Number(status.agentViewportRows),
      contentRows: Number(status.agentContentLineCount),
      scrollTop: Number(status.agentScrollTop),
      paintedThumbRows: agentThumbRowCount(completed.snapshot, panelRectangle),
    });
    if (frameIndex < 119) {
      nextFrame = driver.awaitNextCompletedFrameSnapshot(150);
    }
  }
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
  for (let wheelBurst = 1; wheelBurst <= 40 && !reachedBottom; wheelBurst++) {
    let nextScrollFrame = driver.awaitNextCompletedFrameSnapshot(2_000);
    sendRepeatedWheel(driver, 'down', 12, 80, 10);
    for (let frameNumber = 1; frameNumber <= 300; frameNumber++) {
      let scrollFrame: Awaited<typeof nextScrollFrame>;
      try {
        scrollFrame = await nextScrollFrame;
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.startsWith(
            'Timed out waiting for the next complete synchronized frame',
          )
        ) {
          break;
        }
        throw error;
      }
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
      if (frameNumber < 300) {
        nextScrollFrame = driver.awaitNextCompletedFrameSnapshot(150);
      }
    }
  }
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
      `the ${modeLabel} probe fixture is ready`,
      (candidate) => candidate.findText('horizontal-thumb-stabi') !== null,
    );
    driver.sendKeys('Control+p');
    await driver.awaitGridCondition(
      `the ${modeLabel} probe opens Go to File`,
      (candidate) => candidate.findText('Go to File') !== null,
    );
    driver.sendText('horizontal-thumb-stability');
    await driver.awaitQuiescence();
    driver.sendKeys('Enter');
    await driver.awaitGridCondition(
      `the ${modeLabel} probe opens the mixed-width tall file`,
      (candidate) => candidate.findText('HORIZONTAL-TH') !== null,
    );
    if (wordWrapEnabled) {
      driver.sendKeys('Alt+z');
      await driver.awaitQuiescence();
    }
    // AWAIT THE THUMB, not the file text. The wait above observes the document's content; this claim
    // reads the SCROLLBAR THUMB, which the debug-bars probe paints in a later frame under load. Sampling
    // here failed a gate on 2026-07-26 (`editor vertical thumb is present with wrap-off`) while passing
    // solo, and it fails HARD rather than timing out, so retry-once cannot even mask it.
    await driver.awaitGridCondition(
      `the ${modeLabel} editor vertical thumb is painted`,
      (candidate) => verticalEditorScrollBarProof(candidate) !== null,
    );
    const unmarkedThumbProof = verticalEditorScrollBarProof(driver.snapshot());
    driver.sendKeys('End');
    driver.sendText('X');
    const markedSnapshot = await driver.awaitGridCondition(
      `the ${modeLabel} editor paints an overview pip after a document mark appears`,
      (candidate) =>
        candidate
          .rowCells(4)
          .concat(
            ...candidate
              .textRows()
              .slice(5, candidate.rows - 3)
              .map((_rowText, rowOffset) => candidate.rowCells(rowOffset + 5)),
          )
          .some((cell) => cell.characters === '•' || cell.characters === '.'),
    );
    const markedThumbProof = verticalEditorScrollBarProof(markedSnapshot);
    requireCondition(
      unmarkedThumbProof !== null &&
        markedThumbProof !== null &&
        unmarkedThumbProof.column === markedThumbProof.column &&
        unmarkedThumbProof.trackLength === markedThumbProof.trackLength &&
        unmarkedThumbProof.thumbLength === markedThumbProof.thumbLength,
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
    const initialHorizontalFrame = diffHorizontalScrollbarFrame(
      driver.snapshot(),
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
    await driver.awaitQuiescence();
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
      'the refreshed diff paints a changed horizontal thumb',
      (candidate) => {
        const frame = diffHorizontalScrollbarFrame(candidate);
        return (
          frame !== null &&
          !byteArraysEqual(stableHorizontalFrame.rowBytes, frame.rowBytes)
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
    const nextCompletedFrame = driver.awaitNextCompletedFrameSnapshot(2_000);
    driver.sendMouse({ kind: 'wheel', column, row, direction, alt });
    let snapshot: HarnessSnapshot.Model;
    try {
      snapshot = (await nextCompletedFrame).snapshot;
    } catch (error) {
      const latestSnapshot = driver.snapshot();
      if (predicate(latestSnapshot)) return latestSnapshot;
      console.log(
        `  DIAG  stalled ${direction} wheel at (${column}, ${row})\n` +
          latestSnapshot.text(),
      );
      throw error;
    }
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
    'overflowing tree paints one horizontal background bar row',
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
  await overflowDriver.awaitQuiescence();
  overflowDriver.sendKeys('Enter');
  snapshot = await overflowDriver.awaitGridCondition(
    'the mixed-width stability fixture is open in the editor',
    (candidate) => candidate.findText('HORIZONTAL-TH') !== null,
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
  let nextScrollFrame = overflowDriver.awaitNextCompletedFrameSnapshot(2_000);
  sendRepeatedWheel(overflowDriver, 'down', 25, 40, 10);
  for (let frameNumber = 1; frameNumber <= 300; frameNumber++) {
    let scrollFrame: Awaited<typeof nextScrollFrame>;
    try {
      scrollFrame = await nextScrollFrame;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith(
          'Timed out waiting for the next complete synchronized frame',
        )
      ) {
        break;
      }
      throw error;
    }
    const frameProof = horizontalEditorScrollBarProof(scrollFrame.snapshot);
    requireCondition(
      frameProof !== null,
      `editor horizontal thumb remains present in scroll frame ${frameNumber}`,
    );
    horizontalThumbLengths.push(frameProof.thumbLength);
    if (frameNumber < 300) {
      nextScrollFrame = overflowDriver.awaitNextCompletedFrameSnapshot(150);
    }
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
  await clickPanelHeadingAction(
    overflowDriver,
    statusPath,
    'expand',
    String(agentStatus.panelActiveContent),
  );
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
