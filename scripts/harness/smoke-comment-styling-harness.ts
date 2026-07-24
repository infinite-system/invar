#!/usr/bin/env bun
// Byte-level port of comment styling across JSDoc, horizontal slicing, find boundaries, and wrap.
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
  statusField,
} from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-comment-styling-harness-'));
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-comment-styling-harness-home-'));
const statusPath = join(fixtureRoot, 'status.json');
const filler = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike';
await Bun.write(
  join(fixtureRoot, 'comment.ts'),
  [
    `// leadcomment ${filler} ${filler} tail hscrollcomment zebramarker end`,
    '/**',
    ` * docmid ${filler} ${filler} tail hscrolldoc end`,
    ' */',
    'export const answer = 42;',
    `// ${filler} ${filler} tail findmatch afterfind end`,
    '',
  ].join('\n'),
);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== harness comment styling: open the TypeScript fixture ==');
  await driver.awaitSnapshot((snapshot) => snapshot.findText('comment.ts') !== null, 15_000);
  driver.sendKeys('Enter');
  let snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('leadcomment') !== null,
  );
  driver.sendKeys('Right');
  await driver.awaitQuiescence();
  requireCondition(
    statusField<string>(statusPath, 'focus') === 'editor',
    'comment.ts opened with the editor focused',
  );

  console.log('== harness comment styling: JSDoc middle lines use the comment foreground ==');
  const commentForeground = markerForeground(snapshot, 'leadcomment');
  const codeForeground = markerForeground(snapshot, 'answer');
  const documentationForeground = markerForeground(snapshot, 'docmid');
  requireCondition(
    commentForeground !== null
      && codeForeground !== null
      && documentationForeground !== null,
    'comment, code, and JSDoc markers are visible',
  );
  requireCondition(
    commentForeground !== codeForeground,
    'comment foreground differs from the code control',
  );
  requireCondition(
    documentationForeground === commentForeground,
    'JSDoc middle line foreground equals line-comment foreground',
  );

  console.log('== harness comment styling: horizontal slices preserve comment colour ==');
  driver.sendKeys('End');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('hscrollcomment') !== null
      && candidate.findText('hscrolldoc') !== null,
  );
  requireCondition(
    (statusField<number>(statusPath, 'editorScrollLeft') ?? 0) > 0,
    'horizontal scroll moved right',
  );
  requireCondition(
    markerForeground(snapshot, 'hscrollcomment') === commentForeground,
    'horizontally sliced line-comment tail keeps comment foreground',
  );
  requireCondition(
    markerForeground(snapshot, 'hscrolldoc') === commentForeground,
    'horizontally sliced JSDoc tail keeps comment foreground',
  );

  console.log('== harness comment styling: find boundary keeps the sliced tail colour ==');
  driver.sendKeys('Control+f');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('Find') !== null
      && statusField<boolean>(statusPath, 'findOpen') === true,
  );
  let findQuery = '';
  for (const character of 'findmatch') {
    findQuery += character;
    driver.sendRawInputWithoutFrameExpectation(character);
    await driver.awaitSnapshot(
      () => statusField<string>(statusPath, 'findQuery') === findQuery,
    );
  }
  requireCondition(
    statusField<number>(statusPath, 'findMatchCount') === 1,
    'horizontal comment find query has exactly one match',
  );
  driver.sendRawInputWithoutFrameExpectation('\x1b');
  await driver.awaitSnapshot(
    () => statusField<boolean>(statusPath, 'findOpen') === false,
  );
  driver.sendKeys('End');
  snapshot = await driver.awaitSnapshot((candidate) => candidate.findText('afterfind') !== null);
  requireCondition(
    markerForeground(snapshot, 'afterfind') === commentForeground,
    'post-find segment keeps comment foreground under horizontal scroll',
  );

  console.log('== harness comment styling: wrap continuations keep comment colour ==');
  driver.sendKeys('Alt+z');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('zebramarker') !== null
      && candidate.findText('docmid') !== null,
  );
  requireCondition(
    statusField<boolean>(statusPath, 'wordWrap') === true,
    'word wrap mode is enabled',
  );
  const wrappedCommentForeground = markerForeground(snapshot, 'leadcomment');
  requireCondition(
    markerForeground(snapshot, 'zebramarker') === wrappedCommentForeground,
    'wrapped line-comment continuation keeps comment foreground',
  );
  requireCondition(
    markerForeground(snapshot, 'docmid') === wrappedCommentForeground,
    'JSDoc middle line keeps comment foreground in wrap mode',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-comment-styling-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(fixtureRoot, { recursive: true, force: true });
  rmSync(homeDirectory, { recursive: true, force: true });
}
