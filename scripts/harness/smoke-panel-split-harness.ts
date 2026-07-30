#!/usr/bin/env bun
// Byte-level panel-split port: the real agent and terminal citizens render in independent regions,
// receive focus-routed keys, resize through a dragged divider, and return to one cell.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Visible panel contents own separate headed regions (src/modules/ui/ui.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
import type { GlyphLevel } from '../../src/modules/theme/TerminalCapabilities';
import { HarnessSmoke } from './HarnessSmoke';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

function cellColumns(status: StatusSnapshot): number[] {
  const value = status.panelCellColumns;
  return Array.isArray(value) ? value.map(Number) : [];
}

function clickCell(
  driver: PtyTestDriver.Model,
  column: number,
  row: number,
): void {
  driver.sendMouse({ kind: 'press', column, row, button: 'left' });
  driver.sendMouse({ kind: 'release', column, row, button: 'left' });
}

function statusButtonColumn(
  snapshot: HarnessSnapshot.Model,
  buttonText: string,
): number {
  const column = snapshot.rowText(snapshot.rows - 1).lastIndexOf(buttonText);
  if (column < 0)
    throw new Error(`Status button is not visible: ${buttonText}`);
  return column + 1;
}

async function driveSharedCloseGlyphTier(
  glyphLevel: Extract<GlyphLevel, 'nerd' | 'unicode'>,
): Promise<void> {
  const tierHomeDirectory = mkdtempSync(
    join(tmpdir(), `tui-panel-close-${glyphLevel}-`),
  );
  const tierStatusPath = join(tierHomeDirectory, 'status.json');
  const tierDriver = new PtyTestDriver.Class({
    workspaceRoot: join(process.cwd(), 'fixtures'),
    columns: 120,
    rows: 40,
    homeDirectory: tierHomeDirectory,
    environment: {
      TUI_STATUS_PATH: tierStatusPath,
      INVAR_AGENT_BACKEND: 'echo',
      LANG: 'C.UTF-8',
      NERD_FONT: glyphLevel === 'nerd' ? '1' : '0',
    },
  });
  const terminalIcon = ThemeIcons.Class.terminalIconFor(glyphLevel);
  const agentIcon = ThemeIcons.Class.agentIconFor(glyphLevel);
  const closeGlyph =
    ThemeIcons.Class.interfaceGlyphVocabularyFor(glyphLevel).panelClose;

  try {
    await HarnessSmoke.Class.awaitStatus(
      tierDriver,
      tierStatusPath,
      `${glyphLevel} close-glyph drive boots with the panel hidden`,
      (status) => status.ready === true && status.terminalVisible === false,
      15_000,
    );
    tierDriver.sendKeys('Control+p');
    await HarnessSmoke.Class.awaitStatus(
      tierDriver,
      tierStatusPath,
      `${glyphLevel} close-glyph drive opens Quick Open`,
      (status) => status.quickOpenOpen === true,
    );
    tierDriver.sendText('greeter.ts');
    await HarnessSmoke.Class.awaitStatus(
      tierDriver,
      tierStatusPath,
      `${glyphLevel} close-glyph drive finds greeter.ts`,
      (status) =>
        status.quickOpenQuery === 'greeter.ts' &&
        Number(status.quickOpenMatches) > 0,
    );
    tierDriver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      tierDriver,
      tierStatusPath,
      `${glyphLevel} close-glyph drive opens one editor tab`,
      (status) => Number(status.bufferTabCount) > 0,
    );
    let snapshot = await tierDriver.awaitGridCondition(
      `${glyphLevel} status bar exposes terminal and agent controls`,
      (candidate) =>
        candidate.findText(` ${terminalIcon} `) !== null &&
        candidate.findText(` ${agentIcon} `) !== null,
    );
    clickCell(
      tierDriver,
      statusButtonColumn(snapshot, ` ${terminalIcon} `),
      snapshot.rows - 1,
    );
    await HarnessSmoke.Class.awaitStatus(
      tierDriver,
      tierStatusPath,
      `${glyphLevel} terminal opens in the panel`,
      (status) =>
        Array.isArray(status.panelCellIds) &&
        status.panelCellIds.includes('terminal'),
    );
    snapshot = tierDriver.snapshot();
    clickCell(
      tierDriver,
      statusButtonColumn(snapshot, ` ${agentIcon} `),
      snapshot.rows - 1,
    );
    const splitStatus = await HarnessSmoke.Class.awaitStatus(
      tierDriver,
      tierStatusPath,
      `${glyphLevel} two-pane space keeps its management list collapsed`,
      (status) =>
        Array.isArray(status.panelCellIds) &&
        status.panelCellIds.includes('agent') &&
        status.panelCellIds.includes('terminal') &&
        status.panelListVisible === false,
    );
    const sharedGlyphSnapshot = await tierDriver.awaitGridCondition(
      `${glyphLevel} tab row omits per-pane title and close chrome`,
      (candidate) =>
        candidate.findText('Claude ×') === null &&
        candidate.findText('Terminal ×') === null,
    );
    const bufferTabRow = sharedGlyphSnapshot
      .textRows()
      .findIndex((rowText) => /\d+\/\d+/.test(rowText));
    const headingGeometry = splitStatus.panelHeadingGeometry as Array<{
      row: number;
      controls: Array<{
        action: string;
        startColumn: number;
        endColumnExclusive: number;
      }>;
    }>;
    const headingCloseCells = headingGeometry.flatMap((heading) =>
      heading.controls
        .filter((control) => control.action === 'close')
        .map((control) =>
          sharedGlyphSnapshot.cell(heading.row, control.startColumn + 1),
        ),
    );
    HarnessSmoke.Class.requireCondition(
      sharedGlyphSnapshot.rowText(bufferTabRow).includes(closeGlyph),
      `${glyphLevel} buffer tab paints shared ${JSON.stringify(closeGlyph)}`,
    );
    HarnessSmoke.Class.requireCondition(
      headingCloseCells.some((cell) => cell?.characters === closeGlyph),
      `${glyphLevel} panel-level close paints shared ${JSON.stringify(closeGlyph)}`,
    );
  } finally {
    await tierDriver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(tierHomeDirectory);
  }
}

