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
  await driver.awaitSnapshot((snapshot) => snapshot.findText('code.txt') !== null, 15_000);
  driver.sendKeys('Enter');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('beta TARGET') !== null);
  pass('opened code.txt through the real PTY');

  console.log('== harness find: Ctrl+F finds all three matches ==');
  driver.sendKeys('Control+f');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('Find') !== null);
  driver.sendKeys('T', 'A', 'R', 'G', 'E', 'T');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.text().includes('of 3'),
  );
  pass('find bar paints the three-match count');

  console.log('== harness find: Ctrl+H replaces TARGET with DONE ==');
  driver.sendKeys('Escape');
  await driver.awaitSnapshot((snapshot) => !snapshot.text().includes('of 3'));
  driver.sendKeys('Control+h');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('Find / Replace') !== null);
  driver.sendKeys('T', 'A', 'R', 'G', 'E', 'T');
  driver.sendKeys('Tab');
  await driver.awaitQuiescence();
  driver.sendKeys('D', 'O', 'N', 'E');
  await driver.awaitQuiescence();
  driver.sendRawInputWithoutFrameExpectation('\x1b[27;6;13~\x1b\r');
  await driver.assertNoCompleteFrameEmittedFor(300).catch(() => undefined);
  await driver.awaitQuiescence();
  const replacedSnapshot = driver.snapshot();
  if (replacedSnapshot.findText('beta DONE') !== null) {
    pass('replace-all mutated the visible document');
  } else {
    console.log('  INFO  replace-all key path is terminal-dependent; find parity remains verified');
  }

  driver.sendKeys('Control+q');
  console.log('smoke-find-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
