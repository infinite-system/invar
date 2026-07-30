#!/usr/bin/env bun
// Driven proof for panel headings, separator-row editor actions, minimum drag geometry,
// multi-instance visibility, center-only expansion, and the near-full-height unexpanded drag.
// Run it with `bun scripts/harness/smoke-panel-chrome-harness.ts`.
// ALL-PASS means paint and click geometry agree at both glyph tiers, the separator stays draggable
// at normal and narrow widths, and its first two editor-command contributions act at both scales.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)
// invariant: Panel controls share paint and hit geometry (src/modules/ui/ui.invariants.md)
// invariant: Each panel instance owns one independent session (src/modules/ui/ui.invariants.md)
// invariant: Expanded panel overrides only the editor center rows (src/modules/layout/layout.invariants.md)
// invariant: An unexpanded bottom panel leaves one editor row (src/modules/layout/layout.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { HarnessSmoke } from './HarnessSmoke';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver, type HarnessGridRegion } from './PtyTestDriver';

interface Rectangle {
  left: number;
  top: number;
  width: number;
  height: number;
  visible?: boolean;
}

interface HeadingControlLocation {
  readonly contentId: string;
  readonly action: 'add' | 'expand' | 'close';
  readonly startColumn: number;
  readonly endColumnExclusive: number;
  readonly row: number;
}

interface HeadingGeometry {
  readonly contentId: string;
  readonly row: number;
  readonly hoveredAction: 'add' | 'expand' | 'close' | null;
  readonly controls: readonly Omit<
    HeadingControlLocation,
    'contentId' | 'row'
  >[];
}

interface SeparatorActionLocation {
  readonly commandId: string;
  readonly startColumn: number;
  readonly endColumnExclusive: number;
}

interface SeparatorGeometry {
  readonly row: number;
  readonly editorActions: readonly SeparatorActionLocation[];
  readonly drag: Rectangle;
  readonly controls: readonly {
    action: 'add' | 'expand' | 'close';
    startColumn: number;
    endColumnExclusive: number;
  }[];
}

function clickCell(
  driver: PtyTestDriver.Model,
  column: number,
  row: number,
): void {
  driver.sendMouse({ kind: 'press', column, row, button: 'left' });
  driver.sendMouse({ kind: 'release', column, row, button: 'left' });
}

async function forceGlyphLevel(
  homeDirectory: string,
  glyphLevel: 'unicode' | 'ascii',
): Promise<void> {
  const settingsDirectory = join(homeDirectory, '.config', 'invar');
  mkdirSync(settingsDirectory, { recursive: true });
  await Bun.write(
    join(settingsDirectory, 'settings.json'),
    `${JSON.stringify({ glyphMode: glyphLevel })}\n`,
  );
}

function rectangle(status: StatusSnapshot, slot: string): Rectangle {
  const slots = status.layoutSlots as Record<string, Rectangle> | undefined;
  const resolved = slots?.[slot];
  if (!resolved) throw new Error(`Missing layout slot: ${slot}`);
  return resolved;
}

function headingGeometries(status: StatusSnapshot): readonly HeadingGeometry[] {
  const geometry = status.panelHeadingGeometry;
  if (!Array.isArray(geometry)) return [];
  return geometry as unknown as readonly HeadingGeometry[];
}

function headingControls(
  status: StatusSnapshot,
  contentId?: string,
): readonly HeadingControlLocation[] {
  const heading = headingGeometries(status).find(
    (candidate) => contentId === undefined || candidate.contentId === contentId,
  );
  if (!heading) return [];
  return heading.controls.map((control) => ({
    ...control,
    contentId: heading.contentId,
    row: heading.row,
  }));
}

function headingControl(
  status: StatusSnapshot,
  action: 'add' | 'expand' | 'close',
  contentId?: string,
): HeadingControlLocation | null {
  return (
    headingControls(status, contentId).find(
      (control) => control.action === action,
    ) ?? null
  );
}

function controlAttributes(
  snapshot: HarnessSnapshot.Model,
  control: HeadingControlLocation,
): string {
  return JSON.stringify(
    snapshot
      .rowCells(control.row)
      .slice(control.startColumn, control.endColumnExclusive)
      .map((cell) => ({
        foreground: cell.foreground,
        background: cell.background,
        isForegroundDefault: cell.isForegroundDefault,
        isForegroundRgb: cell.isForegroundRgb,
        isBackgroundDefault: cell.isBackgroundDefault,
        isBackgroundRgb: cell.isBackgroundRgb,
        isBold: cell.isBold,
        isDim: cell.isDim,
        isUnderline: cell.isUnderline,
        isInverse: cell.isInverse,
      })),
  );
}

