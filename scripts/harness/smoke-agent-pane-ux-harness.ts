#!/usr/bin/env bun
// Byte-level parity port of the agent-pane UX smoke: transcript/composer projection, permission mode,
// animated busy state, tool folding, viewport behavior, selection, copy, wrapping, and idle teardown.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { dragBetweenCells } from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';

const thinkingWords = [
  'Reducing', 'Distilling', 'Carving', 'Removing', 'Collapsing', 'Converging', 'Generating',
  'Synthesizing', 'Triangulating', 'Grounding', 'Scoping', 'Testing', 'Refining', 'Isolating',
  'Auditing', 'Breaking', 'Reframing', 'invariant', 'Crystallizing', 'Quantum', 'negative space',
  'ineffable', 'limit',
];
const spinnerGlyphs = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧'];

interface Rectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ComposerScreenRow {
  readonly row: number;
  readonly contentStartColumn: number;
  readonly rightBorderColumn: number;
  readonly content: string;
}

function bottomPanelSlot(status: StatusSnapshot): Rectangle {
  const layoutSlots = status.layoutSlots as
    | Record<string, Rectangle>
    | undefined;
  const bottomPanel = layoutSlots?.bottomPanel;
  if (!bottomPanel) throw new Error('Bottom-panel slot geometry disappeared');
  return bottomPanel;
}

function firstRowContaining(snapshot: HarnessSnapshot.Model, marker: string): number | null {
  return snapshot.findText(marker)?.row ?? null;
}

function thinkingLine(snapshot: HarnessSnapshot.Model): string | null {
  return snapshot.textRows().find(
    (rowText) => spinnerGlyphs.some((glyph) => rowText.includes(glyph)),
  ) ?? null;
}

function thinkingWordColumn(snapshot: HarnessSnapshot.Model): number | null {
  const rowText = thinkingLine(snapshot);
  if (!rowText) return null;
  const word = thinkingWords.find((candidate) => rowText.includes(candidate));
  return word ? Array.from(rowText.slice(0, rowText.indexOf(word))).length : null;
}

function normalizedVisibleText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function composerScreenRows(
  snapshot: HarnessSnapshot.Model,
  panelRectangle: Rectangle,
): ComposerScreenRow[] {
  const promptPosition = snapshot.findText('❯ ');
  if (!promptPosition) throw new Error('Composer prompt disappeared');
  const rows: ComposerScreenRow[] = [];
  const contentStartColumn = promptPosition.column + 2;
  for (
    let row = promptPosition.row;
    row < panelRectangle.top + panelRectangle.height;
    row += 1
  ) {
    const panelRowText = snapshot.rowText(row).slice(
      panelRectangle.left,
      panelRectangle.left + panelRectangle.width,
    );
    if (row > promptPosition.row && panelRowText.includes('────────')) break;
    const rightBorderOffset = panelRowText.lastIndexOf('│');
    if (rightBorderOffset < 0) {
      throw new Error(`Composer row ${row} lost its right pane border`);
    }
    const rightBorderColumn = panelRectangle.left + rightBorderOffset;
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
  const panelRows = snapshot.textRows().map((rowText) =>
    rowText.slice(
      panelRectangle.left + 1,
      panelRectangle.left + panelRectangle.width - 1,
    ));
  const assistantLabelRow = panelRows.findIndex(
    (rowText, row) =>
      row > panelRectangle.top
      && rowText.trim() === 'Claude',
  );
  if (assistantLabelRow < 0) throw new Error('Assistant transcript label disappeared');
  const toolRow = panelRows.findIndex(
    (rowText, row) =>
      row > assistantLabelRow && rowText.includes('Bash'),
  );
  if (toolRow < 0) throw new Error('Transcript tool row disappeared');
  return panelRows
    .slice(assistantLabelRow + 1, toolRow)
    .map((rowText) => rowText.trim())
    .filter((rowText) => rowText.length > 0);
}

function emittedClipboardTexts(output: string): string[] {
  return Array.from(
    output.matchAll(/\x1b]52;c;([A-Za-z0-9+/=]*)\x07/g),
    (match) => Buffer.from(match[1] ?? '', 'base64').toString('utf8'),
  );
}

