#!/usr/bin/env bun
// Byte-level drive of the agent-visible integrated-terminal tools and clean prompt.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

function rightPaneText(snapshot: HarnessSnapshot.Model, leftPaneColumns: number): string {
  return snapshot.textRows()
    .map((rowText) => rowText.slice(leftPaneColumns + 1))
    .join('\n');
}

function snapshotHasPromptColor(snapshot: HarnessSnapshot.Model, promptColor: number): boolean {
  return snapshot.textRows().some((_rowText, rowIndex) =>
    snapshot.rowCells(rowIndex).some(
      (cell) => cell.characters === '$'
        && cell.isForegroundRgb
        && cell.foreground === promptColor,
    ),
  );
}

async function awaitFileContents(path: string, expected: string): Promise<void> {
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    if (existsSync(path) && readFileSync(path, 'utf8') === expected) return;
    await Bun.sleep(10);
  }
  throw new Error(`Timed out waiting for ${path} to contain ${expected}`);
}

async function focusPanelCell(
  driver: PtyTestDriver.Model,
  statusPath: string,
  cellIndex: number,
): Promise<Record<string, unknown>> {
  const status = HarnessSmoke.Class.readStatus(statusPath);
  const cellColumns = (status.panelCellColumns as number[]) ?? [];
  const panelRow = Number(status.height) - 8;
  const column = cellIndex === 0
    ? 10
    : Number(cellColumns[0] ?? 0) + 6;
  driver.sendMouse({ kind: 'press', column, row: panelRow, button: 'left' });
  driver.sendMouse({ kind: 'release', column, row: panelRow, button: 'left' });
  return HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.panelFocusedIndex === cellIndex,
  );
}

async function driveAnimatedTerminalTools(
  homeDirectory: string,
  settingsPath: string,
): Promise<void> {
  writeFileSync(
    settingsPath,
    JSON.stringify({
      agentSkipPermissions: true,
      agentTypingSpeed: 40,
      reducedMotion: false,
      terminalCleanPrompt: true,
    }),
  );
  const statusPath = join(homeDirectory, 'animated-status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: join(process.cwd(), 'fixtures'),
    columns: 140,
    rows: 42,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_AGENT_BACKEND: 'echo',
    },
  });
  const stagedPath = join(homeDirectory, 'staged-proof.txt');
  const injectionPath = join(homeDirectory, 'injection-proof.txt');
  const queuedPath = join(homeDirectory, 'queued-proof.txt');
  const animatedPath = join(homeDirectory, 'animated-proof.txt');

  try {
    await HarnessSmoke.Class.awaitStatus(driver, statusPath, (status) => status.ready === true);

    console.log('== harness terminal-stage: clean themed prompt and live header ==');
    driver.sendKeys('F8');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      (status) => status.panelActiveContent === 'terminal'
        && status.terminalFocused === true,
    );
    let snapshot = await driver.awaitSnapshot(
      (candidate) => candidate.textRows().some(
        (rowText) => /[^@\s]+@[^:\s]+:.*fixtures/.test(rowText),
      ) && snapshotHasPromptColor(candidate, 0x7aa2f7),
      15_000,
    );
    HarnessSmoke.Class.requireCondition(
      snapshotHasPromptColor(snapshot, 0x7aa2f7),
      'minimal $ prompt foreground equals the terminalPrompt palette role',
    );
    HarnessSmoke.Class.pass('header shows user@host:path from shell metadata');

    driver.sendText('cd /tmp');
    driver.sendKeys('Enter');
    snapshot = await driver.awaitSnapshot(
      (candidate) => candidate.textRows().some(
        (rowText) => /[^@\s]+@[^:\s]+:\/tmp/.test(rowText),
      ),
    );
    HarnessSmoke.Class.requireCondition(
      snapshot.textRows().some((rowText) => /[^@\s]+@[^:\s]+:\/tmp/.test(rowText)),
      'header updates live after cd',
    );

    console.log('== harness terminal-stage: echo backend lists provider tools ==');
    driver.sendRawInput('\x1b[27;6;97~');
    await driver.awaitSnapshot((candidate) => candidate.findText('Ask Claude') !== null);
    driver.sendText('terminal-tools:list');
    driver.sendKeys('Enter');
    snapshot = await driver.awaitSnapshot(
      (candidate) => candidate.findText('runTerminalCommand') !== null
        && candidate.findText('Invar sanitizes the full command') !== null,
    );
    HarnessSmoke.Class.requireCondition(
      snapshot.findText('runTerminalCommand') !== null
        && snapshot.findText('Invar sanitizes the full command') !== null,
      'echo backend renders both registered tool manuals in bypass mode',
    );

    console.log('== harness terminal-stage: staged command is inert until human Enter ==');
    driver.sendText(`terminal-tools:stage:printf STAGED > ${stagedPath}`);
    driver.sendKeys('Enter');
    const splitStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      (status) => Array.isArray(status.panelCellIds)
        && status.panelCellIds.join(',') === 'agent,terminal'
        && status.panelFocusedIndex === 1,
    );
    const leftPaneColumns = Number((splitStatus.panelCellColumns as number[])[0] ?? 0);
    snapshot = await driver.awaitSnapshot(
      (candidate) => rightPaneText(candidate, leftPaneColumns).includes('printf STAGED'),
      15_000,
    );
    HarnessSmoke.Class.requireCondition(
      !existsSync(stagedPath),
      'staged bytes appear at the prompt and do not execute',
    );
    driver.sendKeys('Enter');
    await awaitFileContents(stagedPath, 'STAGED');
    HarnessSmoke.Class.pass('human Enter executes the staged readline buffer');

    console.log('== harness terminal-stage: newline injection is stripped before the first byte ==');
    await focusPanelCell(driver, statusPath, 0);
    driver.sendText(
      `terminal-tools:stage:printf SAFE\\ntouch ${injectionPath}`,
    );
    driver.sendKeys('Enter');
    snapshot = await driver.awaitSnapshot(
      (candidate) => rightPaneText(candidate, leftPaneColumns).includes('printf SAFEtouch'),
    );
    HarnessSmoke.Class.requireCondition(
      !existsSync(injectionPath)
        && !rightPaneText(snapshot, leftPaneColumns).includes('printf SAFE\ntouch'),
      'embedded newline is stripped and neither command executes',
    );
    driver.sendKeys('Control+c');
    await driver.awaitSnapshot(
      (candidate) => candidate.findText('^C') !== null,
    );

    console.log('== harness terminal-stage: user input blocks and queues agent typing ==');
    driver.sendText('printf USER_BUSY');
    await driver.awaitSnapshot(
      (candidate) => rightPaneText(candidate, leftPaneColumns).includes('printf USER_BUSY'),
    );
    await focusPanelCell(driver, statusPath, 0);
    driver.sendText(`terminal-tools:stage:printf QUEUED > ${queuedPath}`);
    driver.sendKeys('Enter');
    snapshot = await driver.awaitSnapshot(
      (candidate) => candidate.findText('terminal command pending') !== null,
    );
    HarnessSmoke.Class.requireCondition(
      rightPaneText(snapshot, leftPaneColumns).includes('printf USER_BUSY')
        && !existsSync(queuedPath),
      'agent command queues while the user owns a non-empty readline buffer',
    );
    driver.sendKeys('Control+c');
    await driver.awaitSnapshot(
      (candidate) => rightPaneText(candidate, leftPaneColumns).includes('printf QUEUED'),
    );
    HarnessSmoke.Class.pass('queued command types only after the user releases the prompt');
    driver.sendKeys('Enter');
    await awaitFileContents(queuedPath, 'QUEUED');

    console.log('== harness terminal-stage: animated run exposes intermediate partial states ==');
    await focusPanelCell(driver, statusPath, 0);
    const animatedCommand = `printf ANIMATED_RUN > ${animatedPath} # human cadence proof xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`;
    driver.sendText(`terminal-tools:run:${animatedCommand}`);
    driver.sendKeys('Enter');
    snapshot = await driver.awaitSnapshot((candidate) => {
      const terminalText = rightPaneText(candidate, leftPaneColumns);
      return terminalText.includes('printf ANI') && !terminalText.includes(animatedCommand);
    });
    HarnessSmoke.Class.requireCondition(
      rightPaneText(snapshot, leftPaneColumns).includes('printf ANI')
        && !rightPaneText(snapshot, leftPaneColumns).includes(animatedCommand),
      'animated run paints an intermediate partial command',
    );
    await awaitFileContents(animatedPath, 'ANIMATED_RUN');
    await driver.awaitSnapshot(
      (candidate) => rightPaneText(candidate, leftPaneColumns).includes('ANIMATED_RUN'),
    );
    HarnessSmoke.Class.pass('runTerminalCommand sends Enter after the full visible command');

    driver.sendKeys('Control+q');
    HarnessSmoke.Class.requireCondition(await driver.exitCode() === 0, 'animated drive quits cleanly');
  } finally {
    await driver.dispose();
  }
}

