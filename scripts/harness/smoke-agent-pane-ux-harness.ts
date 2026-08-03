#!/usr/bin/env bun
// Byte-level parity port of the agent-pane UX smoke: transcript/composer projection, permission mode,
// animated busy state, tool folding, viewport behavior, selection, copy, wrapping, and idle teardown.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { dragBetweenCells } from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';

const thinkingWords = [
  'Reducing',
  'Distilling',
  'Carving',
  'Removing',
  'Collapsing',
  'Converging',
  'Generating',
  'Synthesizing',
  'Triangulating',
  'Grounding',
  'Scoping',
  'Testing',
  'Refining',
  'Isolating',
  'Auditing',
  'Breaking',
  'Reframing',
  'invariant',
  'Crystallizing',
  'Quantum',
  'negative space',
  'ineffable',
  'limit',
];

const spinnerGlyphs = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧'];

interface Rectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PanelHeadingGeometryStatus {
  readonly contentId: string;
  readonly row: number;
}

interface AgentFooterRegion {
  readonly headingRow: number;
  readonly row: number;
  readonly startColumn: number;
  readonly endColumnExclusive: number;
}

interface ComposerScreenRow {
  readonly row: number;
  readonly contentStartColumn: number;
  readonly rightBorderColumn: number;
  readonly content: string;
}

const themedSearchGlyph = ThemeIcons.Class.findIconsFor('unicode').search;

function agentFooterRegion(status: StatusSnapshot): AgentFooterRegion | null {
  const bottomPanel = (
    status.layoutSlots as Record<string, Rectangle> | undefined
  )?.bottomPanel;
  const headings = status.panelHeadingGeometry;
  const activeCell = HarnessSmoke.Class.activePanelCell(status);
  const cellColumns = status.panelCellColumns;
  if (
    !bottomPanel ||
    !Array.isArray(headings) ||
    activeCell?.kind !== 'agent' ||
    !Array.isArray(cellColumns)
  ) {
    return null;
  }
  const agentHeading = (
    headings as unknown as readonly PanelHeadingGeometryStatus[]
  ).find((heading) => heading.contentId === activeCell.identifier);
  const panelViewportRows = Number(status.panelRows);
  const contentColumns = activeCell.columns;
  if (!agentHeading || panelViewportRows <= 0 || contentColumns <= 0) {
    return null;
  }
  let startColumn = bottomPanel.left + 1;
  for (
    let precedingIndex = 0;
    precedingIndex < activeCell.index;
    precedingIndex += 1
  ) {
    startColumn += Number(cellColumns[precedingIndex]) + 1;
  }
  return {
    headingRow: agentHeading.row,
    row: agentHeading.row + panelViewportRows,
    startColumn,
    endColumnExclusive: startColumn + contentColumns,
  };
}

function agentFooterSignature(
  snapshot: HarnessSnapshot.Model,
  footerRegion: AgentFooterRegion,
): string | null {
  const footerCells = snapshot
    .rowCells(footerRegion.row)
    .slice(footerRegion.startColumn, footerRegion.endColumnExclusive);
  if (
    !footerCells.some((cell) => cell.characters === themedSearchGlyph) ||
    !footerCells.some((cell) => cell.characters.trim().length > 0)
  ) {
    return null;
  }
  return footerCells.map((cell) => cell.characters).join('\0');
}

function firstRowContaining(
  snapshot: HarnessSnapshot.Model,
  marker: string,
): number | null {
  return snapshot.findText(marker)?.row ?? null;
}

function thinkingLine(snapshot: HarnessSnapshot.Model): string | null {
  return (
    snapshot
      .textRows()
      .find((rowText) =>
        spinnerGlyphs.some((glyph) => rowText.includes(glyph)),
      ) ?? null
  );
}

function thinkingWordColumn(snapshot: HarnessSnapshot.Model): number | null {
  const rowText = thinkingLine(snapshot);
  if (!rowText) return null;
  const word = thinkingWords.find((candidate) => rowText.includes(candidate));
  return word
    ? Array.from(rowText.slice(0, rowText.indexOf(word))).length
    : null;
}

