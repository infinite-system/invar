#!/usr/bin/env bun
// Byte-level panel-split port: the real agent and terminal citizens render in independent regions,
// receive focus-routed keys, resize through a dragged divider, and return to one cell.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Visible panel contents own separate headed regions (src/modules/ui/ui.invariants.md)
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
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
  driver.sendMouse({ kind: 'move', column, row, button: 'none' });
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

function copyPathTelemetryAttempts(
  logPath: string,
): CopyPathTelemetryAttempt[] {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter((line) => line.includes('COPY_PATH_TELEMETRY '))
    .map((line) =>
      JSON.parse(line.slice(line.indexOf('COPY_PATH_TELEMETRY ') + 20)),
    );
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
        Array.isArray(status.panelCellKinds) &&
        status.panelCellKinds.includes('terminal'),
    );
    const terminalFrameSnapshot = await tierDriver.awaitGridCondition(
      `${glyphLevel} terminal frame close paints before its direct close drive`,
      (candidate) => {
        const tabRow = candidate
          .textRows()
          .findIndex((rowText) => rowText.includes(` Terminal ${closeGlyph}`));
        return (
          tabRow >= 0 && candidate.rowText(tabRow + 1).includes(closeGlyph)
        );
      },
    );
    const terminalTabRow = terminalFrameSnapshot
      .textRows()
      .findIndex((rowText) => rowText.includes(` Terminal ${closeGlyph}`));
    const terminalFrameCloseColumn = terminalFrameSnapshot
      .rowText(terminalTabRow + 1)
      .lastIndexOf(closeGlyph);
    if (terminalFrameCloseColumn < 0) {
      throw new Error(`${glyphLevel} terminal frame close is not painted`);
    }
    clickCell(tierDriver, terminalFrameCloseColumn, terminalTabRow + 1);
    const closedTerminalStatus = await HarnessSmoke.Class.awaitStatus(
      tierDriver,
      tierStatusPath,
      `${glyphLevel} terminal frame close removes one instance without a dialog`,
      (status) =>
        status.quitConfirmationOpen === false &&
        Array.isArray(status.panelContentKinds) &&
        !status.panelContentKinds.includes('terminal'),
    );
    HarnessSmoke.Class.requireCondition(
      closedTerminalStatus.quitConfirmationOpen === false &&
        tierDriver.snapshot().findText('Close Terminal?') === null,
      `${glyphLevel} instance close paints no confirmation dialog`,
    );
    snapshot = tierDriver.snapshot();
    clickCell(
      tierDriver,
      statusButtonColumn(snapshot, ` ${terminalIcon} `),
      snapshot.rows - 1,
    );
    await HarnessSmoke.Class.awaitStatus(
      tierDriver,
      tierStatusPath,
      `${glyphLevel} terminal reopens before the container arm`,
      (status) =>
        Array.isArray(status.panelContentKinds) &&
        status.panelContentKinds.includes('terminal'),
    );
    await HarnessSmoke.Class.requestPanelContainerClose(
      tierDriver,
      'Terminal',
      1,
      closeGlyph,
    );
    tierDriver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      tierDriver,
      tierStatusPath,
      `${glyphLevel} container confirmation states one instance and defaults to No`,
      (status) =>
        status.quitConfirmationOpen === false &&
        Array.isArray(status.panelContentKinds) &&
        status.panelContentKinds.includes('terminal'),
    );
    await tierDriver.awaitGridCondition(
      `${glyphLevel} declined container confirmation leaves the painted grid`,
      (candidate) =>
        candidate.findText('Close Terminal and its 1 instance?') === null,
    );
    HarnessSmoke.Class.pass(
      `${glyphLevel} container close states one instance and defaults to No`,
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
      `${glyphLevel} second window becomes a separate full-width group`,
      (status) =>
        Array.isArray(status.panelCellKinds) &&
        status.panelCellKinds.join(',') === 'agent' &&
        Array.isArray(status.panelGroups) &&
        status.panelGroups.length === 2 &&
        status.panelListVisible === false,
    );
    const sharedGlyphSnapshot = tierDriver.snapshot();
    const panelTabRow = Number(
      (splitStatus.panelSeparatorGeometry as { tabRow?: number } | null)
        ?.tabRow,
    );
    HarnessSmoke.Class.requireCondition(
      sharedGlyphSnapshot
        .textRows()
        .slice(panelTabRow + 1)
        .every(
          (rowText) =>
            !rowText.includes('Claude ×') && !rowText.includes('Terminal ×'),
        ),
      `${glyphLevel} panel body omits per-pane title and close chrome`,
    );
    const bufferTabRow = sharedGlyphSnapshot
      .textRows()
      .findIndex((rowText) => /\d+\/\d+/.test(rowText));
    HarnessSmoke.Class.requireCondition(
      sharedGlyphSnapshot.rowText(bufferTabRow).includes(closeGlyph),
      `${glyphLevel} buffer tab paints shared ${JSON.stringify(closeGlyph)}`,
    );
    HarnessSmoke.Class.requireCondition(
      sharedGlyphSnapshot.cell(panelTabRow + 1, 118)?.characters === closeGlyph,
      `${glyphLevel} subwindow frame paints shared ${JSON.stringify(closeGlyph)} on its first row`,
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
const copyPathTelemetryLogPath = join(homeDirectory, 'copy-path-telemetry.log');

const driver = new PtyTestDriver.Class({
  workspaceRoot: join(process.cwd(), 'fixtures'),
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    TUI_LOG_PATH: copyPathTelemetryLogPath,
    INVAR_AGENT_BACKEND: 'echo',
    INVAR_COPY_PATH_TELEMETRY: '1',
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
    "status condition: status.terminalVisible === true && Array.isArray(status.panelCellKinds) && status.panelCellKinds.join(',') === 'terminal' && Array.isArray(status.panelCellColumns) && Number(status.panelCellColumns[0]) > 1",
    (status) =>
      status.terminalVisible === true &&
      Array.isArray(status.panelCellKinds) &&
      status.panelCellKinds.join(',') === 'terminal' &&
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
    '== harness panel-split: Agent opens full width, then its row explicitly adds a split ==',
  );
  clickCell(
    driver,
    statusButtonColumn(driver.snapshot(), ' ✦ '),
    driver.snapshot().rows - 1,
  );
  openedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: Array.isArray(status.panelCellKinds) && status.panelCellKinds.join(',') === 'agent' && status.panelActiveContentKind === 'agent'",
    (status) =>
      Array.isArray(status.panelCellKinds) &&
      status.panelCellKinds.join(',') === 'agent' &&
      status.panelActiveContentKind === 'agent' &&
      Array.isArray(status.panelCellColumns),
  );
  HarnessSmoke.Class.requireCondition(
    Number((openedStatus.panelCellColumns as number[])[0]) === fullColumns,
    'new Agent window starts full width',
  );
  const paneListControl = (
    openedStatus.panelSeparatorGeometry as {
      tabRow: number;
      instancesToggle: {
        startColumn: number;
        endColumnExclusive: number;
      } | null;
    }
  ).instancesToggle;
  if (!paneListControl) throw new Error('Missing pane-list control geometry');
  clickCell(
    driver,
    paneListControl.startColumn + 1,
    Number((openedStatus.panelSeparatorGeometry as { tabRow: number }).tabRow),
  );
  openedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the pane list stays pinned before explicit split',
    (status) =>
      status.panelListVisible === true &&
      typeof status.panelListGeometry === 'object',
  );
  const panelListGeometry = openedStatus.panelListGeometry as {
    left: number;
    top: number;
    width: number;
  };
  const unhoveredInstanceRow = driver
    .snapshot()
    .rowText(panelListGeometry.top + 2)
    .slice(
      panelListGeometry.left,
      panelListGeometry.left + panelListGeometry.width,
    );
  HarnessSmoke.Class.requireCondition(
    !unhoveredInstanceRow.includes('×'),
    'instance row hides its close control before hover',
  );
  driver.sendMouse({
    kind: 'move',
    column: panelListGeometry.left + panelListGeometry.width - 2,
    row: panelListGeometry.top + 3,
    button: 'none',
  });
  await driver.awaitGridCondition(
    'hovered instance close control publishes its tooltip',
    (snapshot) => snapshot.findText('Close instance') !== null,
  );
  driver.sendMouse({
    kind: 'move',
    column: panelListGeometry.left + panelListGeometry.width - 5,
    row: panelListGeometry.top + 3,
    button: 'none',
  });
  await driver.awaitGridCondition(
    'hovered instance split control publishes its tooltip',
    (snapshot) => snapshot.findText('Split instance') !== null,
  );
  clickCell(
    driver,
    panelListGeometry.left + panelListGeometry.width - 5,
    panelListGeometry.top + 3,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the row split button opens the pane-level Add window popup',
    (status) =>
      status.boundedListPopupOpen === true &&
      Array.isArray(status.boundedListPopupItemIdentifiers) &&
      JSON.stringify(status.boundedListPopupItemIdentifiers) ===
        JSON.stringify(['terminal', 'terminal-agent', 'invar-agent']) &&
      status.boundedListPopupTitle === 'Add Terminal',
  );
  driver.sendKeys('Enter');
  openedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the pane-level chooser closes after adding its selection',
    (status) => status.boundedListPopupOpen === false,
  );
  HarnessSmoke.Class.requireCondition(
    Array.isArray(openedStatus.panelCellKinds) &&
      openedStatus.panelCellKinds.join(',') === 'agent,terminal' &&
      Array.isArray(openedStatus.panelCellColumns),
    'explicit split adds a new terminal to the Agent group',
  );
  const splitTerminalIdentifier = String(
    (openedStatus.panelCellIds as string[])[1],
  );
  HarnessSmoke.Class.pass('two cells render left-to-right');
  HarnessSmoke.Class.requireCondition(
    openedStatus.panelFocusedIndex === 1,
    'newly split terminal cell is focused',
  );
  HarnessSmoke.Class.requireCondition(
    openedStatus.panelListVisible === true,
    'contents list stays pinned after the split',
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
  const splitListSnapshot = await driver.awaitGridCondition(
    'split instance list closes both ends of its connector family',
    (snapshot) =>
      snapshot.findText('╭ ') !== null && snapshot.findText('╰ ') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    splitListSnapshot.findText('╭ ') !== null &&
      splitListSnapshot.findText('╰ ') !== null,
    'split instance list paints first and last connector closure',
  );
  HarnessSmoke.Class.pass('agent pane shows its own composer');

  console.log(
    '== harness panel-split: keys reach only the focused agent cell ==',
  );
  const panelRow = Number(openedStatus.height) - 8;
  const layoutSlots = openedStatus.layoutSlots as
    Record<string, { left: number; top: number; width: number }> | undefined;
  const panelLeft = Number(layoutSlots?.bottomPanel?.left ?? 0);
  clickCell(driver, panelLeft + 5, panelRow);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the explicit split keeps independent member focus',
    (status) =>
      status.panelFocusedIndex === 0 &&
      status.panelActiveContentKind === 'agent',
  );
  driver.sendText('AGENTKEY');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('AGENTKEY') !== null,
  );
  HarnessSmoke.Class.pass('focused agent cell received the keys');
  driver.sendKeys('End');
  driver.sendKeys('Shift+Left');
  driver.sendKeys('Shift+Left');
  driver.sendRawInputWithoutFrameExpectation('\x1b[27;5;99~');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'the focused agent copy publishes its selected character count',
    (status) => status.lastCopyChars === 2,
  );
  await driver.awaitGridCondition(
    'the focused agent copy paints its status-bar flash',
    (candidate) => candidate.findText('Copied 2 chars') !== null,
  );
  await driver.awaitOutputCondition(
    'the focused agent copy writes one structured copy-path telemetry line',
    () =>
      copyPathTelemetryAttempts(copyPathTelemetryLogPath).some(
        (attempt) =>
          attempt.focusedSurface === 'agent' &&
          attempt.selectionOwner === 'agent-composer' &&
          attempt.selectionLength === 2 &&
          attempt.routeTaken === 'copy-handler' &&
          attempt.osc52Emitted === true &&
          attempt.osc52ByteLength === 2,
      ),
  );
  HarnessSmoke.Class.pass(
    'focused agent copy shows its flash and writes structured telemetry',
  );

  console.log(
    '== harness panel-split: click focuses terminal and stty sees its sub-width ==',
  );
  const terminalClickColumn = panelLeft + initialLeftColumns + 4;
  clickCell(driver, terminalClickColumn, panelRow);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the split terminal owns focus after its pane click',
    (status) =>
      status.panelFocusedIndex === 1 &&
      status.panelActiveContent === splitTerminalIdentifier,
  );
  HarnessSmoke.Class.pass('click moved focus to the terminal cell');
  driver.sendRawInputWithoutFrameExpectation('\x1b[27;5;99~');
  await driver.awaitOutputCondition(
    'an active agent selection forwarded to the terminal child writes explicit telemetry',
    () =>
      copyPathTelemetryAttempts(copyPathTelemetryLogPath).some(
        (attempt) =>
          attempt.focusedSurface === 'terminal' &&
          attempt.selectionOwner === 'agent-composer' &&
          attempt.selectionLength === 2 &&
          attempt.routeTaken === 'forwarded-to-child-pty' &&
          attempt.osc52Emitted === false &&
          attempt.osc52ByteLength === 0,
      ),
  );
  HarnessSmoke.Class.pass(
    'the log names an active agent selection forwarded to the terminal child',
  );
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
  clickCell(driver, panelLeft + 5, panelRow);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the Invar agent regains focus before its exit command',
    (status) => status.panelActiveContentKind === 'agent',
  );
  driver.sendKeys('Control+a');
  driver.sendKeys('Backspace');
  driver.sendText('/exit');
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Invar agent exit replaces its exact split slot with a plain terminal',
    (status) =>
      Array.isArray(status.panelCellIds) &&
      status.panelCellIds.length === 2 &&
      status.panelCellIds[1] === splitTerminalIdentifier &&
      Array.isArray(status.panelCellKinds) &&
      status.panelCellKinds.join(',') === 'terminal,terminal',
  );
  HarnessSmoke.Class.pass(
    'Invar agent /exit replaced the first split slot with a terminal',
  );
  driver.sendKeys('Control+q');
  console.log('smoke-panel-split-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}

interface CopyPathTelemetryAttempt {
  readonly focusedSurface: string;
  readonly selectionOwner: string;
  readonly selectionLength: number;
  readonly routeTaken: string;
  readonly osc52Emitted: boolean;
  readonly osc52ByteLength: number;
}