async function driveReducedMotion(
  homeDirectory: string,
  settingsPath: string,
): Promise<void> {
  writeFileSync(
    settingsPath,
    JSON.stringify({
      agentSkipPermissions: true,
      agentTypingSpeed: 10,
      reducedMotion: true,
      terminalCleanPrompt: true,
    }),
  );
  const statusPath = join(homeDirectory, 'reduced-motion-status.json');
  const reducedMotionPath = join(homeDirectory, 'reduced-motion-proof.txt');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: join(process.cwd(), 'fixtures'),
    columns: 140,
    rows: 42,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_AGENT_BACKEND: 'echo',
    },
  });
  try {
    await HarnessSmoke.Class.awaitStatus(driver, statusPath, (status) => status.ready === true);
    driver.sendRawInput('\x1b[27;6;97~');
    await driver.awaitSnapshot((candidate) => candidate.findText('Ask Claude') !== null);
    const command = `printf INSTANT > ${reducedMotionPath} # ${'x'.repeat(120)}`;
    const startedMilliseconds = performance.now();
    driver.sendText(`terminal-tools:run:${command}`);
    driver.sendKeys('Enter');
    await awaitFileContents(reducedMotionPath, 'INSTANT');
    const elapsedMilliseconds = performance.now() - startedMilliseconds;
    HarnessSmoke.Class.requireCondition(
      elapsedMilliseconds < 1_000,
      `reducedMotion uses the instant path (${elapsedMilliseconds.toFixed(0)} ms)`,
    );
    driver.sendKeys('Control+q');
  } finally {
    await driver.dispose();
  }
}

const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-terminal-stage-harness-home-'));
const settingsDirectory = join(homeDirectory, '.config', 'invar');
const settingsPath = join(settingsDirectory, 'settings.json');
mkdirSync(settingsDirectory, { recursive: true });

try {
  await driveAnimatedTerminalTools(homeDirectory, settingsPath);
  await driveReducedMotion(homeDirectory, settingsPath);
  console.log('smoke-terminal-stage-harness: ALL-PASS');
} finally {
  rmSync(homeDirectory, { recursive: true, force: true });
}
