#!/usr/bin/env bun
// Byte-level port of transcript search: both triggers drive the shared FindBar, and match projection,
// viewport following, highlight backgrounds, focus return, and idle behavior are observed at the PTY.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function runProjectionUnitTests(repositoryRoot: string): void {
  const result = Bun.spawnSync([
    process.execPath,
    'test',
    'src/modules/agent/AgentTranscriptSearch.test.ts',
  ], {
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  HarnessSmoke.Class.requireCondition(
    result.exitCode === 0,
    'transcript-search projection unit tests pass',
  );
}

async function sendTurn(
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
}

function visibleNeedleBackgroundCounts(
  snapshot: HarnessSnapshot.Model,
): { current: number; other: number } {
  let current = 0;
  let other = 0;
  for (let row = 0; row < snapshot.rows; row++) {
    const needleColumn = snapshot.rowText(row).indexOf('needle');
    if (needleColumn < 0) continue;
    const cell = snapshot.cell(row, needleColumn);
    if (!cell?.isBackgroundRgb) continue;
    if (cell.background === 0x2b2f41) current++;
    if (cell.background === 0x1e202e) other++;
  }
  return { current, other };
}

const repositoryRoot = process.cwd();
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-agent-search-harness-home-'));
mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
await Bun.write(
  join(homeDirectory, '.config', 'invar', 'settings.json'),
  JSON.stringify({ glyphMode: 'unicode' }),
);
const statusPath = join(homeDirectory, 'status.json');

console.log('== harness agent search: deterministic projection tests ==');
runProjectionUnitTests(repositoryRoot);

const driver = new PtyTestDriver.Class({
  workspaceRoot: join(repositoryRoot, 'fixtures'),
  repositoryRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    COLORTERM: 'truecolor',
    INVAR_AGENT_BACKEND: 'echo',
  },
});

try {
  console.log('== harness agent search: seed a multi-turn transcript ==');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.ready === true,
    20_000,
  );
  driver.sendRawInput('\x1b[27;6;97~');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('Ask Claude') !== null);
  await sendTurn(driver, statusPath, 'alpha needle one');
  for (
    const fillerTurn of [
      'filler two',
      'filler three',
      'filler four',
      'filler five',
      'filler six',
    ]
  ) {
    await sendTurn(driver, statusPath, fillerTurn);
  }
  await sendTurn(driver, statusPath, 'omega needle last');
  HarnessSmoke.Class.requireCondition(
    HarnessSmoke.Class.readStatus(statusPath).agentStuckToBottom === true,
    'transcript is tail-anchored after seeding',
  );

  console.log('== harness agent search: click the themed search icon ==');
  let snapshot = driver.snapshot();
  const searchIconPosition = snapshot.findText('⌕');
  HarnessSmoke.Class.requireCondition(
    searchIconPosition !== null
      && snapshot.rowText(searchIconPosition.row).includes('engine:'),
    'themed search icon paints in the engine mode line',
  );
  if (!searchIconPosition) throw new Error('Search icon disappeared');
  driver.sendMouse({
    kind: 'press',
    column: searchIconPosition.column,
    row: searchIconPosition.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: searchIconPosition.column,
    row: searchIconPosition.row,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.findOpen === true && status.findTarget === 'agent-transcript',
  );
  HarnessSmoke.Class.pass('mouse icon opens the shared transcript FindBar');

  driver.sendText('needle');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('1 of 4') !== null,
  );
  let status = HarnessSmoke.Class.readStatus(statusPath);
  HarnessSmoke.Class.requireCondition(
    status.findQuery === 'needle'
      && status.findMatchCount === 4
      && status.agentStuckToBottom === false
      && status.agentScrollTop === 0,
    'live query finds four transcript matches and reveals the first at the top',
  );

  console.log('== harness agent search: Ctrl+F reopens the same retained target ==');
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.findOpen === false,
  );
  driver.sendKeys('Control+f');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.findOpen === true
      && candidate.findTarget === 'agent-transcript'
      && candidate.findQuery === 'needle'
      && candidate.findMatchCount === 4,
  );
  snapshot = await driver.awaitGridCondition(
    'the retained transcript search paints its current and other matches',
    (candidate) => {
      const candidateBackgroundCounts = visibleNeedleBackgroundCounts(candidate);
      return candidateBackgroundCounts.current >= 1
        && candidateBackgroundCounts.other >= 1;
    },
  );
  const backgroundCounts = visibleNeedleBackgroundCounts(snapshot);
  HarnessSmoke.Class.requireCondition(
    backgroundCounts.current >= 1 && backgroundCounts.other >= 1,
    'current and other transcript matches paint selection and find-match RGB backgrounds',
  );

  console.log('== harness agent search: Enter cycles and follows the far match ==');
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.findCurrentMatchIndex === 1,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.findCurrentMatchIndex === 2,
  );
  driver.sendKeys('Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.findCurrentMatchIndex === 3
      && Number(candidate.agentScrollTop) > 0,
  );
  snapshot = await driver.awaitGridCondition(
    'the final transcript search match is visible',
    (candidate) => candidate.findText('omega needle last') !== null,
  );
  status = HarnessSmoke.Class.readStatus(statusPath);
  HarnessSmoke.Class.requireCondition(
    status.findCurrentMatchIndex === 3 && Number(status.agentScrollTop) > 0,
    'cycling reaches the last match and moves the viewport',
  );

  console.log('== harness agent search: idle, focus return, and icon reopen ==');
  await HarnessSmoke.Class.awaitFrameSilence(driver);
  await driver.assertAtMostOneCompleteFrameEmittedFor(4_000);
  HarnessSmoke.Class.pass('open transcript FindBar remains idle-quiescent');
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.findOpen === false,
  );
  driver.sendText('after esc');
  await driver.awaitSnapshot((candidate) => candidate.findText('❯ after esc') !== null);
  HarnessSmoke.Class.pass('Escape returns typing to the composer');

  driver.sendMouse({
    kind: 'press',
    column: searchIconPosition.column,
    row: searchIconPosition.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: searchIconPosition.column,
    row: searchIconPosition.row,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (candidate) => candidate.findOpen === true
      && candidate.findQuery === 'needle'
      && candidate.findMatchCount === 4,
  );
  HarnessSmoke.Class.pass('icon reopen retains and re-derives the transcript query');

  driver.sendKeys('Control+q');
  console.log('smoke-agent-search-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(homeDirectory, { recursive: true, force: true });
}
