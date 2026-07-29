#!/usr/bin/env bun
// The dirty marker is CONTENT-derived, on every editing path — not "an edit happened" and not "the
// undo depth returned to zero". This drive proves the case the eager flag got wrong: type a character
// and BACKSPACE it, with no undo involved, and the buffer is byte-identical to disk again, so the
// marker must clear. Then the same for a deleted-and-retyped line, and across a mid-session save
// (which moves the baseline: "original" means LAST SAVED).
//
// Every wait observes the exact published field or grid cell its assertion reads, and each post-action
// wait carries the revision the action bumped, so no predicate can be satisfied by the pre-action
// state. The marker is addressed by tab geometry (the cell after the tab label), never by searching
// the ● glyph as text.
//
// invariant: The dirty marker is derived from content, never asserted (src/modules/editor/editor.invariants.md)
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  activeTabHasDirtyMarker,
  awaitStatusPublication,
  pass,
  requireCondition,
} from './HarnessSmokeSupport';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

const loadedContent = 'alpha\nbeta\ngamma\n';

const workspaceRoot = mkdtempSync(join(tmpdir(), 'tui-dirty-marker-harness-'));

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-dirty-marker-harness-home-'),
);

const documentPath = join(workspaceRoot, 'dirty-marker.txt');

const statusPath = join(homeDirectory, 'status.json');

await Bun.write(documentPath, loadedContent);

