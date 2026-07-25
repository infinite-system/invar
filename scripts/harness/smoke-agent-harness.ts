#!/usr/bin/env bun
// Byte-level port of smoke-agent: the echo backend is driven through the real panel PTY, while
// transcript and chrome assertions come from the terminal-emulator grid.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function statusButtonColumn(driver: PtyTestDriver.Model, label: string): number {
  const statusBarRow = driver.snapshot().rows - 1;
  const column = driver.snapshot().rowText(statusBarRow).lastIndexOf(label);
  if (column < 0) throw new Error(`Status button is not visible: ${label}`);
  return column + Math.floor(label.length / 2);
}

function runAgentUnitTests(repositoryRoot: string): void {
  const result = Bun.spawnSync([process.execPath, 'test', 'src/modules/agent/'], {
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  HarnessSmoke.Class.requireCondition(
    result.exitCode === 0,
    'agent-core unit tests pass',
  );
}

const repositoryRoot = process.cwd();
const fixtureRoot = join(repositoryRoot, 'fixtures');
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-agent-harness-home-'));
const statusPath = join(homeDirectory, 'status.json');
const settingsDirectory = join(homeDirectory, '.config', 'invar');
mkdirSync(settingsDirectory, { recursive: true });
await Bun.write(join(settingsDirectory, 'settings.json'), '{"glyphMode":"unicode"}\n');

console.log('== harness agent: deterministic backend/session tests ==');
runAgentUnitTests(repositoryRoot);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  repositoryRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_AGENT_BACKEND: 'echo',
  },
});

try {
  console.log('== harness agent: boot and status-bar button ==');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.ready === true,
    20_000,
  );
  HarnessSmoke.Class.requireCondition(
    HarnessSmoke.Class.readStatus(statusPath).terminalVisible === false,
    'agent pane is hidden at boot',
  );
  await driver.awaitQuiescence();
  const bootStatus = HarnessSmoke.Class.readStatus(statusPath);
  const agentButtonColumn = statusButtonColumn(driver, ' ✦ ');
  driver.sendMouse({
    kind: 'press',
    column: agentButtonColumn,
    row: Number(bootStatus.height) - 1,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: agentButtonColumn,
    row: Number(bootStatus.height) - 1,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.terminalVisible === true && status.panelActiveContent === 'agent',
  );
  HarnessSmoke.Class.pass('status-bar agent button opens the agent pane');
  const openStatus = HarnessSmoke.Class.readStatus(statusPath);
  driver.sendMouse({
    kind: 'press',
    column: statusButtonColumn(driver, ' ✦ '),
    row: Number(openStatus.height) - 1,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: statusButtonColumn(driver, ' ✦ '),
    row: Number(openStatus.height) - 1,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.terminalVisible === false,
  );
  HarnessSmoke.Class.pass('status-bar agent button hides the agent pane');

  console.log('== harness agent: chord, composer, and echo round trip ==');
  driver.sendRawInput('\x1b[27;6;97~');
  let snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('Ask Claude') !== null
      && candidate.findText('❯') !== null,
  );
  const toggledStatus = HarnessSmoke.Class.readStatus(statusPath);
  HarnessSmoke.Class.requireCondition(
    toggledStatus.terminalVisible === true
      && toggledStatus.terminalFocused === true
      && toggledStatus.panelActiveContent === 'agent',
    'agent chord opens and focuses the pane',
  );
  HarnessSmoke.Class.requireCondition(
    String(toggledStatus.panelContentIds).includes('agent'),
    'agent is registered in the shared panel host',
  );
  HarnessSmoke.Class.pass('empty-state hint and composer glyph render');

  driver.sendText('ping the harness');
  await driver.awaitSnapshot((candidate) => candidate.findText('ping the harness') !== null);
  HarnessSmoke.Class.pass('composer paints typed text');
  driver.sendKeys('Enter');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('You') !== null
      && candidate.findText('You said') !== null
      && candidate.findText('ping the harness') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('You said') !== null,
    'structured echo reply renders with the exact prompt',
  );

  console.log('== harness agent: demand-driven idle and hide ==');
  await HarnessSmoke.Class.awaitFrameSilence(driver, 150);
  await driver.assertAtMostOneCompleteFrameEmittedFor(4_000);
  HarnessSmoke.Class.pass('agent pane emits at most one complete frame during four idle seconds');
  driver.sendRawInput('\x1b[27;6;97~');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.terminalVisible === false,
  );
  HarnessSmoke.Class.pass('second chord hides the panel');

  driver.sendKeys('Control+q');
  console.log('smoke-agent-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(homeDirectory, { recursive: true, force: true });
}
