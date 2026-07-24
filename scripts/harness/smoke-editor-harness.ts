#!/usr/bin/env bun
// Byte-level editor core port: visual and caret facts come from TerminalEmulator cells; status is
// retained only for the original smoke's internal model, mode, scroll, and resource assertions.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Synchronized end markers bound complete frames (scripts/harness/harness.invariants.md)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { HarnessSnapshot } from './HarnessSnapshot';
import {
  awaitStatusPublication,
  dragBetweenCells,
  pass,
  requireCondition,
  requireEqual,
  statusField,
} from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';

function activeTabHasDirtyDot(snapshot: HarnessSnapshot.Model, activeBufferPath: string): boolean {
  const tabMarker = ` ${basename(activeBufferPath)} `;
  for (let row = 0; row < snapshot.rows; row++) {
    const markerColumn = snapshot.rowText(row).indexOf(tabMarker);
    if (markerColumn < 0) continue;
    return snapshot.cell(row, markerColumn + tabMarker.length)?.characters !== ' ';
  }
  throw new Error(`Active tab marker not visible: ${tabMarker}`);
}

function gutterNumber(snapshot: HarnessSnapshot.Model, row: number): number | null {
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
  await driver.awaitSnapshot(
    () => statusField<boolean>(statusPath, 'ready') === true,
    15_000,
  );
  requireCondition(Boolean(statusField<string>(statusPath, 'activeWorkspace')), 'workspace is active');
  driver.sendKeys('Down');
  await driver.awaitQuiescence();
  driver.sendKeys('Down');
  await driver.awaitQuiescence();
  for (let openAttempt = 1; openAttempt <= 8; openAttempt++) {
    if (statusField<string>(statusPath, 'activeBuffer')) break;
    driver.sendKeys('Enter');
    await driver.awaitQuiescence();
    driver.sendKeys('Down');
    await driver.awaitQuiescence();
  }
  const activeBufferPath = statusField<string>(statusPath, 'activeBuffer');
  requireCondition(Boolean(activeBufferPath), 'tree navigation opened a file');
  if (!activeBufferPath) throw new Error('FAIL active buffer path is absent after open');

  console.log('== harness editor: typing updates the document and native caret ==');
  driver.sendKeys('Right');
  await driver.awaitQuiescence();
  const revisionBeforeTyping = statusField<number>(statusPath, 'bufferRevision') ?? 0;
  driver.sendText('X');
  let snapshot = await driver.awaitSnapshot((candidate) => {
    const typedPosition = candidate.findText('X');
    return typedPosition !== null
      && candidate.cursorColumn === typedPosition.column + 1
      && candidate.cursorRow === typedPosition.row;
  });
  requireCondition(
    (statusField<number>(statusPath, 'bufferRevision') ?? 0) > revisionBeforeTyping,
    'typing bumped the buffer revision',
  );
  const typedPosition = snapshot.findText('X');
  requireCondition(typedPosition !== null, 'typed glyph paints in the emulator grid');
  const typedGutterNumber = gutterNumber(snapshot, typedPosition.row);
  requireCondition(
    typedGutterNumber !== null
      && gutterNumber(snapshot, typedPosition.row + 1) === typedGutterNumber + 1,
    'wrap-off keeps consecutive logical lines on consecutive terminal rows',
  );

  console.log('== harness editor: keyboard selection creates and clears one range ==');
  driver.sendKeys('Shift+Right');
  await driver.awaitSnapshot(
    () => statusField<boolean>(statusPath, 'hasSelection') === true,
  );
  requireCondition(Boolean(statusField(statusPath, 'selection')), 'selection range is published');
  driver.sendKeys('Escape');
  await driver.awaitSnapshot(
    () => statusField<boolean>(statusPath, 'hasSelection') === false,
  );
  pass('Escape cleared the keyboard selection');

  console.log('== harness editor: undo to disk state clears flag and rendered dirty dot ==');
  requireEqual(statusField<boolean>(statusPath, 'dirty'), true, 'buffer is dirty after typing');
  snapshot = await driver.awaitGridCondition(
    'the active tab paints its dirty dot',
    (candidate) => activeTabHasDirtyDot(candidate, activeBufferPath),
  );
  requireCondition(
    activeTabHasDirtyDot(snapshot, activeBufferPath),
    'active tab paints the dirty dot',
  );
  for (let undoAttempt = 1; undoAttempt <= 5; undoAttempt++) {
    if (statusField<boolean>(statusPath, 'dirty') === false) break;
    driver.sendKeys('Control+z');
    await driver.awaitQuiescence();
  }
  requireEqual(statusField<boolean>(statusPath, 'dirty'), false, 'undo cleared the dirty flag');
  snapshot = await driver.awaitGridCondition(
    'undo clears the active tab dirty dot',
    (candidate) => !activeTabHasDirtyDot(candidate, activeBufferPath),
  );
  requireCondition(
    !activeTabHasDirtyDot(snapshot, activeBufferPath),
    'undo cleared the rendered dirty dot',
  );
  driver.sendText('X');
  snapshot = await driver.awaitGridCondition(
    'the fixture content line is visible after restoring the edit',
    (candidate) => candidate.findText('X') !== null
      && candidate.findText('tiny project') !== null,
  );

  console.log('== harness editor: drag selection persists and Ctrl+C copies ==');
  const selectionLine = snapshot.findText('tiny project');
  requireCondition(selectionLine !== null, 'fixture content line is visible for drag selection');
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
    (candidate) => statusField<boolean>(statusPath, 'hasSelection') === true
      && candidate.rowCells(selectionLine.row)
        .slice(selectionLine.column, selectionLine.column + 11)
        .some((cell) => cell.background !== unselectedBackground),
  );
  await driver.assertNoCompleteFrameEmittedFor(800);
  requireEqual(
    statusField<boolean>(statusPath, 'hasSelection'),
    true,
    'selection remains after an untouched interval',
  );
  driver.sendRawInputWithoutFrameExpectation('\x03');
  await awaitStatusPublication(
    statusPath,
    (status) => (status.lastCopyChars as number | undefined) !== undefined,
  );
  requireCondition(
    (statusField<number>(statusPath, 'lastCopyChars') ?? 0) > 0,
    'Ctrl+C copied selected characters',
  );
  driver.sendRawInputWithoutFrameExpectation('\x1b');
  await awaitStatusPublication(
    statusPath,
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
  await driver.awaitSnapshot(() => Boolean(statusField(statusPath, 'mouse')));
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
  await driver.awaitSnapshot((candidate) => candidate.findText('desync)') !== null);
  pass('line end is visible at maximum horizontal scroll');

  console.log('== harness editor: rightward drag includes the release cell ==');
  driver.sendKeys('Home');
  snapshot = await driver.awaitSnapshot((candidate) => candidate.findText('Fixture') !== null);
  const fixturePosition = snapshot.findText('Fixture');
  requireCondition(fixturePosition !== null, 'Fixture marker returned at the line head');
  await dragBetweenCells(
    driver,
    fixturePosition.column,
    fixturePosition.row,
    fixturePosition.column + 6,
    fixturePosition.row,
  );
  await driver.awaitSnapshot(
    () => statusField<boolean>(statusPath, 'hasSelection') === true,
  );
  driver.sendRawInputWithoutFrameExpectation('\x03');
  await awaitStatusPublication(
    statusPath,
    (status) => status.lastCopyChars === 7,
  );
  requireEqual(
    statusField<number>(statusPath, 'lastCopyChars'),
    7,
    'rightward drag copied the final release-cell character',
  );
  driver.sendRawInputWithoutFrameExpectation('\x1b');
  await awaitStatusPublication(
    statusPath,
    (status) => status.hasSelection === false,
  );
  driver.sendKeys('Home');
  await driver.awaitQuiescence();

  console.log('== harness editor: Option-wheel routes horizontally and reverses ==');
  const horizontalScrollBefore = statusField<number>(statusPath, 'editorScrollLeft') ?? 0;
  const wheelRow = fixturePosition.row;
  for (let wheelEvent = 1; wheelEvent <= 6; wheelEvent++) {
    driver.sendRawInput(`\x1b[<75;44;${wheelRow + 1}M`);
  }
  await driver.awaitSnapshot(
    () => (statusField<number>(statusPath, 'editorScrollLeft') ?? 0) > horizontalScrollBefore,
  );
  pass('Option-wheel routes to horizontal scroll');
  for (let wheelEvent = 1; wheelEvent <= 8; wheelEvent++) {
    driver.sendRawInput(`\x1b[<74;44;${wheelRow + 1}M`);
  }
  await driver.awaitQuiescence();
  driver.sendKeys('Home');
  await driver.awaitSnapshot(
    () => statusField<number>(statusPath, 'editorScrollLeft') === 0,
  );

  console.log('== harness editor: held right-edge drag auto-scrolls and extends selection ==');
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
  await driver.awaitSnapshot(
    () => (statusField<number>(statusPath, 'editorScrollLeft') ?? 0) > 5,
  );
  const edgeScrollLeft = statusField<number>(statusPath, 'editorScrollLeft') ?? 0;
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: 117,
    row: fixturePosition.row,
    button: 'left',
  });
  requireCondition(edgeScrollLeft > 5, `edge hold auto-scrolled to ${edgeScrollLeft}`);
  driver.sendKeys('Escape');
  await driver.awaitQuiescence();
  driver.sendKeys('Home');
  await driver.awaitQuiescence();

  console.log('== harness editor: tree and editor clicks use one dispatch path ==');
  driver.sendRawInputWithoutFrameExpectation('\x1b');
  await awaitStatusPublication(
    statusPath,
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
    (status) => status.focus === 'files' && status.treeSelected === 0,
  );
  pass('tree click focuses files and selects row zero');
  snapshot = await driver.awaitGridCondition(
    'the editor pane click target remains visible after the tree click',
    (candidate) => candidate.findText('tiny project') !== null,
  );
  const editorClickPosition = snapshot.findText('tiny project');
  requireCondition(editorClickPosition !== null, 'editor pane click target remains visible');
  clickCell(driver, editorClickPosition.column, editorClickPosition.row);
  await driver.awaitSnapshot(() => statusField<string>(statusPath, 'focus') === 'editor');
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
    requireCondition(refreshedSourcePosition !== null, 'source row remains available to expand');
    clickCell(driver, refreshedSourcePosition.column, refreshedSourcePosition.row);
    snapshot = await driver.awaitSnapshot(
      (candidate) => {
        const greeterPosition = candidate.findText('greeter.ts');
        return greeterPosition !== null && greeterPosition.column < 30;
      },
    );
    greeterTreePosition = snapshot.findText('greeter.ts');
  }
  requireCondition(
    greeterTreePosition !== null && greeterTreePosition.column < 30,
    'greeter.ts tree row is visible',
  );
  clickCell(driver, greeterTreePosition.column, greeterTreePosition.row);
  await driver.awaitSnapshot(
    () => statusField<string>(statusPath, 'activeBuffer')?.endsWith('greeter.ts') === true,
  );
  const cursor = statusField<{ line?: number }>(statusPath, 'cursor');
  requireCondition(cursor?.line === 0, 'tree click opens greeter.ts without moving its editor cursor');

  console.log('== harness editor: palette and status gear open their overlays ==');
  driver.sendKeys('F1');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('Command Palette') !== null
      && statusField<string>(statusPath, 'overlay') === 'palette',
  );
  pass('F1 opens the command palette');
  driver.sendRawInputWithoutFrameExpectation('\x1b');
  await awaitStatusPublication(
    statusPath,
    (status) => status.overlay === null,
  );
  const terminalWidth = statusField<number>(statusPath, 'width') ?? 120;
  const terminalHeight = statusField<number>(statusPath, 'height') ?? 40;
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: terminalWidth - 5,
    row: terminalHeight - 1,
    button: 'left',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: terminalWidth - 5,
    row: terminalHeight - 1,
    button: 'left',
  });
  await awaitStatusPublication(
    statusPath,
    (status) => status.settingsOpen === true,
  );
  pass('status-bar gear opens Settings');
  driver.sendRawInputWithoutFrameExpectation('\x1b');
  await awaitStatusPublication(
    statusPath,
    (status) => status.settingsOpen === false,
  );

  console.log('== harness editor: opening files adds tabs and dehydrates clean backgrounds ==');
  const tabsBefore = statusField<number>(statusPath, 'bufferTabCount') ?? 0;
  const targetTabCount = tabsBefore + 2;
  for (let openAttempt = 1; openAttempt <= 10; openAttempt++) {
    if ((statusField<number>(statusPath, 'bufferTabCount') ?? 0) >= targetTabCount) break;
    if (statusField<string>(statusPath, 'focus') !== 'files') {
      driver.sendRawInputWithoutFrameExpectation('\t');
      await awaitStatusPublication(
        statusPath,
        (status) => status.focus === 'files',
      );
    }
    driver.sendRawInputWithoutFrameExpectation('\x1b[B');
    driver.sendRawInputWithoutFrameExpectation('\r');
    await driver.assertNoCompleteFrameEmittedFor(50).catch(() => undefined);
    await driver.awaitQuiescence();
  }
  const tabsAfterOpen = statusField<number>(statusPath, 'bufferTabCount') ?? 0;
  const liveAfterOpen = statusField<number>(statusPath, 'bufferLiveCount') ?? 0;
  requireCondition(tabsAfterOpen > tabsBefore, `opening files adds tabs (${tabsBefore} to ${tabsAfterOpen})`);
  requireCondition(
    liveAfterOpen < tabsAfterOpen,
    `flyweight keeps live documents ${liveAfterOpen} below tabs ${tabsAfterOpen}`,
  );
  driver.sendKeys('Control+w');
  await driver.awaitQuiescence();
  if ((statusField<number>(statusPath, 'pendingCloseTab') ?? -1) >= 0) {
    driver.sendKeys('y');
    await driver.awaitQuiescence();
  }
  requireCondition(
    (statusField<number>(statusPath, 'bufferTabCount') ?? tabsAfterOpen) < tabsAfterOpen,
    'Ctrl+W closes the active tab',
  );

  console.log('== harness editor: demand-driven rendering is silent at rest ==');
  driver.sendKeys('Escape');
  await driver.awaitQuiescence();
  await driver.assertAtMostOneCompleteFrameEmittedFor(5_000);
  pass('complete synchronized frame delta is at most one during five untouched seconds');

  console.log('== harness editor: Ctrl+Q exits cleanly ==');
  driver.sendKeys('Control+q');
  const exitResult = await Promise.race([
    driver.exitCode().then(() => 'exited'),
    Bun.sleep(3_000).then(() => 'timeout'),
  ]);
  requireCondition(exitResult === 'exited', 'editor process exited after Ctrl+Q');
  console.log('smoke-editor-harness: ALL-PASS');
} finally {
  await driver.dispose();
  rmSync(homeDirectory, { recursive: true, force: true });
}
