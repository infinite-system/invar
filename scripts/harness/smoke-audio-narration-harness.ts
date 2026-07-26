#!/usr/bin/env bun
// Byte-level port of audio narration: isolated settings drive the off/on applied effect, the mock TTS
// keeps the run silent, and explicit Escape barge-in is distinguished from ordinary typing.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function runNarrationUnitTests(repositoryRoot: string): void {
  const result = Bun.spawnSync(
    [process.execPath, 'test', 'src/modules/narration/'],
    {
      cwd: repositoryRoot,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  );
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
    // 160 columns: the full-height left dock (layout model default) narrows the bottom-panel
    // composer, and driveTurn's echo wait needs the longest prompt to fit on one rendered line.
    columns: 160,
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
    'status condition: status.agentBusy === false',
    (status) => status.agentBusy === false,
  );
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('You said') !== null,
  );
}

const repositoryRoot = process.cwd();
const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-audio-narration-harness-home-'),
);
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
    'the application is ready with narration disabled',
    (status) => status.ready === true && status.narrationEnabled === false,
    20_000,
  );
  HarnessSmoke.Class.pass('narration is disabled at boot');
  driver.sendRawInput('\x1b[27;6;97~');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    disabledStatusPath,
    "status condition: status.panelActiveContent === 'agent'",
    (status) => status.panelActiveContent === 'agent',
  );
  await driveTurn(driver, disabledStatusPath, 'hello narration');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    disabledStatusPath,
    'disabled narration completes the turn without speaking',
    (status) =>
      status.narrationSpokenCount === 0 && status.narrationLastSpoken === '',
  );
  HarnessSmoke.Class.pass(
    'disabled narration completes the turn without speaking',
  );

  console.log(
    '== harness audio narration: enabled setting speaks and supports barge-in ==',
  );
  await driver.dispose();
  driver = null;
  await writeNarrationSetting(settingsPath, true);
  const enabledStatusPath = join(homeDirectory, 'enabled-status.json');
  driver = createDriver(repositoryRoot, homeDirectory, enabledStatusPath);
  const narrationEnabledDriver = driver;
  await HarnessSmoke.Class.awaitStatus(
    driver,
    enabledStatusPath,
    'the application is ready with narration enabled',
    (status) => status.ready === true && status.narrationEnabled === true,
    20_000,
  );
  HarnessSmoke.Class.pass('narration setting is applied at boot');
  driver.sendRawInput('\x1b[27;6;97~');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    enabledStatusPath,
    "status condition: status.panelActiveContent === 'agent'",
    (status) => status.panelActiveContent === 'agent',
  );
  const inlineCodePrompt =
    '**`alpha``beta`** and [`linkCode`](https://example.com) then `INLINE_CODE_PLACEHOLDER_0`';
  await driveTurn(driver, enabledStatusPath, inlineCodePrompt);
  let enabledStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    enabledStatusPath,
    'enabled narration publishes sanitized hostile inline-code speech',
    (status) =>
      Number(status.narrationSpokenCount) > 0 &&
      String(status.narrationLastSpoken).includes(
        'alphabeta and linkCode then INLINE_CODE_PLACEHOLDER_0',
      ) &&
      !String(status.narrationLastSpoken).includes('`') &&
      !/[\uE000-\uF8FF]/u.test(String(status.narrationLastSpoken)),
  );
  const narrationLastSpoken = String(enabledStatus.narrationLastSpoken);
  HarnessSmoke.Class.requireCondition(
    Number(enabledStatus.narrationSpokenCount) > 0 &&
      narrationLastSpoken.includes(
        'alphabeta and linkCode then INLINE_CODE_PLACEHOLDER_0',
      ) &&
      !narrationLastSpoken.includes('`') &&
      !/[\uE000-\uF8FF]/u.test(narrationLastSpoken),
    'enabled narration speaks hostile inline-code shapes with no internal tokens',
  );

  const bargeInCountBeforeTyping = Number(enabledStatus.narrationBargeInCount);
  const preTypingSnapshot = driver.snapshot();
  const typedSnapshot = await driver.assertContentInvariantAcrossAction({
    invariantRegion: {
      startRow: 1,
      endRowExclusive: Math.floor(preTypingSnapshot.rows / 2),
      startColumn: 0,
      endColumnExclusive: preTypingSnapshot.columns,
    },
    changedRegion: {
      startRow: preTypingSnapshot.rows - 7,
      endRowExclusive: preTypingSnapshot.rows - 1,
      startColumn: 0,
      endColumnExclusive: preTypingSnapshot.columns,
    },
    actionDescription:
      'ordinary typing changes only the composer while the transcript stays fixed',
    performAction: () => narrationEnabledDriver.sendText('x'),
  });
  HarnessSmoke.Class.requireCondition(
    typedSnapshot.findText('❯ x') !== null,
    'ordinary typing paints x in the composer',
  );
  enabledStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    enabledStatusPath,
    'ordinary typing preserves the narration barge-in count',
    (status) =>
      Number(status.narrationBargeInCount) === bargeInCountBeforeTyping,
  );
  HarnessSmoke.Class.requireCondition(
    Number(enabledStatus.narrationBargeInCount) === bargeInCountBeforeTyping,
    'ordinary typing does not barge in',
  );
  driver.sendKeysWithoutFrameExpectation('Escape');
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    enabledStatusPath,
    'status condition: Number(status.narrationBargeInCount) > bargeInCountBeforeTyping',
    (status) => Number(status.narrationBargeInCount) > bargeInCountBeforeTyping,
  );
  HarnessSmoke.Class.pass('Escape explicitly barges in on narration');

  driver.sendKeys('Control+q');
  console.log('smoke-audio-narration-harness: ALL-PASS');
} finally {
  await driver?.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
