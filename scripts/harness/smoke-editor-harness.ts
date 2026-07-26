#!/usr/bin/env bun
// Byte-level editor core port: visual and caret facts come from TerminalEmulator cells; status is
// retained only for the original smoke's internal model, mode, scroll, and resource assertions.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Synchronized end markers bound complete frames (scripts/harness/harness.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import {
  activeTabHasDirtyMarker,
  awaitStatusPublication,
  dragBetweenCells,
  pass,
  requireCondition,
} from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';
import { HarnessSmoke } from './HarnessSmoke';

function gutterNumber(
  snapshot: HarnessSnapshot.Model,
  row: number,
): number | null {
  const match = snapshot.rowText(row).slice(37, 44).match(/\d+/);
  return match ? Number(match[0]) : null;
}

function clickCell(
  driver: PtyTestDriver.Model,
  column: number,
  row: number,
): void {
  driver.sendMouse({ kind: 'press', column, row, button: 'left' });
  driver.sendMouse({ kind: 'release', column, row, button: 'left' });
}

const repositoryRoot = process.cwd();
const fixtureRoot = join(repositoryRoot, 'fixtures');
const homeDirectory = mkdtempSync(join(tmpdir(), 'tui-editor-harness-home-'));
const statusPath = join(homeDirectory, 'status.json');
const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  repositoryRoot,
  columns: 120,
  rows: 40,
  homeDirectory,
  environment: { TUI_STATUS_PATH: statusPath },
});

