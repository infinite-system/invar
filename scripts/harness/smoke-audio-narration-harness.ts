#!/usr/bin/env bun
// Byte-level port of audio narration: isolated settings drive the off/on applied effect, the mock TTS
// keeps the run silent, and explicit Escape barge-in is distinguished from ordinary typing.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function runNarrationUnitTests(repositoryRoot: string): void {
  const result = Bun.spawnSync([process.execPath, 'test', 'src/modules/narration/'], {
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  HarnessSmoke.Class.requireCondition(
    result.exitCode === 0,
    'narration projection unit tests pass',
  );
}

async function writeNarrationSetting(
  settingsPath: string,
  isEnabled: boolean,
): Promise<void> {
  await Bun.write(
    settingsPath,
    JSON.stringify({ agentAudioNarration: isEnabled }, null, 2),
  );
}

function createDriver(
  repositoryRoot: string,
  homeDirectory: string,
  statusPath: string,
): PtyTestDriver.Model {
  return new PtyTestDriver.Class({
    workspaceRoot: join(repositoryRoot, 'fixtures'),
    repositoryRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_AGENT_BACKEND: 'echo',
      INVAR_TTS_BACKEND: 'mock',
    },
  });
}

async function driveTurn(
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
    (status) => status.agentBusy === false,
  );
  await driver.awaitSnapshot((snapshot) => snapshot.findText('You said') !== null);
}

const repositoryRoot = process.cwd();
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-audio-narration-harness-home-'));
const settingsDirectory = join(homeDirectory, '.config', 'invar');
const settingsPath = join(settingsDirectory, 'settings.json');
mkdirSync(settingsDirectory, { recursive: true });

console.log('== harness audio narration: deterministic projection tests ==');
runNarrationUnitTests(repositoryRoot);

let driver: PtyTestDriver.Model | null = null;
try {
  console.log('== harness audio narration: disabled setting speaks nothing ==');
  await writeNarrationSetting(settingsPath, false);
  const disabledStatusPath = join(homeDirectory, 'disabled-status.json');
  driver = createDriver(repositoryRoot, homeDirectory, disabledStatusPath);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    disabledStatusPath,
    (status) => status.ready === true,
    20_000,
  );
  HarnessSmoke.Class.requireCondition(
    HarnessSmoke.Class.readStatus(disabledStatusPath).narrationEnabled === false,
    'narration is disabled at boot',
  );
  driver.sendRawInput('\x1b[27;6;97~');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    disabledStatusPath,
    (status) => status.panelActiveContent === 'agent',
  );
  await driveTurn(driver, disabledStatusPath, 'hello narration');
  const disabledStatus = HarnessSmoke.Class.readStatus(disabledStatusPath);
  HarnessSmoke.Class.requireCondition(
    disabledStatus.narrationSpokenCount === 0
      && disabledStatus.narrationLastSpoken === '',
    'disabled narration completes the turn without speaking',
  );

  console.log('== harness audio narration: enabled setting speaks and supports barge-in ==');
  driver.dispose();
  driver = null;
  await writeNarrationSetting(settingsPath, true);
  const enabledStatusPath = join(homeDirectory, 'enabled-status.json');
  driver = createDriver(repositoryRoot, homeDirectory, enabledStatusPath);
  await HarnessSmoke.Class.awaitStatus(
    driver,
    enabledStatusPath,
    (status) => status.ready === true,
    20_000,
  );
  HarnessSmoke.Class.requireCondition(
    HarnessSmoke.Class.readStatus(enabledStatusPath).narrationEnabled === true,
    'narration setting is applied at boot',
  );
  driver.sendRawInput('\x1b[27;6;97~');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    enabledStatusPath,
    (status) => status.panelActiveContent === 'agent',
  );
  await driveTurn(driver, enabledStatusPath, 'speak this reply');
  let enabledStatus = HarnessSmoke.Class.readStatus(enabledStatusPath);
  HarnessSmoke.Class.requireCondition(
    Number(enabledStatus.narrationSpokenCount) > 0
      && String(enabledStatus.narrationLastSpoken).includes('You said'),
    'enabled narration speaks the assistant transcript turn',
  );

  const bargeInCountBeforeTyping = Number(enabledStatus.narrationBargeInCount);
  driver.sendText('x');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('❯ x') !== null);
  enabledStatus = HarnessSmoke.Class.readStatus(enabledStatusPath);
  HarnessSmoke.Class.requireCondition(
    Number(enabledStatus.narrationBargeInCount) === bargeInCountBeforeTyping,
    'ordinary typing does not barge in',
  );
  driver.sendKeysWithoutFrameExpectation('Escape');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    enabledStatusPath,
    (status) => Number(status.narrationBargeInCount) > bargeInCountBeforeTyping,
  );
  HarnessSmoke.Class.pass('Escape explicitly barges in on narration');

  await HarnessSmoke.Class.awaitFrameSilence(driver);
  await driver.assertAtMostOneCompleteFrameEmittedFor(4_000);
  HarnessSmoke.Class.pass('narration-enabled agent pane remains idle-quiescent');
  driver.sendKeys('Control+q');
  console.log('smoke-audio-narration-harness: ALL-PASS');
} finally {
  driver?.dispose();
  rmSync(homeDirectory, { recursive: true, force: true });
}
