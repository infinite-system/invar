#!/usr/bin/env bun
// Byte-level bracketed-paste port across editor, terminal, agent composer, and focus recovery.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: A focused panel routes keystrokes to its active pane content (src/modules/ui/ui.invariants.md)
// invariant: Bracketed paste survives stream chunking (src/modules/ui/ui.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  awaitStatusPublication,
  dragBetweenCells,
  pass,
  requireCondition,
} from './HarnessSmokeSupport';
import { BracketedPasteInput } from './BracketedPasteInput';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';
import { HarnessSmoke } from './HarnessSmoke';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-paste-harness-'));

const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-paste-harness-home-'));

const statusPath = join(fixtureRoot, 'status.json');

await Bun.write(join(fixtureRoot, 'paste.txt'), 'paste fixture\n');
await Bun.write(join(fixtureRoot, 'second paste.txt'), 'second fixture\n');
await Bun.write(join(fixtureRoot, 'dropped picture.png'), 'invalid image');
await Bun.write(join(fixtureRoot, 'dropped movie.mp4'), 'invalid video');
mkdirSync(join(fixtureRoot, 'dropped folder'));
await Bun.write(join(homeDirectory, 'outside drop.txt'), 'outside fixture\n');

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_AGENT_BACKEND: 'echo',
  },
});

driver.outputSequenceCount('\x1b[?2004h');

// One reader for every pane-window text compare in this smoke. It joins the rows of a column
// window and removes the cells that carry no payload: whitespace, and BOTH splitter marks. A
// window can include the splitter cell beside its pane. That cell used to be blank, so whitespace
// removal reached the payload through it. It now paints a mark, and a surviving mark lands inside
// the pasted text and breaks a contiguous match.
function paneWindowText(
  snapshot: HarnessSnapshot.Model,
  left: number,
  columns: number,
): string {
  return snapshot
    .textRows()
    .map((rowText) => rowText.slice(left, left + columns))
    .join('')
    .replace(/[\s┃━]+/g, '');
}

function emittedClipboardTexts(): string[] {
  return driver
    .clipboardEmissions()
    .map((clipboardEmission) => clipboardEmission.decodedText);
}

async function sendChunkedPaste(text: string): Promise<void> {
  for (const inputChunk of BracketedPasteInput.Class.splitAtMarkerEdges(
    text,
    997,
  )) {
    driver.sendRawInputBytesWithoutFrameExpectation(inputChunk);
    await Bun.sleep(1);
  }
}

function exactSizePayload(
  byteCount: number,
  prefix: string,
  suffix: string,
): string {
  const fixedByteCount = Buffer.byteLength(prefix) + Buffer.byteLength(suffix);
  requireCondition(
    fixedByteCount <= byteCount,
    `fixed payload text fits in ${byteCount} bytes`,
  );
  const payload = `${prefix}${'x'.repeat(byteCount - fixedByteCount)}${suffix}`;
  requireCondition(
    Buffer.byteLength(payload) === byteCount,
    `payload is exactly ${byteCount} bytes`,
  );
  return payload;
}

