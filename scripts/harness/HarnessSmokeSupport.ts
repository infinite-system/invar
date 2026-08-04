import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
import type { HarnessRectangle, HarnessSnapshot } from './HarnessSnapshot';
import type { PtyTestDriver } from './PtyTestDriver';

// invariant: Async-published state is always awaited (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)

export type HarnessStatus = Record<string, unknown>;

export interface PublishedPanelCell {
  readonly identifier: string;
  readonly kind: string;
  readonly columns: number;
  readonly index: number;
}

/** Read the aligned panel-cell status arrays without treating a pane kind as its identity. */
export function publishedPanelCells(
  status: HarnessStatus,
): readonly PublishedPanelCell[] {
  const identifiers = status.panelCellIds;
  const kinds = status.panelCellKinds;
  const columns = status.panelCellColumns;
  if (
    !Array.isArray(identifiers) ||
    !Array.isArray(kinds) ||
    !Array.isArray(columns) ||
    identifiers.length !== kinds.length ||
    identifiers.length !== columns.length
  ) {
    return [];
  }
  return identifiers.map((identifier, index) => ({
    identifier: String(identifier),
    kind: String(kinds[index]),
    columns: Number(columns[index]),
    index,
  }));
}

/** Return every visible cell of a kind. A kind can name many panes, so this result stays plural. */
export function panelCellsOfKind(
  status: HarnessStatus,
  kind: string,
): readonly PublishedPanelCell[] {
  return publishedPanelCells(status).filter((cell) => cell.kind === kind);
}

/** Resolve active-cell geometry through the exact opaque id published by panelActiveContent. */
export function activePanelCell(
  status: HarnessStatus,
): PublishedPanelCell | null {
  const activeIdentifier = status.panelActiveContent;
  if (typeof activeIdentifier !== 'string') return null;
  return (
    publishedPanelCells(status).find(
      (cell) => cell.identifier === activeIdentifier,
    ) ?? null
  );
}

/** Convert one layout-canvas slot to terminal-grid coordinates. The status layout starts below the
 *  workspace and breadcrumb chrome, so its row is not a screen row by itself. */
export function layoutSlotRectangle(
  status: HarnessStatus,
  slotName: string,
): HarnessRectangle | null {
  const layoutSlots = status.layoutSlots;
  const screenRows = Number(status.height);
  if (
    typeof layoutSlots !== 'object' ||
    layoutSlots === null ||
    !Number.isFinite(screenRows)
  ) {
    return null;
  }
  const rectangles = Object.values(layoutSlots).filter(
    (candidate): candidate is HarnessRectangle =>
      typeof candidate === 'object' &&
      candidate !== null &&
      Number.isFinite(Number((candidate as HarnessRectangle).left)) &&
      Number.isFinite(Number((candidate as HarnessRectangle).top)) &&
      Number.isFinite(Number((candidate as HarnessRectangle).width)) &&
      Number.isFinite(Number((candidate as HarnessRectangle).height)),
  );
  const slot = (layoutSlots as Record<string, unknown>)[slotName];
  if (!rectangles.includes(slot as HarnessRectangle)) return null;
  const rectangle = slot as HarnessRectangle;
  const layoutCanvasRows = rectangles.reduce(
    (maximumBottom, candidate) =>
      Math.max(maximumBottom, Number(candidate.top) + Number(candidate.height)),
    0,
  );
  const layoutCanvasTop = screenRows - 1 - layoutCanvasRows;
  return {
    left: Number(rectangle.left),
    top: layoutCanvasTop + Number(rectangle.top),
    width: Number(rectangle.width),
    height: Number(rectangle.height),
  };
}

/** Resolve one visible panel cell to its exact screen rectangle through its opaque identifier. */
// invariant: Pane identity is separate from presentation (src/modules/ui/ui.invariants.md)
export function panelCellRectangle(
  status: HarnessStatus,
  identifier: string,
): HarnessRectangle | null {
  const cells = publishedPanelCells(status);
  const cell = cells.find((candidate) => candidate.identifier === identifier);
  const panelRectangle = layoutSlotRectangle(status, 'bottomPanel');
  if (!cell || !panelRectangle) return null;
  const precedingColumns = cells
    .slice(0, cell.index)
    .reduce((totalColumns, candidate) => totalColumns + candidate.columns, 0);
  return {
    left: panelRectangle.left + precedingColumns + cell.index,
    top: panelRectangle.top,
    width: cell.columns,
    height: panelRectangle.height,
  };
}