console.log('== harness panel-split: deterministic PanelHost split tests ==');

const unitResult = Bun.spawnSync(
  [process.execPath, 'test', 'src/modules/ui/PanelHost.test.ts'],
  { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' },
);

HarnessSmoke.Class.requireCondition(
  unitResult.exitCode === 0,
  'PanelHost unit tests (split layout, focus routing, per-cell resize, divider re-flow)',
);

console.log(
  '== harness panel-split: shared close glyph in nerd and plain tiers ==',
);
await driveSharedCloseGlyphTier('nerd');
await driveSharedCloseGlyphTier('unicode');

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-panel-split-harness-home-'),
);

const statusPath = join(homeDirectory, 'status.json');

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
  console.log(
    '== harness panel-split: boot hidden and open the single terminal cell ==',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the application is ready with the panel hidden',
    (status) => status.ready === true && status.terminalVisible === false,
    15_000,
  );
  HarnessSmoke.Class.pass('panel hidden at boot');
  let statusBarSnapshot = await driver.awaitGridCondition(
    'the terminal status button is visible before opening the panel',
    (candidate) => candidate.findText(' ❯ ') !== null,
  );
  clickCell(
    driver,
    statusButtonColumn(statusBarSnapshot, ' ❯ '),
    statusBarSnapshot.rows - 1,
  );
  let openedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.terminalVisible === true && Array.isArray(status.panelCellIds) && status.panelCellIds.join(',') === 'terminal' && Array.isArray(status.panelCellColumns) && Number(status.panelCellColumns[0]) > 1",
    (status) =>
      status.terminalVisible === true &&
      Array.isArray(status.panelCellIds) &&
      status.panelCellIds.join(',') === 'terminal' &&
      Array.isArray(status.panelCellColumns) &&
      Number(status.panelCellColumns[0]) > 1,
  );
  HarnessSmoke.Class.pass('panel visible');
  HarnessSmoke.Class.pass('single cell is terminal');
  HarnessSmoke.Class.requireCondition(
    openedStatus.panelFocusedIndex === 0,
    'focused cell index is 0',
  );
  const fullColumns = cellColumns(openedStatus)[0] ?? 0;
  HarnessSmoke.Class.requireCondition(
    fullColumns > 1,
    'single cell has real width',
  );

  console.log(
    '== harness panel-split: clicking Agent adds its own side-by-side pane ==',
  );
  clickCell(
    driver,
    statusButtonColumn(driver.snapshot(), ' ✦ '),
    driver.snapshot().rows - 1,
  );
  openedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: Array.isArray(status.panelCellIds) && status.panelCellIds.join(',') === 'agent,terminal' && status.panelActiveContent === 'agent'",
    (status) =>
      Array.isArray(status.panelCellIds) &&
      status.panelCellIds.join(',') === 'agent,terminal' &&
      status.panelActiveContent === 'agent' &&
      Array.isArray(status.panelCellColumns),
  );
  HarnessSmoke.Class.pass('two cells render left-to-right');
  HarnessSmoke.Class.requireCondition(
    openedStatus.panelFocusedIndex === 0,
    'newly opened agent cell is focused',
  );
  HarnessSmoke.Class.requireCondition(
    openedStatus.panelListVisible === false,
    'contents list stays hidden with two open panes',
  );
  const initialColumns = cellColumns(openedStatus);
  const initialLeftColumns = initialColumns[0] ?? 0;
  const initialRightColumns = initialColumns[1] ?? 0;
  HarnessSmoke.Class.requireCondition(
    initialLeftColumns > 1,
    'left cell has its own width',
  );
  HarnessSmoke.Class.requireCondition(
    initialRightColumns > 1,
    'right cell has its own width',
  );
  HarnessSmoke.Class.requireCondition(
    initialLeftColumns < fullColumns && initialRightColumns < fullColumns,
    'both split cells are narrower than the full pane',
  );
  await driver.awaitSnapshot((snapshot) =>
    snapshot
      .textRows()
      .some(
        (text) =>
          text.includes('❯') &&
          text.includes('✦') &&
          text.indexOf('✦') < text.indexOf('❯'),
      ),
  );
  const headingText =
    driver
      .snapshot()
      .textRows()
      .find(
        (text) =>
          text.includes('❯') &&
          text.includes('✦') &&
          text.indexOf('✦') < text.indexOf('❯'),
      ) ?? '';
  HarnessSmoke.Class.requireCondition(
    headingText.indexOf('✦') < headingText.indexOf('❯'),
    'agent and terminal render in separate flat pane regions',
  );
  HarnessSmoke.Class.pass('agent pane shows its own composer');

  console.log(
    '== harness panel-split: keys reach only the focused agent cell ==',
  );
  driver.sendText('AGENTKEY');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('AGENTKEY') !== null,
  );
  HarnessSmoke.Class.pass('focused agent cell received the keys');

  console.log(
    '== harness panel-split: click focuses terminal and stty sees its sub-width ==',
  );
  const panelRow = Number(openedStatus.height) - 8;
  const layoutSlots = openedStatus.layoutSlots as
    Record<string, { left: number; top: number; width: number }> | undefined;
  const panelLeft = Number(layoutSlots?.bottomPanel?.left ?? 0);
  const terminalClickColumn = panelLeft + initialLeftColumns + 4;
  clickCell(driver, terminalClickColumn, panelRow);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.panelFocusedIndex === 1 && status.panelActiveContent === 'terminal'",
    (status) =>
      status.panelFocusedIndex === 1 &&
      status.panelActiveContent === 'terminal',
  );
  HarnessSmoke.Class.pass('click moved focus to the terminal cell');
  driver.sendText('stty size');
  driver.sendKeys('Enter');
  const expectedTerminalColumns = initialRightColumns - 4;
  const terminalSizePattern = new RegExp(
    `(?:^|\\D)\\d+ ${expectedTerminalColumns}(?:\\D|$)`,
  );
  const focusedTerminalSnapshot = await driver.awaitGridCondition(
    'the terminal reports its split width while the blurred agent keeps its composer text',
    (candidate) =>
      candidate
        .textRows()
        .some((rowText) => terminalSizePattern.test(rowText)) &&
      candidate.findText('AGENTKEY') !== null,
  );
  HarnessSmoke.Class.pass(
    `terminal reported its padded sub-width ${expectedTerminalColumns}`,
  );
  HarnessSmoke.Class.requireCondition(
    focusedTerminalSnapshot.findText('AGENTKEY') !== null,
    'blurred agent kept its composer text and terminal keys did not leak',
  );

  console.log('== harness panel-split: divider drag reflows both cells ==');
  const dividerColumn = panelLeft + initialLeftColumns;
  const targetColumn = dividerColumn - 18;
  driver.sendMouse({
    kind: 'press',
    column: dividerColumn,
    row: panelRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'move',
    column: targetColumn,
    row: panelRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: targetColumn,
    row: panelRow,
    button: 'left',
  });
  const resizedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the panel divider publishes narrower left and wider right cell columns',
    (status) => {
      const resizedColumns = cellColumns(status);
      return (
        Number(resizedColumns[0]) < initialLeftColumns &&
        Number(resizedColumns[1]) > initialRightColumns
      );
    },
  );
  const resizedColumns = cellColumns(resizedStatus);
  const resizedLeftColumns = resizedColumns[0] ?? 0;
  const resizedRightColumns = resizedColumns[1] ?? 0;
  HarnessSmoke.Class.pass(
    `divider drag re-flowed both cells (left ${initialLeftColumns}->${resizedLeftColumns}, ` +
      `right ${initialRightColumns}->${resizedRightColumns})`,
  );

  HarnessSmoke.Class.requireCondition(
    resizedLeftColumns < initialLeftColumns &&
      resizedRightColumns > initialRightColumns,
    'the flat split keeps direct divider reflow',
  );
  driver.sendKeys('Control+q');
  console.log('smoke-panel-split-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
