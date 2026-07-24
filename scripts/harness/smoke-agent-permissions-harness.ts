#!/usr/bin/env bun
// Byte-level port of the interactive permission loop using the permission-gated echo backend.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

async function submitPrompt(
  driver: PtyTestDriver.Model,
  statusPath: string,
  prompt: string,
): Promise<void> {
  driver.sendText(prompt);
  await driver.awaitSnapshot((snapshot) => snapshot.findText(prompt) !== null);
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.agentPendingPermissionTool === 'Bash',
  );
  await driver.awaitGridCondition(
    `the permission prompt for ${prompt} is visibly rendered`,
    (snapshot) => snapshot.findText('? Claude wants to run') !== null
      && snapshot.findText(`$ echo gated for: ${prompt}`) !== null
      && snapshot.findText('[y] allow') !== null,
  );
}

async function answerPermission(
  driver: PtyTestDriver.Model,
  statusPath: string,
  answer: 'y' | 'n' | 'a',
): Promise<void> {
  driver.sendText(answer);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.agentBusy === false
      && status.agentPendingPermissionTool === '',
  );
}

const repositoryRoot = process.cwd();
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-agent-permissions-harness-home-'));
const statusPath = join(homeDirectory, 'status.json');
const driver = new PtyTestDriver.Class({
  workspaceRoot: join(repositoryRoot, 'fixtures'),
  repositoryRoot,
  columns: 110,
  rows: 34,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_AGENT_BACKEND: 'echo',
    INVAR_AGENT_ECHO_PERMISSION: '1',
  },
});

try {
  console.log('== harness agent permissions: enter ask mode ==');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.ready === true,
    20_000,
  );
  driver.sendRawInput('\x1b[27;6;97~');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('bypass permissions on') !== null);
  driver.sendKeys('Shift+Tab');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('? ask permissions') !== null);
  HarnessSmoke.Class.pass('Shift+Tab cycles bypass mode to ask permissions');

  console.log('== harness agent permissions: allow one gated tool ==');
  await submitPrompt(driver, statusPath, 'first-gated-command');
  let snapshot = driver.snapshot();
  let status = HarnessSmoke.Class.readStatus(statusPath);
  HarnessSmoke.Class.requireCondition(
    status.agentBusy === true
      && snapshot.findText('? Claude wants to run') !== null
      && snapshot.findText('$ echo gated for: first-gated-command') !== null
      && snapshot.findText('[y] allow') !== null
      && snapshot.findText('▸ ⚙ Bash') === null,
    'tool is paused behind the rendered permission prompt',
  );
  await answerPermission(driver, statusPath, 'y');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('✓ allowed') !== null
      && candidate.findText('▸ ⚙ Bash') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('▸ ⚙ Bash') !== null,
    'allow runs the gated tool and completes the turn',
  );

  console.log('== harness agent permissions: deny one gated tool ==');
  await submitPrompt(driver, statusPath, 'second-gated-command');
  await answerPermission(driver, statusPath, 'n');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('✗ denied') !== null
      && candidate.findText('will not run that command') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('▸ ✓ gated for: second-gated-command') === null,
    'deny records the refusal without producing a tool-result row',
  );

  console.log('== harness agent permissions: stray input is swallowed ==');
  await submitPrompt(driver, statusPath, 'third-gated-command');
  driver.sendRawInputWithoutFrameExpectation('zqx');
  await driver.awaitGridCondition(
    'the permission prompt remains visible without rendering stray input',
    (snapshot) => snapshot.findText('? Claude wants to run') !== null
      && snapshot.findText('zqx') === null,
  );
  status = HarnessSmoke.Class.readStatus(statusPath);
  HarnessSmoke.Class.requireCondition(
    status.agentPendingPermissionTool === 'Bash',
    'stray typing leaves the permission unresolved',
  );
  await answerPermission(driver, statusPath, 'y');
  HarnessSmoke.Class.pass('a later valid answer resolves the prompt');

  console.log('== harness agent permissions: always allow persists for the session ==');
  await submitPrompt(driver, statusPath, 'fourth-gated-command');
  await answerPermission(driver, statusPath, 'a');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('gated for: fourth-gated-command') !== null,
  );
  driver.sendText('fifth-auto-allowed');
  await driver.awaitSnapshot((candidate) => candidate.findText('fifth-auto-allowed') !== null);
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.agentBusy === false,
  );
  status = HarnessSmoke.Class.readStatus(statusPath);
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('gated for: fifth-auto-allowed') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    status.agentPendingPermissionTool === ''
      && snapshot.findText('gated for: fifth-auto-allowed') !== null,
    'always-allow skips the next prompt and runs its tool',
  );

  await HarnessSmoke.Class.awaitFrameSilence(driver);
  await driver.assertAtMostOneCompleteFrameEmittedFor(4_000);
  HarnessSmoke.Class.pass('permission pane remains idle-quiescent');
  driver.sendKeys('Control+q');
  await driver.exitCode();
  console.log('smoke-agent-permissions-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(homeDirectory, { recursive: true, force: true });
}
