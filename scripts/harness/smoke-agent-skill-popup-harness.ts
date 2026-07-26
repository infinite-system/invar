#!/usr/bin/env bun
// Drives the real agent composer and popup through a PTY. Popup placement is
// asserted from the emulator grid, not from internal renderable coordinates.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

const repositoryRoot = process.cwd();
const workspaceRoot = mkdtempSync(
  join(tmpdir(), 'invar-agent-skill-workspace-'),
);
const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-agent-skill-home-'));
const statusPath = join(homeDirectory, 'status.json');
const settingsDirectory = join(homeDirectory, '.config', 'invar');
mkdirSync(settingsDirectory, { recursive: true });
await Bun.write(
  join(settingsDirectory, 'settings.json'),
  '{"glyphMode":"unicode"}\n',
);
await Bun.write(
  join(workspaceRoot, '.claude', 'skills', 'ivue', 'SKILL.md'),
  '---\ndescription: reactive substrate\n---\nUse ivue.',
);
await Bun.write(
  join(workspaceRoot, '.claude', 'skills', 'invariants', 'SKILL.md'),
  '---\ndescription: contract discipline\n---\nCheck invariants.',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot,
  repositoryRoot,
  columns: 100,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    INVAR_AGENT_BACKEND: 'echo',
  },
});

try {
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the app is ready',
    (status) => status.ready === true,
    20_000,
  );
  driver.sendRawInput('\x1b[27;6;97~');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the agent pane is focused',
    (status) =>
      status.panelActiveContent === 'agent' && status.terminalFocused === true,
  );
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Ask Claude') !== null,
  );
  await driver.awaitQuiescence();

  console.log('== skill popup: live prefix filtering and dropup ==');
  driver.sendText('/i');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the slash token lists both matching skills',
    (status) =>
      status.agentSkillPopupOpen === true &&
      Array.isArray(status.agentSkillPopupItemIdentifiers) &&
      status.agentSkillPopupItemIdentifiers.length === 2,
  );
  HarnessSmoke.Class.pass('typing a slash token opens the skill popup');

  driver.sendText('v');
  const filteredStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the /iv prefix filters to ivue',
    (status) =>
      status.agentSkillPopupOpen === true &&
      JSON.stringify(status.agentSkillPopupItemIdentifiers) === '["ivue"]',
  );
  HarnessSmoke.Class.requireCondition(
    (
      filteredStatus.agentSkillPopupGeometry as {
        opensUpward?: boolean;
      }
    )?.opensUpward === true,
    'available-row geometry chooses upward placement',
  );
  const dropupSnapshot = await driver.awaitSnapshot(
    (snapshot) =>
      snapshot.findText('/ivue') !== null &&
      snapshot.findText('❯ /iv') !== null,
  );
  const skillRow = dropupSnapshot.findText('/ivue')?.row ?? -1;
  const composerRow = dropupSnapshot.findText('❯ /iv')?.row ?? -1;
  HarnessSmoke.Class.requireCondition(
    skillRow >= 0 && composerRow >= 0 && skillRow < composerRow,
    'the emulator grid places the skill list above the composer',
  );

  driver.sendKeys('Down', 'Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Down and Enter accept ivue and close the popup',
    (status) => status.agentSkillPopupOpen === false,
  );
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('❯ /ivue') !== null,
  );
  HarnessSmoke.Class.pass('Down and Enter insert the selected invocation');

  console.log('== skill popup: Escape preserves text ==');
  driver.sendKeys(
    'Backspace',
    'Backspace',
    'Backspace',
    'Backspace',
    'Backspace',
    'Backspace',
  );
  driver.sendText('/iv');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the popup reopens for the Escape path',
    (status) => status.agentSkillPopupOpen === true,
  );
  driver.sendRawInput('\x1b[27;1;27~');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Escape dismisses the popup',
    (status) => status.agentSkillPopupOpen === false,
  );
  await driver.awaitSnapshot((snapshot) => snapshot.findText('❯ /iv') !== null);
  HarnessSmoke.Class.pass('Escape leaves the typed slash prefix intact');

  console.log('== skill popup: token boundary ==');
  driver.sendKeys('Backspace', 'Backspace', 'Backspace');
  driver.sendText('word/iv');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('❯ word/iv') !== null,
  );
  const nonTriggerStatus = HarnessSmoke.Class.readStatus(statusPath);
  HarnessSmoke.Class.requireCondition(
    nonTriggerStatus.agentSkillPopupOpen === false,
    'a mid-word slash does not trigger the popup',
  );

  driver.sendKeys(
    'Backspace',
    'Backspace',
    'Backspace',
    'Backspace',
    'Backspace',
    'Backspace',
    'Backspace',
  );
  driver.sendText('word /iv');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'a slash after whitespace starts a token',
    (status) => status.agentSkillPopupOpen === true,
  );
  HarnessSmoke.Class.pass('a whitespace token boundary triggers the popup');

  driver.sendRawInput('\x1b[27;1;27~');
  driver.sendKeys('Control+q');
  console.log('smoke-agent-skill-popup-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  await HarnessSmoke.Class.removeTemporaryDirectory(workspaceRoot);
}