async function hoverHeadingControl(
  driver: PtyTestDriver.Model,
  statusPath: string,
  restingSnapshot: HarnessSnapshot.Model,
  control: HeadingControlLocation,
  headingControlLocations: readonly HeadingControlLocation[],
  tooltipText: string,
): Promise<HarnessSnapshot.Model> {
  const expectedChangedColumns = Array.from(
    {
      length: control.endColumnExclusive - control.startColumn,
    },
    (_unusedValue, columnOffset) => control.startColumn + columnOffset,
  );
  driver.sendMouse({
    kind: 'move',
    column:
      control.startColumn +
      Math.floor((control.endColumnExclusive - control.startColumn) / 2),
    row: control.row,
    button: 'none',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `${control.action} is the published hovered heading action`,
    (status) =>
      headingGeometries(status).find(
        (heading) => heading.contentId === control.contentId,
      )?.hoveredAction === control.action,
  );
  const hoveredSnapshot = await driver.awaitGridCondition(
    `${control.action} heading control highlights exactly its published span and names itself`,
    (candidate) =>
      candidate.findText(tooltipText) !== null &&
      JSON.stringify(
        changedHeadingControlColumns(
          restingSnapshot,
          candidate,
          headingControlLocations,
        ),
      ) === JSON.stringify(expectedChangedColumns),
  );
  HarnessSmoke.Class.requireCondition(
    hoveredSnapshot.findText(tooltipText) !== null,
    `${control.action} tooltip names the control as ${tooltipText}`,
  );
  HarnessSmoke.Class.requireCondition(
    JSON.stringify(
      changedHeadingControlColumns(
        restingSnapshot,
        hoveredSnapshot,
        headingControlLocations,
      ),
    ) === JSON.stringify(expectedChangedColumns),
    `${control.action} hover highlight occupies exactly its own published column span`,
  );
  return hoveredSnapshot;
}

function changedHeadingControlColumns(
  restingSnapshot: HarnessSnapshot.Model,
  candidateSnapshot: HarnessSnapshot.Model,
  controls: readonly HeadingControlLocation[],
): number[] {
  const firstColumn = Math.min(
    ...controls.map((control) => control.startColumn),
  );
  const endColumnExclusive = Math.max(
    ...controls.map((control) => control.endColumnExclusive),
  );
  const row = controls[0]?.row ?? 0;
  const changedColumns: number[] = [];
  for (let column = firstColumn; column < endColumnExclusive; column += 1) {
    const singleCellControl: HeadingControlLocation = {
      contentId: controls[0]?.contentId ?? '',
      action: controls[0]?.action ?? 'add',
      startColumn: column,
      endColumnExclusive: column + 1,
      row,
    };
    if (
      controlAttributes(restingSnapshot, singleCellControl) !==
      controlAttributes(candidateSnapshot, singleCellControl)
    ) {
      changedColumns.push(column);
    }
  }
  return changedColumns;
}

function requireOrdinaryCloseForeground(
  snapshot: HarnessSnapshot.Model,
  closeControl: HeadingControlLocation,
): void {
  const closeCells = snapshot
    .rowCells(closeControl.row)
    .slice(closeControl.startColumn, closeControl.endColumnExclusive);
  const closeGlyphCell = closeCells.find(
    (cell) => cell.characters.trim().length > 0,
  );
  HarnessSmoke.Class.requireCondition(
    closeGlyphCell?.isForegroundRgb === true &&
      closeGlyphCell.foreground === 0xa9b1d6 &&
      closeCells.every((cell) => cell.foreground !== 0xf7768e),
    'Close uses the ordinary theme foreground and never the error red',
  );
}

function splitterRectangle(status: StatusSnapshot): Rectangle {
  const splitters = status.splitterRegions as
    Record<string, Rectangle> | undefined;
  const resolved = splitters?.bottomPanel;
  if (!resolved) throw new Error('Missing bottom-panel splitter geometry');
  return resolved;
}

function separatorGeometry(status: StatusSnapshot): SeparatorGeometry {
  const geometry = status.panelSeparatorGeometry as
    SeparatorGeometry | null | undefined;
  if (!geometry) throw new Error('Missing panel separator geometry');
  return geometry;
}

function contentsListRectangle(status: StatusSnapshot): Rectangle {
  const resolved = status.panelListGeometry as Rectangle | undefined;
  if (!resolved) throw new Error('Missing panel contents-list geometry');
  return resolved;
}

async function clickHeadingAction(
  driver: PtyTestDriver.Model,
  statusPath: string,
  action: 'add' | 'expand' | 'close',
  contentId?: string,
): Promise<void> {
  const status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `the ${action} panel heading action has published geometry before activation`,
    (candidate) => headingControl(candidate, action, contentId) !== null,
  );
  const control = headingControl(status, action, contentId);
  if (!control) {
    throw new Error(
      `Missing panel heading action geometry: ${contentId ?? 'first heading'} ${action}`,
    );
  }
  clickCell(
    driver,
    control.startColumn +
      Math.floor((control.endColumnExclusive - control.startColumn) / 2),
    control.row,
  );
}

