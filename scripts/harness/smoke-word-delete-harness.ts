#!/usr/bin/env bun
// Byte-level delete-previous-word port across editor and find-bar inputs.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  awaitStatusPublication,
  pass,
  requireCondition,
  statusField,
} from './HarnessSmokeSupport';
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
  await awaitStatusPublication(
    statusPath,
    'the word-delete editor publishes editor focus',
    (status) => status.focus === 'editor',
  );
  const activeBufferStatus = await awaitStatusPublication(
    statusPath,
    'the opened word-delete buffer is published',
    (status) => typeof status.activeBuffer === 'string',
  );
  const activeBufferBefore = activeBufferStatus.activeBuffer;
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
  // Status publication and frame completion are separate authorities (harness.invariants.md):
  // wait on BOTH the rendered text and the semantic cursor before asserting either.
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('hello ') !== null
      && candidate.findText('world') === null,
  );
  await awaitStatusPublication(
    statusPath,
    'Alt+Delete keeps the active buffer open with the cursor after hello',
    (status) => status.activeBuffer === activeBufferBefore
      && (status.cursor as { col?: number } | undefined)?.col === 6,
  );
  pass('Alt+Delete kept the active buffer open');
  pass('Alt+Delete leaves the cursor after hello and its trailing space');
  await driver.assertNoCompleteFrameEmittedFor(300);
  driver.sendRawInputWithoutFrameExpectation('\x1b\x7f');
  // Wait on the RENDERED cursor too — the status file can publish before the repaint lands.
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.cursorColumn === helloPosition.column
      && candidate.cursorRow === helloPosition.row,
  );
  await awaitStatusPublication(
    statusPath,
    'repeated word delete publishes a cursor at line start',
    (status) => (status.cursor as { col?: number } | undefined)?.col === 0,
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