/** Resolve the active opaque pane identifier to its screen rectangle. */
export function activePanelCellRectangle(
  status: HarnessStatus,
): HarnessRectangle | null {
  const cell = activePanelCell(status);
  return cell ? panelCellRectangle(status, cell.identifier) : null;
}

/** Return every registered pane id of a kind from the aligned content status arrays. */
export function panelContentIdentifiersOfKind(
  status: HarnessStatus,
  kind: string,
): readonly string[] {
  const identifiers = status.panelContentIds;
  const kinds = status.panelContentKinds;
  if (
    !Array.isArray(identifiers) ||
    !Array.isArray(kinds) ||
    identifiers.length !== kinds.length
  ) {
    return [];
  }
  return identifiers.flatMap((identifier, index) =>
    String(kinds[index]) === kind ? [String(identifier)] : [],
  );
}

export function pass(label: string): void {
  console.log(`  PASS  ${label}`);
}

export function requireCondition(
  condition: unknown,
  label: string,
): asserts condition {
  if (!condition) throw new Error(`FAIL ${label}`);
  pass(label);
}

/** Spawn a child with piped streams and require exit 0 — printing the child's full
 *  stdout and stderr FIRST when it fails. A piped-and-dropped child collapses a real
 *  red into one bare label: gate-493 preserved only "FAIL terminal core and PanelHost
 *  unit tests", so the failing test's identity was destroyed with it. */