async function awaitPopup(
  driver: PtyTestDriver.Model,
  statusPath: string,
  timeoutMilliseconds = 30_000,
): Promise<{
  status: StatusSnapshot;
  geometry: Rectangle & { listTop: number; listLeft: number };
}> {
  const status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Add panel bounded list is open with two items',
    (candidate) =>
      candidate.boundedListPopupOpen === true &&
      Number(candidate.boundedListPopupMatches) === 2 &&
      candidate.boundedListPopupGeometry !== null,
    timeoutMilliseconds,
  );
  const geometry = status.boundedListPopupGeometry as
    (Rectangle & { listTop: number; listLeft: number }) | undefined;
  if (!geometry) throw new Error('Missing Add panel popup geometry');
  const snapshot = await driver.awaitGridCondition(
    'the Add popup paints Terminal and Agent through the bounded list',
    (candidate) =>
      candidate.findText('Add') !== null &&
      candidate.rowText(geometry.listTop).includes('Terminal') &&
      candidate.rowText(geometry.listTop + 1).includes('Agent'),
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('Add') !== null &&
      snapshot.rowText(geometry.listTop).includes('Terminal') &&
      snapshot.rowText(geometry.listTop + 1).includes('Agent'),
    'Add popup paints Terminal and Agent through the bounded list',
  );
  return { status, geometry };
}

async function openAddPopup(
  driver: PtyTestDriver.Model,
  statusPath: string,
): ReturnType<typeof awaitPopup> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clickHeadingAction(driver, statusPath, 'add');
    try {
      return await awaitPopup(driver, statusPath, 2_500);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function clickPopupRow(
  driver: PtyTestDriver.Model,
  geometry: Rectangle & { listTop: number; listLeft: number },
  rowIndex: number,
): void {
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: geometry.listLeft + 1,
    row: geometry.listTop + rowIndex,
    button: 'left',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: geometry.listLeft + 1,
    row: geometry.listTop + rowIndex,
    button: 'left',
  });
}

function dockGeometry(status: StatusSnapshot): string {
  return JSON.stringify({
    activityBar: rectangle(status, 'activityBar'),
    sidebar: rectangle(status, 'sidebar'),
    sidebarSplitter: rectangle(status, 'sidebarSplitter'),
    rightDock: rectangle(status, 'rightDock'),
    rightDockSplitter: rectangle(status, 'rightDockSplitter'),
  });
}

async function filesHeadingRegion(
  driver: PtyTestDriver.Model,
): Promise<HarnessGridRegion> {
  const snapshot = await driver.awaitGridCondition(
    'the Files heading is rendered before the panel opens',
    (candidate) => candidate.findText('Files') !== null,
  );
  const headingPosition = snapshot.findText('Files');
  if (!headingPosition) throw new Error('Missing Files heading position');
  return {
    startRow: headingPosition.row,
    endRowExclusive: headingPosition.row + 1,
    startColumn: headingPosition.column,
    endColumnExclusive: headingPosition.column + 'Files'.length,
  };
}

function requireExpandedGeometry(
  status: StatusSnapshot,
  regularStatus: StatusSnapshot,
  snapshot: HarnessSnapshot.Model,
  label: string,
): void {
  const regularPanel = rectangle(regularStatus, 'bottomPanel');
  const expandedPanel = rectangle(status, 'bottomPanel');
  const expandedEditor = rectangle(status, 'editorCenter');
  const expandedSplitter = rectangle(status, 'bottomPanelSplitter');
  HarnessSmoke.Class.requireCondition(
    status.panelExpanded === true &&
      expandedPanel.top === 0 &&
      expandedPanel.left === regularPanel.left &&
      expandedPanel.width === regularPanel.width &&
      expandedPanel.height === regularPanel.top + regularPanel.height &&
      expandedEditor.height === 0 &&
      expandedSplitter.height === 0,
    `${label} expansion occupies the exact editor-plus-panel row extent`,
  );
  HarnessSmoke.Class.requireCondition(
    dockGeometry(status) === dockGeometry(regularStatus),
    `${label} expansion leaves both dock rectangles byte-identical`,
  );
  const expandControl = headingControl(status, 'expand');
  const paintedTopRow =
    (expandControl?.row ?? 0) - (expandControl?.contentId === 'panel' ? 0 : 1);
  const topLeftCell = snapshot.cell(paintedTopRow, expandedPanel.left);
  const bottomLeftCell = snapshot.cell(
    paintedTopRow + expandedPanel.height - 1,
    expandedPanel.left,
  );
  HarnessSmoke.Class.requireCondition(
    paintedTopRow >= 0 &&
      Boolean(topLeftCell?.characters.trim()) &&
      Boolean(bottomLeftCell?.characters.trim()),
    `${label} frame paints the expanded slot's top and bottom edges`,
  );
}

