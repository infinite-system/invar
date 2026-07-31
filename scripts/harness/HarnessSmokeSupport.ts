import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
import type { HarnessSnapshot } from './HarnessSnapshot';
import type { PtyTestDriver } from './PtyTestDriver';

// invariant: Async-published state is always awaited (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)

export type HarnessStatus = Record<string, unknown>;

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

/** The tab bar paints the dirty marker in the single cell that follows the tab's ` label ` run
 *  (`TabBarRenderer`), so the marker is addressed by that GEOMETRY — never by hunting the ● glyph as
 *  text, which would also match a bullet inside the document. Shared by every smoke that reads the
 *  marker so the geometry lives in one place. */
export function activeTabHasDirtyMarker(
  snapshot: HarnessSnapshot.Model,
  bufferPath: string,
): boolean {
  const tabLabel = ` ${basename(bufferPath)} `;
  for (let row = 0; row < snapshot.rows; row++) {
    const labelColumn = snapshot.rowText(row).indexOf(tabLabel);
    if (labelColumn < 0) continue;
    return (
      snapshot.cell(row, labelColumn + tabLabel.length)?.characters !== ' '
    );
  }
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
    stdout: 'ignore',
    stderr: 'pipe',
    env: Object.fromEntries(
      Object.entries(process.env).filter(
        ([environmentName, environmentValue]) =>
          environmentValue !== undefined && !environmentName.startsWith('GIT_'),
      ),
    ) as Record<string, string>,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${commandArguments.join(' ')} failed: ` +
        new TextDecoder().decode(result.stderr),
    );
  }
}
