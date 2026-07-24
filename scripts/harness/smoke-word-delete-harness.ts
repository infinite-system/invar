#!/usr/bin/env bun
// Byte-level delete-previous-word port across editor and find-bar inputs.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pass, requireCondition, statusField } from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';

function findQueryRow(textRows: readonly string[]): string {
  return textRows.find(
    (rowText) => rowText.includes('no results') || /\d+ of \d+/.test(rowText),
  ) ?? '';
}

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-word-delete-harness-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-word-delete-harness-home-'));
const statusPath = join(fixtureRoot, 'status.json');
await Bun.write(join(fixtureRoot, 'word-delete.txt'), '');

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== harness word delete: open an empty editor buffer ==');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('word-delete.txt') !== null, 15_000);
  driver.sendKeys('Enter');
  await driver.awaitSnapshot((snapshot) => snapshot.text().includes('word-delete.txt'));
  driver.sendRawInputWithoutFrameExpectation('\x1b[C');
  await driver.awaitSnapshot(
    () => statusField<string>(statusPath, 'focus') === 'editor',
  );
  const activeBufferBefore = statusField<string>(statusPath, 'activeBuffer');
  requireCondition(Boolean(activeBufferBefore), 'opened word-delete.txt');

  console.log('== harness word delete: Option+Backspace deletes the previous word ==');
  driver.sendText('hello world');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('hello world') !== null);
  driver.sendRawInput('\x1b\x7f');
  let snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('hello ') !== null
      && candidate.findText('world') === null,
  );
  const helloPosition = snapshot.findText('hello ');
  requireCondition(
    helloPosition !== null
      && snapshot.cursorColumn === helloPosition.column + 6
      && snapshot.cursorRow === helloPosition.row,
    'Option+Backspace leaves the caret after hello and its trailing space',
  );

  console.log('== harness word delete: Alt+Delete uses the same action and keeps the file open ==');
  driver.sendText('world');
  await driver.awaitSnapshot((candidate) => candidate.findText('hello world') !== null);
  driver.sendRawInput('\x1b[3;3~');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('hello ') !== null
      && candidate.findText('world') === null,
  );
  requireCondition(
    statusField<string>(statusPath, 'activeBuffer') === activeBufferBefore,
    'Alt+Delete kept the active buffer open',
  );
  requireCondition(
    statusField<{ col?: number }>(statusPath, 'cursor')?.col === 6,
    'Alt+Delete leaves the cursor after hello and its trailing space',
  );
  await driver.assertNoCompleteFrameEmittedFor(300);
  driver.sendRawInputWithoutFrameExpectation('\x1b\x7f');
  snapshot = await driver.awaitSnapshot(
    () => statusField<{ col?: number }>(statusPath, 'cursor')?.col === 0,
  );
  requireCondition(
    snapshot.cursorColumn === helloPosition.column
      && snapshot.cursorRow === helloPosition.row,
    'repeating word delete removed whitespace plus hello and returned the caret to line start',
  );

  console.log('== harness word delete: punctuation is a distinct run ==');
  driver.sendText('foo...');
  await driver.awaitSnapshot((candidate) => candidate.findText('foo...') !== null);
  driver.sendRawInput('\x1b\x7f');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('foo') !== null
      && candidate.findText('foo...') === null,
  );
  const fooPosition = snapshot.findText('foo');
  requireCondition(
    fooPosition !== null && snapshot.cursorColumn === fooPosition.column + 3,
    'punctuation run deletes without deleting the word',
  );
  driver.sendRawInput('\x1b[3;3~');
  await driver.awaitSnapshot((candidate) => candidate.findText('foo') === null);

  console.log('== harness word delete: find query shares the previous-word boundary ==');
  driver.sendKeys('Control+f');
  await driver.awaitSnapshot((candidate) => candidate.findText('Find') !== null);
  driver.sendText('foo bar');
  await driver.awaitSnapshot((candidate) => findQueryRow(candidate.textRows()).includes('foo bar'));
  driver.sendRawInput('\x1b\x7f');
  snapshot = await driver.awaitSnapshot((candidate) => {
    const queryRow = findQueryRow(candidate.textRows());
    return queryRow.includes('foo') && !queryRow.includes('bar');
  });
  requireCondition(
    findQueryRow(snapshot.textRows()).includes('foo'),
    'find query changed foo bar to foo and a trailing space',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-word-delete-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
