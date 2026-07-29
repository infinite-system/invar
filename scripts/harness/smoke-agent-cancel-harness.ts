#!/usr/bin/env bun
// Drives agent cancellation, liveness, and message queueing through the real PTY and CLI backend.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Every agent turn reaches a terminal state (src/modules/agent/agent.invariants.md)
// invariant: Stream inactivity is visible and non-destructive (src/modules/agent/agent.invariants.md)
// invariant: Queued agent messages preserve order (src/modules/agent/agent.invariants.md)
// invariant: Agent instructions match the workspace (src/modules/agent/agent.invariants.md)
import {
  appendFileSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

interface ProcessRecord {
  readonly prompt: string;
  readonly processIdentifiers: readonly number[];
}

function readPromptLog(promptLogPath: string): string[] {
  try {
    return readFileSync(promptLogPath, 'utf8')
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as string);
  } catch {
    return [];
  }
}

function readProcessRecords(processLogPath: string): ProcessRecord[] {
  try {
    return readFileSync(processLogPath, 'utf8')
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as ProcessRecord);
  } catch {
    return [];
  }
}

function processExists(processIdentifier: number): boolean {
  try {
    process.kill(processIdentifier, 0);
    return true;
  } catch {
    return false;
  }
}

async function awaitProcessAbsence(
  processIdentifiers: readonly number[],
  description: string,
): Promise<void> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    if (
      processIdentifiers.every(
        (processIdentifier) => !processExists(processIdentifier),
      )
    ) {
      HarnessSmoke.Class.pass(description);
      return;
    }
    await Bun.sleep(20);
  }
  throw new Error(
    `Timed out waiting for ${description}; live process identifiers: ${processIdentifiers
      .filter((processIdentifier) => processExists(processIdentifier))
      .join(', ')}`,
  );
}

async function awaitPromptRecord(
  processLogPath: string,
  prompt: string,
): Promise<ProcessRecord> {
  const deadline = performance.now() + 5_000;
  while (performance.now() < deadline) {
    const record = readProcessRecords(processLogPath).find(
      (candidate) => candidate.prompt === prompt,
    );
    if (record) return record;
    await Bun.sleep(20);
  }
  throw new Error(`Timed out waiting for mock process record for ${prompt}`);
}

async function awaitPromptSequence(
  promptLogPath: string,
  expectedPrompts: readonly string[],
  description: string,
): Promise<string[]> {
  const deadline = performance.now() + 5_000;
  let observedPrompts: string[] = [];
  while (performance.now() < deadline) {
    observedPrompts = readPromptLog(promptLogPath);
    if (
      observedPrompts.slice(-expectedPrompts.length).join('|') ===
      expectedPrompts.join('|')
    ) {
      return observedPrompts;
    }
    await Bun.sleep(20);
  }
  throw new Error(
    `Timed out waiting for ${description}; observed prompts: ` +
      observedPrompts.join(' → '),
  );
}

async function requirePromptCountRemainsUnchangedFor(
  promptLogPath: string,
  expectedPromptCount: number,
  observationMilliseconds: number,
  description: string,
): Promise<void> {
  const deadline = performance.now() + observationMilliseconds;
  let promptCountRemainedUnchanged = true;
  while (performance.now() < deadline) {
    if (readPromptLog(promptLogPath).length !== expectedPromptCount) {
      promptCountRemainedUnchanged = false;
      break;
    }
    await Bun.sleep(Math.min(20, deadline - performance.now()));
  }
  HarnessSmoke.Class.requireCondition(
    promptCountRemainedUnchanged,
    description,
  );
}

async function submitMessage(
  driver: PtyTestDriver.Model,
  statusPath: string,
  prompt: string,
  expectedState: string,
): Promise<StatusSnapshot> {
  driver.sendText(prompt);
  await driver.awaitGridCondition(
    `composer visibly contains ${prompt}`,
    (snapshot) => snapshot.findText(prompt) !== null,
  );
  driver.sendKeys('Enter');
  return HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    `agent turn state becomes ${expectedState} after submitting ${prompt}`,
    (status) => status.agentTurnState === expectedState,
  );
}

