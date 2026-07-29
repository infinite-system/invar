#!/usr/bin/env bun
// Byte-level port of smoke-find: the real Ctrl+F / Ctrl+H paths are driven through the PTY and the
// match count plus document mutation are read from the terminal-emulator grid.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pass } from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';
import { HarnessSmoke } from './HarnessSmoke';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-find-harness-'));

const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-find-harness-home-'));

await Bun.write(
  join(fixtureRoot, 'code.txt'),
  'alpha\nbeta TARGET\ngamma\ndelta TARGET here\nepsilon TARGET end\n',
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
});

try {
  console.log('== harness find: launch and open the file ==');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('code.txt') !== null,
    15_000,
  );
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('beta TARGET') !== null,
  );
  pass('opened code.txt through the real PTY');

  console.log('== harness find: Ctrl+F finds all three matches ==');
  driver.sendKeys('Control+f');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('Find') !== null);
  driver.sendKeys('T', 'A', 'R', 'G', 'E', 'T');
  await driver.awaitSnapshot((snapshot) => snapshot.text().includes('of 3'));
  pass('find bar paints the three-match count');

  console.log('== harness find: Ctrl+H opens replace mode ==');
  driver.sendKeys('Escape');
  await driver.awaitSnapshot((snapshot) => !snapshot.text().includes('of 3'));
  driver.sendKeys('Control+h');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Find / Replace') !== null,
  );
  pass('Ctrl+H paints the Find / Replace interface');
  driver.sendRawInputWithoutFrameExpectation('\x1b');
  await driver.awaitGridCondition(
    'Escape closes the Find / Replace interface',
    (candidate) => candidate.findText('Find / Replace') === null,
  );

  driver.sendKeys('Control+q');
  console.log('smoke-find-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