try {
  console.log('== harness editor: launch, navigate, and open a file ==');
  await awaitStatusPublication(
    statusPath,
    'the application is ready with an active workspace',
    (status) => status.ready === true && Boolean(status.activeWorkspace),
    15_000,
  );
  pass('workspace is active');
  driver.sendKeys('Down');
  await driver.awaitQuiescence();
  driver.sendKeys('Down');
  await driver.awaitQuiescence();
  for (let openAttempt = 1; openAttempt <= 8; openAttempt++) {
    const openAttemptStatus = await awaitStatusPublication(
      statusPath,
      'the active buffer field is published during tree navigation',
      (status) => Object.hasOwn(status, 'activeBuffer'),
    );
    if (openAttemptStatus.activeBuffer) break;
    driver.sendKeys('Enter');
    await driver.awaitQuiescence();
    driver.sendKeys('Down');
    await driver.awaitQuiescence();
  }
  const openedBufferStatus = await awaitStatusPublication(
    statusPath,
    'tree navigation publishes an active buffer path',
    (status) =>
      typeof status.activeBuffer === 'string' && status.activeBuffer.length > 0,
  );
  const activeBufferPath = String(openedBufferStatus.activeBuffer);
  pass('tree navigation opened a file');

  console.log(
    '== harness editor: typing updates the document and native caret ==',
  );
  driver.sendKeys('Right');
  await driver.awaitQuiescence();
  const typingBaselineStatus = await awaitStatusPublication(
    statusPath,
    'the buffer revision is published before typing',
    (status) => typeof status.bufferRevision === 'number',
  );
  const revisionBeforeTyping = Number(typingBaselineStatus.bufferRevision);
  driver.sendText('X');
  let snapshot = await driver.awaitSnapshot((candidate) => {
    const typedPosition = candidate.findText('X');
    return (
      typedPosition !== null &&
      candidate.cursorColumn === typedPosition.column + 1 &&
      candidate.cursorRow === typedPosition.row
    );
  });
  await awaitStatusPublication(
    statusPath,
    'typing advances the buffer revision',
    (status) => Number(status.bufferRevision) > revisionBeforeTyping,
  );
  pass('typing bumped the buffer revision');
  const typedPosition = snapshot.findText('X');
  requireCondition(
    typedPosition !== null,
    'typed glyph paints in the emulator grid',
  );
  const typedGutterNumber = gutterNumber(snapshot, typedPosition.row);
  requireCondition(
    typedGutterNumber !== null &&
      gutterNumber(snapshot, typedPosition.row + 1) === typedGutterNumber + 1,
    'wrap-off keeps consecutive logical lines on consecutive terminal rows',
  );

  console.log(
    '== harness editor: keyboard selection creates and clears one range ==',
  );
  driver.sendKeys('Shift+Right');
  await awaitStatusPublication(
    statusPath,
    'keyboard selection publishes one selection range',
    (status) => status.hasSelection === true && Boolean(status.selection),
  );
  pass('selection range is published');
  driver.sendKeys('Escape');
  await awaitStatusPublication(
    statusPath,
    'Escape publishes the keyboard selection as cleared',
    (status) => status.hasSelection === false,
  );
  pass('Escape cleared the keyboard selection');

  console.log(
    '== harness editor: undo to disk state clears flag and rendered dirty dot ==',
  );
  await awaitStatusPublication(
    statusPath,
    'the typed buffer is published as dirty',
    (status) => status.dirty === true,
  );
  pass('buffer is dirty after typing');
  snapshot = await driver.awaitGridCondition(
    'the active tab paints its dirty dot',
    (candidate) => activeTabHasDirtyMarker(candidate, activeBufferPath),
  );
  requireCondition(
    activeTabHasDirtyMarker(snapshot, activeBufferPath),
    'active tab paints the dirty dot',
  );
  for (let undoAttempt = 1; undoAttempt <= 5; undoAttempt++) {
    const undoStatus = await awaitStatusPublication(
      statusPath,
      'the dirty field is published during undo',
      (status) => typeof status.dirty === 'boolean',
    );
    if (undoStatus.dirty === false) break;
    driver.sendKeys('Control+z');
    await driver.awaitQuiescence();
  }
  await awaitStatusPublication(
    statusPath,
    'undo publishes the buffer as clean',
    (status) => status.dirty === false,
  );
  pass('undo cleared the dirty flag');
  snapshot = await driver.awaitGridCondition(
    'undo clears the active tab dirty dot',
    (candidate) => !activeTabHasDirtyMarker(candidate, activeBufferPath),
  );
  requireCondition(
    !activeTabHasDirtyMarker(snapshot, activeBufferPath),
    'undo cleared the rendered dirty dot',
  );
  driver.sendText('X');
  snapshot = await driver.awaitGridCondition(
    'the fixture content line is visible after restoring the edit',
    (candidate) =>
      candidate.findText('X') !== null &&
      candidate.findText('tiny project') !== null,
  );

  console.log(
    '== harness editor: drag selection persists and Ctrl+C copies ==',
  );
  const selectionLine = snapshot.findText('tiny project');
  requireCondition(
    selectionLine !== null,
    'fixture content line is visible for drag selection',
  );
  const unselectedBackground = snapshot.cell(
    selectionLine.row,
    selectionLine.column,
  )?.background;
  await dragBetweenCells(
    driver,
    selectionLine.column,
    selectionLine.row,
    selectionLine.column + 10,
    selectionLine.row,
  );
  await driver.awaitGridCondition(
    'the dragged editor selection paints before the untouched interval begins',
    (candidate) =>
      candidate
        .rowCells(selectionLine.row)
        .slice(selectionLine.column, selectionLine.column + 11)
        .some((cell) => cell.background !== unselectedBackground),
  );
  await awaitStatusPublication(
    statusPath,
    'the dragged editor selection is published',
    (status) => status.hasSelection === true,
  );
  pass('selection is published before copy');
  driver.sendRawInputWithoutFrameExpectation('\x03');
  await awaitStatusPublication(
    statusPath,
    'Ctrl+C publishes a positive copied character count',
    (status) => Number(status.lastCopyChars) > 0,
  );
  pass('Ctrl+C copied selected characters');
  driver.sendRawInputWithoutFrameExpectation('\x1b');
  await awaitStatusPublication(
    statusPath,
    'status condition: status.hasSelection === false',
    (status) => status.hasSelection === false,
  );

  console.log('== harness editor: real SGR mouse click reaches the app ==');
  snapshot = await driver.awaitGridCondition(
    'the editor click target is visible after clearing the selection',
    (candidate) => candidate.findText('tiny project') !== null,
  );
  const clickTarget = snapshot.findText('tiny project');
  requireCondition(clickTarget !== null, 'editor click target is visible');
  clickCell(driver, clickTarget.column, clickTarget.row);
  await awaitStatusPublication(
    statusPath,
    'the real input path publishes the mouse click',
    (status) => Boolean(status.mouse),
  );
  pass('mouse click is published by the real input path');

  console.log('== harness editor: End reveals the long line end ==');
  snapshot = await driver.awaitGridCondition(
    'the long fixture line is visible before moving to its end',
    (candidate) => candidate.findText('Fixture') !== null,
  );
  const longLineHead = snapshot.findText('Fixture');
  requireCondition(longLineHead !== null, 'long fixture line is visible');
  clickCell(driver, longLineHead.column, longLineHead.row);
  await driver.awaitQuiescence();
  driver.sendKeys('End');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('desync)') !== null,
  );
  pass('line end is visible at maximum horizontal scroll');

  console.log('== harness editor: rightward drag includes the release cell ==');
  driver.sendKeys('Home');
  snapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('Fixture') !== null,
  );
  const fixturePosition = snapshot.findText('Fixture');
  requireCondition(
    fixturePosition !== null,
    'Fixture marker returned at the line head',
  );
  await dragBetweenCells(
    driver,
    fixturePosition.column,
    fixturePosition.row,
    fixturePosition.column + 6,
    fixturePosition.row,
  );
  await awaitStatusPublication(
    statusPath,
    'the rightward drag selection is published',
    (status) => status.hasSelection === true,
  );
  driver.sendRawInputWithoutFrameExpectation('\x03');
  await awaitStatusPublication(
    statusPath,
    'status condition: status.lastCopyChars === 7',
    (status) => status.lastCopyChars === 7,
  );
  pass('rightward drag copied the final release-cell character');
  driver.sendRawInputWithoutFrameExpectation('\x1b');
  await awaitStatusPublication(
    statusPath,
    'status condition: status.hasSelection === false',
    (status) => status.hasSelection === false,
  );
  driver.sendKeys('Home');
  await driver.awaitQuiescence();

  console.log(
    '== harness editor: Option-wheel routes horizontally and reverses ==',
  );
  const horizontalScrollBaseline = await awaitStatusPublication(
    statusPath,
    'the horizontal scroll offset is published before Option-wheel input',
    (status) => typeof status.editorScrollLeft === 'number',
  );
  const horizontalScrollBefore = Number(
    horizontalScrollBaseline.editorScrollLeft,
  );
  const wheelRow = fixturePosition.row;
  for (let wheelEvent = 1; wheelEvent <= 6; wheelEvent++) {
    driver.sendRawInput(`\x1b[<75;44;${wheelRow + 1}M`);
  }
  await awaitStatusPublication(
    statusPath,
    'Option-wheel advances the horizontal scroll offset',
    (status) => Number(status.editorScrollLeft) > horizontalScrollBefore,
  );
  pass('Option-wheel routes to horizontal scroll');
  for (let wheelEvent = 1; wheelEvent <= 8; wheelEvent++) {
    driver.sendRawInput(`\x1b[<74;44;${wheelRow + 1}M`);
  }
  await driver.awaitQuiescence();
  driver.sendKeys('Home');
  await awaitStatusPublication(
    statusPath,
    'Home publishes a zero horizontal scroll offset',
    (status) => status.editorScrollLeft === 0,
  );

  console.log(
    '== harness editor: held right-edge drag auto-scrolls and extends selection ==',
  );
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: fixturePosition.column + 10,
    row: fixturePosition.row,
    button: 'left',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'move',
    column: 117,
    row: fixturePosition.row,
    button: 'left',
  });
  const edgeScrollStatus = await awaitStatusPublication(
    statusPath,
    'the held right-edge drag publishes horizontal auto-scroll beyond five columns',
    (status) => Number(status.editorScrollLeft) > 5,
  );
  const edgeScrollLeft = Number(edgeScrollStatus.editorScrollLeft);
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: 117,
    row: fixturePosition.row,
    button: 'left',
  });
  requireCondition(
    edgeScrollLeft > 5,
    `edge hold auto-scrolled to ${edgeScrollLeft}`,
  );
  driver.sendKeys('Escape');
  await driver.awaitQuiescence();
  driver.sendKeys('Home');
  await driver.awaitQuiescence();

  console.log(
    '== harness editor: tree and editor clicks use one dispatch path ==',
  );
  driver.sendRawInputWithoutFrameExpectation('\x1b');
  await awaitStatusPublication(
    statusPath,
    "status condition: status.focus === 'files'",
    (status) => status.focus === 'files',
  );
  snapshot = await driver.awaitGridCondition(
    'the source tree row is visible after returning focus to files',
    (candidate) => candidate.findText('src') !== null,
  );
  const sourceTreePosition = snapshot.findText('src');
  requireCondition(sourceTreePosition !== null, 'source tree row is visible');
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: sourceTreePosition.column,
    row: sourceTreePosition.row,
    button: 'left',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: sourceTreePosition.column,
    row: sourceTreePosition.row,
    button: 'left',
  });
  await awaitStatusPublication(
    statusPath,
    "status condition: status.focus === 'files' && status.treeSelected === 0",
    (status) => status.focus === 'files' && status.treeSelected === 0,
  );
  pass('tree click focuses files and selects row zero');
  snapshot = await driver.awaitGridCondition(
    'the editor pane click target remains visible after the tree click',
    (candidate) => candidate.findText('tiny project') !== null,
  );
  const editorClickPosition = snapshot.findText('tiny project');
  requireCondition(
    editorClickPosition !== null,
    'editor pane click target remains visible',
  );
  clickCell(driver, editorClickPosition.column, editorClickPosition.row);
  await awaitStatusPublication(
    statusPath,
    'the editor click publishes editor focus',
    (status) => status.focus === 'editor',
  );
  pass('editor click restores editor focus');
  clickCell(driver, editorClickPosition.column + 3, editorClickPosition.row);
  await driver.awaitQuiescence();
  snapshot = await driver.awaitGridCondition(
    'the source tree row is available after restoring editor focus',
    (candidate) => candidate.findText('src') !== null,
  );
  let greeterTreePosition = snapshot.findText('greeter.ts');
  if (!greeterTreePosition || greeterTreePosition.column > 30) {
    const refreshedSourcePosition = snapshot.findText('src');
    requireCondition(
      refreshedSourcePosition !== null,
      'source row remains available to expand',
    );
    clickCell(
      driver,
      refreshedSourcePosition.column,
      refreshedSourcePosition.row,
    );
    snapshot = await driver.awaitSnapshot((candidate) => {
      const greeterPosition = candidate.findText('greeter.ts');
      return greeterPosition !== null && greeterPosition.column < 30;
    });
    greeterTreePosition = snapshot.findText('greeter.ts');
  }
  requireCondition(
    greeterTreePosition !== null && greeterTreePosition.column < 30,
    'greeter.ts tree row is visible',
  );
  clickCell(driver, greeterTreePosition.column, greeterTreePosition.row);
  await awaitStatusPublication(
    statusPath,
    'the tree click opens greeter.ts without moving its cursor',
    (status) =>
      String(status.activeBuffer).endsWith('greeter.ts') &&
      (status.cursor as { line?: number } | undefined)?.line === 0,
  );
  pass('tree click opens greeter.ts without moving its editor cursor');

  console.log(
    '== harness editor: palette and status gear open their overlays ==',
  );
  driver.sendKeys('F1');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('Command Palette') !== null,
  );
  await awaitStatusPublication(
    statusPath,
    'the command palette overlay is published',
    (status) => status.overlay === 'palette',
  );
  pass('F1 opens the command palette');
  driver.sendRawInputWithoutFrameExpectation('\x1b');
  await awaitStatusPublication(
    statusPath,
    'status condition: status.overlay === null',
    (status) => status.overlay === null,
  );
  // Click the gear WHERE IT RENDERS: fixed offsets from the right edge encode one status-bar
  // control order, and the corner order is now a product decision (clock, then right-dock
  // outermost). Discovery by glyph survives any reordering.
  const gearSnapshot = await driver.awaitSnapshot(
    (candidate) => candidate.findText('⚙') !== null,
  );
  const gearPosition = gearSnapshot.findText('⚙');
  if (!gearPosition) throw new Error('status-bar gear glyph disappeared');
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: gearPosition.column,
    row: gearPosition.row,
    button: 'left',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: gearPosition.column,
    row: gearPosition.row,
    button: 'left',
  });
  await awaitStatusPublication(
    statusPath,
    'status condition: status.settingsOpen === true',
    (status) => status.settingsOpen === true,
  );
  pass('status-bar gear opens Settings');
  driver.sendRawInputWithoutFrameExpectation('\x1b');
  await awaitStatusPublication(
    statusPath,
    'status condition: status.settingsOpen === false',
    (status) => status.settingsOpen === false,
  );

  console.log(
    '== harness editor: opening files adds tabs and dehydrates clean backgrounds ==',
  );
  const tabBaselineStatus = await awaitStatusPublication(
    statusPath,
    'the tab count is published before opening more files',
    (status) => typeof status.bufferTabCount === 'number',
  );
  const tabsBefore = Number(tabBaselineStatus.bufferTabCount);
  const targetTabCount = tabsBefore + 2;
  for (let openAttempt = 1; openAttempt <= 10; openAttempt++) {
    const openStatus = await awaitStatusPublication(
      statusPath,
      'the tab count and focus are published while opening more files',
      (status) =>
        typeof status.bufferTabCount === 'number' &&
        typeof status.focus === 'string',
    );
    if (Number(openStatus.bufferTabCount) >= targetTabCount) break;
    if (openStatus.focus !== 'files') {
      driver.sendRawInputWithoutFrameExpectation('\t');
      await awaitStatusPublication(
        statusPath,
        "status condition: status.focus === 'files'",
        (status) => status.focus === 'files',
      );
    }
    driver.sendRawInput('\x1b[B\r');
    await driver.awaitQuiescence();
  }
  const tabsAfterOpenStatus = await awaitStatusPublication(
    statusPath,
    'the increased tab count and live document count are published',
    (status) =>
      Number(status.bufferTabCount) > tabsBefore &&
      typeof status.bufferLiveCount === 'number',
  );
  const tabsAfterOpen = Number(tabsAfterOpenStatus.bufferTabCount);
  const liveAfterOpen = Number(tabsAfterOpenStatus.bufferLiveCount);
  requireCondition(
    tabsAfterOpen > tabsBefore,
    `opening files adds tabs (${tabsBefore} to ${tabsAfterOpen})`,
  );
  requireCondition(
    liveAfterOpen < tabsAfterOpen,
    `flyweight keeps live documents ${liveAfterOpen} below tabs ${tabsAfterOpen}`,
  );
  driver.sendKeys('Control+w');
  await driver.awaitQuiescence();
  // The predicate must be UNSATISFIABLE BY PRE-Ctrl+W STATE. It used to accept
  // `typeof pendingCloseTab === 'number'`, which the status already satisfied with the
  // "nothing pending" sentinel before the key was ever sent: sampling stale skipped the
  // `y` confirmation below, left the prompt open, and then waited forever for a tab
  // count that could not drop. That is why this smoke was ~50% flaky at this exact step
  // while retry-once-on-timeout kept the gate looking green. Quiescence waits for
  // FRAMES, not for the status file to be rewritten, so it cannot close this gap.
  //
  // Either outcome of Ctrl+W is now named, and both require the key to have landed: a
  // confirmation is pending for a dirty buffer, or a clean buffer closed outright.
  const pendingCloseStatus = await awaitStatusPublication(
    statusPath,
    'Ctrl+W either requests confirmation or has already reduced the tab count',
    (status) =>
      Number(status.pendingCloseTab) >= 0 ||
      Number(status.bufferTabCount) < tabsAfterOpen,
  );
  if (Number(pendingCloseStatus.pendingCloseTab) >= 0) {
    driver.sendKeys('y');
    await driver.awaitQuiescence();
  }
  await awaitStatusPublication(
    statusPath,
    'Ctrl+W publishes a reduced buffer tab count',
    (status) => Number(status.bufferTabCount) < tabsAfterOpen,
  );
  pass('Ctrl+W closes the active tab');

  console.log('== harness editor: Ctrl+Q exits cleanly ==');
  driver.sendKeys('Control+q');
  const exitResult = await Promise.race([
    driver.exitCode().then(() => 'exited'),
    Bun.sleep(3_000).then(() => 'timeout'),
  ]);
  requireCondition(
    exitResult === 'exited',
    'editor process exited after Ctrl+Q',
  );
  console.log('smoke-editor-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