function createMockClaudeExecutable(binaryDirectory: string): string {
  const executablePath = join(binaryDirectory, 'claude');
  const source = [
    '#!/usr/bin/env bun',
    "import { appendFileSync } from 'node:fs';",
    "const promptFlagIndex = process.argv.indexOf('-p');",
    "const prompt = promptFlagIndex >= 0 ? (process.argv[promptFlagIndex + 1] ?? '') : '';",
    'const promptLogPath = process.env.INVAR_AGENT_MOCK_PROMPT_LOG;',
    'const processLogPath = process.env.INVAR_AGENT_MOCK_PROCESS_LOG;',
    "if (promptLogPath) appendFileSync(promptLogPath, JSON.stringify(prompt) + '\\n');",
    "const emitEvent = (event) => process.stdout.write(JSON.stringify(event) + '\\n');",
    "emitEvent({ type: 'system', subtype: 'init', session_id: 'mock-session' });",
    "if (prompt.startsWith('hang-') || prompt === 'cancel-root') {",
    "  const descendant = Bun.spawn([process.execPath, '-e', 'setInterval(() => {}, 1000)'], { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });",
    "  if (processLogPath) appendFileSync(processLogPath, JSON.stringify({ prompt, processIdentifiers: [process.pid, descendant.pid] }) + '\\n');",
    '  setInterval(() => {}, 1000);',
    "} else if (prompt === 'queue-root') {",
    "  if (processLogPath) appendFileSync(processLogPath, JSON.stringify({ prompt, processIdentifiers: [process.pid] }) + '\\n');",
    "  const activityTimer = setInterval(() => emitEvent({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '.' }] } }), 100);",
    "  setTimeout(() => { clearInterval(activityTimer); emitEvent({ type: 'result', subtype: 'success', is_error: false }); }, 900);",
    '} else {',
    "  if (processLogPath) appendFileSync(processLogPath, JSON.stringify({ prompt, processIdentifiers: [process.pid] }) + '\\n');",
    "  emitEvent({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'reply ' + prompt }] } });",
    "  emitEvent({ type: 'result', subtype: 'success', is_error: false });",
    '}',
    '',
  ].join('\n');
  writeFileSync(executablePath, source);
  chmodSync(executablePath, 0o755);
  return executablePath;
}

const repositoryRoot = process.cwd();

const temporaryDirectory = mkdtempSync(
  join(tmpdir(), 'tui-agent-cancel-harness-'),
);

const homeDirectory = join(temporaryDirectory, 'home');

const binaryDirectory = join(temporaryDirectory, 'bin');

const workspaceDirectory = join(temporaryDirectory, 'workspace');

const statusPath = join(temporaryDirectory, 'status.json');

const promptLogPath = join(temporaryDirectory, 'prompts.jsonl');

const processLogPath = join(temporaryDirectory, 'processes.jsonl');

mkdirSync(homeDirectory, { recursive: true });

mkdirSync(binaryDirectory, { recursive: true });

mkdirSync(join(workspaceDirectory, '.claude', 'skills', 'resolver-smoke'), {
  recursive: true,
});

writeFileSync(
  join(workspaceDirectory, '.claude', 'skills', 'resolver-smoke', 'SKILL.md'),
  [
    '---',
    'name: resolver-smoke',
    'description: driven slash-resolution fixture',
    '---',
    '',
    'hang-SKILLBODYANCHOR',
    '',
  ].join('\n'),
);

createMockClaudeExecutable(binaryDirectory);

appendFileSync(promptLogPath, '');

appendFileSync(processLogPath, '');

const driver = new PtyTestDriver.Class({
  workspaceRoot: workspaceDirectory,
  repositoryRoot,
  columns: 110,
  rows: 42,
  homeDirectory,
  environment: {
    PATH: `${binaryDirectory}:${process.env.PATH ?? ''}`,
    TUI_STATUS_PATH: statusPath,
    INVAR_AGENT_BACKEND: 'cli',
    INVAR_AGENT_PROVIDER: 'claude',
    INVAR_AGENT_STREAM_INACTIVITY_MS: '300',
    INVAR_AGENT_MOCK_PROMPT_LOG: promptLogPath,
    INVAR_AGENT_MOCK_PROCESS_LOG: processLogPath,
  },
});

