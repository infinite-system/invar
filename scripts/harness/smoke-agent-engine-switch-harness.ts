#!/usr/bin/env bun
// Byte-level port of the hermetic agent-engine switch contract, including context transfer and
// provider-derived title, greeting, and transcript identity.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function hasTranscriptLabel(snapshot: HarnessSnapshot.Model, label: string): boolean {
  return snapshot.textRows().some((rowText) => {
    const trimmedRow = rowText.trimEnd();
    return trimmedRow.endsWith('│')
      && trimmedRow.slice(0, -1).trimEnd() === `│  ${label}`;
  });
}

async function submitTurn(driver: PtyTestDriver.Model, prompt: string): Promise<void> {
  driver.sendText(prompt);
  await driver.awaitSnapshot((snapshot) => snapshot.findText(prompt) !== null);
  driver.sendKeys('Enter');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('You said') !== null);
}

function createDriver(
  repositoryRoot: string,
  fixtureRoot: string,
  homeDirectory: string,
  statusPath: string,
  provider?: string,
): PtyTestDriver.Model {
  return new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    repositoryRoot,
    columns: 110,
    rows: 34,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_AGENT_BACKEND: 'echo',
      INVAR_AGENT_ENGINES: 'claude,codex',
      INVAR_AGENT_PROVIDER: provider,
    },
  });
}

const repositoryRoot = process.cwd();
const fixtureRoot = join(repositoryRoot, 'fixtures');
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-agent-engine-harness-home-'));
const firstStatusPath = join(homeDirectory, 'claude-status.json');
let driver = createDriver(repositoryRoot, fixtureRoot, homeDirectory, firstStatusPath);

try {
  console.log('== harness agent engine: Claude boot and live switch ==');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    firstStatusPath,
    (status) => status.ready === true,
    20_000,
  );
  driver.sendRawInput('\x1b[27;6;97~');
  let snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('engine: claude') !== null
      && candidate.findText('Ask Claude anything') !== null,
  );
  let status = HarnessSmoke.Class.readStatus(firstStatusPath);
  HarnessSmoke.Class.requireCondition(
    status.agentEngine === 'claude' && status.agentTitle === 'Claude',
    'Claude boot resolves engine and title',
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('╭─Claude') !== null
      && snapshot.findText('⇄') !== null
      && snapshot.findText('ctrl+e') !== null,
    'Claude title and engine-cycle affordance render',
  );

  await submitTurn(driver, 'Please remember this token for later: MAGENTA-8842.');
  snapshot = driver.snapshot();
  HarnessSmoke.Class.requireCondition(
    hasTranscriptLabel(snapshot, 'Claude'),
    'pre-switch reply is labeled Claude',
  );
  driver.sendRawInput('\x1b[27;5;101~');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('switched to codex') !== null
      && candidate.findText('context ported') !== null
      && candidate.findText('engine: codex') !== null,
  );
  status = HarnessSmoke.Class.readStatus(firstStatusPath);
  HarnessSmoke.Class.requireCondition(
    status.agentEngine === 'codex' && status.agentTitle === 'Codex',
    'Ctrl+E switches the live provider identity to Codex',
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('╭─Codex') !== null && hasTranscriptLabel(snapshot, 'Claude'),
    'pane retitles while history retains its producing engine label',
  );

  await submitTurn(driver, 'What token did I ask you to remember?');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('Context ported from the previous engine') !== null
      && candidate.findText('MAGENTA-8842') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    hasTranscriptLabel(snapshot, 'Codex'),
    'post-switch reply is labeled Codex and receives ported context',
  );
  status = HarnessSmoke.Class.readStatus(firstStatusPath);
  driver.sendMouse({
    kind: 'press',
    column: 4,
    row: Number(status.height) - 4,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: 4,
    row: Number(status.height) - 4,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    firstStatusPath,
    (candidate) => candidate.agentEngine === 'claude',
  );
  await driver.awaitSnapshot((candidate) => candidate.findText('switched to claude') !== null);
  HarnessSmoke.Class.pass('clicking the engine segment cycles back to Claude');
  await HarnessSmoke.Class.awaitFrameSilence(driver);
  await driver.assertAtMostOneCompleteFrameEmittedFor(4_000);
  HarnessSmoke.Class.pass('switched agent pane remains idle-quiescent');

  console.log('== harness agent engine: fresh Codex-provider boot ==');
  driver.dispose();
  const secondStatusPath = join(homeDirectory, 'codex-status.json');
  driver = createDriver(repositoryRoot, fixtureRoot, homeDirectory, secondStatusPath, 'codex');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    secondStatusPath,
    (candidate) => candidate.ready === true,
    20_000,
  );
  driver.sendRawInput('\x1b[27;6;97~');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('Ask Codex anything') !== null
      && candidate.findText('╭─Codex') !== null,
  );
  status = HarnessSmoke.Class.readStatus(secondStatusPath);
  HarnessSmoke.Class.requireCondition(
    status.agentEngine === 'codex'
      && status.agentTitle === 'Codex'
      && snapshot.findText('Ask Claude') === null,
    'Codex-provider boot has no frozen Claude identity',
  );
  await submitTurn(driver, 'hello codex');
  HarnessSmoke.Class.requireCondition(
    hasTranscriptLabel(driver.snapshot(), 'Codex'),
    'first Codex-provider reply is labeled Codex',
  );
  driver.sendKeys('Control+q');
  console.log('smoke-agent-engine-switch-harness: ALL-PASS');
} finally {
  driver.dispose();
  rmSync(homeDirectory, { recursive: true, force: true });
}
