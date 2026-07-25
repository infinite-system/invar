#!/usr/bin/env bun
// Byte-level bracketed-paste port across editor, terminal, agent composer, and focus recovery.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: A focused panel routes keystrokes to its active pane content (src/modules/terminal/terminal.invariants.md)
// invariant: Bracketed paste survives stream chunking (src/modules/terminal/terminal.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  dragBetweenCells,
  pass,
  requireCondition,
  statusField,
} from './HarnessSmokeSupport';
import { BracketedPasteInput } from './BracketedPasteInput';
import { PtyTestDriver } from './PtyTestDriver';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-paste-harness-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-paste-harness-home-'));
const statusPath = join(fixtureRoot, 'status.json');
await Bun.write(join(fixtureRoot, 'paste.txt'), 'paste fixture\n');

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

function emittedClipboardTexts(output: string): string[] {
  return Array.from(
    output.matchAll(/\x1b]52;c;([A-Za-z0-9+/=]*)\x07/g),
    (match) => Buffer.from(match[1] ?? '', 'base64').toString('utf8'),
  );
}

async function sendChunkedPaste(text: string): Promise<void> {
  for (
    const inputChunk of BracketedPasteInput.Class.splitAtMarkerEdges(text, 997)
  ) {
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
  console.log('== harness paste: open a file and focus the editor ==');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('paste.txt') !== null, 15_000);
  driver.sendKeys('Enter');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('paste fixture') !== null);
  driver.sendKeys('Right');
  await driver.awaitQuiescence();
  pass('editor is ready for bracketed paste');

  console.log('== harness paste: single-line editor paste inserts at the caret ==');
  const firstRevision = statusField<number>(statusPath, 'bufferRevision') ?? 0;
  driver.sendPaste('PASTEUNIQUEXYZ');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('PASTEUNIQUEXYZ') !== null);
  requireCondition(
    (statusField<number>(statusPath, 'bufferRevision') ?? 0) > firstRevision,
    'single-line paste bumped the buffer revision',
  );
  requireCondition(statusField<boolean>(statusPath, 'dirty') === true, 'paste dirtied the document');

  console.log('== harness paste: multi-line editor paste creates visible lines ==');
  const secondRevision = statusField<number>(statusPath, 'bufferRevision') ?? 0;
  driver.sendPaste('ALPHALINE\nBRAVOLINE\nCHARLIELINE');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('ALPHALINE') !== null
      && snapshot.findText('CHARLIELINE') !== null,
  );
  requireCondition(
    (statusField<number>(statusPath, 'bufferRevision') ?? 0) > secondRevision,
    'multi-line paste bumped the buffer revision',
  );

  console.log('== harness paste: terminal paste reaches the child PTY ==');
  driver.sendKeys('F8');
  await driver.awaitSnapshot(
    () => statusField<boolean>(statusPath, 'terminalFocused') === true,
  );
  requireCondition(
    statusField<string>(statusPath, 'panelActiveContent') === 'terminal',
    'active pane is the terminal',
  );
  driver.sendPaste('PASTEDINTERMINAL');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('PASTEDINTERMINAL') !== null);
  pass('terminal child echoed pasted text at its prompt');
  driver.sendKeys('Control+c');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('^C') !== null);

  console.log('== harness paste: terminal word operations reach readline ==');
  driver.sendText('alpha beta gamma');
  driver.sendRawInput('\x1bb');
  driver.sendText('X');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('alpha beta Xgamma') !== null);
  driver.sendRawInput('\x1bb');
  driver.sendRawInput('\x1bf');
  driver.sendText('Y');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('alpha beta XgammaY') !== null);
  driver.sendRawInput('\x1b\x7f');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('alpha beta XgammaY') === null
      && snapshot.findText('alpha beta') !== null,
  );
  pass('word-left, word-right, and Alt+Backspace forward as readline meta sequences');
  driver.sendKeys('Control+c');
  await driver.awaitQuiescence();

  console.log('== harness paste: split markers and large payloads reach the terminal exactly ==');
  const tenByteTerminalPayload = 'TEN-BYTES!';
  await sendChunkedPaste(tenByteTerminalPayload);
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText(tenByteTerminalPayload) !== null,
  );
  pass('10-byte paste split across both markers reaches the terminal');
  driver.sendKeys('Control+c');
  await driver.awaitQuiescence();

  for (const payloadByteCount of [1024, 65_536]) {
    const commandPrefix = "printf '";
    const resultMarker = `CHUNK_${payloadByteCount}_RESULT_`;
    const commandSuffix =
      `' | wc -c | { read count; printf '${resultMarker}%s\\n' "$count"; }`;
    const command = exactSizePayload(
      payloadByteCount,
      commandPrefix,
      commandSuffix,
    );
    const expectedPayloadByteCount = payloadByteCount
      - Buffer.byteLength(commandPrefix)
      - Buffer.byteLength(commandSuffix);
    await sendChunkedPaste(command);
    // Staging sequencing only: the staged echo wraps at the pane width, and whether any marker
    // straddles a row boundary is layout-configuration arithmetic, so no single-row text wait can
    // gate here. Quiescence proves the paste bytes flushed and the echo settled; byte-exactness is
    // proven by the wc -c result below, which prints at pane column 0 and cannot straddle.
    await driver.awaitQuiescence();
    driver.sendKeys('Enter');
    await driver.awaitSnapshot(
      (snapshot) => (
        snapshot.findText(`${resultMarker}${expectedPayloadByteCount}`) !== null
      ),
      30_000,
    );
    pass(
      `${payloadByteCount}-byte paste split across markers and payload reaches the terminal exactly`,
    );
  }

  console.log('== harness paste: terminal selection copies through raw OSC 52 ==');
  driver.sendText('printf COPYTERMINAL');
  let snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('COPYTERMINAL') !== null,
  );
  const terminalCopyPosition = snapshot.findText('COPYTERMINAL');
  if (!terminalCopyPosition) throw new Error('Terminal copy target disappeared');
  await dragBetweenCells(
    driver,
    terminalCopyPosition.column,
    terminalCopyPosition.row,
    terminalCopyPosition.column + 11,
    terminalCopyPosition.row,
  );
  const clipboardEmissionCountBefore = emittedClipboardTexts(driver.recordedOutput()).length;
  driver.sendRawInputWithoutFrameExpectation('\x1b[27;5;99~');
  const copyDeadline = performance.now() + 5_000;
  while (
    emittedClipboardTexts(driver.recordedOutput()).length
      <= clipboardEmissionCountBefore
    && performance.now() < copyDeadline
  ) {
    await Bun.sleep(10);
  }
  requireCondition(
    emittedClipboardTexts(driver.recordedOutput())
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
  await driver.awaitQuiescence();

  console.log('== harness paste: agent paste inserts into the composer ==');
  driver.sendRawInput('\x1b[27;6;97~');
  await driver.awaitSnapshot(
    () => statusField<string>(statusPath, 'panelActiveContent') === 'agent',
  );
  driver.sendPaste('PASTEDINAGENT');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('PASTEDINAGENT') !== null);
  pass('agent composer paints the pasted text');

  console.log('== harness paste: split markers and large payloads route to the agent composer ==');
  driver.sendRawInput('\x1b[127;5u');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('PASTEDINAGENT') === null);
  for (const payloadByteCount of [10, 1024, 65_536]) {
    const payloadSuffix = `-END${payloadByteCount}`;
    const payload = exactSizePayload(
      payloadByteCount,
      `C${payloadByteCount}-`,
      payloadSuffix,
    );
    await sendChunkedPaste(payload);
    await driver.awaitSnapshot(
      (snapshot) => snapshot.findText(payloadSuffix) !== null,
      30_000,
    );
    requireCondition(
      statusField<string>(statusPath, 'panelActiveContent') === 'agent',
      `${payloadByteCount}-byte paste remained routed to the agent composer`,
    );
    pass(
      `${payloadByteCount}-byte paste split across markers and payload reaches the agent composer`,
    );
    driver.sendRawInput('\x1b[127;5u');
    await driver.awaitSnapshot(
      (snapshot) => snapshot.findText(payloadSuffix) === null,
      30_000,
    );
  }

  console.log('== harness paste: paste survives staged and animated terminal interception ==');
  for (let deletion = 0; deletion < 30; deletion += 1) {
    driver.sendKeysWithoutFrameExpectation('Backspace');
  }
  driver.sendText('terminal-tools:stage:printf STAGED_PASTE');
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('$ printf STAGED_PASTE') !== null
      && candidate.findText('terminal command staged at') !== null,
  );
  driver.sendPaste('_BURST');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('$ printf STAGED_PASTE_BURST') !== null,
  );
  pass('paste payload reaches readline intact while a command is staged');
  driver.sendKeys('Control+c');
  await driver.awaitQuiescence();

  const layoutSlots = statusField<
    Record<string, { left: number; top: number; width: number; height: number }>
  >(statusPath, 'layoutSlots');
  const bottomPanel = layoutSlots?.bottomPanel;
  if (!bottomPanel) throw new Error('Bottom-panel slot geometry disappeared');
  const screenRows = Number(statusField<number>(statusPath, 'height') ?? 40);
  const layoutCanvasTop =
    screenRows - 1 - (bottomPanel.top + bottomPanel.height);
  const panelCellIdentifiers =
    statusField<string[]>(statusPath, 'panelCellIds') ?? [];
  const panelCellColumns =
    statusField<number[]>(statusPath, 'panelCellColumns') ?? [];
  const agentCellIndex = panelCellIdentifiers.indexOf('agent');
  if (agentCellIndex < 0) throw new Error('Agent panel cell disappeared');
  const panelBodyColumn = bottomPanel.left + 2 + (
    agentCellIndex === 0 ? 0 : Number(panelCellColumns[0] ?? 0) + 1
  );
  const panelBodyRow =
    layoutCanvasTop + bottomPanel.top + Math.floor(bottomPanel.height / 2);
  driver.sendMouse({ kind: 'press', column: panelBodyColumn, row: panelBodyRow, button: 'left' });
  driver.sendMouse({ kind: 'release', column: panelBodyColumn, row: panelBodyRow, button: 'left' });
  await driver.awaitSnapshot(
    () => statusField<string>(statusPath, 'panelActiveContent') === 'agent',
  );
  driver.sendText(
    `terminal-tools:stage:printf ANIMATING_${'x'.repeat(100)}`,
  );
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('printf ANI') !== null
      && candidate.findText(`ANIMATING_${'x'.repeat(100)}`) === null,
  );
  driver.sendPaste('PASTE_DURING_ANIMATION');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('PASTE_DURING_ANIMATION') !== null,
  );
  pass('paste payload reaches readline intact during visible typing');
  driver.sendKeys('Control+c');
  await driver.awaitQuiescence();
  driver.sendKeys('F8');
  await driver.awaitSnapshot(
    () => statusField<string>(statusPath, 'panelActiveContent') === 'agent',
  );
  driver.sendRawInput('\x1b[27;6;97~');
  await driver.awaitSnapshot(
    () => statusField<boolean>(statusPath, 'terminalVisible') === false,
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
  const thirdRevision = statusField<number>(statusPath, 'bufferRevision') ?? 0;
  driver.sendPaste('PASTEAFTERREFOCUS');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('PASTEAFTERREFOCUS') !== null);
  requireCondition(
    (statusField<number>(statusPath, 'bufferRevision') ?? 0) > thirdRevision,
    'paste after refocus bumped the buffer revision',
  );

  driver.sendKeys('Control+q');
  await driver.exitCode();
  console.log('smoke-paste-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