try {
  console.log('== harness agent cancel: boot and open focused pane ==');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'application ready before agent cancellation drive',
    (status) => status.ready === true,
    20_000,
  );
  driver.sendRawInput('\x1b[27;6;97~');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'agent pane opens focused',
    (status) => status.terminalFocused === true,
  );
  const initialAgentSnapshot = await driver.awaitGridCondition(
    'agent composer prompt is visible before slash submission',
    (candidate) => candidate.findText('❯ ') !== null,
  );
  HarnessSmoke.Class.clickText(driver, initialAgentSnapshot, '❯ ');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'clicking the discovered composer prompt focuses the Claude agent cell',
    (status) =>
      status.terminalFocused === true && status.agentEngine === 'claude',
  );

  console.log(
    '== harness agent cancel: project skill expands before backend delivery ==',
  );
  const slashInvocation = '/resolver-smoke ARGUMENTANCHOR';
  const expectedSkillPrompt = 'hang-SKILLBODYANCHOR\n\nARGUMENTANCHOR';
  await submitMessage(driver, statusPath, slashInvocation, 'running');
  const deliveredSkillRecord = await awaitPromptRecord(
    processLogPath,
    expectedSkillPrompt,
  );
  const deliveredSkillPrompt = deliveredSkillRecord.prompt;
  HarnessSmoke.Class.requireCondition(
    deliveredSkillPrompt === expectedSkillPrompt,
    `composer slash turn reaches the backend as the project skill body plus arguments (${JSON.stringify(deliveredSkillPrompt)})`,
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'resolved project skill turn cancels cleanly',
    (status) => status.agentTurnState === 'canceled',
  );
  awaitProcessAbsence(
    deliveredSkillRecord.processIdentifiers,
    'resolved project skill backend process group is absent after Escape',
  );

  console.log(
    '== harness agent cancel: overlay priority then Escape cancellation ==',
  );
  await submitMessage(driver, statusPath, 'hang-overlay', 'running');
  const overlayProcessRecord = await awaitPromptRecord(
    processLogPath,
    'hang-overlay',
  );
  let snapshot = await driver.awaitGridCondition(
    'running spinner shows the cancellation hint',
    (candidate) => candidate.findText('esc to cancel') !== null,
  );
  const runningHintPosition = snapshot.findText('esc to cancel');
  const runningHintForeground = runningHintPosition
    ? snapshot.cell(runningHintPosition.row, runningHintPosition.column)
        ?.foreground
    : null;
  const panelTop = Number(
    (
      HarnessSmoke.Class.readStatus(statusPath).layoutSlots as
        Record<string, { top: number }> | undefined
    )?.bottomPanel?.top ?? 20,
  );
  driver.sendMouse({
    kind: 'press',
    column: 50,
    row: Math.max(2, panelTop - 2),
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: 50,
    row: Math.max(2, panelTop - 2),
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'agent panel loses focus before the settings overlay opens',
    (status) => status.terminalFocused === false,
  );
  driver.sendKeys('Control+,');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'settings overlay opens above the running agent turn',
    (status) =>
      status.settingsOpen === true && status.agentTurnState === 'running',
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Escape closes settings before it can cancel the agent turn',
    (status) =>
      status.settingsOpen === false && status.agentTurnState === 'running',
  );
  HarnessSmoke.Class.pass('overlay Escape priority is preserved');

  snapshot = await driver.awaitGridCondition(
    'running prompt remains visible after the overlay closes',
    (candidate) => candidate.findText('hang-overlay') !== null,
  );
  HarnessSmoke.Class.clickText(driver, snapshot, 'hang-overlay');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'clicking the transcript restores agent-pane focus',
    (status) => status.terminalFocused === true,
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Escape marks the turn canceled and releases busy state',
    (status) =>
      status.agentTurnState === 'canceled' && status.agentBusy === false,
  );
  snapshot = await driver.awaitGridCondition(
    'the transcript visibly marks cancellation',
    (candidate) =>
      candidate.findText('canceled') !== null &&
      candidate.findText('❯') !== null,
  );
  driver.sendText('composer-usable');
  await driver.awaitGridCondition(
    'composer accepts text immediately after cancellation',
    (candidate) => candidate.findText('composer-usable') !== null,
  );
  HarnessSmoke.Class.pass(
    'canceled transcript and immediately usable composer are visible',
  );
  for (
    let characterIndex = 0;
    characterIndex < 'composer-usable'.length;
    characterIndex += 1
  ) {
    driver.sendKeysWithoutFrameExpectation('Backspace');
  }
  awaitProcessAbsence(
    overlayProcessRecord.processIdentifiers,
    'canceled backend process group is absent',
  );

  console.log(
    '== harness agent cancel: inactivity is visible and never auto-kills ==',
  );
  await submitMessage(driver, statusPath, 'hang-stall', 'running');
  const stalledProcessRecord = await awaitPromptRecord(
    processLogPath,
    'hang-stall',
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'silent backend crosses the inactivity threshold',
    (status) => status.agentTurnState === 'stalled',
  );
  snapshot = await driver.awaitGridCondition(
    'stalled spinner line exposes the recovery action',
    (candidate) => candidate.findText('stalled — esc to cancel') !== null,
  );
  const stalledPosition = snapshot.findText('stalled');
  const stalledForeground = stalledPosition
    ? snapshot.cell(stalledPosition.row, stalledPosition.column)?.foreground
    : null;
  HarnessSmoke.Class.requireCondition(
    stalledProcessRecord.processIdentifiers.every(processExists),
    'watchdog leaves the backend process group alive',
  );
  HarnessSmoke.Class.requireCondition(
    stalledForeground !== null &&
      runningHintForeground !== null &&
      stalledForeground !== runningHintForeground,
    'stalled warning has a distinct visual foreground',
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Escape recovers a stalled turn',
    (status) => status.agentTurnState === 'canceled',
  );
  awaitProcessAbsence(
    stalledProcessRecord.processIdentifiers,
    'stalled backend process group is absent after Escape',
  );

  console.log('== harness agent cancel: two queued messages send in order ==');
  await submitMessage(driver, statusPath, 'queue-root', 'running');
  driver.sendText('queue-one');
  driver.sendKeys('Enter');
  driver.sendText('queue-two');
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'two user messages are queued during the running turn',
    (status) => status.queuedMessageCount === 2,
  );
  await driver.awaitGridCondition(
    'queued affordances are visible in the transcript',
    (candidate) => candidate.findText('[queued]') !== null,
  );
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the ordered user queue drains to idle',
    (status) =>
      status.queuedMessageCount === 0 && status.agentTurnState === 'idle',
    10_000,
  );
  const orderedPrompts = await awaitPromptSequence(
    promptLogPath,
    ['queue-root', 'queue-one', 'queue-two'],
    'the backend prompt log to publish the ordered user queue',
  );
  HarnessSmoke.Class.requireCondition(
    orderedPrompts.slice(-3).join('|') === 'queue-root|queue-one|queue-two',
    `queued backend delivery preserves order (${orderedPrompts.slice(-3).join(' → ')})`,
  );

  console.log(
    '== harness agent cancel: cancellation holds queue until a queued-message click ==',
  );
  await submitMessage(driver, statusPath, 'cancel-root', 'running');
  const heldProcessRecord = await awaitPromptRecord(
    processLogPath,
    'cancel-root',
  );
  driver.sendText('held-one');
  driver.sendKeys('Enter');
  driver.sendText('held-two');
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'two messages are queued before cancellation',
    (status) => status.queuedMessageCount === 2,
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'cancellation holds both queued messages',
    (status) =>
      status.agentTurnState === 'canceled' && status.queuedMessageCount === 2,
  );
  awaitProcessAbsence(
    heldProcessRecord.processIdentifiers,
    'canceled queued-turn process group is absent',
  );
  const promptsBeforeHoldWindow = readPromptLog(promptLogPath);
  await requirePromptCountRemainsUnchangedFor(
    promptLogPath,
    promptsBeforeHoldWindow.length,
    450,
    'cancellation does not auto-fire the queued head',
  );
  snapshot = await driver.awaitGridCondition(
    'held queued message exposes its click target',
    (candidate) => candidate.findText('[queued]') !== null,
  );
  HarnessSmoke.Class.clickText(driver, snapshot, '[queued]');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'queued-message click releases the head and drains in order',
    (status) =>
      status.queuedMessageCount === 0 && status.agentTurnState === 'idle',
  );
  const releasedPrompts = await awaitPromptSequence(
    promptLogPath,
    ['cancel-root', 'held-one', 'held-two'],
    'the backend prompt log to publish the released queue in order',
  );
  HarnessSmoke.Class.requireCondition(
    releasedPrompts.slice(-3).join('|') === 'cancel-root|held-one|held-two',
    `held queue releases in order (${releasedPrompts.slice(-3).join(' → ')})`,
  );

  console.log('== RESULT: ALL-PASS ==');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(temporaryDirectory);
}
