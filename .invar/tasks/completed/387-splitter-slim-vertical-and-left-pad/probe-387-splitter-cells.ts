#!/usr/bin/env bun
// What this finds out: how EVERY splitter in the app actually paints, cell by cell.
// The drive grid prints characters only, so a vertical splitter that fills its cell
// with a background colour looks like an empty column there. This probe reads the
// published `splitterRegions` rectangle for each splitter and prints, for every cell
// in it, the character and the foreground/background colour the terminal emulator
// received. That is the only way to compare the visual WEIGHT of the horizontal
// splitter against the vertical ones.
//
// How to run it (from the repository root):
//   bun .invar/tasks/in-progress/387-splitter-slim-vertical-and-left-pad/probe-387-splitter-cells.ts
//
// How to read the output: one block per splitter. The header gives the published
// rectangle. Each line is one cell as `row,column  <character>  fg=<n> bg=<n>`.
// `fg=default` or `bg=default` means the terminal was never told a colour there.
//   A cell that shows a SPACE with a non-default background is a FILLED cell — the
//   fat look. A cell that shows a line glyph with a default background is a SLIM
//   cell — the thin look. Count how many of the splitter's cells are which.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../../../src/modules/system/StatusChannel';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import type { HarnessSnapshot } from '../../../../scripts/harness/HarnessSnapshot';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

interface SplitterRegion {
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
}

function splitterRegions(
  status: StatusSnapshot,
): Record<string, SplitterRegion> {
  return (status.splitterRegions ?? {}) as Record<string, SplitterRegion>;
}

function describeColour(value: number, isDefault: boolean): string {
  return isDefault ? 'default' : String(value);
}

function printRegion(
  snapshot: HarnessSnapshot.Model,
  name: string,
  region: SplitterRegion,
): void {
  console.log(
    `\n=== ${name} === left=${region.left} top=${region.top} ` +
      `width=${region.width} height=${region.height} visible=${region.visible}`,
  );
  if (!region.visible || region.width <= 0 || region.height <= 0) {
    console.log('  (not painted)');
    return;
  }
  for (let row = region.top; row < region.top + region.height; row += 1) {
    for (
      let column = region.left;
      column < region.left + region.width;
      column += 1
    ) {
      const cell = snapshot.cell(row, column);
      if (!cell) {
        console.log(`  ${row},${column}  <off screen>`);
        continue;
      }
      const characters = cell.characters === ' ' ? '<space>' : cell.characters;
      console.log(
        `  ${row},${column}  ${characters}  ` +
          `fg=${describeColour(cell.foreground, cell.isForegroundDefault)} ` +
          `bg=${describeColour(cell.background, cell.isBackgroundDefault)}`,
      );
    }
  }
}

function printNeighbourRow(
  snapshot: HarnessSnapshot.Model,
  label: string,
  row: number,
  firstColumn: number,
  lastColumn: number,
): void {
  console.log(
    `\n--- ${label} row ${row}, columns ${firstColumn}..${lastColumn}`,
  );
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    const cell = snapshot.cell(row, column);
    if (!cell) continue;
    const characters = cell.characters === ' ' ? '<space>' : cell.characters;
    console.log(
      `  ${row},${column}  ${characters}  ` +
        `fg=${describeColour(cell.foreground, cell.isForegroundDefault)} ` +
        `bg=${describeColour(cell.background, cell.isBackgroundDefault)}`,
    );
  }
}

const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-387-splitter-probe-'));
const statusPath = join(homeDirectory, 'status.json');
const driver = new PtyTestDriver.Class({
  workspaceRoot: join(process.cwd(), 'fixtures'),
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_AGENT_BACKEND: 'echo',
    LANG: 'C.UTF-8',
    COLORTERM: 'truecolor',
  },
});

try {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the app boots',
    (status) => status.ready === true,
    20_000,
  );

  // A document must be open before the bottom panel splitter carries its action icons.
  driver.sendKeys('Control+p');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Quick Open is open',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText('greeter.ts');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Quick Open matches greeter.ts',
    (status) =>
      status.quickOpenQuery === 'greeter.ts' &&
      Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'one editor tab is open',
    (status) => Number(status.bufferTabCount) > 0,
  );

  driver.sendKeys('Control+j');
  const withPanel = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the bottom panel is visible',
    (status) =>
      splitterRegions(status).bottomPanel?.visible === true &&
      Number(splitterRegions(status).bottomPanel?.width) > 1,
  );

  driver.sendKeys('Control+Alt+b');
  const withDock = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the right dock is visible',
    (status) =>
      splitterRegions(status).rightDock?.visible === true &&
      Number(splitterRegions(status).rightDock?.height) > 1,
  );

  const snapshot = await driver.awaitGridCondition(
    'the grid settles with panel and dock open',
    (candidate) => candidate.rows > 0,
  );

  console.log('\n########## GRID ##########');
  for (const [index, text] of snapshot.textRows().entries()) {
    console.log(`${String(index).padStart(2, '0')} |${text}|`);
  }

  console.log('\n########## SPLITTER CELLS ##########');
  const regions = splitterRegions(withDock);
  for (const [name, region] of Object.entries(regions)) {
    printRegion(snapshot, name, region);
  }

  const bottomPanel = regions.bottomPanel;
  if (bottomPanel && bottomPanel.visible) {
    printNeighbourRow(
      snapshot,
      'bottom panel separator, full row',
      bottomPanel.top,
      Math.max(0, bottomPanel.left - 10),
      Math.min(snapshot.columns - 1, bottomPanel.left + bottomPanel.width + 12),
    );
  }
  void withPanel;
} finally {
  driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
