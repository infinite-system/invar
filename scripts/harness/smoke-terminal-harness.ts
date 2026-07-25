#!/usr/bin/env bun
// Byte-level port of the integrated-terminal smoke: Invar owns a nested shell PTY inside the
// harness PTY, and the production emulator remains the screen oracle for the full round trip.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

function terminalSizePattern(rows: number, columns: number): RegExp {
  return new RegExp(`(?:^|\\D)${rows} ${columns}(?:\\D|$)`);
}

const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-terminal-harness-home-'));
const statusPath = join(homeDirectory, 'status.json');
const settingsDirectory = join(homeDirectory, '.config', 'invar');
mkdirSync(settingsDirectory, { recursive: true });
await Bun.write(join(settingsDirectory, 'settings.json'), '{"glyphMode":"unicode"}\n');

console.log('== harness terminal: deterministic emulator and panel tests ==');
const unitResult = Bun.spawnSync(
  [process.execPath, 'test', 'src/modules/terminal/', 'src/modules/ui/PanelHost.test.ts'],
  { cwd: process.cwd(), stdout: 'pipe', stderr: 'pipe' },
);
HarnessSmoke.Class.requireCondition(
  unitResult.exitCode === 0,
  'terminal core and PanelHost unit tests',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: join(process.cwd(), 'fixtures'),
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== harness terminal: status-bar button toggles the nested terminal ==');
  const bootStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.ready === true,
    15_000,
  );
  HarnessSmoke.Class.requireCondition(
    bootStatus.terminalVisible === false,
    'terminal is hidden at boot',
  );
  await driver.awaitQuiescence();
  const statusBarRow = Number(bootStatus.height) - 1;
  const terminalButtonStart = driver.snapshot().rowText(statusBarRow).lastIndexOf(' ❯ ');
  HarnessSmoke.Class.requireCondition(
    terminalButtonStart >= 0,
    'terminal status affordance is visibly present',
  );
  const terminalButtonColumn = terminalButtonStart + 1;
  driver.sendMouse({
    kind: 'press',
    column: terminalButtonColumn,
    row: statusBarRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: terminalButtonColumn,
    row: statusBarRow,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.terminalVisible === true,
  );
  HarnessSmoke.Class.pass('status-bar terminal button opens the panel');
  driver.sendMouse({
    kind: 'press',
    column: terminalButtonColumn,
    row: statusBarRow,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: terminalButtonColumn,
    row: statusBarRow,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.terminalVisible === false,
  );
  HarnessSmoke.Class.pass('second status-bar click hides the panel');

  console.log('== harness terminal: F8 opens and focuses the real nested shell ==');
  driver.sendKeys('F8');
  const openedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => status.terminalVisible === true
      && status.terminalFocused === true
      && status.panelActiveContent === 'terminal'
      && Number(status.terminalColumns) > 0
      && Number(status.terminalRows) > 0,
  );
  HarnessSmoke.Class.pass('F8 opened and focused the terminal content');
  const initialColumns = Number(openedStatus.terminalColumns);
  const initialRows = Number(openedStatus.terminalRows);
  const initialChildColumns = initialColumns - 4;
  const initialChildRows = initialRows - 2;

  driver.sendText('stty size');
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.textRows().some(
      (rowText) => terminalSizePattern(initialChildRows, initialChildColumns).test(rowText),
    ),
    15_000,
  );
  HarnessSmoke.Class.pass(
    `nested shell sees padded pane size ${initialChildRows} ${initialChildColumns}`,
  );

  driver.sendText('tty');
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.textRows().some(
      (rowText) => /\/dev\/(?:pts\/|tty)/.test(rowText),
    ),
  );
  HarnessSmoke.Class.pass('nested shell reports a real tty');

  driver.sendText('echo hello');
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.textRows().some(
      (rowText) => rowText.replace(/^[\s│|╎]+|[\s│|╎]+$/g, '') === 'hello',
    ),
  );
  HarnessSmoke.Class.pass('shell output completed the nested PTY round trip');

  console.log('== harness terminal: divider drag resizes the nested child PTY ==');
  const splitterRegions = openedStatus.splitterRegions as
    | Record<string, { left: number; top: number; width: number }>
    | undefined;
  const bottomPanelSplitter = splitterRegions?.bottomPanel;
  if (!bottomPanelSplitter) throw new Error('Missing bottom-panel splitter region');
  const dividerRow = bottomPanelSplitter.top;
  const dividerTargetRow = dividerRow - 6;
  const dividerColumn =
    bottomPanelSplitter.left + Math.floor(bottomPanelSplitter.width / 2);
  driver.sendMouse({ kind: 'press', column: dividerColumn, row: dividerRow, button: 'left' });
  driver.sendMouse({ kind: 'move', column: dividerColumn, row: dividerTargetRow, button: 'left' });
  driver.sendMouse({ kind: 'release', column: dividerColumn, row: dividerTargetRow, button: 'left' });
  const resizedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    (status) => Number(status.terminalRows) > initialRows,
  );
  const resizedColumns = Number(resizedStatus.terminalColumns);
  const resizedRows = Number(resizedStatus.terminalRows);
  HarnessSmoke.Class.pass(`divider grew terminal rows ${initialRows} to ${resizedRows}`);
  driver.sendText('stty size');
  driver.sendKeys('Enter');
  const resizedSizePattern = terminalSizePattern(resizedRows - 2, resizedColumns - 4);
  await driver.awaitSnapshot(
    (snapshot) => snapshot.textRows().some((rowText) => resizedSizePattern.test(rowText)),
  );
  HarnessSmoke.Class.pass('nested shell reflowed to the resized padded geometry');

  const clockSnapshot = await driver.awaitGridCondition(
    'the status-bar minute clock renders as HH MM',
    (candidate) => candidate.textRows().some(
      (rowText) => /[0-2][0-9]:[0-5][0-9]/.test(rowText),
    ),
  );
  HarnessSmoke.Class.requireCondition(
    clockSnapshot.textRows().some((rowText) => /[0-2][0-9]:[0-5][0-9]/.test(rowText)),
    'status-bar minute clock renders HH:MM',
  );
  await HarnessSmoke.Class.awaitFrameSilence(driver);
  await driver.assertAtMostOneCompleteFrameEmittedFor(4_000);
  HarnessSmoke.Class.pass('terminal-open idle window emits at most the minute-clock frame');
  HarnessSmoke.Class.requireCondition(
    HarnessSmoke.Class.readStatus(statusPath).terminalFocused === true,
    'terminal remains focused before quit',
  );

  driver.sendKeys('Control+q');
  HarnessSmoke.Class.requireCondition(await driver.exitCode() === 0, 'Ctrl+Q quits from the terminal');
  const exitedSnapshot = await driver.awaitGridCondition(
    'the application screen is absent after quit',
    (candidate) => !candidate.textRows().some((rowText) => /Files/.test(rowText)),
  );
  HarnessSmoke.Class.requireCondition(
    !exitedSnapshot.textRows().some((rowText) => /Files/.test(rowText)),
    'the application screen is gone after quit',
  );
  console.log('smoke-terminal-harness: ALL-PASS');
} finally {
  driver.dispose();
  rmSync(homeDirectory, { recursive: true, force: true });
}
