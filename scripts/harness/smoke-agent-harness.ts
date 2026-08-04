#!/usr/bin/env bun
// Byte-level port of smoke-agent: the echo backend is driven through the real panel PTY, while
// transcript and chrome assertions come from the terminal-emulator grid.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function statusButtonColumn(
  driver: PtyTestDriver.Model,
  label: string,
): number {
  const statusBarRow = driver.snapshot().rows - 1;
  const column = driver.snapshot().rowText(statusBarRow).lastIndexOf(label);
  if (column < 0) throw new Error(`Status button is not visible: ${label}`);
  return column + Math.floor(label.length / 2);
}

function runAgentUnitTests(repositoryRoot: string): void {
  HarnessSmoke.Class.requireChildSuccess(
    'agent-core unit tests pass',
    [process.execPath, 'test', 'src/modules/agent/'],
    repositoryRoot,
  );
}

const repositoryRoot = process.cwd();

const fixtureRoot = join(repositoryRoot, 'fixtures');

const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-agent-harness-home-'));

const statusPath = join(homeDirectory, 'status.json');

const settingsDirectory = join(homeDirectory, '.config', 'invar');

mkdirSync(settingsDirectory, { recursive: true });

await Bun.write(
  join(settingsDirectory, 'settings.json'),
  '{"glyphMode":"unicode"}\n',
);

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
  const bootStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the app is ready with the agent pane hidden and screen height published',
    (status) =>
      status.ready === true &&
      status.terminalVisible === false &&
      typeof status.height === 'number',
    20_000,
  );
  HarnessSmoke.Class.pass('agent pane is hidden at boot');
  await driver.awaitScreenChange();
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
  const openStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the agent pane is visible and active with screen height published',
    (status) =>
      status.panelVisible === true &&
      status.terminalVisible === false &&
      status.panelActiveContentKind === 'agent' &&
      typeof status.height === 'number',
  );
  HarnessSmoke.Class.pass('status-bar agent button opens the agent pane');
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
    'status condition: status.terminalVisible === false',
    (status) => status.terminalVisible === false,
  );
  HarnessSmoke.Class.pass('status-bar agent button hides the agent pane');

  console.log('== harness agent: chord, composer, and echo round trip ==');
  driver.sendRawInput('\x1b[27;6;97~');
  const openedAgentStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the agent chord opens and focuses the registered agent pane',
    (status) =>
      status.panelVisible === true &&
      status.panelFocused === true &&
      status.terminalVisible === false &&
      status.terminalFocused === false &&
      status.panelActiveContentKind === 'agent' &&
      Array.isArray(status.panelContentKinds) &&
      status.panelContentKinds.includes('agent'),
  );
  const agentRectangle =
    HarnessSmoke.Class.activePanelCellRectangle(openedAgentStatus);
  if (!agentRectangle) throw new Error('Active agent geometry disappeared');
  let snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate.findTextInRectangle('Ask Claude', agentRectangle) !== null &&
      candidate.findTextInRectangle('❯', agentRectangle) !== null,
  );
  HarnessSmoke.Class.pass('agent chord opens and focuses the pane');
  HarnessSmoke.Class.pass('agent is registered in the shared panel host');
  HarnessSmoke.Class.pass('empty-state hint and composer glyph render');

  driver.sendText('ping the harness');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('ping the harness') !== null,
  );
  HarnessSmoke.Class.pass('composer paints typed text');
  driver.sendKeys('Enter');
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('You') !== null &&
      candidate.findText('You said') !== null &&
      candidate.findText('ping the harness') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('You said') !== null,
    'structured echo reply renders with the exact prompt',
  );

  console.log('== harness agent: hide ==');
  driver.sendRawInput('\x1b[27;6;97~');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.terminalVisible === false',
    (status) => status.terminalVisible === false,
  );
  HarnessSmoke.Class.pass('second chord hides the panel');

  driver.sendKeys('Control+q');
  console.log('smoke-agent-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
