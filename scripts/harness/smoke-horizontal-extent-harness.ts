#!/usr/bin/env bun
// Horizontal-extent acceptance drive: open the real regression file through Invar, move to its
// widest line, and prove Alt-wheel can reveal that line's true end through the PTY byte stream.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Synchronized end markers bound complete frames (scripts/harness/harness.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  pass,
  requireCondition,
  statusField,
} from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';

const repositoryRoot = process.cwd();
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-horizontal-extent-harness-home-'));
const statusPath = join(homeDirectory, 'status.json');
const regressionFileName = 'JpegDecoder.test.ts';
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
  await driver.awaitSnapshot(
    () => statusField<boolean>(statusPath, 'ready') === true,
    60_000,
  );
  driver.sendKeys('Control+p');
  await driver.awaitSnapshot((candidate) => candidate.findText('Go to File') !== null);
  driver.sendText(regressionFileName);
  await driver.awaitQuiescence();
  driver.sendKeys('Enter');
  await driver.awaitSnapshot(
    () => statusField<string>(statusPath, 'activeBuffer')?.endsWith(
      `/src/modules/image/${regressionFileName}`,
    ) === true,
    15_000,
  );
  pass(`opened src/modules/image/${regressionFileName}`);
  for (let silenceAttempt = 1; silenceAttempt <= 40; silenceAttempt++) {
    try {
      await driver.assertNoCompleteFrameEmittedFor(200);
      break;
    } catch (error) {
      if (silenceAttempt === 40) throw error;
    }
  }

  console.log('== harness horizontal extent: Alt-wheel clamps against the opening viewport ==');
  let stableClampObservations = 0;
  let previousScrollLeft = -1;
  for (let wheelEvent = 1; wheelEvent <= 80; wheelEvent++) {
    driver.sendMouseWithoutFrameExpectation({
      kind: 'wheel',
      column: 70,
      row: 15,
      direction: 'right',
      alt: true,
    });
    try {
      await driver.awaitNextCompletedFrameSnapshot(500);
    } catch (error) {
      if (
        !(error instanceof Error)
        || !error.message.startsWith('Timed out waiting for the next complete synchronized frame')
      ) {
        throw error;
      }
    }
    const scrollLeft = statusField<number>(statusPath, 'editorScrollLeft') ?? 0;
    if (scrollLeft === previousScrollLeft) stableClampObservations += 1;
    else stableClampObservations = 0;
    previousScrollLeft = scrollLeft;
    if (stableClampObservations >= 5) break;
  }
  requireCondition(previousScrollLeft > 0, 'Alt-wheel moved the horizontal viewport');
  for (let silenceAttempt = 1; silenceAttempt <= 40; silenceAttempt++) {
    try {
      await driver.assertNoCompleteFrameEmittedFor(200);
      break;
    } catch (error) {
      if (silenceAttempt === 40) throw error;
    }
  }
  const openingViewportClamp = statusField<number>(statusPath, 'editorScrollLeft') ?? 0;
  pass(`Alt-wheel stopped at opening-viewport scrollLeft ${openingViewportClamp}`);

  console.log('== harness horizontal extent: reveal the deep widest line without more horizontal input ==');
  let nextScrollFrame = driver.awaitNextCompletedFrameSnapshot(2_000);
  for (let wheelEvent = 1; wheelEvent <= 20; wheelEvent++) {
    driver.sendMouse({
      kind: 'wheel',
      column: 70,
      row: 15,
      direction: 'down',
    });
  }
  let widestLineSnapshot = null;
  for (let frameNumber = 1; frameNumber <= 300; frameNumber++) {
    let scrollFrame: Awaited<typeof nextScrollFrame>;
    try {
      scrollFrame = await nextScrollFrame;
    } catch (error) {
      if (
        error instanceof Error
        && error.message.startsWith('Timed out waiting for the next complete synchronized frame')
      ) {
        break;
      }
      throw error;
    }
    if (scrollFrame.snapshot.findText(widestLineMarker) !== null) {
      widestLineSnapshot = scrollFrame.snapshot;
      break;
    }
    nextScrollFrame = driver.awaitNextCompletedFrameSnapshot(150);
  }
  requireCondition(
    widestLineSnapshot !== null,
    `vertical wheel reveals the deep widest line marker "${widestLineMarker}"`,
  );
  requireCondition(
    statusField<number>(statusPath, 'editorScrollLeft') === openingViewportClamp,
    'vertical scrolling does not change the horizontal clamp',
  );
  requireCondition(
    widestLineSnapshot.findText(widestLineTail) !== null,
    `Alt-wheel reveals the widest line tail "${widestLineTail}"`,
  );

  driver.sendKeys('Control+q');
  console.log('smoke-horizontal-extent-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(homeDirectory, { recursive: true, force: true });
}
