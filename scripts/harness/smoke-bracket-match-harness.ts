#!/usr/bin/env bun
// Byte-level bracket-match port: the balanced braces are located and styled from emulator cells.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  markerForeground,
  pass,
  requireCondition,
  requireEqual,
  runGit,
  statusField,
} from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';

const unitResult = Bun.spawnSync(
  [process.execPath, 'test', 'src/modules/editor/BracketMatch.test.ts'],
  { stdout: 'pipe', stderr: 'pipe' },
);
requireCondition(unitResult.exitCode === 0, 'bracket unit tests pass');

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-bracket-match-harness-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-bracket-match-harness-home-'));
const statusPath = join(fixtureRoot, 'status.json');
await Bun.write(join(fixtureRoot, 'sample.ts'), 'function f()\n{\n  return 1;\n}\n');
runGit(fixtureRoot, ['init', '-q']);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== harness bracket match: quick-open the TypeScript fixture ==');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('sample.ts') !== null, 15_000);
  driver.sendKeys('Control+p');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('Go to File') !== null);
  driver.sendText('sample');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('sample.ts') !== null);
  driver.sendKeys('Enter');
  let snapshot = await driver.awaitSnapshot((candidate) => candidate.findText('function f()') !== null);
  driver.sendKeys('Tab');
  await driver.awaitQuiescence();
  pass('sample.ts opened and editor focus received the arrow path');

  const baselineCloserForeground = markerForeground(snapshot, '}');
  console.log('== harness bracket match: cursor on opener recolours the balanced closer ==');
  driver.sendKeys('Down');
  snapshot = await driver.awaitSnapshot((candidate) => {
    const openerForeground = markerForeground(candidate, '{');
    const closerForeground = markerForeground(candidate, '}');
    return openerForeground !== null
      && closerForeground !== null
      && openerForeground === closerForeground
      && closerForeground !== baselineCloserForeground;
  });
  requireEqual(statusField<number>(statusPath, 'matchingBracketLine'), 3, 'matching line is 3');
  requireEqual(statusField<number>(statusPath, 'matchingBracketColumn'), 0, 'matching column is 0');
  requireCondition(
    markerForeground(snapshot, '{') === markerForeground(snapshot, '}'),
    'balanced brace cells share the accent foreground',
  );

  console.log('== harness bracket match: moving off clears the highlight ==');
  driver.sendKeys('Up');
  snapshot = await driver.awaitSnapshot(
    (candidate) => markerForeground(candidate, '}') === baselineCloserForeground,
  );
  requireEqual(
    statusField<number>(statusPath, 'matchingBracketLine'),
    -1,
    'no match is published away from a bracket',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-bracket-match-harness: ALL-PASS');
} finally {
  driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