async function awaitClipboardEmission(
  driver: PtyTestDriver.Model,
  previousEmissionCount: number,
  expectedMarker: string,
): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const emittedTexts = emittedClipboardTexts(driver.recordedOutput());
    if (
      emittedTexts
        .slice(previousEmissionCount)
        .some((text) => text.includes(expectedMarker))
    ) {
      return;
    }
    await Bun.sleep(10);
  }
  const newEmissions = emittedClipboardTexts(driver.recordedOutput()).slice(previousEmissionCount);
  throw new Error(
    `Timed out waiting for an OSC 52 clipboard emission containing ${expectedMarker}; `
    + `received ${JSON.stringify(newEmissions)}`,
  );
}

function verticalScrollBarRun(
  snapshot: HarnessSnapshot.Model,
  panelRectangle: Rectangle,
): number {
  const paneRows = snapshot.textRows()
    .map((rowText, row) => ({
      rowText: rowText.slice(
        panelRectangle.left,
        panelRectangle.left + panelRectangle.width,
      ),
      row,
    }))
    .filter(({ rowText, row }) =>
      row > panelRectangle.top
      && row < panelRectangle.top + panelRectangle.height - 1
      && rowText.startsWith('│')
      && rowText.endsWith('│'));
  if (paneRows.length === 0) return 0;
  const rightBorderColumn = panelRectangle.left + Math.max(
    ...paneRows.map(({ rowText }) => rowText.trimEnd().lastIndexOf('│')),
  );
  const scrollBarColumn = rightBorderColumn - 1;
  const blankBackgrounds = paneRows.map(({ rowText, row }) => {
    const cell = snapshot.cell(row, scrollBarColumn);
    return rowText[scrollBarColumn - panelRectangle.left] === ' '
      ? cell?.background ?? null
      : null;
  });
  const backgroundCounts = new Map<number, number>();
  for (const background of blankBackgrounds) {
    if (background === null) continue;
    backgroundCounts.set(background, (backgroundCounts.get(background) ?? 0) + 1);
  }
  const dominantBackground = [...backgroundCounts.entries()]
    .sort((first, second) => second[1] - first[1])[0]?.[0];
  let longestRun = 0;
  let currentRun = 0;
  let currentBackground: number | null = null;
  for (const background of [...blankBackgrounds, null]) {
    if (
      background !== null
      && background !== dominantBackground
      && background === currentBackground
    ) {
      currentRun++;
    } else {
      longestRun = Math.max(longestRun, currentRun);
      currentBackground = background !== dominantBackground ? background : null;
      currentRun = currentBackground === null ? 0 : 1;
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
    "status condition: status.agentBusy === true",
    (status) => status.agentBusy === true,
  );
}

async function awaitIdle(driver: PtyTestDriver.Model, statusPath: string): Promise<void> {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: status.agentBusy === false",
    (status) => status.agentBusy === false,
    10_000,
  );
}