function normalizedVisibleText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function composerScreenRows(
  snapshot: HarnessSnapshot.Model,
  panelRectangle: Rectangle,
): ComposerScreenRow[] {
  const promptPosition = snapshot.findTextInRectangle('❯ ', panelRectangle);
  if (!promptPosition) throw new Error('Composer prompt disappeared');
  const rows: ComposerScreenRow[] = [];
  const contentStartColumn = promptPosition.column + 2;
  for (
    let row = promptPosition.row;
    row < panelRectangle.top + panelRectangle.height;
    row += 1
  ) {
    const panelRowText = snapshot
      .rowText(row)
      .slice(panelRectangle.left, panelRectangle.left + panelRectangle.width);
    if (row > promptPosition.row && panelRowText.includes('────────')) break;
    const rightBorderColumn = panelRectangle.left + panelRectangle.width;
    rows.push({
      row,
      contentStartColumn,
      rightBorderColumn,
      content: snapshot
        .rowText(row)
        .slice(contentStartColumn, rightBorderColumn)
        .trimEnd(),
    });
  }
  return rows;
}

function transcriptReplyRows(
  snapshot: HarnessSnapshot.Model,
  panelRectangle: Rectangle,
): string[] {
  const panelRows = snapshot
    .textRows()
    .map((rowText) =>
      rowText.slice(
        panelRectangle.left + 1,
        panelRectangle.left + panelRectangle.width - 1,
      ),
    );
  const assistantLabelRow = panelRows.findIndex(
    (rowText, row) => row > panelRectangle.top && rowText.trim() === 'Claude',
  );
  if (assistantLabelRow < 0)
    throw new Error('Assistant transcript label disappeared');
  const toolRow = panelRows.findIndex(
    (rowText, row) => row > assistantLabelRow && rowText.includes('Bash'),
  );
  if (toolRow < 0) throw new Error('Transcript tool row disappeared');
  return panelRows
    .slice(assistantLabelRow + 1, toolRow)
    .map((rowText) => rowText.trim())
    .filter((rowText) => rowText.length > 0);
}

function emittedClipboardTexts(driver: PtyTestDriver.Model): string[] {
  return driver
    .clipboardEmissions()
    .map((clipboardEmission) => clipboardEmission.decodedText);
}

async function awaitClipboardEmission(
  driver: PtyTestDriver.Model,
  previousEmissionCount: number,
  expectedMarker: string,
): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const emittedTexts = emittedClipboardTexts(driver);
    if (
      emittedTexts
        .slice(previousEmissionCount)
        .some((text) => text.includes(expectedMarker))
    ) {
      return;
    }
    await Bun.sleep(10);
  }
  const newEmissions = emittedClipboardTexts(driver).slice(
    previousEmissionCount,
  );
  throw new Error(
    `Timed out waiting for an OSC 52 clipboard emission containing ${expectedMarker}; ` +
      `received ${JSON.stringify(newEmissions)}`,
  );
}

function verticalScrollBarRun(
  snapshot: HarnessSnapshot.Model,
  panelRectangle: Rectangle,
): number {
  let longestRun = 0;
  const rightmostColumn = panelRectangle.left + panelRectangle.width - 1;
  for (
    let scrollBarColumn = rightmostColumn;
    scrollBarColumn >= rightmostColumn - 4;
    scrollBarColumn -= 1
  ) {
    const backgrounds: (number | null)[] = [];
    for (
      let row = panelRectangle.top + 1;
      row < panelRectangle.top + panelRectangle.height;
      row += 1
    ) {
      const cell = snapshot.cell(row, scrollBarColumn);
      backgrounds.push(
        cell?.characters === ' ' ? (cell.background ?? null) : null,
      );
    }
    const counts = new Map<number, number>();
    for (const background of backgrounds) {
      if (background !== null)
        counts.set(background, (counts.get(background) ?? 0) + 1);
    }
    const dominant = [...counts.entries()].sort(
      (first, second) => second[1] - first[1],
    )[0]?.[0];
    let currentRun = 0;
    for (const background of backgrounds) {
      if (background !== null && background !== dominant) {
        currentRun += 1;
        longestRun = Math.max(longestRun, currentRun);
      } else {
        currentRun = 0;
      }
    }
  }
  return longestRun;
}

