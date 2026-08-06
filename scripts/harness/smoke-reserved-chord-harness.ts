#!/usr/bin/env bun
// Automatic task presentation preserves the editor's keyboard ownership. A
// focused terminal or agent keeps pane-owned chords and yields only reserved
// or application-global frame chords to the host.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Folder open starts declared tasks (src/modules/tasks/tasks.invariants.md)
// invariant: Focus owns the keystroke (src/modules/keybindings/keybindings.invariants.md)
// invariant: A focused panel routes keystrokes to its active pane content (src/modules/ui/ui.invariants.md)
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
    INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS: '0',
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
    editorStatus.panelFocused === false,
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
    '== harness global chord: focused Files opens the folder picker ==',
  );
  driver.sendKeys('Control+Shift+e');
  await awaitStatus(
    'Ctrl+Shift+E transfers focus to Files',
    (candidate) => candidate.focus === 'files',
  );
  driver.sendKeys('Control+Shift+o');
  await awaitStatus(
    'Ctrl+Shift+O opens the folder picker while Files owns focus',
    (candidate) =>
      candidate.quickOpenOpen === true &&
      candidate.quickOpenMode === 'workspacePath',
  );
  HarnessSmoke.Class.pass(
    'Ctrl+Shift+O opens the folder picker from focused Files',
  );
  driver.sendKeys('Escape');
  await awaitStatus(
    'Escape closes the folder picker before the focused-panel checks',
    (candidate) => candidate.quickOpenOpen === false,
  );
  driver.sendKeys('Control+Shift+j');
  await awaitStatus(
    'the editor regains focus before the focused-panel checks',
    (candidate) => candidate.focus === 'editor',
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
    (candidate) => candidate.panelFocused === true,
  );
  const terminalControlPFrame = Number(
    HarnessSmoke.Class.readStatus(statusPath).frame,
  );
  driver.sendKeys('Control+p');
  await awaitStatus(
    'the terminal consumes Ctrl+P without opening Quick Open',
    (candidate) =>
      Number(candidate.frame) > terminalControlPFrame &&
      candidate.quickOpenOpen === false,
  );
  HarnessSmoke.Class.pass('Ctrl+P stays with the focused terminal');

  console.log(
    '== harness application-global chord: focused terminal opens Extensions ==',
  );
  driver.sendKeys('Control+Shift+x');
  await awaitStatus(
    'Ctrl+Shift+X opens Extensions from the focused task terminal',
    (candidate) => candidate.focus === 'extensions',
  );
  HarnessSmoke.Class.pass(
    'Ctrl+Shift+X opens Extensions from the focused task terminal',
  );

  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('RESERVED-CHORD-TASK') !== null,
  );
  HarnessSmoke.Class.clickText(driver, snapshot, 'RESERVED-CHORD-TASK');
  await awaitStatus(
    'the task terminal regains focus before the agent check',
    (candidate) => candidate.panelFocused === true,
  );
  driver.sendKeys('Control+Shift+a');
  await awaitStatus(
    'Ctrl+Shift+A opens and focuses the agent pane',
    (candidate) =>
      candidate.panelFocused === true &&
      candidate.panelActiveContentKind === 'agent',
  );
  const agentControlPFrame = Number(
    HarnessSmoke.Class.readStatus(statusPath).frame,
  );
  driver.sendKeys('Control+p');
  await awaitStatus(
    'the agent consumes Ctrl+P without opening Quick Open',
    (candidate) =>
      Number(candidate.frame) > agentControlPFrame &&
      candidate.quickOpenOpen === false,
  );
  HarnessSmoke.Class.pass('Ctrl+P stays with the focused agent');
  driver.sendKeys('Control+Shift+x');
  await awaitStatus(
    'Ctrl+Shift+X opens Extensions from the focused agent pane',
    (candidate) => candidate.focus === 'extensions',
  );
  HarnessSmoke.Class.pass(
    'Ctrl+Shift+X opens Extensions from the focused agent pane',
  );

  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('Ask Claude') !== null,
  );
  HarnessSmoke.Class.clickText(driver, snapshot, 'Ask Claude');
  await awaitStatus(
    'the agent pane regains focus before the reserved chord check',
    (candidate) =>
      candidate.panelFocused === true &&
      candidate.panelActiveContentKind === 'agent',
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