export function requireChildSuccess(
  label: string,
  command: readonly string[],
  workingDirectory = process.cwd(),
): void {
  const result = Bun.spawnSync([...command], {
    cwd: workingDirectory,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (result.exitCode !== 0) {
    const standardOutput = new TextDecoder().decode(result.stdout).trim();
    const standardError = new TextDecoder().decode(result.stderr).trim();
    console.error(
      `-- child output for FAIL ${label} (exit ${result.exitCode}) --`,
    );
    if (standardOutput.length > 0) console.error(standardOutput);
    if (standardError.length > 0) console.error(standardError);
    if (standardOutput.length === 0 && standardError.length === 0) {
      console.error('(the child wrote nothing on either stream)');
    }
    console.error(`-- end of child output for ${label} --`);
  }
  requireCondition(result.exitCode === 0, label);
}

export function requireEqual(
  actualValue: unknown,
  expectedValue: unknown,
  label: string,
): void {
  requireCondition(
    actualValue === expectedValue,
    `${label} (${String(actualValue)})`,
  );
}

export function readStatus(statusPath: string): HarnessStatus | null {
  if (!existsSync(statusPath)) return null;
  return JSON.parse(readFileSync(statusPath, 'utf8')) as HarnessStatus;
}

export function statusField<T>(
  statusPath: string,
  fieldName: string,
): T | undefined {
  return readStatus(statusPath)?.[fieldName] as T | undefined;
}

export async function awaitStatus(
  driver: PtyTestDriver.Model,
  statusPath: string,
  description: string,
  predicate: (status: HarnessStatus) => boolean,
  timeoutMilliseconds = 30_000,
): Promise<HarnessStatus> {
  void driver;
  return awaitStatusPublication(
    statusPath,
    description,
    predicate,
    timeoutMilliseconds,
  );
}

export async function awaitStatusPublication(
  statusPath: string,
  description: string,
  predicate: (status: HarnessStatus) => boolean,
  timeoutMilliseconds = 30_000,
): Promise<HarnessStatus> {
  const deadline = performance.now() + timeoutMilliseconds;
  while (performance.now() < deadline) {
    const status = readStatus(statusPath);
    if (status && predicate(status)) return status;
    await Bun.sleep(5);
  }
  throw new Error(`Timed out waiting for ${description} at ${statusPath}`);
}

/** The tab bar paints the dirty marker in the single cell that follows the tab's ` label ` run and
 *  paints its close glyph two cells later (`TabBarRenderer`). Use both facts to distinguish the tab
 *  from the same filename in the breadcrumb row. Never hunt the ● glyph as text because that would
 *  also match a bullet inside the document. Shared by every smoke that reads the marker so the
 *  geometry lives in one place. */
export function activeTabHasDirtyMarker(
  snapshot: HarnessSnapshot.Model,
  bufferPath: string,
): boolean {
  const tabLabel = ` ${basename(bufferPath)} `;
  const closeGlyphs = new Set(
    (['nerd', 'unicode', 'ascii'] as const).map((glyphLevel) =>
      ThemeIcons.Class.glyphFor(glyphLevel, 'panelClose'),
    ),
  );
  let tabGeometryFound = false;
  for (let row = 0; row < snapshot.rows; row++) {
    const rowText = snapshot.rowText(row);
    let labelColumn = rowText.indexOf(tabLabel);
    while (labelColumn >= 0) {
      const markerColumn = labelColumn + tabLabel.length;
      const closeColumn = markerColumn + 2;
      if (closeGlyphs.has(snapshot.cell(row, closeColumn)?.characters ?? '')) {
        tabGeometryFound = true;
        if (snapshot.cell(row, markerColumn)?.characters !== ' ') return true;
      }
      labelColumn = rowText.indexOf(tabLabel, labelColumn + 1);
    }
  }
  if (tabGeometryFound) return false;
  throw new Error(`Active tab label is not visible: ${tabLabel}`);
}

export function markerPosition(
  snapshot: HarnessSnapshot.Model,
  marker: string,
): { row: number; column: number } {
  const position = snapshot.findText(marker);
  if (!position)
    throw new Error(`Marker is not visible: ${marker}\n${snapshot.text()}`);
  return position;
}

/** The workspace layout switcher is the middle cell of its three-cell right-edge segment.
 *  Resolve its mark through the theme vocabulary so a ladder change does not rewrite each smoke. */
export function commandBarLayoutSwitcherPosition(
  snapshot: HarnessSnapshot.Model,
): { row: number; column: number } | null {
  const layoutSwitcherGlyphs = new Set(
    (['nerd', 'unicode', 'ascii'] as const).map((glyphLevel) =>
      ThemeIcons.Class.glyphFor(glyphLevel, 'layoutSwitcher'),
    ),
  );
  const layoutSwitcherColumn = snapshot.columns - 2;
  for (let row = 0; row < snapshot.rows; row++) {
    if (
      layoutSwitcherGlyphs.has(
        snapshot.cell(row, layoutSwitcherColumn)?.characters ?? '',
      )
    ) {
      return { row, column: layoutSwitcherColumn };
    }
  }
  return null;
}

export function clickMarker(
  driver: PtyTestDriver.Model,
  snapshot: HarnessSnapshot.Model,
  marker: string,
): void {
  const position = markerPosition(snapshot, marker);
  driver.sendMouse({
    kind: 'press',
    column: position.column,
    row: position.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: position.column,
    row: position.row,
    button: 'left',
  });
}

export async function dragBetweenCells(
  driver: PtyTestDriver.Model,
  startColumn: number,
  startRow: number,
  endColumn: number,
  endRow: number,
): Promise<void> {
  driver.sendMouseWithoutFrameExpectation({
    kind: 'move',
    column: startColumn,
    row: startRow,
    button: 'none',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: startColumn,
    row: startRow,
    button: 'left',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'move',
    column: Math.floor((startColumn + endColumn) / 2),
    row: Math.floor((startRow + endRow) / 2),
    button: 'left',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'move',
    column: endColumn,
    row: endRow,
    button: 'left',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: endColumn,
    row: endRow,
    button: 'left',
  });
}

export function markerForeground(
  snapshot: HarnessSnapshot.Model,
  marker: string,
): number | null {
  const position = snapshot.findText(marker);
  return position
    ? (snapshot.cell(position.row, position.column)?.foreground ?? null)
    : null;
}

export function runGit(
  repositoryRoot: string,
  commandArguments: readonly string[],
): void {
  const result = Bun.spawnSync(['git', ...commandArguments], {
    cwd: repositoryRoot,
    // git writes several common failure reasons to STDOUT ("nothing to commit,
    // working tree clean"), so a stderr-only report can render a red as `failed: `
    // with no reason at all. Pipe BOTH streams and report both.
    stdout: 'pipe',
    stderr: 'pipe',
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        ([environmentName, environmentValue]) =>
          environmentValue !== undefined && !environmentName.startsWith('GIT_'),
      ),
    ) as Record<string, string>,
  });
  if (result.exitCode !== 0) {
    const standardError = new TextDecoder().decode(result.stderr).trim();
    const standardOutput = new TextDecoder().decode(result.stdout).trim();
    throw new Error(
      `git ${commandArguments.join(' ')} failed (exit ${result.exitCode})` +
        (standardError.length > 0 ? `; stderr: ${standardError}` : '') +
        (standardOutput.length > 0 ? `; stdout: ${standardOutput}` : '') +
        (standardError.length === 0 && standardOutput.length === 0
          ? '; both streams were empty'
          : ''),
    );
  }
}
