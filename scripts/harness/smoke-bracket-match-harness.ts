#!/usr/bin/env bun
// Byte-level bracket-match port: the balanced braces are located and styled from emulator cells.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  awaitStatusPublication,
  markerForeground,
  pass,
  requireCondition,
  runGit,
} from './HarnessSmokeSupport';
import { GraphClient } from './GraphClient';
import { PtyTestDriver } from './PtyTestDriver';
import { HarnessSmoke } from './HarnessSmoke';

const unitResult = Bun.spawnSync(
  [process.execPath, 'test', 'src/modules/editor/BracketMatch.test.ts'],
  { stdout: 'pipe', stderr: 'pipe' },
);

requireCondition(unitResult.exitCode === 0, 'bracket unit tests pass');

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-bracket-match-harness-'));

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-bracket-match-harness-home-'),
);

const statusPath = join(fixtureRoot, 'status.json');

await Bun.write(
  join(fixtureRoot, 'sample.ts'),
  'function f()\n{\n  return 1;\n}\n',
);

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
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('sample.ts') !== null,
    15_000,
  );
  driver.sendKeys('Control+p');
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('Go to File') !== null,
  );
  driver.sendText('sample');
  await GraphClient.Class.awaitValue(statusPath, 'quickOpen.query', 'sample');
  await GraphClient.Class.awaitValue(
    statusPath,
    'quickOpen.matches.0.path',
    'sample.ts',
  );
  driver.sendKeys('Enter');
  let snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('function f()') !== null,
  );
  driver.sendKeys('Tab');
  await awaitStatusPublication(
    statusPath,
    'sample.ts has editor focus before the arrow-key path',
    (status) => status.focus === 'editor',
  );
  pass('sample.ts opened and editor focus received the arrow path');

  const baselineCloserForeground = markerForeground(snapshot, '}');
  console.log(
    '== harness bracket match: cursor on opener recolours the balanced closer ==',
  );
  driver.sendKeys('Down');
  snapshot = await driver.awaitSnapshot((candidate) => {
    const openerForeground = markerForeground(candidate, '{');
    const closerForeground = markerForeground(candidate, '}');
    return (
      openerForeground !== null &&
      closerForeground !== null &&
      openerForeground === closerForeground &&
      closerForeground !== baselineCloserForeground
    );
  });
  await awaitStatusPublication(
    statusPath,
    'the balanced closer position is published',
    (status) =>
      status.matchingBracketLine === 3 && status.matchingBracketColumn === 0,
  );
  pass('matching line is 3');
  pass('matching column is 0');
  requireCondition(
    markerForeground(snapshot, '{') === markerForeground(snapshot, '}'),
    'balanced brace cells share the accent foreground',
  );

  console.log('== harness bracket match: moving off clears the highlight ==');
  driver.sendKeys('Up');
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      markerForeground(candidate, '}') === baselineCloserForeground,
  );
  await awaitStatusPublication(
    statusPath,
    'no bracket match is published away from a bracket',
    (status) => status.matchingBracketLine === -1,
  );
  pass('no match is published away from a bracket');

  driver.sendKeys('Control+q');
  console.log('smoke-bracket-match-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