const driver = new PtyTestDriver.Class({
  workspaceRoot,
  columns: 100,
  rows: 30,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

/** The document content on disk — the thing the marker is a claim ABOUT. */
async function diskContent(): Promise<string> {
  return Bun.file(documentPath)
    .text()
    .catch(() => '');
}

async function awaitDiskContent(
  expectedContent: string,
  description: string,
): Promise<void> {
  const deadline = performance.now() + 15_000;
  while (performance.now() < deadline) {
    if ((await diskContent()) === expectedContent) {
      pass(description);
      return;
    }
    await Bun.sleep(10);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

try {
  console.log('== harness dirty-marker: open a clean document ==');
  const treeSnapshot = await driver.awaitGridCondition(
    'the workspace tree lists the fixture document',
    (candidate) => candidate.findText('dirty-marker.txt') !== null,
    15_000,
  );
  HarnessSmoke.Class.clickText(driver, treeSnapshot, 'dirty-marker.txt');
  const openedStatus = await awaitStatusPublication(
    statusPath,
    'the fixture document is published as the active buffer and CLEAN',
    (status) =>
      status.activeBuffer === documentPath &&
      status.dirty === false &&
      typeof status.bufferRevision === 'number',
  );
  pass('a freshly loaded document publishes no unsaved edits');
  const cleanSnapshot = await driver.awaitGridCondition(
    'the loaded document paints its tab with no dirty marker',
    (candidate) =>
      candidate.findText('alpha') !== null &&
      !activeTabHasDirtyMarker(candidate, documentPath),
  );
  requireCondition(
    !activeTabHasDirtyMarker(cleanSnapshot, documentPath),
    'the clean tab paints a blank marker cell',
  );

  console.log(
    '== harness dirty-marker: a typed character dirties, BACKSPACE clears it (no undo) ==',
  );
  const revisionBeforeTyping = Number(openedStatus.bufferRevision);
  driver.sendKeys('End');
  driver.sendText('X');
  const typedStatus = await awaitStatusPublication(
    statusPath,
    'the typed character publishes a higher revision and a dirty buffer',
    (status) =>
      Number(status.bufferRevision) > revisionBeforeTyping &&
      status.dirty === true,
  );
  const revisionAfterTyping = Number(typedStatus.bufferRevision);
  const typedSnapshot = await driver.awaitGridCondition(
    'the typed line and the tab dirty marker are both painted',
    (candidate) =>
      candidate.findText('alphaX') !== null &&
      activeTabHasDirtyMarker(candidate, documentPath),
  );
  requireCondition(
    activeTabHasDirtyMarker(typedSnapshot, documentPath),
    'typing paints the dirty marker',
  );

  // THE CASE THIS SMOKE EXISTS FOR. No Ctrl+Z anywhere: a plain deletion restores the on-disk bytes,
  // so the marker must clear. The wait carries the backspace's own revision, so the pre-backspace
  // state (dirty, one revision lower) cannot satisfy it.
  driver.sendKeys('Backspace');
  await awaitStatusPublication(
    statusPath,
    'the backspaced buffer publishes a higher revision and NO unsaved edits',
    (status) =>
      Number(status.bufferRevision) > revisionAfterTyping &&
      status.dirty === false,
  );
  pass('backspacing the typed character published the buffer as clean');
  const backspacedSnapshot = await driver.awaitGridCondition(
    'the restored line is painted and the tab dirty marker is gone',
    (candidate) =>
      candidate.findText('alpha') !== null &&
      candidate.findText('alphaX') === null &&
      !activeTabHasDirtyMarker(candidate, documentPath),
  );
  requireCondition(
    !activeTabHasDirtyMarker(backspacedSnapshot, documentPath),
    'backspacing back to the on-disk content CLEARED the dirty marker with no undo',
  );

  console.log(
    '== harness dirty-marker: delete a whole line and retype it identically ==',
  );
  driver.sendKeys('Down');
  driver.sendKeys('End');
  const revisionBeforeLineDelete = Number(
    (
      await awaitStatusPublication(
        statusPath,
        'the cursor sits at the end of the second line before the deletion',
        (status) =>
          Boolean(status.cursor) &&
          (status.cursor as { line: number; col: number }).line === 1 &&
          (status.cursor as { line: number; col: number }).col === 4,
      )
    ).bufferRevision,
  );
  for (let deleted = 0; deleted < 4; deleted += 1) driver.sendKeys('Backspace');
  await awaitStatusPublication(
    statusPath,
    'the emptied line publishes a higher revision and a dirty buffer',
    (status) =>
      Number(status.bufferRevision) > revisionBeforeLineDelete &&
      status.dirty === true &&
      Array.isArray(status.editorLines) &&
      (status.editorLines as string[])[1] === '',
  );
  pass('deleting the line content published the buffer as dirty');
  driver.sendText('beta');
  await awaitStatusPublication(
    statusPath,
    'the retyped identical line publishes the buffer as clean again',
    (status) =>
      status.dirty === false &&
      Array.isArray(status.editorLines) &&
      (status.editorLines as string[])[1] === 'beta',
  );
  pass('retyping the line identically published the buffer as clean');
  const retypedSnapshot = await driver.awaitGridCondition(
    'the retyped line is painted and its tab carries no dirty marker',
    (candidate) =>
      candidate.findText('beta') !== null &&
      !activeTabHasDirtyMarker(candidate, documentPath),
  );
  requireCondition(
    !activeTabHasDirtyMarker(retypedSnapshot, documentPath),
    'a deleted-and-retyped line clears the dirty marker',
  );

  console.log(
    '== harness dirty-marker: a mid-session save moves the baseline ==',
  );
  driver.sendKeys('Control+End');
  driver.sendKeys('Up');
  driver.sendKeys('End');
  driver.sendText('!');
  const revisionBeforeSave = Number(
    (
      await awaitStatusPublication(
        statusPath,
        'the pre-save edit publishes the appended character and a dirty buffer',
        (status) =>
          status.dirty === true &&
          Array.isArray(status.editorLines) &&
          (status.editorLines as string[])[2] === 'gamma!',
      )
    ).bufferRevision,
  );
  driver.sendKeys('Control+s');
  // Await the DISK, not the marker: the save's observable effect is the written file, and the marker
  // was already clean-or-dirty before the keystroke either way.
  await awaitDiskContent(
    'alpha\nbeta\ngamma!\n',
    'Control+s wrote the edited content to disk',
  );
  await awaitStatusPublication(
    statusPath,
    'the saved buffer publishes no unsaved edits',
    (status) => status.dirty === false,
  );
  pass('saving published the buffer as clean');

  // Back to the ORIGINALLY LOADED content — which is no longer the baseline. A marker keyed on "has
  // it changed since it was opened" would call this clean; a marker keyed on the LAST SAVED content
  // calls it dirty, which is what the file on disk says.
  driver.sendKeys('Backspace');
  await awaitStatusPublication(
    statusPath,
    'returning to the originally loaded content publishes a HIGHER revision and a DIRTY buffer',
    (status) =>
      Number(status.bufferRevision) > revisionBeforeSave &&
      status.dirty === true &&
      Array.isArray(status.editorLines) &&
      (status.editorLines as string[])[2] === 'gamma',
  );
  requireCondition(
    (await diskContent()) === 'alpha\nbeta\ngamma!\n',
    'the buffer now differs from the SAVED file, so the marker is correctly lit',
  );
  const rebaselinedSnapshot = await driver.awaitGridCondition(
    'the tab paints the dirty marker against the saved baseline',
    (candidate) => activeTabHasDirtyMarker(candidate, documentPath),
  );
  requireCondition(
    activeTabHasDirtyMarker(rebaselinedSnapshot, documentPath),
    'the ORIGINAL loaded content reads as dirty once a later state has been saved',
  );

  driver.sendText('!');
  await awaitStatusPublication(
    statusPath,
    'returning to the SAVED content publishes the buffer as clean',
    (status) =>
      status.dirty === false &&
      Array.isArray(status.editorLines) &&
      (status.editorLines as string[])[2] === 'gamma!',
  );
  const resavedSnapshot = await driver.awaitGridCondition(
    'the saved line is painted again and the tab marker has cleared',
    (candidate) =>
      candidate.findText('gamma!') !== null &&
      !activeTabHasDirtyMarker(candidate, documentPath),
  );
  requireCondition(
    !activeTabHasDirtyMarker(resavedSnapshot, documentPath),
    'typing back to the SAVED content clears the marker (the baseline rebaselined)',
  );

  console.log('smoke-dirty-marker: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(workspaceRoot);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
