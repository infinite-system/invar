#!/usr/bin/env bun
// Horizontal-extent acceptance drive: open the real regression file through Invar, move to its
// widest line, and prove Alt-wheel can reveal that line's true end through the PTY byte stream.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Synchronized end markers bound complete frames (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  awaitStatusPublication,
  pass,
  requireCondition,
} from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';
import { HarnessSmoke } from './HarnessSmoke';

const repositoryRoot = process.cwd();

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-horizontal-extent-harness-home-'),
);

const statusPath = join(homeDirectory, 'status.json');

const regressionFileName = 'JpegDecoder.test.ts';

const openingViewportTail = "jpeg-js's own encoder (deterministic,";

const widestLineMarker = 'contract shape: dims plus rgba';

const widestLineTail = "length width*height*4', () => {";

const driver = new PtyTestDriver.Class({
  workspaceRoot: repositoryRoot,
  repositoryRoot,
  columns: 120,
  rows: 32,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== harness horizontal extent: open the real regression file ==');
  await awaitStatusPublication(
    statusPath,
    'the application is ready for horizontal extent verification',
    (status) => status.ready === true,
    60_000,
  );
  driver.sendKeys('Control+p');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('Go to File') !== null,
  );
  driver.sendText(regressionFileName);
  await awaitStatusPublication(
    statusPath,
    `Quick Open resolves ${regressionFileName} before it is accepted`,
    (status) =>
      status.quickOpenQuery === regressionFileName &&
      Number(status.quickOpenMatches) > 0,
  );
  driver.sendKeys('Enter');
  await awaitStatusPublication(
    statusPath,
    `the active buffer is src/modules/image/${regressionFileName}`,
    (status) =>
      String(status.activeBuffer).endsWith(
        `/src/modules/image/${regressionFileName}`,
      ),
    15_000,
  );
  pass(`opened src/modules/image/${regressionFileName}`);
  const openingSnapshot = await driver.awaitGridCondition(
    `${regressionFileName} is rendered before horizontal input`,
    (candidate) => candidate.findText(regressionFileName) !== null,
  );
  const filesHeadingPosition = openingSnapshot.findText('Files');
  requireCondition(
    filesHeadingPosition !== null,
    'the Files heading is visible before horizontal input',
  );
  requireCondition(
    openingSnapshot.findText(openingViewportTail) === null,
    `the opening comment tail "${openingViewportTail}" is hidden before horizontal input`,
  );

  console.log(
    '== harness horizontal extent: Alt-wheel clamps against the opening viewport ==',
  );
  await driver.assertContentInvariantAcrossAction({
    invariantRegion: {
      startRow: filesHeadingPosition.row,
      endRowExclusive: filesHeadingPosition.row + 1,
      startColumn: filesHeadingPosition.column,
      endColumnExclusive: filesHeadingPosition.column + 'Files'.length,
    },
    changedRegion: {
      startRow: 1,
      endRowExclusive: openingSnapshot.rows - 2,
      startColumn: 32,
      endColumnExclusive: openingSnapshot.columns,
    },
    actionDescription:
      'Alt-wheel changes the editor viewport while the Files heading stays fixed',
    performAction: async () => {
      for (let wheelEvent = 1; wheelEvent <= 80; wheelEvent++) {
        driver.sendMouseWithoutFrameExpectation({
          kind: 'wheel',
          column: 70,
          row: 15,
          direction: 'right',
          alt: true,
        });
      }
      await driver.awaitGridCondition(
        'the horizontal viewport reaches its positive resting clamp',
        () => {
          const status = HarnessSmoke.Class.readStatus(statusPath);
          return (
            status.workspaceScrollMomentumAtRest === true &&
            Number(status.editorScrollLeft) > 0
          );
        },
      );
    },
  });
  await driver.awaitGridCondition(
    `the opening viewport reveals its comment tail "${openingViewportTail}"`,
    (candidate) => candidate.findText(openingViewportTail) !== null,
  );
  const openingClampStatus = await awaitStatusPublication(
    statusPath,
    'the positive opening-viewport horizontal clamp is published',
    (status) => Number(status.editorScrollLeft) > 0,
  );
  const openingViewportClamp = Number(openingClampStatus.editorScrollLeft);
  pass('Alt-wheel moved the horizontal viewport');
  pass(
    `Alt-wheel stopped at opening-viewport scrollLeft ${openingViewportClamp}`,
  );

  console.log(
    '== harness horizontal extent: reveal the deep widest line without more horizontal input ==',
  );
  const verticalScrollFrames =
    await driver.collectCompletedFrameObservationsUntil({
      conditionDescription: `vertical scrolling reveals ${widestLineMarker}`,
      condition: (snapshot) => snapshot.findText(widestLineMarker) !== null,
      performAction: () => {
        for (let wheelEvent = 1; wheelEvent <= 20; wheelEvent++) {
          driver.sendMouse({
            kind: 'wheel',
            column: 70,
            row: 15,
            direction: 'down',
          });
        }
      },
      timeoutMilliseconds: 2_000,
    });
  const widestLineSnapshot =
    verticalScrollFrames.find(
      (observation) => observation.snapshot.findText(widestLineMarker) !== null,
    )?.snapshot ?? null;
  requireCondition(
    widestLineSnapshot !== null,
    `vertical wheel reveals the deep widest line marker "${widestLineMarker}"`,
  );
  await awaitStatusPublication(
    statusPath,
    'vertical scrolling preserves the opening horizontal clamp',
    (status) => status.editorScrollLeft === openingViewportClamp,
  );
  pass('vertical scrolling does not change the horizontal clamp');
  requireCondition(
    widestLineSnapshot.findText(widestLineTail) !== null,
    `Alt-wheel reveals the widest line tail "${widestLineTail}"`,
  );

  driver.sendKeys('Control+q');
  console.log('smoke-horizontal-extent-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
