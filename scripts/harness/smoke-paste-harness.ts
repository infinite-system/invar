#!/usr/bin/env bun
// Byte-level bracketed-paste port across editor, terminal, agent composer, and focus recovery.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: A focused panel routes keystrokes to its active pane content (src/modules/terminal/terminal.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pass, requireCondition, statusField } from './HarnessSmokeSupport';
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
  environment: { TUI_STATUS_PATH: statusPath },
});

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
  driver.sendKeys('F8');
  await driver.awaitQuiescence();

  console.log('== harness paste: agent paste inserts into the composer ==');
  driver.sendRawInput('\x1b[27;6;97~');
  await driver.awaitSnapshot(
    () => statusField<string>(statusPath, 'panelActiveContent') === 'agent',
  );
  driver.sendPaste('PASTEDINAGENT');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('PASTEDINAGENT') !== null);
  pass('agent composer paints the pasted text');
  driver.sendRawInput('\x1b[27;6;97~');
  await driver.awaitQuiescence();

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
