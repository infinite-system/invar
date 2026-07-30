#!/usr/bin/env bun
// Byte-level port of comment styling across JSDoc, slicing, find, wrap, and Vue SFC regions.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  awaitStatusPublication,
  markerForeground,
  pass,
  requireCondition,
  statusField,
} from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';
import { HarnessSmoke } from './HarnessSmoke';
import { ThemePalettes } from '../../src/modules/theme/ThemePalettes';

const fixtureRoot = mkdtempSync(join(tmpdir(), 'tui-comment-styling-harness-'));

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-comment-styling-harness-home-'),
);

const statusPath = join(fixtureRoot, 'status.json');

const filler =
  'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike';

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

await Bun.write(
  join(fixtureRoot, 'component.vue'),
  [
    '<script setup lang="ts">',
    'const typedValue: number = 42; // script-comment',
    '</script>',
    '<template><button @click="typedValue++">{{ typedValue }}</button></template>',
    '<style>.card { color: #aabbcc; /* css-comment */ }</style>',
    '<style scoped lang="scss">',
    '$tone: red; .card { &__title { color: $tone; } // scss-comment }',
    '</style>',
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
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('comment.ts') !== null,
    15_000,
  );
  driver.sendKeys('Enter');
  let snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('leadcomment') !== null,
  );
  driver.sendKeys('Right');
  await driver.awaitScreenChange();
  await awaitStatusPublication(
    statusPath,
    'comment.ts has editor focus',
    (status) => status.focus === 'editor',
  );
  pass('comment.ts opened with the editor focused');

  console.log(
    '== harness comment styling: JSDoc middle lines use the comment foreground ==',
  );
  // AWAIT THE MARKERS, and read the snapshot that PROVED them. Two defects were stacked here: the
  // preceding waits observe FOCUS, while this claim reads SYNTAX MARKERS that arrive from an async
  // highlight pass — and the three reads below used a `snapshot` captured BEFORE those waits ran, so
  // they sampled a frame older than the state they assert. Under gate load the markers had not painted
  // into that stale frame and the claim failed hard (it passed solo on a quiet machine).
  snapshot = await driver.awaitGridCondition(
    'the comment, code, and JSDoc markers are painted',
    (candidate) =>
      markerForeground(candidate, 'leadcomment') !== null &&
      markerForeground(candidate, 'answer') !== null &&
      markerForeground(candidate, 'docmid') !== null,
  );
  const commentForeground = markerForeground(snapshot, 'leadcomment');
  const codeForeground = markerForeground(snapshot, 'answer');
  const documentationForeground = markerForeground(snapshot, 'docmid');
  requireCondition(
    commentForeground !== null &&
      codeForeground !== null &&
      documentationForeground !== null,
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

  console.log(
    '== harness comment styling: horizontal slices preserve comment colour ==',
  );
  driver.sendKeys('End');
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('hscrollcomment') !== null &&
      candidate.findText('hscrolldoc') !== null,
  );
  await awaitStatusPublication(
    statusPath,
    'the editor publishes a positive horizontal scroll offset',
    (status) => Number(status.editorScrollLeft) > 0,
  );
  pass('horizontal scroll moved right');
  requireCondition(
    markerForeground(snapshot, 'hscrollcomment') === commentForeground,
    'horizontally sliced line-comment tail keeps comment foreground',
  );
  requireCondition(
    markerForeground(snapshot, 'hscrolldoc') === commentForeground,
    'horizontally sliced JSDoc tail keeps comment foreground',
  );

  console.log(
    '== harness comment styling: find boundary keeps the sliced tail colour ==',
  );
  driver.sendKeys('Control+f');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('Find') !== null,
  );
  await awaitStatusPublication(
    statusPath,
    'Find is published as open',
    (status) => status.findOpen === true,
  );
  let findQuery = '';
  for (const character of 'findmatch') {
    findQuery += character;
    driver.sendRawInputWithoutFrameExpectation(character);
    await awaitStatusPublication(
      statusPath,
      `the Find query publishes ${findQuery}`,
      (status) => status.findQuery === findQuery,
    );
  }
  await awaitStatusPublication(
    statusPath,
    'the horizontal comment Find query publishes one match',
    (status) => status.findMatchCount === 1,
  );
  pass('horizontal comment find query has exactly one match');
  driver.sendRawInputWithoutFrameExpectation('\x1b');
  await awaitStatusPublication(
    statusPath,
    'Find is published as closed',
    (status) => status.findOpen === false,
  );
  driver.sendKeys('End');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('afterfind') !== null,
  );
  requireCondition(
    markerForeground(snapshot, 'afterfind') === commentForeground,
    'post-find segment keeps comment foreground under horizontal scroll',
  );

  console.log(
    '== harness comment styling: wrap continuations keep comment colour ==',
  );
  driver.sendKeys('Alt+z');
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('zebramarker') !== null &&
      candidate.findText('docmid') !== null,
  );
  await awaitStatusPublication(
    statusPath,
    'word wrap is published as enabled',
    (status) => status.wordWrap === true,
  );
  pass('word wrap mode is enabled');
  const wrappedCommentForeground = markerForeground(snapshot, 'leadcomment');
  requireCondition(
    markerForeground(snapshot, 'zebramarker') === wrappedCommentForeground,
    'wrapped line-comment continuation keeps comment foreground',
  );
  requireCondition(
    markerForeground(snapshot, 'docmid') === wrappedCommentForeground,
    'JSDoc middle line keeps comment foreground in wrap mode',
  );

  console.log(
    '== harness comment styling: Vue SFC regions use their declared tokenizers ==',
  );
  driver.sendKeys('Control+p');
  await awaitStatusPublication(
    statusPath,
    'Go to File opens before the Vue syntax drive',
    (status) => status.quickOpenOpen === true,
  );
  driver.sendText('component.vue');
  await awaitStatusPublication(
    statusPath,
    'Go to File finds the Vue fixture',
    (status) =>
      status.quickOpenQuery === 'component.vue' &&
      Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  snapshot = await driver.awaitGridCondition(
    'the Vue script, template, CSS, and SCSS markers paint',
    (candidate) =>
      candidate.findText('script-comment') !== null &&
      candidate.findText('@click') !== null &&
      candidate.findText('css-comment') !== null &&
      candidate.findText('scss-comment') !== null,
  );
  await awaitStatusPublication(
    statusPath,
    'the Vue fixture is the active buffer',
    (status) => String(status.activeBuffer).endsWith('/component.vue'),
  );
  const palette = ThemePalettes.Class.DARK;
  const packed = (color: string): number => Number.parseInt(color.slice(1), 16);
  requireCondition(
    markerForeground(snapshot, 'const typedValue') === packed(palette.keyword),
    'script setup uses the TypeScript keyword foreground',
  );
  requireCondition(
    markerForeground(snapshot, 'script-comment') === packed(palette.comment),
    'script setup uses the TypeScript comment foreground',
  );
  requireCondition(
    markerForeground(snapshot, '@click') === packed(palette.keyword),
    'template directives keep the Vue HTML foreground',
  );
  requireCondition(
    markerForeground(snapshot, 'color: #aabbcc') === packed(palette.keyword) &&
      markerForeground(snapshot, '#aabbcc') === packed(palette.number) &&
      markerForeground(snapshot, 'css-comment') === packed(palette.comment),
    'style content uses CSS property, color, and comment foregrounds',
  );
  requireCondition(
    markerForeground(snapshot, '&__title') === packed(palette.operator) &&
      markerForeground(snapshot, 'scss-comment') === packed(palette.comment),
    'SCSS nesting and line comments use the SCSS source',
  );

  driver.sendKeys('Control+Shift+x');
  await awaitStatusPublication(
    statusPath,
    'Extensions opens before Vue withdrawal',
    (status) =>
      status.sidebarView === 'extensions' && status.focus === 'extensions',
  );
  driver.sendKeysWithoutFrameExpectation(
    ...Array.from({ length: 20 }, () => 'Up'),
  );
  await driver.awaitGridCondition(
    'the Extensions selection is anchored before Vue withdrawal',
    (candidate) => candidate.findText('› [x] File Tree') !== null,
  );
  for (
    let selectionStep = 0;
    selectionStep < 20 && driver.snapshot().findText('› [x] Vue') === null;
    selectionStep += 1
  ) {
    driver.sendKeys('Down');
    await driver.awaitScreenChange();
  }
  await driver.awaitGridCondition(
    'Vue is selected in Extensions',
    (candidate) => candidate.findText('› [x] Vue') !== null,
  );
  driver.sendKeys('Space');
  await driver.awaitGridCondition(
    'Vue is withdrawn',
    (candidate) => candidate.findText('› [ ] Vue') !== null,
  );
  driver.sendKeys('Control+Shift+j');
  snapshot = await driver.awaitGridCondition(
    'Vue withdrawal repaints the active SFC as plain text',
    (candidate) =>
      candidate.findText('script-comment') !== null &&
      markerForeground(candidate, 'const typedValue') === packed(palette.fg) &&
      markerForeground(candidate, 'script-comment') === packed(palette.fg) &&
      markerForeground(candidate, '@click') === packed(palette.fg),
  );
  requireCondition(
    markerForeground(snapshot, 'scss-comment') === packed(palette.fg),
    'Vue withdrawal removes SCSS syntax with no dangling source',
  );

  driver.sendKeys('Control+Shift+x');
  await driver.awaitGridCondition(
    'the disabled Vue row remains selected',
    (candidate) => candidate.findText('› [ ] Vue') !== null,
  );
  driver.sendKeys('Space');
  await driver.awaitGridCondition(
    'Vue reinstalls',
    (candidate) => candidate.findText('› [x] Vue') !== null,
  );
  driver.sendKeys('Control+Shift+j');
  snapshot = await driver.awaitGridCondition(
    'Vue reinstall restores block syntax',
    (candidate) =>
      markerForeground(candidate, 'const typedValue') ===
        packed(palette.keyword) &&
      markerForeground(candidate, 'scss-comment') === packed(palette.comment),
  );
  requireCondition(
    markerForeground(snapshot, '@click') === packed(palette.keyword),
    'Vue reinstall restores the same template syntax source',
  );

  driver.sendKeys('Control+q');
  console.log('smoke-comment-styling-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
