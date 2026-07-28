#!/usr/bin/env bun
// Byte-level port of smoke-quickopen: Ctrl+P, fuzzy input, and activation all cross the real PTY.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Quick Open activates the selected entry (src/modules/search/search.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-quickopen-harness-'));
const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-quickopen-harness-home-'),
);
const statusPath = join(homeDirectory, 'status.json');
HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);
for (const fileName of [
  'alpha.txt',
  'beta.txt',
  'gamma.txt',
  'TASK.md',
  'project.tasks.md',
]) {
  await Bun.write(join(fixtureRoot, fileName), 'x\n');
}
mkdirSync(join(fixtureRoot, 'src'));
await Bun.write(join(fixtureRoot, 'src', 'widget.txt'), 'content\n');

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== harness quick-open: Ctrl+P opens the modal ==');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('alpha.txt') !== null,
    15_000,
  );
  driver.sendKeys('Control+p');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Go to File') !== null,
  );
  HarnessSmoke.Class.pass('Ctrl+P opened the Go-to-File modal');

  console.log('== harness quick-open: fuzzy query opens the ranked file ==');
  driver.sendText('widget');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('src/widget.txt') !== null,
  );
  driver.sendKeys('Enter');
  const openedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: String(status.activeBuffer).endsWith('/src/widget.txt')",
    (status) => String(status.activeBuffer).endsWith('/src/widget.txt'),
  );
  HarnessSmoke.Class.pass(
    `Enter opened the fuzzy-matched file (${String(openedStatus.activeBuffer).split('/').at(-1)})`,
  );
  const openedSnapshot = await driver.awaitGridCondition(
    'the opened widget file content is visible in the emulator grid',
    (candidate) => candidate.findText('content') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    openedSnapshot.findText('content') !== null,
    'the opened file content is visible in the emulator grid',
  );

  console.log(
    '== harness quick-open: activation preserves selected identity ==',
  );
  driver.sendKeys('Control+p');
  await driver.awaitGridCondition(
    'Go to File to reopen for the confusable identity pair',
    (snapshot) => snapshot.findText('Go to File') !== null,
  );
  driver.sendText('TASK.md');
  const selectedPublication = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Quick Open to publish TASK.md selected beside project.tasks.md',
    (status) =>
      status.quickOpenOpen === true &&
      status.quickOpenQuery === 'TASK.md' &&
      status.quickOpenSelectedIdentifier === 'TASK.md',
  );
  await driver.awaitGridCondition(
    'the confusable project.tasks.md result to be visible beside TASK.md',
    (snapshot) =>
      snapshot.findText('TASK.md') !== null &&
      snapshot.findText('project.tasks.md') !== null,
  );
  const publishedSelectedIdentifier =
    selectedPublication.quickOpenSelectedIdentifier;
  HarnessSmoke.Class.requireCondition(
    typeof publishedSelectedIdentifier === 'string',
    'Quick Open published a selected path identity',
  );
  driver.sendKeys('Enter');
  const identityOpenedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the opened buffer to be the exact entry Quick Open published as selected',
    (status) =>
      status.activeBuffer ===
      join(fixtureRoot, String(publishedSelectedIdentifier)),
  );
  HarnessSmoke.Class.pass(
    'Enter opened the exact Quick Open entry published as selected ' +
      `(${String(identityOpenedStatus.activeBuffer)})`,
  );

  driver.sendKeys('Control+q');
  console.log('smoke-quickopen-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