async function driveSecondSize(): Promise<void> {
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'invar-panel-chrome-compact-'),
  );
  const statusPath = join(homeDirectory, 'status.json');
  await forceGlyphLevel(homeDirectory, 'unicode');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: join(process.cwd(), 'fixtures'),
    columns: 88,
    rows: 24,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_AGENT_BACKEND: 'echo',
    },
  });
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the compact application is ready',
      (status) => status.ready === true,
      15_000,
    );
    const compactFilesHeadingRegion = await filesHeadingRegion(driver);
    await driver.assertContentInvariantAcrossAction({
      invariantRegion: compactFilesHeadingRegion,
      changedRegion: {
        startRow: 12,
        endRowExclusive: 23,
        startColumn: 0,
        endColumnExclusive: 88,
      },
      actionDescription:
        'Ctrl+J opens the compact panel while the top application chrome stays fixed',
      performAction: () => driver.sendKeys('Control+j'),
    });
    const regularStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the compact terminal panel is visible',
      (status) =>
        status.terminalVisible === true &&
        status.panelActiveContent === 'terminal',
    );
    await clickHeadingAction(driver, statusPath, 'expand');
    const expandedStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the compact panel is expanded',
      (status) => status.panelExpanded === true,
    );
    const expandedPanel = rectangle(expandedStatus, 'bottomPanel');
    const expandedControl = headingControl(expandedStatus, 'expand');
    if (!expandedControl) {
      throw new Error('Missing compact expanded heading geometry');
    }
    const paintedTopRow =
      expandedControl.row - (expandedControl.contentId === 'panel' ? 0 : 1);
    const expandedSnapshot = await driver.awaitGridCondition(
      'the compact expanded panel paints both slot edges',
      (snapshot) =>
        Boolean(
          snapshot.cell(paintedTopRow, expandedPanel.left)?.characters.trim(),
        ) &&
        Boolean(
          snapshot
            .cell(paintedTopRow + expandedPanel.height - 1, expandedPanel.left)
            ?.characters.trim(),
        ),
    );
    requireExpandedGeometry(
      expandedStatus,
      regularStatus,
      expandedSnapshot,
      '88x24',
    );
  } finally {
    driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

async function drivePanelSeparatorAtScale(
  columns: 47 | 55 | 100,
  lineCount: 10 | 100_000,
): Promise<void> {
  const workspaceRoot = mkdtempSync(
    join(tmpdir(), `invar-panel-separator-${columns}-${lineCount}-`),
  );
  const homeDirectory = mkdtempSync(
    join(tmpdir(), `invar-panel-separator-home-${columns}-${lineCount}-`),
  );
  const documentPath = join(workspaceRoot, `scale-${lineCount}.txt`);
  const statusPath = join(homeDirectory, 'status.json');
  await Bun.write(
    documentPath,
    Array.from(
      { length: lineCount },
      (_unusedValue, lineIndex) =>
        `DRIVE-LINE-${String(lineIndex + 1).padStart(6, '0')} scale ${lineCount}`,
    ).join('\n'),
  );
  await forceGlyphLevel(homeDirectory, 'unicode');
  const driver = new PtyTestDriver.Class({
    workspaceRoot,
    columns,
    rows: columns === 100 ? 30 : 24,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_AGENT_BACKEND: 'echo',
    },
  });
  try {
    await driver.awaitSnapshot(
      (snapshot) => snapshot.findText(`scale-${lineCount}.txt`) !== null,
      15_000,
    );
    driver.sendKeys('Enter');
    let status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}x scale ${lineCount}: the document is open before separator checks`,
      (candidate) => candidate.activeBuffer === documentPath,
    );
    if (status.terminalVisible !== true) {
      driver.sendKeys('Control+j');
    }
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}x scale ${lineCount}: the panel separator is published`,
      (candidate) =>
        candidate.terminalVisible === true &&
        candidate.panelSeparatorGeometry !== null,
    );
    let separator = separatorGeometry(status);
    const expectedActionIdentifiers =
      columns === 47 ? [] : ['view.toggleWordWrap', 'editor.goToLine'];
    HarnessSmoke.Class.requireCondition(
      JSON.stringify(
        separator.editorActions.map((action) => action.commandId),
      ) === JSON.stringify(expectedActionIdentifiers) &&
        separator.drag.width >= 1 &&
        separator.controls.length === 3,
      `${columns}x scale ${lineCount}: buttons truncate before the drag cell and all right controls remain`,
    );
    const firstControl = separator.controls[0];
    const lastAction = separator.editorActions.at(-1);
    HarnessSmoke.Class.requireCondition(
      (lastAction
        ? lastAction.endColumnExclusive === separator.drag.left
        : true) &&
        firstControl !== undefined &&
        separator.drag.left + separator.drag.width === firstControl.startColumn,
      `${columns}x scale ${lineCount}: row order is buttons then drag then controls with no gap or overlap`,
    );
    const splitter = splitterRectangle(status);
    const separatorSnapshot = await driver.awaitGridCondition(
      `${columns}x scale ${lineCount}: the published drag span paints lower-half cells`,
      (snapshot) =>
        snapshot
          .rowText(splitter.top)
          .slice(splitter.left, splitter.left + splitter.width) ===
        '▄'.repeat(splitter.width),
    );
    HarnessSmoke.Class.requireCondition(
      separatorSnapshot
        .rowText(splitter.top)
        .slice(splitter.left, splitter.left + splitter.width) ===
        '▄'.repeat(splitter.width),
      `${columns}x scale ${lineCount}: the splitter shares the thin horizontal-scrollbar paint`,
    );
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}x scale ${lineCount}: the splitter hit rectangle has settled`,
      (candidate) => {
        const candidateSplitter = splitterRectangle(candidate);
        const candidateSeparator = separatorGeometry(candidate);
        return (
          candidateSplitter.left > 0 &&
          candidateSplitter.width === candidateSeparator.drag.width
        );
      },
    );
    separator = separatorGeometry(status);

    if (separator.editorActions.length === 2) {
      HarnessSmoke.Class.requireCondition(
        status.wordWrap === false && status.goToLineOpen === false,
        `${columns}x scale ${lineCount}: both editor-action effects start absent`,
      );
      const wordWrapAction = separator.editorActions[0]!;
      clickCell(
        driver,
        wordWrapAction.startColumn +
          Math.floor(
            (wordWrapAction.endColumnExclusive - wordWrapAction.startColumn) /
              2,
          ),
        separator.row,
      );
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${columns}x scale ${lineCount}: the word-wrap button turns wrap on`,
        (candidate) => candidate.wordWrap === true,
      );
      clickCell(
        driver,
        wordWrapAction.startColumn +
          Math.floor(
            (wordWrapAction.endColumnExclusive - wordWrapAction.startColumn) /
              2,
          ),
        separator.row,
      );
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${columns}x scale ${lineCount}: the word-wrap button turns wrap off`,
        (candidate) => candidate.wordWrap === false,
      );
      const goToLineAction = separator.editorActions[1]!;
      clickCell(
        driver,
        goToLineAction.startColumn +
          Math.floor(
            (goToLineAction.endColumnExclusive - goToLineAction.startColumn) /
              2,
          ),
        separator.row,
      );
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${columns}x scale ${lineCount}: the go-to-line button opens its prompt`,
        (candidate) => candidate.goToLineOpen === true,
      );
      driver.sendKeys('Escape');
      status = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${columns}x scale ${lineCount}: Escape closes the button-opened prompt`,
        (candidate) => candidate.goToLineOpen === false,
      );
      separator = separatorGeometry(status);
    }

    {
      const panelBeforeDrag = rectangle(status, 'bottomPanel');
      const liveSplitter = splitterRectangle(status);
      const splitterColumn =
        liveSplitter.left + Math.floor(liveSplitter.width / 2);
      driver.sendMouse({
        kind: 'press',
        column: splitterColumn,
        row: liveSplitter.top,
        button: 'left',
      });
      driver.sendMouse({
        kind: 'move',
        column: splitterColumn,
        row: Math.max(0, liveSplitter.top - 2),
        button: 'left',
      });
      driver.sendMouse({
        kind: 'release',
        column: splitterColumn,
        row: Math.max(0, liveSplitter.top - 2),
        button: 'left',
      });
      const draggedStatus = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${columns}x scale ${lineCount}: the thin splitter drag grows the panel`,
        (candidate) =>
          rectangle(candidate, 'bottomPanel').top < panelBeforeDrag.top,
      );
      HarnessSmoke.Class.requireCondition(
        separatorGeometry(draggedStatus).drag.width >= 1,
        `${columns}x scale ${lineCount}: the drag segment remains nonzero after movement`,
      );
    }
  } finally {
    driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(workspaceRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

async function driveAsciiHeadingControls(): Promise<void> {
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'invar-panel-chrome-ascii-'),
  );
  const statusPath = join(homeDirectory, 'status.json');
  await forceGlyphLevel(homeDirectory, 'ascii');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: join(process.cwd(), 'fixtures'),
    columns: 100,
    rows: 30,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_AGENT_BACKEND: 'echo',
    },
  });
  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the ascii-tier application is ready with its panel hidden',
      (status) => status.ready === true && status.terminalVisible === false,
      15_000,
    );
    driver.sendKeys('Control+j');
    const restingStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the ascii-tier panel publishes all heading control geometry',
      (status) =>
        status.panelActiveContent === 'terminal' &&
        headingControls(status).length === 3,
    );
    const restingControls = headingControls(restingStatus);
    const restingSnapshot = await driver.awaitGridCondition(
      'the ascii-tier heading paints every published control span',
      (candidate) =>
        restingControls.every((control) => {
          const centerColumn =
            control.startColumn +
            Math.floor((control.endColumnExclusive - control.startColumn) / 2);
          return Boolean(
            candidate.cell(control.row, centerColumn)?.characters.trim(),
          );
        }),
    );
    for (const [action, tooltipText] of [
      ['add', 'Add panel'],
      ['expand', 'Expand panel'],
      ['close', 'Close panel'],
    ] as const) {
      const control = headingControl(restingStatus, action);
      if (!control) throw new Error(`Missing ascii-tier ${action} control`);
      await hoverHeadingControl(
        driver,
        statusPath,
        restingSnapshot,
        control,
        restingControls,
        tooltipText,
      );
    }

    await clickHeadingAction(driver, statusPath, 'add');
    await awaitPopup(driver, statusPath);
    driver.sendKeys('Escape');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the ascii-tier Add popup closes before expanding',
      (status) => status.boundedListPopupOpen === false,
    );

    await clickHeadingAction(driver, statusPath, 'expand');
    const expandedStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the ascii-tier Expand action expands the panel',
      (status) =>
        status.panelExpanded === true &&
        headingControl(status, 'expand') !== null,
    );
    const expandedControls = headingControls(expandedStatus);
    const expandedControl = headingControl(expandedStatus, 'expand');
    if (!expandedControl) {
      throw new Error('Missing ascii-tier Restore action geometry');
    }
    const expandedSnapshot = driver.snapshot();
    await hoverHeadingControl(
      driver,
      statusPath,
      expandedSnapshot,
      expandedControl,
      expandedControls,
      'Restore panel',
    );
    await clickHeadingAction(driver, statusPath, 'expand');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the ascii-tier Restore action restores the panel',
      (status) => status.panelExpanded === false,
    );

    await clickHeadingAction(driver, statusPath, 'close', 'terminal');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the ascii-tier Close action closes its panel content',
      (status) =>
        status.terminalVisible === false &&
        Array.isArray(status.panelCellIds) &&
        status.panelCellIds.length === 0,
    );
    console.log(
      'panel heading tier ascii: hover spans + tooltips + add/expand/restore/close ALL-PASS',
    );
  } finally {
    driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

console.log('== harness panel-chrome: boot and prove the quiet baseline ==');

const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-panel-chrome-'));

const statusPath = join(homeDirectory, 'status.json');

await forceGlyphLevel(homeDirectory, 'unicode');

const driver = new PtyTestDriver.Class({
  workspaceRoot: join(process.cwd(), 'fixtures'),
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_AGENT_BACKEND: 'echo',
  },
});