const repositoryRoot = process.cwd();
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-agent-pane-ux-harness-home-'));
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
    "status condition: status.ready === true",
    (status) => status.ready === true,
    20_000,
  );
  driver.sendRawInput('\x1b[27;6;97~');
  let snapshot = await driver.awaitSnapshot(
    (candidate) => {
      const followPosition = candidate.findText('follow: off');
      if (!followPosition) return false;
      const discoveredFooterRow = candidate.rowText(followPosition.row);
      return candidate.findText('──────────') !== null
        && discoveredFooterRow.includes('engine: claude')
        && discoveredFooterRow.includes('bypass permissions')
        && candidate.findText('❯') !== null
        && candidate.findText('  Ask Claude') !== null;
    },
  );
  const focusedPaneStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the agent pane opens focused with its panel geometry published',
    (status) => status.terminalFocused === true
      && typeof status.layoutSlots === 'object'
      && status.layoutSlots !== null,
  );
  HarnessSmoke.Class.pass('agent pane opens focused with framed composer chrome');
  const panelRectangle = bottomPanelSlot(focusedPaneStatus);
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('✦ Claude') !== null,
    'agent pane owns a heading inside the shared panel border',
  );
  HarnessSmoke.Class.pass(
    'the discovered footer row contains engine, follow mode, and permission segments',
  );
  const originalModeLine = snapshot.textRows().find((rowText) => rowText.includes('permissions'));
  driver.sendKeys('Shift+Tab');
  snapshot = await driver.awaitSnapshot((candidate) => {
    const modeLine = candidate.textRows().find((rowText) => rowText.includes('permissions'));
    return modeLine !== undefined && modeLine !== originalModeLine;
  });
  HarnessSmoke.Class.pass('Shift+Tab changes the permission mode line');

  console.log('== harness agent pane UX: animated busy and waiting state ==');
  const wordBoundaryPrompt =
    'alpha-marker boundaryalpha boundarybravo boundarycharlie '
    + 'boundarydelta boundaryecho boundaryfoxtrot boundarygolf';
  await submitTurn(
    driver,
    statusPath,
    wordBoundaryPrompt,
  );
  snapshot = await driver.awaitSnapshot(
    (candidate) => thinkingLine(candidate) !== null
      && candidate.findText('0s') !== null
      && candidate.findText('⧗ Bash') !== null,
  );
  const initialThinkingLine = thinkingLine(snapshot);
  const initialWordColumn = thinkingWordColumn(snapshot);
  HarnessSmoke.Class.requireCondition(
    initialThinkingLine !== null
      && !['✦', '✧', '⋆', '∗'].some((glyph) => initialThinkingLine.includes(glyph)),
    'thinking line has one front loader and no stray sparkle glyph',
  );
  const laterBusySnapshot = await driver.awaitSnapshot(
    (candidate) => thinkingLine(candidate) !== null
      && thinkingLine(candidate) !== initialThinkingLine,
    3_000,
  );
  HarnessSmoke.Class.requireCondition(
    initialWordColumn !== null && thinkingWordColumn(laterBusySnapshot) === initialWordColumn,
    'thinking word starts in a stable column across animation frames',
  );
  await awaitIdle(driver, statusPath);
  snapshot = await driver.awaitGridCondition(
    'the waiting tool note disappears after the agent session returns to idle',
    (candidate) => candidate.findText('⧗ Bash') === null
      && candidate.findText('$ echo') !== null
      && candidate.findText('{"command"') === null
      && candidate.findText('  "command"') === null,
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('⧗ Bash') === null,
    'waiting note disappears when the session returns to idle',
  );
  for (let page = 0; page < 4 && firstRowContaining(snapshot, 'alpha-marker') === null; page += 1) {
    driver.sendKeys('PageUp');
    await driver.awaitQuiescence();
    snapshot = driver.snapshot();
  }
  const userTurnRow = firstRowContaining(snapshot, 'alpha-marker');
  HarnessSmoke.Class.requireCondition(userTurnRow !== null, 'user turn remains in the transcript');
  if (userTurnRow === null) throw new Error('User turn row disappeared');
  const userTurnLastRow = firstRowContaining(snapshot, 'boundarygolf');
  HarnessSmoke.Class.requireCondition(
    userTurnLastRow !== null,
    'wrapped user turn keeps its final word whole',
  );
  if (userTurnLastRow === null) throw new Error('User turn final row disappeared');
  const followingRow = snapshot.rowText(userTurnLastRow + 1);
  const followingPanelRow = followingRow.slice(
    panelRectangle.left,
    panelRectangle.left + panelRectangle.width,
  );
  HarnessSmoke.Class.requireCondition(
    /^│[\s█▄░]*│$/.test(followingPanelRow),
    'a blank line follows the posted user turn',
  );
  const expectedEchoReply =
    `You said: “${wordBoundaryPrompt}”. This is the local echo backend — `
    + 'real Claude arrives when CliStreamBackend is wired (phase 2).';
  const visibleReplyRows = transcriptReplyRows(snapshot, panelRectangle);
  HarnessSmoke.Class.requireCondition(
    normalizedVisibleText(visibleReplyRows.join(' '))
      === normalizedVisibleText(expectedEchoReply),
    'echo reply reconstructs from rendered rows without a split word boundary',
  );
  for (const promptWord of wordBoundaryPrompt.split(' ')) {
    HarnessSmoke.Class.requireCondition(
      visibleReplyRows.some((rowText) => rowText.includes(promptWord)),
      `wrapped echo reply keeps ${promptWord} whole on one row`,
    );
  }

  console.log('== harness agent pane UX: collapsible tool row and wrapped reply ==');
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('$ echo') !== null
      && snapshot.findText('{"command"') === null
      && snapshot.findText('  "command"') === null,
    'collapsed tool shows the human phrase and hides raw input',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the collapsed tool publishes no expanded tool rows',
    (status) => status.agentExpandedCount === 0,
  );
  const collapsedToolPosition = snapshot.findText('▸ ⚙ Bash');
  HarnessSmoke.Class.requireCondition(collapsedToolPosition !== null, 'collapsed tool row paints');
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
    "status condition: candidate.agentExpandedCount === 1",
    (candidate) => candidate.agentExpandedCount === 1,
  );
  HarnessSmoke.Class.pass('expanded tool state is published');
  const expandedToolPosition = snapshot.findText('▾ ⚙ Bash');
  HarnessSmoke.Class.requireCondition(expandedToolPosition !== null, 'expanded tool row paints');
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
    "status condition: status.agentExpandedCount === 0",
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

  console.log('== harness agent pane UX: tail anchoring, scrollbar, and scrolling ==');
  await submitTurn(driver, statusPath, 'beta-second-prompt');
  await awaitIdle(driver, statusPath);
  await submitTurn(driver, statusPath, 'gamma-newest-prompt');
  await awaitIdle(driver, statusPath);
  snapshot = await driver.awaitGridCondition(
    'the newest prompt and transcript scrollbar are visible at the tail',
    (candidate) => candidate.findText('gamma-newest-prompt') !== null
      && verticalScrollBarRun(candidate, panelRectangle) >= 2,
  );
  let status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the transcript tail anchor and maximum scroll position are published',
    (candidate) => candidate.agentStuckToBottom === true
      && typeof candidate.agentScrollTop === 'number',
  );
  HarnessSmoke.Class.requireCondition(
    status.agentStuckToBottom === true && snapshot.findText('alpha-marker') === null,
    'tail anchor follows the newest turn and scrolls the first above the fold',
  );
  HarnessSmoke.Class.requireCondition(
    verticalScrollBarRun(snapshot, panelRectangle) >= 2,
    'overflowing transcript paints a multi-cell blank background scrollbar thumb',
  );

  const newestPosition = snapshot.findText('gamma-newest-prompt');
  if (!newestPosition) throw new Error('Newest prompt disappeared');
  const maximumScrollTop = Number(status.agentScrollTop);
  for (let wheelEvent = 0; wheelEvent < 4; wheelEvent++) {
    driver.sendMouse({
      kind: 'wheel',
      column: newestPosition.column,
      row: newestPosition.row,
      direction: 'up',
    });
  }
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: Number(candidate.agentScrollTop) < maximumScrollTop",
    (candidate) => Number(candidate.agentScrollTop) < maximumScrollTop,
  );
  await HarnessSmoke.Class.awaitFrameSilence(driver, 400, 5_000);
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'settled upward wheel momentum releases the transcript tail anchor',
    (candidate) => candidate.agentStuckToBottom === false,
  );
  HarnessSmoke.Class.pass('wheel momentum glides upward, settles, and releases the tail anchor');
  for (let page = 0; page < 8 && driver.snapshot().findText('alpha-marker') === null; page++) {
    driver.sendKeys('PageUp');
    await driver.awaitQuiescence();
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
    "status condition: candidate.agentStuckToBottom === true",
    (candidate) => candidate.agentStuckToBottom === true,
    8_000,
  );
  HarnessSmoke.Class.pass('scrolling to the bottom re-arms tail anchoring');

  console.log('== harness agent pane UX: transcript and composer selection/copy ==');
  snapshot = await driver.awaitGridCondition(
    'the newest transcript row is visible after tail anchoring is restored',
    (candidate) => candidate.findText('gamma-newest-prompt') !== null,
  );
  const transcriptPosition = snapshot.findText('gamma-newest-prompt');
  HarnessSmoke.Class.requireCondition(transcriptPosition !== null, 'newest transcript row is visible');
  if (!transcriptPosition) throw new Error('Transcript selection target disappeared');
  await dragBetweenCells(
    driver,
    transcriptPosition.column,
    transcriptPosition.row,
    transcriptPosition.column + 18,
    transcriptPosition.row,
  );
  const transcriptClipboardCount = emittedClipboardTexts(driver.recordedOutput()).length;
  driver.sendRawInputWithoutFrameExpectation('\x1b[27;5;99~');
  const transcriptCopyStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    "status condition: Number(candidate.lastCopyChars) >= 5",
    (candidate) => Number(candidate.lastCopyChars) >= 5,
  );
  HarnessSmoke.Class.requireCondition(
    Number(transcriptCopyStatus.lastCopyChars) >= 5,
    'Ctrl+C copies a transcript selection',
  );
  await awaitClipboardEmission(driver, transcriptClipboardCount, 'gamma-newest');
  HarnessSmoke.Class.pass('transcript copy emits selected bytes through raw OSC 52');

  driver.sendText('COPYCOMPOSER text');
  snapshot = await driver.awaitSnapshot((candidate) => candidate.findText('COPYCOMPOSER') !== null);
  const composerPosition = snapshot.findText('COPYCOMPOSER');
  if (!composerPosition) throw new Error('Composer selection target disappeared');
  await dragBetweenCells(
    driver,
    composerPosition.column,
    composerPosition.row,
    composerPosition.column + 12,
    composerPosition.row,
  );
  const composerClipboardCount = emittedClipboardTexts(driver.recordedOutput()).length;
  driver.sendRawInputWithoutFrameExpectation('\x1b[27;5;99~');
  const composerCopyStatus = await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    "status condition: Number(candidate.lastCopyChars) >= 5",
    (candidate) => Number(candidate.lastCopyChars) >= 5,
  );
  HarnessSmoke.Class.requireCondition(
    Number(composerCopyStatus.lastCopyChars) >= 5,
    'Ctrl+C copies a composer selection',
  );
  await awaitClipboardEmission(driver, composerClipboardCount, 'COPYCOMPOSER');
  HarnessSmoke.Class.pass('composer copy emits selected bytes through raw OSC 52');

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
    (candidate) => candidate.findText('alpha beta XgammaY') === null
      && candidate.findText('alpha beta') !== null,
  );
  HarnessSmoke.Class.pass('word-left, word-right, and Alt+Backspace edit the composer');

  console.log('== harness agent pane UX: composer word wrap, right gap, and idle teardown ==');
  for (let deletion = 0; deletion < 30; deletion++) {
    driver.sendKeysWithoutFrameExpectation('Backspace');
  }
  const composerWordBoundaryText =
    'composeralpha composerbravo composercharlie composerdelta composerecho '
    + 'composerfoxtrot composergolf composerhotel composerindia composerjuliet';
  driver.sendText(composerWordBoundaryText);
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('composerjuliet') !== null,
  );
  let composerRows = composerScreenRows(snapshot, panelRectangle);
  HarnessSmoke.Class.requireCondition(
    normalizedVisibleText(composerRows.map((row) => row.content).join(' '))
      === composerWordBoundaryText,
    'composer reconstructs from rendered rows without a split ordinary word',
  );
  for (const composerWord of composerWordBoundaryText.split(' ')) {
    HarnessSmoke.Class.requireCondition(
      composerRows.some((row) => row.content.includes(composerWord)),
      `composer keeps ${composerWord} whole on one row`,
    );
  }
  HarnessSmoke.Class.requireCondition(
    composerRows.every(
      (row) =>
        snapshot.rowText(row.row).slice(
          row.rightBorderColumn - 2,
          row.rightBorderColumn,
        ) === '  ',
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
    'hyphenalpha-hyphenbravo-hyphencharlie-hyphendelta-hyphenecho-'
    + 'hyphenfoxtrot-hyphengolf-hyphenhotel-hyphenindia-hyphenjuliet';
  driver.sendText(hyphenatedComposerText);
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('hyphenjuliet') !== null,
  );
  composerRows = composerScreenRows(snapshot, panelRectangle);
  HarnessSmoke.Class.requireCondition(
    composerRows.map((row) => row.content).join('') === hyphenatedComposerText
      && composerRows.length > 1
      && composerRows
        .slice(0, -1)
        .every((row) => row.content.endsWith('-')),
    'over-width hyphenated composer text wraps only after existing hyphens',
  );
  HarnessSmoke.Class.requireCondition(
    composerRows.every(
      (row) =>
        snapshot.rowText(row.row).slice(
          row.rightBorderColumn - 2,
          row.rightBorderColumn,
        ) === '  ',
    ),
    'hyphenated composer rows retain the two-column right gap',
  );
  const lastComposerRow = composerRows[composerRows.length - 1];
  if (!lastComposerRow) throw new Error('Wrapped composer rows disappeared');
  HarnessSmoke.Class.requireCondition(
    snapshot.cursorRow === lastComposerRow.row
      && snapshot.cursorColumn
        === lastComposerRow.contentStartColumn + lastComposerRow.content.length,
    'native caret follows the end of the hyphen-wrapped composer text',
  );
  await HarnessSmoke.Class.awaitFrameSilence(driver);
  await driver.assertAtMostOneCompleteFrameEmittedFor(4_000);
  HarnessSmoke.Class.pass('animation timer is torn down at idle');

  driver.sendKeys('Control+q');
  console.log('smoke-agent-pane-ux-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