try {
  console.log('== harness paste: dropped paths route by kind ==');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('paste.txt') !== null,
    15_000,
  );
  requireCondition(
    driver.outputSequenceCount('\x1b[?2004h') > 0,
    'the app enables bracketed-paste mode before accepting a drop',
  );
  pass('bracketed-paste mode is enabled');

  const textPath = join(fixtureRoot, 'paste.txt');
  const secondTextPath = join(fixtureRoot, 'second paste.txt');
  driver.sendRawInputWithoutFrameExpectation(textPath);
  driver.sendKeys('Control+j');
  await awaitStatusPublication(
    statusPath,
    'a later panel chord proves the unbracketed path bytes were processed',
    (status) => status.panelVisible === true,
  );
  const unbracketedStatus = await awaitStatusPublication(
    statusPath,
    'the unbracketed path leaves the editor unopened',
    (status) => status.activeBuffer === null,
  );
  requireCondition(
    unbracketedStatus.activeBuffer === null,
    'an unbracketed path does not trigger drop routing',
  );
  pass('an unbracketed path did not open a file');

  driver.sendText('set -- ');
  driver.sendPaste(`'${textPath}' "${secondTextPath}"`);
  await awaitStatusPublication(
    statusPath,
    'the focused terminal keeps the dropped paths out of the editor',
    (status) =>
      status.activeBuffer === null &&
      status.terminalFocused === true &&
      status.panelActiveContentKind === 'terminal',
  );
  driver.sendText(
    '; printf \'DROP_COUNT=%s FIRST=%s SECOND=%s\\n\' "$#" "$(basename "$1")" "$(basename "$2")"',
  );
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (snapshot) =>
      snapshot.findText(
        'DROP_COUNT=2 FIRST=paste.txt SECOND=second paste.txt',
      ) !== null,
  );
  pass('a focused terminal received two shell-quoted dropped paths');
  pass('the focused-terminal drop opened no editor buffer');
  driver.sendKeys('Control+j');
  await awaitStatusPublication(
    statusPath,
    'the panel closes before the framed drop cases',
    (status) => status.panelVisible === false,
  );

  const imagePath = join(fixtureRoot, 'dropped picture.png');
  driver.sendPaste(`'${imagePath}'`);
  await awaitStatusPublication(
    statusPath,
    'the single-quoted image path opens a media pane',
    (status) =>
      status.panelActiveContentKind === 'media' &&
      status.panelActiveContentLabel === 'dropped picture.png' &&
      status.mediaMode === 'image',
  );
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('IMAGE UNAVAILABLE') !== null,
  );
  pass('a single-quoted image drop opened a visible media pane');

  const videoPath = join(fixtureRoot, 'dropped movie.mp4');
  driver.sendPaste(videoPath.replaceAll(' ', '\\ '));
  await awaitStatusPublication(
    statusPath,
    'the escaped video path opens a media pane',
    (status) =>
      status.panelActiveContentKind === 'media' &&
      status.panelActiveContentLabel === 'dropped movie.mp4' &&
      status.mediaMode === 'video',
  );
  pass('an escaped video drop opened a media pane');

  const directoryPath = join(fixtureRoot, 'dropped folder');
  driver.sendPaste(`"${directoryPath}"`);
  await awaitStatusPublication(
    statusPath,
    'the double-quoted folder path opens the workspace offer',
    (status) =>
      status.boundedListPopupOpen === true &&
      status.boundedListPopupTitle === 'Open dropped folder' &&
      status.boundedListPopupSelectedIdentifier === directoryPath,
  );
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Open dropped folder') !== null,
  );
  pass('a directory drop opened the workspace offer');
  driver.sendKeys('Escape');
  await awaitStatusPublication(
    statusPath,
    'the folder offer closes before the next drop',
    (status) => status.boundedListPopupOpen === false,
  );

  const outsidePath = join(homeDirectory, 'outside drop.txt');
  driver.sendPaste(`"${outsidePath}"`);
  await awaitStatusPublication(
    statusPath,
    'the outside-root path opens as a read-only buffer',
    (status) =>
      status.activeBuffer === outsidePath &&
      status.activeBufferReadOnly === true,
  );
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('outside drop.txt [read-only]') !== null,
  );
  pass('an outside-root drop has a visible read-only badge');

  driver.sendPaste(`'${textPath}' "${secondTextPath}"`);
  await awaitStatusPublication(
    statusPath,
    'a two-file drop opens both text buffers and activates the last one',
    (status) => status.activeBuffer === secondTextPath,
  );
  pass('a multi-file drop opened both text paths');

  driver.sendPaste(`'${textPath}'`);
  await awaitStatusPublication(
    statusPath,
    'the in-root text path opens editable in the editor',
    (status) =>
      status.activeBuffer === textPath &&
      status.activeBufferReadOnly === false &&
      status.focus === 'editor',
  );
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('paste fixture') !== null,
  );
  await awaitStatusPublication(
    statusPath,
    'the dropped paste fixture has editor focus',
    (status) => status.focus === 'editor',
  );
  pass('a dropped text file is ready for bracketed paste');

  console.log(
    '== harness paste: single-line editor paste inserts at the caret ==',
  );
  const firstRevisionStatus = await awaitStatusPublication(
    statusPath,
    'the buffer revision is published before single-line paste',
    (status) => typeof status.bufferRevision === 'number',
  );
  const firstRevision = Number(firstRevisionStatus.bufferRevision);
  driver.sendPaste('PASTEUNIQUEXYZ');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('PASTEUNIQUEXYZ') !== null,
  );
  await awaitStatusPublication(
    statusPath,
    'single-line paste advances the revision and dirties the document',
    (status) =>
      Number(status.bufferRevision) > firstRevision && status.dirty === true,
  );
  pass('single-line paste bumped the buffer revision');
  pass('paste dirtied the document');

  console.log(
    '== harness paste: multi-line editor paste creates visible lines ==',
  );
  const secondRevisionStatus = await awaitStatusPublication(
    statusPath,
    'the buffer revision is published before multi-line paste',
    (status) => typeof status.bufferRevision === 'number',
  );
  const secondRevision = Number(secondRevisionStatus.bufferRevision);
  driver.sendPaste('ALPHALINE\nBRAVOLINE\nCHARLIELINE');
  await driver.awaitSnapshot(
    (snapshot) =>
      snapshot.findText('ALPHALINE') !== null &&
      snapshot.findText('CHARLIELINE') !== null,
  );
  await awaitStatusPublication(
    statusPath,
    'multi-line paste advances the buffer revision',
    (status) => Number(status.bufferRevision) > secondRevision,
  );
  pass('multi-line paste bumped the buffer revision');

  console.log('== harness paste: terminal paste reaches the child PTY ==');
  driver.sendKeys('Control+j');
  await awaitStatusPublication(
    statusPath,
    'the terminal pane is active and focused',
    (status) =>
      status.terminalFocused === true &&
      status.panelActiveContentKind === 'terminal',
  );
  pass('active pane is the terminal');
  driver.sendPaste('PASTEDINTERMINAL');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('PASTEDINTERMINAL') !== null,
  );
  pass('terminal child echoed pasted text at its prompt');
  driver.sendKeys('Control+c');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('^C') !== null);

  console.log('== harness paste: terminal word operations reach readline ==');
  driver.sendText('alpha beta gamma');
  driver.sendRawInput('\x1bb');
  driver.sendText('X');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('alpha beta Xgamma') !== null,
  );
  driver.sendRawInput('\x1bb');
  driver.sendRawInput('\x1bf');
  driver.sendText('Y');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('alpha beta XgammaY') !== null,
  );
  driver.sendRawInput('\x1b\x7f');
  await driver.awaitSnapshot(
    (snapshot) =>
      snapshot.findText('alpha beta XgammaY') === null &&
      snapshot.findText('alpha beta') !== null,
  );
  pass(
    'word-left, word-right, and Alt+Backspace forward as readline meta sequences',
  );
  driver.sendKeys('Control+c');
  await driver.awaitScreenChange();

  console.log(
    '== harness paste: split markers and large payloads reach the terminal exactly ==',
  );
  const tenByteTerminalPayload = 'TEN-BYTES!';
  await sendChunkedPaste(tenByteTerminalPayload);
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText(tenByteTerminalPayload) !== null,
  );
  pass('10-byte paste split across both markers reaches the terminal');
  driver.sendKeys('Control+c');
  await driver.awaitScreenChange();

  for (const payloadByteCount of [1024, 65_536]) {
    const commandPrefix = "printf '";
    const resultMarker = `CHUNK_${payloadByteCount}_RESULT_`;
    const commandSuffix = `' | wc -c | { read count; printf '${resultMarker}%s\\n' "$count"; }`;
    const command = exactSizePayload(
      payloadByteCount,
      commandPrefix,
      commandSuffix,
    );
    const expectedPayloadByteCount =
      payloadByteCount -
      Buffer.byteLength(commandPrefix) -
      Buffer.byteLength(commandSuffix);
    await sendChunkedPaste(command);
    // Staging sequencing only: the staged echo wraps at the pane width, and whether any marker
    // straddles a row boundary is layout-configuration arithmetic, so no single-row text wait can
    // gate here. Quiescence proves the paste bytes flushed and the echo settled; byte-exactness is
    // proven by the wc -c result below, which prints at pane column 0 and cannot straddle.
    await driver.awaitScreenChange();
    driver.sendKeys('Enter');
    await driver.awaitSnapshot(
      (snapshot) =>
        snapshot.findText(`${resultMarker}${expectedPayloadByteCount}`) !==
        null,
      30_000,
    );
    pass(
      `${payloadByteCount}-byte paste split across markers and payload reaches the terminal exactly`,
    );
  }

  console.log(
    '== harness paste: terminal selection copies through raw OSC 52 ==',
  );
  driver.sendText('printf COPYTERMINAL');
  let snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('COPYTERMINAL') !== null,
  );
  const terminalCopyPosition = snapshot.findText('COPYTERMINAL');
  if (!terminalCopyPosition)
    throw new Error('Terminal copy target disappeared');
  await dragBetweenCells(
    driver,
    terminalCopyPosition.column,
    terminalCopyPosition.row,
    terminalCopyPosition.column + 11,
    terminalCopyPosition.row,
  );
  const clipboardEmissionCountBefore = emittedClipboardTexts().length;
  driver.sendRawInputWithoutFrameExpectation('\x1b[27;5;99~');
  const copyDeadline = performance.now() + 5_000;
  while (
    emittedClipboardTexts().length <= clipboardEmissionCountBefore &&
    performance.now() < copyDeadline
  ) {
    await Bun.sleep(10);
  }
  requireCondition(
    emittedClipboardTexts()
      .slice(clipboardEmissionCountBefore)
      .some((text) => text.includes('COPYTERMINAL')),
    'terminal selection emits the selected bytes through OSC 52',
  );
  driver.sendMouse({
    kind: 'press',
    column: terminalCopyPosition.column,
    row: terminalCopyPosition.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: terminalCopyPosition.column,
    row: terminalCopyPosition.row,
    button: 'left',
  });
  driver.sendKeys('Control+c');
  await driver.awaitScreenChange();

  console.log('== harness paste: agent paste inserts into the composer ==');
  driver.sendRawInput('\x1b[27;6;97~');
  await awaitStatusPublication(
    statusPath,
    'the agent pane is published as active',
    (status) => status.panelActiveContentKind === 'agent',
  );
  driver.sendPaste('PASTEDINAGENT');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('PASTEDINAGENT') !== null,
  );
  pass('agent composer paints the pasted text');

  console.log(
    '== harness paste: split markers and large payloads route to the agent composer ==',
  );
  driver.sendRawInput('\x1b[127;5u');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('PASTEDINAGENT') === null,
  );
  const agentPanelLayoutStatus = await awaitStatusPublication(
    statusPath,
    'panel cell identifiers and columns are published before agent paste',
    (status) =>
      Array.isArray(status.panelCellIds) &&
      Array.isArray(status.panelCellColumns) &&
      typeof status.layoutSlots === 'object' &&
      status.layoutSlots !== null,
  );
  const activeAgentCell = HarnessSmoke.Class.activePanelCell(
    agentPanelLayoutStatus,
  );
  const agentPanelCellColumns =
    agentPanelLayoutStatus.panelCellColumns as number[];
  if (activeAgentCell?.kind !== 'agent') {
    throw new Error('The active agent panel cell geometry disappeared');
  }
  const pasteAgentCellIndex = activeAgentCell.index;
  const agentBottomPanel = (
    agentPanelLayoutStatus.layoutSlots as
      Record<string, { left: number }> | undefined
  )?.bottomPanel;
  if (pasteAgentCellIndex < 0 || !agentBottomPanel) {
    throw new Error('Agent panel geometry disappeared before agent paste');
  }
  const pasteAgentPaneLeft =
    agentBottomPanel.left +
    1 +
    (pasteAgentCellIndex === 0 ? 0 : Number(agentPanelCellColumns[0] ?? 0) + 1);
  const pasteAgentPaneColumns = Number(
    agentPanelCellColumns[pasteAgentCellIndex] ?? 0,
  );
  const agentPaneText = (snapshot: HarnessSnapshot.Model): string =>
    paneWindowText(snapshot, pasteAgentPaneLeft, pasteAgentPaneColumns);
  driver.sendPaste(`'${textPath}' "${secondTextPath}"`);
  await driver.awaitSnapshot(
    (snapshot) =>
      agentPaneText(snapshot).includes("paste.txt'") &&
      agentPaneText(snapshot).includes("secondpaste.txt'"),
  );
  await awaitStatusPublication(
    statusPath,
    'the focused agent keeps dropped paths out of the editor',
    (status) =>
      status.activeBuffer === textPath &&
      status.panelActiveContentKind === 'agent',
  );
  pass('a focused agent received two shell-quoted dropped paths');
  driver.sendRawInput('\x1b[127;5u');
  await driver.awaitSnapshot(
    (snapshot) => !agentPaneText(snapshot).includes("secondpaste.txt'"),
  );
  for (const payloadByteCount of [10, 1024, 65_536]) {
    const payloadSuffix = `-END${payloadByteCount}`;
    const payload = exactSizePayload(
      payloadByteCount,
      `C${payloadByteCount}-`,
      payloadSuffix,
    );
    await sendChunkedPaste(payload);
    await driver.awaitSnapshot(
      (snapshot) => agentPaneText(snapshot).includes(payloadSuffix),
      30_000,
    );
    await awaitStatusPublication(
      statusPath,
      `${payloadByteCount}-byte paste remains routed to the agent composer`,
      (status) => status.panelActiveContentKind === 'agent',
    );
    pass(
      `${payloadByteCount}-byte paste remained routed to the agent composer`,
    );
    pass(
      `${payloadByteCount}-byte paste split across markers and payload reaches the agent composer`,
    );
    driver.sendRawInput('\x1b[127;5u');
    await driver.awaitSnapshot(
      (snapshot) => !agentPaneText(snapshot).includes(payloadSuffix),
      30_000,
    );
  }

  console.log(
    '== harness paste: paste survives staged and animated terminal interception ==',
  );
  for (let deletion = 0; deletion < 30; deletion += 1) {
    driver.sendKeysWithoutFrameExpectation('Backspace');
  }
  driver.sendText('terminal-tools:stage:printf STAGED_PASTE');
  driver.sendKeys('Enter');
  const stagedPanelLayoutStatus = await awaitStatusPublication(
    statusPath,
    'the staged tool selects the terminal group and publishes its geometry',
    (status) =>
      status.panelActiveContentKind === 'terminal' &&
      Array.isArray(status.panelCellIds) &&
      Array.isArray(status.panelCellColumns) &&
      String(status.agentLastToolResult).includes('Staged without Enter') &&
      typeof status.layoutSlots === 'object' &&
      status.layoutSlots !== null,
  );
  const activeStagedTerminalCell = HarnessSmoke.Class.activePanelCell(
    stagedPanelLayoutStatus,
  );
  const stagedPanelCellColumns =
    stagedPanelLayoutStatus.panelCellColumns as number[];
  if (activeStagedTerminalCell?.kind !== 'terminal') {
    throw new Error('The active staged terminal geometry disappeared');
  }
  const stagedTerminalCellIndex = activeStagedTerminalCell.index;
  const stagedBottomPanel = (
    stagedPanelLayoutStatus.layoutSlots as
      Record<string, { left: number }> | undefined
  )?.bottomPanel;
  if (stagedTerminalCellIndex < 0 || !stagedBottomPanel) {
    throw new Error('Terminal panel geometry disappeared before staged paste');
  }
  const stagedTerminalPaneLeft =
    stagedBottomPanel.left +
    1 +
    (stagedTerminalCellIndex === 0
      ? 0
      : Number(stagedPanelCellColumns[0] ?? 0) + 1);
  const stagedTerminalPaneColumns = Number(
    stagedPanelCellColumns[stagedTerminalCellIndex] ?? 0,
  );
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('$ printf STAGED_PASTE') !== null,
  );
  driver.sendPaste('_BURST');
  await driver.awaitSnapshot((candidate) =>
    paneWindowText(
      candidate,
      stagedTerminalPaneLeft,
      stagedTerminalPaneColumns,
    ).includes('$printfSTAGED_PASTE_BURST'),
  );
  pass('paste payload reaches readline intact while a command is staged');
  driver.sendKeys('Control+c');
  await driver.awaitScreenChange();

  const panelLayoutStatus = await awaitStatusPublication(
    statusPath,
    'panel layout geometry and cell columns are published',
    (status) =>
      typeof status.layoutSlots === 'object' &&
      status.layoutSlots !== null &&
      Array.isArray(status.panelCellIds) &&
      Array.isArray(status.panelCellColumns) &&
      typeof status.height === 'number',
  );
  const layoutSlots = panelLayoutStatus.layoutSlots as Record<
    string,
    { left: number; top: number; width: number; height: number }
  >;
  const bottomPanel = layoutSlots?.bottomPanel;
  if (!bottomPanel) throw new Error('Bottom-panel slot geometry disappeared');
  const activeTerminalCell =
    HarnessSmoke.Class.activePanelCell(panelLayoutStatus);
  const panelCellColumns = panelLayoutStatus.panelCellColumns as number[];
  if (activeTerminalCell?.kind !== 'terminal') {
    throw new Error('The active terminal panel cell disappeared');
  }
  const terminalCellIndex = activeTerminalCell.index;
  const terminalPaneLeft =
    bottomPanel.left +
    1 +
    (terminalCellIndex === 0 ? 0 : Number(panelCellColumns[0] ?? 0) + 1);
  const terminalPaneColumns = Number(panelCellColumns[terminalCellIndex] ?? 0);
  driver.sendRawInput('\x1b[27;6;97~');
  await awaitStatusPublication(
    statusPath,
    'the Agent shortcut selects its retained full-width group',
    (status) => status.panelActiveContentKind === 'agent',
  );
  driver.sendText(`terminal-tools:stage:printf ANIMATING_${'x'.repeat(100)}`);
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('printf ANI') !== null &&
      candidate.findText(`ANIMATING_${'x'.repeat(100)}`) === null,
  );
  driver.sendPaste('PASTE_DURING_ANIMATION');
  await driver.awaitSnapshot((candidate) =>
    paneWindowText(candidate, terminalPaneLeft, terminalPaneColumns).includes(
      'PASTE_DURING_ANIMATION',
    ),
  );
  pass('paste payload reaches readline intact during visible typing');
  driver.sendKeys('Control+c');
  await driver.awaitScreenChange();
  driver.sendRawInput('\x1b[27;6;97~');
  await awaitStatusPublication(
    statusPath,
    'the Agent shortcut selects the agent group after terminal interruption',
    (status) => status.panelActiveContentKind === 'agent',
  );
  driver.sendRawInput('\x1b[27;6;97~');
  await awaitStatusPublication(
    statusPath,
    'the second Agent shortcut hides the panel with the terminal group hidden',
    (status) =>
      status.panelVisible === false && status.terminalVisible === false,
  );

  console.log('== harness paste: focus recovery re-enables bracketed paste ==');
  const pasteEnableCountBefore = driver.outputSequenceCount('\x1b[?2004h');
  driver.sendRawInputWithoutFrameExpectation('\x1b[O');
  driver.sendRawInputWithoutFrameExpectation('\x1b[I');
  await driver.awaitSnapshot(
    () => driver.outputSequenceCount('\x1b[?2004h') > pasteEnableCountBefore,
  );
  requireCondition(
    driver.outputSequenceCount('\x1b[?2004h') > pasteEnableCountBefore,
    'focus-in recovery emitted a fresh DECSET 2004 enable sequence',
  );
  const thirdRevisionStatus = await awaitStatusPublication(
    statusPath,
    'the buffer revision is published before post-focus paste',
    (status) => typeof status.bufferRevision === 'number',
  );
  const thirdRevision = Number(thirdRevisionStatus.bufferRevision);
  driver.sendPaste('PASTEAFTERREFOCUS');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('PASTEAFTERREFOCUS') !== null,
  );
  await awaitStatusPublication(
    statusPath,
    'paste after refocus advances the buffer revision',
    (status) => Number(status.bufferRevision) > thirdRevision,
  );
  pass('paste after refocus bumped the buffer revision');

  driver.sendKeys('Control+q');
  await driver.exitCode();
  console.log('smoke-paste-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