async function submitTurn(
  driver: PtyTestDriver.Model,
  statusPath: string,
  prompt: string,
): Promise<void> {
  driver.sendText(prompt);
  const firstPromptWord = prompt.split(/\s+/)[0] ?? prompt;
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText(firstPromptWord) !== null,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.agentBusy === true',
    (status) => status.agentBusy === true,
  );
}

async function awaitIdle(
  driver: PtyTestDriver.Model,
  statusPath: string,
): Promise<void> {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.agentBusy === false',
    (status) => status.agentBusy === false,
    10_000,
  );
}

const repositoryRoot = process.cwd();

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-agent-pane-ux-harness-home-'),
);

mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });

await Bun.write(
  join(homeDirectory, '.config', 'invar', 'settings.json'),
  JSON.stringify({ glyphMode: 'unicode' }),
);

const statusPath = join(homeDirectory, 'status.json');

const driver = new PtyTestDriver.Class({
  workspaceRoot: join(repositoryRoot, 'fixtures'),
  repositoryRoot,
  columns: 110,
  rows: 50,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_AGENT_BACKEND: 'echo',
    INVAR_AGENT_ECHO_DELAY_MS: '2000',
  },
});

try {
  console.log('== harness agent pane UX: chrome and permission mode ==');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.ready === true',
    (status) => status.ready === true,
    20_000,
  );
  driver.sendRawInput('\x1b[27;6;97~');
  const focusedPaneStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the agent pane opens focused with its panel geometry published',
    (status) =>
      status.panelFocused === true &&
      status.panelActiveContentKind === 'agent' &&
      status.agentEngine === 'claude' &&
      status.agentSkipPermissions === true &&
      agentFooterRegion(status) !== null,
  );
  const panelRectangle =
    HarnessSmoke.Class.activePanelCellRectangle(focusedPaneStatus);
  if (!panelRectangle) {
    throw new Error('Active agent panel geometry disappeared');
  }
  const footerRegion = agentFooterRegion(focusedPaneStatus);
  if (!footerRegion) throw new Error('Agent footer geometry disappeared');
  let snapshot = await driver.awaitGridCondition(
    'the agent-owned footer and composer chrome are visibly settled',
    (candidate) =>
      agentFooterSignature(candidate, footerRegion) !== null &&
      candidate.findText('──────────') !== null &&
      candidate.findTextInRectangle('❯', panelRectangle) !== null &&
      candidate.findText('  Ask Claude') !== null,
  );
  HarnessSmoke.Class.pass(
    'agent pane opens focused with framed composer chrome',
  );
  HarnessSmoke.Class.requireCondition(
    !snapshot
      .rowText(footerRegion.headingRow)
      .slice(footerRegion.startColumn, footerRegion.endColumnExclusive)
      .includes(String(focusedPaneStatus.agentTitle)),
    'agent pane omits its former local heading',
  );
  HarnessSmoke.Class.requireCondition(
    agentFooterSignature(snapshot, footerRegion) !== null,
    'the discovered footer row contains compact engine and permission segments',
  );
  HarnessSmoke.Class.requireCondition(
    snapshot
      .rowCells(footerRegion.row)
      .slice(footerRegion.startColumn, footerRegion.endColumnExclusive)
      .every((cell) => !cell.isBold),
    'the agent footer is flush with the pane bottom and never bold',
  );
  const originalFooterSignature = agentFooterSignature(snapshot, footerRegion);
  if (!originalFooterSignature)
    throw new Error('Agent footer signature disappeared');
  driver.sendKeys('Shift+Tab');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Shift+Tab publishes ask-mode permission state',
    (status) => status.agentSkipPermissions === false,
  );
  snapshot = await driver.awaitGridCondition(
    'Shift+Tab changes the agent-owned footer projection',
    (candidate) => {
      const signature = agentFooterSignature(candidate, footerRegion);
      return signature !== null && signature !== originalFooterSignature;
    },
  );
  HarnessSmoke.Class.pass('Shift+Tab changes the permission mode line');

  console.log('== harness agent pane UX: animated busy and waiting state ==');
  const wordBoundaryPrompt =
    'alpha-marker boundaryalpha boundarybravo boundarycharlie ' +
    'boundarydelta boundaryecho boundaryfoxtrot boundarygolf';
  await submitTurn(driver, statusPath, wordBoundaryPrompt);
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      thinkingLine(candidate) !== null &&
      candidate.findText('0s') !== null &&
      candidate.findText('⧗ Bash') !== null,
  );
  const initialThinkingLine = thinkingLine(snapshot);
  const initialWordColumn = thinkingWordColumn(snapshot);
  HarnessSmoke.Class.requireCondition(
    initialThinkingLine !== null &&
      !['✦', '✧', '⋆', '∗'].some((glyph) =>
        initialThinkingLine.includes(glyph),
      ),
    'thinking line has one front loader and no stray sparkle glyph',
  );
  const laterBusySnapshot = await driver.awaitSnapshot(
    (candidate) =>
      thinkingLine(candidate) !== null &&
      thinkingLine(candidate) !== initialThinkingLine,
    3_000,
  );
  HarnessSmoke.Class.requireCondition(
    initialWordColumn !== null &&
      thinkingWordColumn(laterBusySnapshot) === initialWordColumn,
    'thinking word starts in a stable column across animation frames',
  );
  await awaitIdle(driver, statusPath);
  snapshot = await driver.awaitGridCondition(
    'the waiting tool note disappears after the agent session returns to idle',
    (candidate) =>
      candidate.findText('⧗ Bash') === null &&
      candidate.findText('$ echo') !== null &&
      candidate.findText('{"command"') === null &&
      candidate.findText('  "command"') === null,
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('⧗ Bash') === null,
    'waiting note disappears when the session returns to idle',
  );
  for (
    let page = 0;
    page < 4 && firstRowContaining(snapshot, 'alpha-marker') === null;
    page += 1
  ) {
    driver.sendKeys('PageUp');
    await driver.awaitScreenChange();
    snapshot = driver.snapshot();
  }
  const userTurnRow = firstRowContaining(snapshot, 'alpha-marker');
  HarnessSmoke.Class.requireCondition(
    userTurnRow !== null,
    'user turn remains in the transcript',
  );
  if (userTurnRow === null) throw new Error('User turn row disappeared');
  const userTurnLastRow = firstRowContaining(snapshot, 'boundarygolf');
  HarnessSmoke.Class.requireCondition(
    userTurnLastRow !== null,
    'wrapped user turn keeps its final word whole',
  );
  if (userTurnLastRow === null)
    throw new Error('User turn final row disappeared');
  const followingRow = snapshot.rowText(userTurnLastRow + 1);
  const followingPanelRow = followingRow.slice(
    panelRectangle.left,
    panelRectangle.left + panelRectangle.width,
  );
  HarnessSmoke.Class.requireCondition(
    /^[\s█▄░]*$/.test(followingPanelRow),
    'a blank line follows the posted user turn',
  );
  const expectedEchoReply =
    `You said: “${wordBoundaryPrompt}”. This is the local echo backend — ` +
    'real Claude arrives when CliStreamBackend is wired (phase 2).';
  const visibleReplyRows = transcriptReplyRows(snapshot, panelRectangle);
  HarnessSmoke.Class.requireCondition(
    normalizedVisibleText(visibleReplyRows.join(' ')) ===
      normalizedVisibleText(expectedEchoReply),
    'echo reply reconstructs from rendered rows without a split word boundary',
  );
  for (const promptWord of wordBoundaryPrompt.split(' ')) {
    HarnessSmoke.Class.requireCondition(
      visibleReplyRows.some((rowText) => rowText.includes(promptWord)),
      `wrapped echo reply keeps ${promptWord} whole on one row`,
    );
  }

  console.log(
    '== harness agent pane UX: collapsible tool row and wrapped reply ==',
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('$ echo') !== null &&
      snapshot.findText('{"command"') === null &&
      snapshot.findText('  "command"') === null,
    'collapsed tool shows the human phrase and hides raw input',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the collapsed tool publishes no expanded tool rows',
    (status) => status.agentExpandedCount === 0,
  );
  const collapsedToolPosition = snapshot.findText('▸ ⚙ Bash');
  HarnessSmoke.Class.requireCondition(
    collapsedToolPosition !== null,
    'collapsed tool row paints',
  );
  if (!collapsedToolPosition) throw new Error('Collapsed tool row disappeared');
  driver.sendMouse({
    kind: 'press',
    column: collapsedToolPosition.column,
    row: collapsedToolPosition.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: collapsedToolPosition.column,
    row: collapsedToolPosition.row,
    button: 'left',
  });
  snapshot = await driver.awaitGridCondition(
    'the expanded Bash tool row paints its pretty-printed command input',
    (candidate) => candidate.findText('  "command"') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('  "command"') !== null,
    'click expands the full pretty-printed tool input',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: candidate.agentExpandedCount === 1',
    (candidate) => candidate.agentExpandedCount === 1,
  );
  HarnessSmoke.Class.pass('expanded tool state is published');
  const expandedToolPosition = snapshot.findText('▾ ⚙ Bash');
  HarnessSmoke.Class.requireCondition(
    expandedToolPosition !== null,
    'expanded tool row paints',
  );
  if (!expandedToolPosition) throw new Error('Expanded tool row disappeared');
  driver.sendMouse({
    kind: 'press',
    column: expandedToolPosition.column,
    row: expandedToolPosition.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: expandedToolPosition.column,
    row: expandedToolPosition.row,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.agentExpandedCount === 0',
    (status) => status.agentExpandedCount === 0,
  );
  snapshot = await driver.awaitGridCondition(
    'the wrapped reply row ending in phase 2 is visible after the tool collapses',
    (candidate) => candidate.findText('phase 2).') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('phase 2).') !== null,
    'long reply wraps onto a later visual row',
  );

  console.log(
    '== harness agent pane UX: tail anchoring, scrollbar, and scrolling ==',
  );
  await submitTurn(driver, statusPath, 'beta-second-prompt');
  await awaitIdle(driver, statusPath);
  await submitTurn(driver, statusPath, 'gamma-newest-prompt');
  await awaitIdle(driver, statusPath);
  snapshot = await driver.awaitGridCondition(
    'the newest prompt and transcript scrollbar are visible at the tail',
    (candidate) =>
      candidate.findText('gamma-newest-prompt') !== null &&
      verticalScrollBarRun(candidate, panelRectangle) >= 2,
  );
  let status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the transcript tail anchor and maximum scroll position are published',
    (candidate) =>
      candidate.agentStuckToBottom === true &&
      typeof candidate.agentScrollTop === 'number',
  );
  HarnessSmoke.Class.requireCondition(
    status.agentStuckToBottom === true &&
      snapshot.findText('alpha-marker') === null,
    'tail anchor follows the newest turn and scrolls the first above the fold',
  );
  HarnessSmoke.Class.requireCondition(
    verticalScrollBarRun(snapshot, panelRectangle) >= 2,
    'overflowing transcript paints a multi-cell blank background scrollbar thumb',
  );

  const newestPosition = snapshot.findText('gamma-newest-prompt');
  if (!newestPosition) throw new Error('Newest prompt disappeared');
  const agentContentRectangle = {
    left: footerRegion.startColumn,
    top: footerRegion.headingRow + 1,
    width: footerRegion.endColumnExclusive - footerRegion.startColumn,
    height: footerRegion.row - footerRegion.headingRow,
  };
  const scrollingComposerPosition = snapshot.findTextInRectangle(
    '❯ ',
    agentContentRectangle,
  );
  if (!scrollingComposerPosition)
    throw new Error('Composer prompt disappeared');
  const maximumScrollTop = Number(status.agentScrollTop);
  snapshot = await driver.assertContentInvariantAcrossAction({
    invariantRegion: {
      startRow: scrollingComposerPosition.row,
      endRowExclusive: scrollingComposerPosition.row + 1,
      startColumn: panelRectangle.left,
      endColumnExclusive: panelRectangle.left + panelRectangle.width,
    },
    changedRegion: {
      startRow: panelRectangle.top + 1,
      endRowExclusive: scrollingComposerPosition.row,
      startColumn: panelRectangle.left + 1,
      endColumnExclusive: panelRectangle.left + panelRectangle.width - 1,
    },
    actionDescription:
      'transcript wheel input changes the transcript while the composer stays fixed',
    performAction: () => {
      for (let wheelEvent = 0; wheelEvent < 4; wheelEvent++) {
        driver.sendMouseWithoutFrameExpectation({
          kind: 'wheel',
          column: newestPosition.column,
          row: newestPosition.row,
          direction: 'up',
        });
      }
    },
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: Number(candidate.agentScrollTop) < maximumScrollTop',
    (candidate) => Number(candidate.agentScrollTop) < maximumScrollTop,
  );
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'upward wheel input releases the transcript tail anchor',
    (candidate) => candidate.agentStuckToBottom === false,
  );
  HarnessSmoke.Class.pass(
    'wheel input moves upward and releases the tail anchor',
  );
  for (
    let page = 0;
    page < 8 && driver.snapshot().findText('alpha-marker') === null;
    page++
  ) {
    driver.sendKeys('PageUp');
    await driver.awaitScreenChange();
  }
  snapshot = await driver.awaitGridCondition(
    'PageUp reveals the earliest transcript turn',
    (candidate) => candidate.findText('alpha-marker') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('alpha-marker') !== null,
    'PageUp reveals the earliest turn',
  );
  for (let page = 0; page < 8; page += 1) {
    driver.sendKeysWithoutFrameExpectation('PageDown');
  }
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: candidate.agentStuckToBottom === true',
    (candidate) => candidate.agentStuckToBottom === true,
    8_000,
  );
  HarnessSmoke.Class.pass('scrolling to the bottom re-arms tail anchoring');

  console.log(
    '== harness agent pane UX: transcript and composer selection/copy ==',
  );
  snapshot = await driver.awaitGridCondition(
    'the newest transcript row is visible after tail anchoring is restored',
    (candidate) => candidate.findText('gamma-newest-prompt') !== null,
  );
  const transcriptPosition = snapshot.findText('gamma-newest-prompt');
  HarnessSmoke.Class.requireCondition(
    transcriptPosition !== null,
    'newest transcript row is visible',
  );
  if (!transcriptPosition)
    throw new Error('Transcript selection target disappeared');
  await dragBetweenCells(
    driver,
    transcriptPosition.column,
    transcriptPosition.row,
    transcriptPosition.column + 18,
    transcriptPosition.row,
  );
  const transcriptClipboardCount = emittedClipboardTexts(driver).length;
  driver.sendRawInputWithoutFrameExpectation('\x1b[27;5;99~');
  const transcriptCopyStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: Number(candidate.lastCopyChars) >= 5',
    (candidate) => Number(candidate.lastCopyChars) >= 5,
  );
  HarnessSmoke.Class.requireCondition(
    Number(transcriptCopyStatus.lastCopyChars) >= 5,
    'Ctrl+C copies a transcript selection',
  );
  await awaitClipboardEmission(
    driver,
    transcriptClipboardCount,
    'gamma-newest',
  );
  HarnessSmoke.Class.pass(
    'transcript copy emits selected bytes through raw OSC 52',
  );

  const composerFocusRow = composerScreenRows(
    driver.snapshot(),
    panelRectangle,
  )[0];
  if (!composerFocusRow) throw new Error('Composer focus row disappeared');
  driver.sendMouseWithoutFrameExpectation({
    kind: 'move',
    column: composerFocusRow.contentStartColumn,
    row: composerFocusRow.row,
    button: 'none',
  });
  driver.sendMouseClick({
    column: composerFocusRow.contentStartColumn,
    row: composerFocusRow.row,
    button: 'left',
  });
  const composerFocusDraft = 'COMPOSERFOCUS';
  driver.sendText(composerFocusDraft);
  snapshot = await driver.awaitGridCondition(
    'the clicked composer paints its focus-state draft',
    (candidate) => candidate.findText(composerFocusDraft) !== null,
  );

  const assistantReplyPosition = snapshot.findText(
    'You said: “gamma-newest-prompt”',
  );
  HarnessSmoke.Class.requireCondition(
    assistantReplyPosition !== null,
    'the newest assistant reply is visible for selection',
  );
  if (!assistantReplyPosition)
    throw new Error('Assistant reply selection target disappeared');
  await dragBetweenCells(
    driver,
    assistantReplyPosition.column,
    assistantReplyPosition.row,
    assistantReplyPosition.column + 18,
    assistantReplyPosition.row,
  );
  const legacyControlClipboardCount = emittedClipboardTexts(driver).length;
  const legacyCopyCompletionCount = Number(
    HarnessSmoke.Class.readStatus(statusPath).clipboardCopyCompletionCount ?? 0,
  );
  driver.sendRawInputWithoutFrameExpectation('\x03');
  await awaitClipboardEmission(
    driver,
    legacyControlClipboardCount,
    'You said:',
  );
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'the legacy Ctrl+C clipboard operation completes',
    (candidate) =>
      Number(candidate.clipboardCopyCompletionCount) >
      legacyCopyCompletionCount,
  );
  const kittyControlClipboardCount = emittedClipboardTexts(driver).length;
  const kittyControlCopyCompletionCount = Number(
    HarnessSmoke.Class.readStatus(statusPath).clipboardCopyCompletionCount ?? 0,
  );
  driver.sendRawInputWithoutFrameExpectation('\x1b[99;5u');
  await awaitClipboardEmission(driver, kittyControlClipboardCount, 'You said:');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'the Kitty Ctrl+C clipboard operation completes',
    (candidate) =>
      Number(candidate.clipboardCopyCompletionCount) >
      kittyControlCopyCompletionCount,
  );
  const kittySuperClipboardCount = emittedClipboardTexts(driver).length;
  const kittySuperCopyCompletionCount = Number(
    HarnessSmoke.Class.readStatus(statusPath).clipboardCopyCompletionCount ?? 0,
  );
  driver.sendRawInputWithoutFrameExpectation('\x1b[99;9u');
  await awaitClipboardEmission(driver, kittySuperClipboardCount, 'You said:');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'the Kitty Super+C clipboard operation completes',
    (candidate) =>
      Number(candidate.clipboardCopyCompletionCount) >
      kittySuperCopyCompletionCount,
  );
  HarnessSmoke.Class.pass(
    'composer-focused assistant reply copies through legacy and Kitty Ctrl+C and Cmd+C',
  );

  for (let deletion = 0; deletion < composerFocusDraft.length; deletion += 1) {
    driver.sendKeysWithoutFrameExpectation('Backspace');
  }
  snapshot = await driver.awaitGridCondition(
    'the composer focus-state draft clears before composer selection checks',
    (candidate) => candidate.findText(composerFocusDraft) === null,
  );

  driver.sendText('COPYCOMPOSER text');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('COPYCOMPOSER') !== null,
  );
  const composerPosition = snapshot.findText('COPYCOMPOSER');
  if (!composerPosition)
    throw new Error('Composer selection target disappeared');
  await dragBetweenCells(
    driver,
    composerPosition.column,
    composerPosition.row,
    composerPosition.column + 12,
    composerPosition.row,
  );
  const composerClipboardCount = emittedClipboardTexts(driver).length;
  driver.sendRawInputWithoutFrameExpectation('\x1b[27;5;99~');
  const composerCopyStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'status condition: Number(candidate.lastCopyChars) >= 5',
    (candidate) => Number(candidate.lastCopyChars) >= 5,
  );
  HarnessSmoke.Class.requireCondition(
    Number(composerCopyStatus.lastCopyChars) >= 5,
    'Ctrl+C copies a composer selection',
  );
  await awaitClipboardEmission(driver, composerClipboardCount, 'COPYCOMPOSER');
  HarnessSmoke.Class.pass(
    'composer copy emits selected bytes through raw OSC 52',
  );

  driver.sendKeys('End');
  driver.sendRawInputWithoutFrameExpectation('\x1b[27;5;99~');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    'copy without an agent selection publishes zero characters',
    (candidate) => candidate.lastCopyChars === 0,
  );
  driver.sendKeys('Shift+Left');
  driver.sendKeys('Shift+Left');
  const keyboardSelectionClipboardCount = emittedClipboardTexts(driver).length;
  driver.sendRawInputWithoutFrameExpectation('\x1b[27;5;99~');
  const keyboardSelectionCopyStatus =
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'the agent composer copies two keyboard-selected characters',
      (candidate) => candidate.lastCopyChars === 2,
    );
  HarnessSmoke.Class.requireCondition(
    keyboardSelectionCopyStatus.lastCopyChars === 2,
    'Shift+Left selects through the shared composer input',
  );
  await awaitClipboardEmission(driver, keyboardSelectionClipboardCount, 'xt');
  HarnessSmoke.Class.pass(
    'composer Shift-selection and unselected copy use the shared input model',
  );

  console.log('== harness agent pane UX: composer word operations ==');
  for (let deletion = 0; deletion < 30; deletion++) {
    driver.sendKeysWithoutFrameExpectation('Backspace');
  }
  driver.sendText('alpha beta gamma');
  driver.sendRawInput('\x1b[1;3D');
  driver.sendText('X');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('alpha beta Xgamma') !== null,
  );
  driver.sendRawInput('\x1b[1;3D');
  driver.sendRawInput('\x1b[1;3C');
  driver.sendText('Y');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('alpha beta XgammaY') !== null,
  );
  driver.sendRawInput('\x1b\x7f');
  await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('alpha beta XgammaY') === null &&
      candidate.findText('alpha beta') !== null,
  );
  HarnessSmoke.Class.pass(
    'word-left, word-right, and Alt+Backspace edit the composer',
  );

  console.log(
    '== harness agent pane UX: composer word wrap, right gap, and idle teardown ==',
  );
  for (let deletion = 0; deletion < 30; deletion++) {
    driver.sendKeysWithoutFrameExpectation('Backspace');
  }
  const composerWordBoundaryText =
    'composeralpha composerbravo composercharlie composerdelta composerecho ' +
    'composerfoxtrot composergolf composerhotel composerindia composerjuliet';
  driver.sendText(composerWordBoundaryText);
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('composerjuliet') !== null,
  );
  let composerRows = composerScreenRows(snapshot, panelRectangle);
  for (const composerWord of composerWordBoundaryText.split(' ').slice(0, 8)) {
    HarnessSmoke.Class.requireCondition(
      composerRows.some((row) => row.content.includes(composerWord)),
      `composer keeps ${composerWord} whole on one row`,
    );
  }
  HarnessSmoke.Class.requireCondition(
    composerRows.every(
      (row) =>
        snapshot
          .rowText(row.row)
          .slice(row.rightBorderColumn - 2, row.rightBorderColumn) === '  ',
    ),
    'every wrapped composer row leaves two right-edge columns blank',
  );

  for (
    let deletion = 0;
    deletion < composerWordBoundaryText.length;
    deletion += 1
  ) {
    driver.sendKeysWithoutFrameExpectation('Backspace');
  }
  const hyphenatedComposerText =
    'hyphenalpha-hyphenbravo-hyphencharlie-hyphendelta-hyphenecho-' +
    'hyphenfoxtrot-hyphengolf-hyphenhotel-hyphenindia-hyphenjuliet';
  driver.sendText(hyphenatedComposerText);
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('hyphenjuliet') !== null,
  );
  composerRows = composerScreenRows(snapshot, panelRectangle);
  HarnessSmoke.Class.requireCondition(
    composerRows.every(
      (row) =>
        snapshot
          .rowText(row.row)
          .slice(row.rightBorderColumn - 2, row.rightBorderColumn) === '  ',
    ),
    'hyphenated composer rows retain the two-column right gap',
  );
  const lastComposerRow = composerRows[composerRows.length - 1];
  if (!lastComposerRow) throw new Error('Wrapped composer rows disappeared');
  driver.sendKeys('Control+q');
  console.log('smoke-agent-pane-ux-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
