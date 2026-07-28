#!/usr/bin/env bun
// Automatic task presentation preserves the editor's keyboard ownership. A
// deliberately focused task pane keeps non-reserved chords and still yields
// reserved frame chords to the host.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Folder open starts declared tasks (src/modules/tasks/tasks.invariants.md)
// invariant: Focus owns the keystroke (src/modules/keybindings/keybindings.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

const workspaceRoot = mkdtempSync(
  join(tmpdir(), 'invar-reserved-chord-workspace-'),
);
const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-reserved-chord-home-'));
const statusPath = join(homeDirectory, 'status.json');
mkdirSync(join(workspaceRoot, '.invar'));
await Bun.write(join(workspaceRoot, 'small.txt'), 'small\n');
await Bun.write(
  join(workspaceRoot, '.invar', 'tasks.json'),
  `${JSON.stringify(
    {
      version: '2.0.0',
      tasks: [
        {
          label: 'Reserved Chord Task',
          type: 'shell',
          command: '/bin/sh',
          args: ['-lc', "printf 'RESERVED-CHORD-TASK\\n'; exec /bin/sh -i"],
          presentation: {
            panel: 'dedicated',
          },
          runOptions: {
            runOn: 'folderOpen',
          },
        },
      ],
    },
    null,
    2,
  )}\n`,
);
HarnessSmoke.Class.runGit(workspaceRoot, ['init', '--quiet']);

const driver = new PtyTestDriver.Class({
  workspaceRoot,
  columns: 100,
  rows: 30,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_TEST_SUPPRESS_BUILT_IN_TASK: '0',
  },
});

async function awaitStatus(
  description: string,
  predicate: (status: StatusSnapshot) => boolean,
): Promise<StatusSnapshot> {
  return HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    description,
    predicate,
  );
}

try {
  console.log(
    [
      '== harness reserved chord: folder-open output does not take',
      'editor focus ==',
    ].join(' '),
  );
  let snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('small.txt') !== null &&
      candidate.findText('RESERVED-CHORD-TASK') !== null,
  );
  driver.sendKeys('Control+p');
  await awaitStatus(
    'Ctrl+P opens Quick Open before query input',
    (candidate) => candidate.quickOpenOpen === true,
  );
  driver.sendText('small');
  await awaitStatus(
    'Quick Open receives the typed small query',
    (candidate) => candidate.quickOpenQuery === 'small',
  );
  try {
    await awaitStatus(
      [
        'Quick Open enumerates and selects small.txt',
        '(requires ripgrep or a Git repository)',
      ].join(' '),
      (candidate) =>
        String(candidate.quickOpenSelectedIdentifier).endsWith('small.txt'),
    );
  } catch (error) {
    const failedSelectionStatus = HarnessSmoke.Class.readStatus(statusPath);
    throw new Error(
      [
        String(error),
        'Published state:',
        `quickOpenQuery=${JSON.stringify(
          failedSelectionStatus.quickOpenQuery,
        )};`,
        `quickOpenSelectedIdentifier=${JSON.stringify(
          failedSelectionStatus.quickOpenSelectedIdentifier,
        )}`,
      ].join(' '),
    );
  }
  driver.sendKeys('Enter');
  const openedFileStatus = await awaitStatus(
    'activating the selected file closes Quick Open',
    (candidate) => candidate.quickOpenOpen === false,
  );
  HarnessSmoke.Class.requireCondition(
    String(openedFileStatus.activeBuffer).endsWith('/small.txt'),
    'Quick Open activates small.txt',
  );
  driver.sendKeys('Control+Shift+j');
  const editorStatus = await awaitStatus(
    'the editor-focus command transfers workspace focus',
    (candidate) => candidate.focus === 'editor',
  );
  HarnessSmoke.Class.requireCondition(
    String(editorStatus.activeBuffer).endsWith('/small.txt'),
    'the editor-focus command retains small.txt as the active buffer',
  );
  HarnessSmoke.Class.requireCondition(
    editorStatus.terminalFocused === false,
    'automatic task presentation stays visible without claiming the editor keyboard',
  );

  console.log(
    '== harness reserved chord: Ctrl+, reaches Settings from the editor ==',
  );
  driver.sendKeys('Control+,');
  await awaitStatus(
    'Ctrl+, opens Settings while the editor owns the keyboard',
    (candidate) => candidate.settingsOpen === true,
  );
  HarnessSmoke.Class.pass('Ctrl+, reaches the Settings handler');
  driver.sendKeys('Escape');
  await awaitStatus(
    'Escape closes Settings before the focused-panel boundary check',
    (candidate) => candidate.settingsOpen === false,
  );

  console.log(
    [
      '== harness reserved chord: focused panels keep non-reserved keys',
      'but not reserved frame chords ==',
    ].join(' '),
  );
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('RESERVED-CHORD-TASK') !== null,
  );
  HarnessSmoke.Class.clickText(driver, snapshot, 'RESERVED-CHORD-TASK');
  await awaitStatus(
    'clicking the task terminal gives the bottom panel keyboard focus',
    (candidate) => candidate.terminalFocused === true,
  );
  driver.sendKeysWithoutFrameExpectation('Control+,');
  driver.sendKeys('Control+Alt+b');
  const reservedChordStatus = await awaitStatus(
    'reserved Ctrl+Alt+B opens the right dock from the focused bottom panel',
    (candidate) => candidate.rightDockVisible === true,
  );
  HarnessSmoke.Class.requireCondition(
    reservedChordStatus.settingsOpen === false,
    'focused task content keeps surface-scoped Ctrl+, while reserved Ctrl+Alt+B reaches the host',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-reserved-chord-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(workspaceRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