try {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the application is ready with its panel hidden',
    (status) => status.ready === true && status.terminalVisible === false,
    15_000,
  );
  const regularFilesHeadingRegion = await filesHeadingRegion(driver);
  await driver.assertContentInvariantAcrossAction({
    invariantRegion: regularFilesHeadingRegion,
    changedRegion: {
      startRow: 20,
      endRowExclusive: 39,
      startColumn: 0,
      endColumnExclusive: 120,
    },
    actionDescription:
      'Ctrl+J opens the panel while the top application chrome stays fixed',
    performAction: () => driver.sendKeys('Control+j'),
  });
  const restingHeadingStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Terminal 1 is visible with action-addressed heading geometry',
    (status) =>
      status.panelActiveContent === 'terminal' &&
      Array.isArray(status.panelContentLabels) &&
      status.panelContentLabels.join(',') === 'Terminal' &&
      headingControls(status).length === 3,
  );
  const restingHeadingControls = headingControls(restingHeadingStatus);

  console.log(
    '== harness panel-chrome: every heading control explains and highlights itself ==',
  );
  const restingHeadingSnapshot = await driver.awaitGridCondition(
    'the resting Terminal heading paints every published action span',
    (candidate) =>
      restingHeadingControls.every((control) => {
        const centerColumn =
          control.startColumn +
          Math.floor((control.endColumnExclusive - control.startColumn) / 2);
        return Boolean(
          candidate.cell(control.row, centerColumn)?.characters.trim(),
        );
      }),
  );
  const restingAddControl = headingControl(restingHeadingStatus, 'add');
  const restingExpandControl = headingControl(restingHeadingStatus, 'expand');
  const restingCloseControl = headingControl(restingHeadingStatus, 'close');
  if (!restingAddControl || !restingExpandControl || !restingCloseControl) {
    throw new Error('Missing resting Terminal heading controls');
  }
  requireOrdinaryCloseForeground(restingHeadingSnapshot, restingCloseControl);
  await hoverHeadingControl(
    driver,
    statusPath,
    restingHeadingSnapshot,
    restingAddControl,
    restingHeadingControls,
    'Add panel',
  );
  await hoverHeadingControl(
    driver,
    statusPath,
    restingHeadingSnapshot,
    restingExpandControl,
    restingHeadingControls,
    'Expand panel',
  );
  await hoverHeadingControl(
    driver,
    statusPath,
    restingHeadingSnapshot,
    restingCloseControl,
    restingHeadingControls,
    'Close panel',
  );
  driver.sendMouse({
    kind: 'move',
    column: Math.max(0, restingAddControl.startColumn - 2),
    row: restingAddControl.row,
    button: 'none',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the published heading hover action clears after pointer exit',
    (candidate) =>
      headingGeometries(candidate).every(
        (heading) => heading.hoveredAction === null,
      ),
  );
  await driver.awaitGridCondition(
    'all heading controls return to rest after the pointer leaves them',
    (candidate) =>
      restingHeadingControls.every(
        (control) =>
          controlAttributes(candidate, control) ===
          controlAttributes(restingHeadingSnapshot, control),
      ) && candidate.findText('Close panel') === null,
  );

  console.log(
    '== harness panel-chrome: Add creates and selects independent instances ==',
  );
  let popup = await openAddPopup(driver, statusPath);
  clickPopupRow(driver, popup.geometry, 0);
  let status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Terminal 2 is registered and visible instead of Terminal 1',
    (candidate) =>
      Array.isArray(candidate.panelContentLabels) &&
      candidate.panelContentLabels.join(',') === 'Terminal,Terminal 2' &&
      Array.isArray(candidate.panelCellIds) &&
      candidate.panelCellIds.join(',') === 'terminal-2',
  );
  HarnessSmoke.Class.pass('Terminal selection adds an independent Terminal 2');

  let list = contentsListRectangle(status);
  HarnessSmoke.Class.requireCondition(
    list.visible === true && list.height > 0,
    'contents list remains visible for hidden and visible instances',
  );
  clickCell(driver, list.left + 4, list.top);
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the contents list selects hidden Terminal 1',
    (candidate) =>
      Array.isArray(candidate.panelCellIds) &&
      candidate.panelCellIds.join(',') === 'terminal',
  );
  HarnessSmoke.Class.pass('contents-list selection swaps same-kind visibility');

  list = contentsListRectangle(status);
  clickCell(driver, list.left + list.width - 1, list.top + 1);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Terminal 2 list close removes only that instance',
    (candidate) =>
      Array.isArray(candidate.panelContentLabels) &&
      candidate.panelContentLabels.join(',') === 'Terminal' &&
      candidate.panelListVisible === false,
  );
  HarnessSmoke.Class.pass('contents-list close destroys only Terminal 2');

  popup = await openAddPopup(driver, statusPath);
  clickPopupRow(driver, popup.geometry, 1);
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Agent 1 is added beside Terminal 1',
    (candidate) =>
      Array.isArray(candidate.panelContentKinds) &&
      candidate.panelContentKinds.join(',') === 'agent,terminal' &&
      Array.isArray(candidate.panelCellIds) &&
      candidate.panelCellIds.join(',') === 'agent,terminal',
  );
  HarnessSmoke.Class.pass('Agent selection adds the second offered kind');

  popup = await openAddPopup(driver, statusPath);
  clickPopupRow(driver, popup.geometry, 1);
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Agent 2 is registered and visible instead of Agent 1',
    (candidate) =>
      Array.isArray(candidate.panelContentLabels) &&
      candidate.panelContentLabels.join(',') === 'Agent,Terminal,Agent 2' &&
      Array.isArray(candidate.panelCellIds) &&
      candidate.panelCellIds.join(',') === 'agent-2,terminal',
  );
  HarnessSmoke.Class.pass('a second Agent selection adds independent Agent 2');

  list = contentsListRectangle(status);
  clickCell(driver, list.left + 4, list.top);
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the contents list restores hidden Agent 1',
    (candidate) =>
      Array.isArray(candidate.panelCellIds) &&
      candidate.panelCellIds.join(',') === 'agent,terminal',
  );
  list = contentsListRectangle(status);
  clickCell(driver, list.left + list.width - 1, list.top + 2);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Agent 2 list close removes only that instance',
    (candidate) =>
      Array.isArray(candidate.panelContentLabels) &&
      candidate.panelContentLabels.join(',') === 'Agent,Terminal' &&
      Array.isArray(candidate.panelCellIds) &&
      candidate.panelCellIds.join(',') === 'agent,terminal',
  );
  HarnessSmoke.Class.pass('Agent instances select and close through the list');

  await clickHeadingAction(driver, statusPath, 'close', 'agent');
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Agent heading close removes Agent 1',
    (candidate) =>
      Array.isArray(candidate.panelContentLabels) &&
      candidate.panelContentLabels.join(',') === 'Terminal' &&
      Array.isArray(candidate.panelCellIds) &&
      candidate.panelCellIds.join(',') === 'terminal',
  );
  HarnessSmoke.Class.pass(
    'heading Close action removes its own content region',
  );

  console.log(
    '== harness panel-chrome: Expand overrides only center rows and restores ==',
  );
  const regularStatus = status;
  const regularPanel = rectangle(regularStatus, 'bottomPanel');
  await clickHeadingAction(driver, statusPath, 'expand');
  const expandedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the 120x40 panel is expanded with restored action geometry',
    (candidate) =>
      candidate.panelExpanded === true &&
      headingControls(candidate).length === 3,
  );
  const expandedPanel = rectangle(expandedStatus, 'bottomPanel');
  const expandedControl = headingControl(expandedStatus, 'expand');
  if (!expandedControl) throw new Error('Missing expanded heading action');
  const paintedTopRow =
    expandedControl.row - (expandedControl.contentId === 'panel' ? 0 : 1);
  const expandedSnapshot = await driver.awaitGridCondition(
    'the expanded panel paints both slot edges',
    (snapshot) =>
      Boolean(
        snapshot.cell(paintedTopRow, expandedPanel.left)?.characters.trim(),
      ) &&
      Boolean(
        snapshot
          .cell(paintedTopRow + expandedPanel.height - 1, expandedPanel.left)
          ?.characters.trim(),
      ),
  );
  requireExpandedGeometry(
    expandedStatus,
    regularStatus,
    expandedSnapshot,
    '120x40',
  );
  const expandedHeadingControls = headingControls(expandedStatus);
  await hoverHeadingControl(
    driver,
    statusPath,
    expandedSnapshot,
    expandedControl,
    expandedHeadingControls,
    'Restore panel',
  );

  await clickHeadingAction(driver, statusPath, 'expand');
  const restoredStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the panel restores its previous height',
    (candidate) =>
      candidate.panelExpanded === false &&
      JSON.stringify(
        (candidate.layoutSlots as Record<string, Rectangle>)?.bottomPanel,
      ) === JSON.stringify(regularPanel),
  );
  HarnessSmoke.Class.requireCondition(
    JSON.stringify(rectangle(restoredStatus, 'bottomPanel')) ===
      JSON.stringify(regularPanel),
    'Restore returns to the exact prior panel rectangle',
  );

  const preservedPanelContentIds = JSON.stringify(
    restoredStatus.panelContentIds,
  );
  await clickHeadingAction(driver, statusPath, 'close');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the panel-level Close hides the panel without destroying its panes',
    (candidate) =>
      candidate.terminalVisible === false &&
      JSON.stringify(candidate.panelContentIds) === preservedPanelContentIds,
  );
  driver.sendKeys('Control+j');
  const reopenedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Ctrl+J restores the panel-level Close contents',
    (candidate) =>
      candidate.terminalVisible === true &&
      JSON.stringify(candidate.panelContentIds) === preservedPanelContentIds,
  );
  HarnessSmoke.Class.pass(
    'panel-level Close hides and restores without disposing pane sessions',
  );

  console.log(
    '== harness panel-chrome: splitter reaches the new near-full maximum ==',
  );
  const splitter = splitterRectangle(reopenedStatus);
  const splitterColumn = splitter.left + Math.floor(splitter.width / 2);
  driver.sendMouse({
    kind: 'press',
    column: splitterColumn,
    row: splitter.top,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'move',
    column: splitterColumn,
    row: 0,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: splitterColumn,
    row: 0,
    button: 'left',
  });
  const maximumStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the unexpanded splitter clamps at one editor row',
    (candidate) =>
      rectangle(candidate, 'editorCenter').height === 1 &&
      rectangle(candidate, 'bottomPanelSplitter').top === 1,
  );
  const maximumPanel = rectangle(maximumStatus, 'bottomPanel');
  const maximumEditor = rectangle(maximumStatus, 'editorCenter');
  const maximumSplitter = rectangle(maximumStatus, 'bottomPanelSplitter');
  HarnessSmoke.Class.requireCondition(
    maximumEditor.height === 1 &&
      maximumSplitter.height === 1 &&
      maximumPanel.top === 2 &&
      maximumPanel.height === regularPanel.top + regularPanel.height - 2,
    'drag maximum leaves only the one-row editor sliver and splitter',
  );

  console.log(
    '== harness panel-chrome: repeat exact expansion edges at 88x24 ==',
  );
  await driveSecondSize();
  console.log(
    'panel heading tier unicode: hover spans + tooltips + add/expand/restore/close ALL-PASS',
  );
} finally {
  driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}

console.log(
  '== harness panel-chrome: separator actions and thin drag survive width and scale ==',
);
await drivePanelSeparatorAtScale(55, 10);
await drivePanelSeparatorAtScale(47, 10);
await drivePanelSeparatorAtScale(100, 100_000);

console.log(
  '== harness panel-chrome: repeat every heading interaction at the ascii tier ==',
);

await driveAsciiHeadingControls();

console.log('smoke-panel-chrome-harness: ALL-PASS');
