#!/usr/bin/env bun
// Byte-level mouse contract for Quick Open, Find/Replace, and the open-project path navigator.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Search results are click-set and highlight-shown (src/modules/search/search.invariants.md)
// invariant: Find bar controls are mouse-clickable buttons (src/modules/search/search.invariants.md)
// invariant: Find options re-run the active query (src/modules/search/search.invariants.md)
// invariant: The open-project path input is a live directory navigator (src/modules/search/search.invariants.md)
// invariant: An un-openable open-project path is flagged live (src/modules/search/search.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { ThemePalettes } from '../../src/modules/theme/ThemePalettes';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { GraphClient } from './GraphClient';
import { PtyTestDriver } from './PtyTestDriver';

function resultRowBackground(
  snapshot: HarnessSnapshot.Model,
  marker: string,
): number | null {
  const position = snapshot.findText(marker);
  if (!position) return null;
  const cell = snapshot.cell(position.row, 31);
  return cell && !cell.isBackgroundDefault ? cell.background : null;
}

function requireNoSelectionArrow(
  snapshot: HarnessSnapshot.Model,
  resultMarkers: readonly string[],
  label: string,
): void {
  const resultRows = snapshot
    .textRows()
    .filter((rowText) =>
      resultMarkers.some((marker) => rowText.includes(marker)),
    );
  const rowsWithArrow = resultRows.filter((rowText) => rowText.includes('›'));
  HarnessSmoke.Class.requireCondition(
    resultRows.length > 0 && rowsWithArrow.length === 0,
    label,
  );
}

function findButtonGeometry(snapshot: HarnessSnapshot.Model): {
  row: number;
  caseColumn: number;
} {
  for (let row = 0; row < snapshot.rows; row++) {
    const rowText = snapshot.rowText(row);
    const caseColumn = rowText.indexOf('Aa');
    if (caseColumn >= 0 && rowText.includes('esc')) return { row, caseColumn };
  }
  throw new Error('FAIL could not locate the Find bar Aa button');
}

function findReplaceAllPosition(snapshot: HarnessSnapshot.Model): {
  row: number;
  column: number;
} {
  const buttonGeometry = findButtonGeometry(snapshot);
  const rowText = snapshot.rowText(buttonGeometry.row);
  const regexColumn = rowText.indexOf('.*', buttonGeometry.caseColumn);
  const replaceAllLabelColumn = rowText.indexOf(' R ', regexColumn + 2);
  if (replaceAllLabelColumn < 0)
    throw new Error('FAIL could not locate the Replace All button');
  return { row: buttonGeometry.row, column: replaceAllLabelColumn + 1 };
}

interface DialogBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

function parseRgbColor(hexColor: string): number {
  return Number.parseInt(hexColor.slice(1), 16);
}

function consentDialogBounds(status: StatusSnapshot): DialogBounds {
  const bounds = (
    status.overlayDialogBounds as
      Record<string, DialogBounds | null> | undefined
  )?.consentDialog;
  if (!bounds)
    throw new Error('FAIL the consent dialog bounds were not published');
  return bounds;
}

// The Cancel button paints as `  Cancel  `: two padding cells each side of the
// label, all on the focused-button selection background. Asserting every cell of
// that exact span (position, characters, shared background) inside the dialog's
// published bounds is what a substring search cannot do: a mis-padded button
// whose spaces are supplied by neighboring text has no such uniform span.
function cancelButtonPaintsPaddedSpan(
  snapshot: HarnessSnapshot.Model,
  bounds: DialogBounds,
  expectedBackground: number,
): boolean {
  const labelText = 'Cancel';
  const position = snapshot.findText(labelText);
  if (!position) return false;
  if (position.row < bounds.top || position.row >= bounds.top + bounds.height) {
    return false;
  }
  const paddingWidth = 2;
  const buttonStartColumn = position.column - paddingWidth;
  const buttonWidth = labelText.length + paddingWidth * 2;
  if (
    buttonStartColumn < bounds.left ||
    buttonStartColumn + buttonWidth > bounds.left + bounds.width
  ) {
    return false;
  }
  return Array.from({ length: buttonWidth }, (_unusedValue, columnOffset) => {
    const cell = snapshot.cell(position.row, buttonStartColumn + columnOffset);
    const expectedCharacter =
      columnOffset < paddingWidth || columnOffset >= buttonWidth - paddingWidth
        ? ' '
        : labelText[columnOffset - paddingWidth];
    return (
      cell !== null &&
      cell.characters === expectedCharacter &&
      cell.background === expectedBackground
    );
  }).every(Boolean);
}

function warningAlert(snapshot: HarnessSnapshot.Model): {
  character: string;
  foreground: number | null;
} {
  for (let row = 0; row < snapshot.rows; row++) {
    const rowText = snapshot.rowText(row);
    const alertColumn = rowText.indexOf('!');
    if (!rowText.includes('+') || alertColumn < 0) continue;
    const cell = snapshot.cell(row, alertColumn);
    return {
      character: cell?.characters ?? '',
      foreground: cell?.isForegroundRgb ? cell.foreground : null,
    };
  }
  return { character: '', foreground: null };
}

const navigatorBase = mkdtempSync(join(tmpdir(), 'tui-search-mouse-harness-'));

const fixtureRoot = join(navigatorBase, 'proj');

const homeDirectory = mkdtempSync(
  join(tmpdir(), 'tui-search-mouse-harness-home-'),
);

const statusPath = join(homeDirectory, 'status.json');

mkdirSync(fixtureRoot);

for (const directoryName of ['sibling-alpha', 'sibling-beta', 'zebra']) {
  mkdirSync(join(navigatorBase, directoryName));
}

await Bun.write(
  join(fixtureRoot, 'sample.txt'),
  'Alpha alpha ALPHA beta\nsecond line\nAlpha again here\n',
);

await Bun.write(join(fixtureRoot, 'other.txt'), 'nothing here\n');

HarnessSmoke.Class.runGit(fixtureRoot, ['init', '-q']);

const driver = new PtyTestDriver.Class({
  workspaceRoot: fixtureRoot,
  columns: 130,
  rows: 40,
  homeDirectory,
  environment: {
    TUI_STATUS_PATH: statusPath,
    NERD_FONT: '0',
    TERM_PROGRAM: 'xterm',
    LANG: 'C',
  },
});

try {
  console.log(
    '== harness search-mouse: Quick Open highlights rows and click-opens ==',
  );
  await driver.awaitSnapshot(
    (snapshot) => snapshot.findText('sample.txt') !== null,
    15_000,
  );
  driver.sendKeys('Control+p');
  let snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('Go to File') !== null &&
      candidate.findText('other.txt') !== null &&
      candidate.findText('sample.txt') !== null &&
      resultRowBackground(candidate, 'other.txt') !== null &&
      resultRowBackground(candidate, 'other.txt') !==
        resultRowBackground(candidate, 'sample.txt'),
  );
  requireNoSelectionArrow(
    snapshot,
    ['other.txt', 'sample.txt'],
    'Quick Open result rows have no arrow marker',
  );
  const selectedBackground = resultRowBackground(snapshot, 'other.txt');
  const unselectedBackground = resultRowBackground(snapshot, 'sample.txt');
  HarnessSmoke.Class.requireCondition(
    selectedBackground !== null && selectedBackground !== unselectedBackground,
    `default selection is shown by a distinct row background ` +
      `(selected=${String(selectedBackground)}, unselected=${String(unselectedBackground)})`,
  );
  const samplePosition = snapshot.findText('sample.txt');
  if (!samplePosition) throw new Error('FAIL sample result is not visible');
  driver.sendMouse({
    kind: 'move',
    column: 31,
    row: samplePosition.row,
    button: 'none',
  });
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      resultRowBackground(candidate, 'sample.txt') !== unselectedBackground,
  );
  const hoveredQuickOpenSelection = await GraphClient.Class.query(
    statusPath,
    'quickOpen.selectedIndex',
    'settle',
  );
  HarnessSmoke.Class.requireCondition(
    hoveredQuickOpenSelection.value === 0,
    'hover leaves keyboard selection unchanged',
  );
  driver.sendMouse({
    kind: 'press',
    column: 32,
    row: samplePosition.row,
    button: 'left',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: 32,
    row: samplePosition.row,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatusWithoutFrame(
    driver,
    statusPath,
    "status condition: String(status.activeBuffer).endsWith('/sample.txt') && status.quickOpenOpen === false",
    (status) =>
      String(status.activeBuffer).endsWith('/sample.txt') &&
      status.quickOpenOpen === false,
  );
  HarnessSmoke.Class.pass(
    'clicking a highlighted result opens it and closes Quick Open',
  );

  console.log(
    '== harness search-mouse: Find controls are live mouse buttons ==',
  );
  driver.sendKeys('Control+f');
  await driver.awaitSnapshot((candidate) => candidate.findText('Aa') !== null);
  driver.sendText('alpha');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.findMatchCount === 4 && status.findCurrentMatchIndex === 0',
    (status) =>
      status.findMatchCount === 4 && status.findCurrentMatchIndex === 0,
  );
  snapshot = driver.snapshot();
  let buttonGeometry = findButtonGeometry(snapshot);
  // #530 blind-press census: the Find bar just appeared, so the hit grid can
  // lag the painted frame by one native render. Park the pointer off the bar,
  // then hover the next button and await its own hover reveal before pressing.
  const nextButtonColumn = buttonGeometry.caseColumn - 4;
  driver.sendMouseWithoutFrameExpectation({
    kind: 'move',
    column: 0,
    row: snapshot.rows - 1,
    button: 'none',
  });
  const nextRestSnapshot = await driver.awaitGridCondition(
    'the Find next button rests unhovered before the aim',
    (candidate) =>
      candidate.cell(buttonGeometry.row, nextButtonColumn) !== null,
  );
  const nextRestCell = nextRestSnapshot.cell(
    buttonGeometry.row,
    nextButtonColumn,
  );
  if (!nextRestCell) throw new Error('FAIL Find next rest cell is missing');
  driver.sendMouseWithoutFrameExpectation({
    kind: 'move',
    column: nextButtonColumn,
    row: buttonGeometry.row,
    button: 'none',
  });
  await driver.awaitGridCondition(
    'the Find next button paints its hover state',
    (candidate) =>
      candidate.cell(buttonGeometry.row, nextButtonColumn)?.background !==
      nextRestCell.background,
  );
  driver.sendMouse({
    kind: 'press',
    column: nextButtonColumn,
    row: buttonGeometry.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: nextButtonColumn,
    row: buttonGeometry.row,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.findCurrentMatchIndex === 1',
    (status) => status.findCurrentMatchIndex === 1,
  );
  snapshot = await driver.awaitGridCondition(
    'the Find counter paints the second of four matches',
    (candidate) =>
      candidate.textRows().some((rowText) => rowText.includes('2 of 4')),
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.textRows().some((rowText) => rowText.includes('2 of 4')),
    'next button advances the rendered counter to 2 of 4',
  );
  const restCaseCell = snapshot.cell(
    buttonGeometry.row,
    buttonGeometry.caseColumn,
  );
  if (!restCaseCell) throw new Error('FAIL Find Aa rest cell is missing');
  driver.sendMouseWithoutFrameExpectation({
    kind: 'move',
    column: buttonGeometry.caseColumn,
    row: buttonGeometry.row,
    button: 'left',
  });
  const hoveredCaseSnapshot = await driver.awaitGridCondition(
    'the Find Aa button paints its hover state',
    (candidate) =>
      candidate.cell(buttonGeometry.row, buttonGeometry.caseColumn)
        ?.background !== restCaseCell.background,
  );
  const hoveredCaseCell = hoveredCaseSnapshot.cell(
    buttonGeometry.row,
    buttonGeometry.caseColumn,
  );
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column: buttonGeometry.caseColumn,
    row: buttonGeometry.row,
    button: 'left',
  });
  const pressedCaseSnapshot = await driver.awaitGridCondition(
    'the Find Aa button paints its pressed state',
    (candidate) => {
      const cell = candidate.cell(
        buttonGeometry.row,
        buttonGeometry.caseColumn,
      );
      return cell?.background !== hoveredCaseCell?.background;
    },
  );
  const pressedCaseCell = pressedCaseSnapshot.cell(
    buttonGeometry.row,
    buttonGeometry.caseColumn,
  );
  HarnessSmoke.Class.requireCondition(
    pressedCaseCell !== null &&
      pressedCaseCell.foreground !== pressedCaseCell.background,
    'the pressed Find Aa label keeps contrast against its background',
  );
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column: buttonGeometry.caseColumn,
    row: buttonGeometry.row,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: status.findCaseSensitive === true && status.findMatchCount === 1',
    (status) =>
      status.findCaseSensitive === true && status.findMatchCount === 1,
  );
  HarnessSmoke.Class.pass(
    'Aa click enables case sensitivity and immediately re-filters',
  );
  // #530 blind-press census: the old loop pressed both option buttons from
  // one stale snapshot; the second press could land on a moved control. Each
  // press is now separately aimed with a park-off + hover reveal, and the
  // second aim uses a fresh snapshot taken after the first toggle's status
  // effect.
  const pressFindOptionButton = async (
    buttonText: string,
    description: string,
  ): Promise<void> => {
    driver.sendMouseWithoutFrameExpectation({
      kind: 'move',
      column: 0,
      row: driver.snapshot().rows - 1,
      button: 'none',
    });
    const restSnapshot = await driver.awaitGridCondition(
      `the Find ${description} button is painted before the aim`,
      (candidate) => candidate.findText(buttonText) !== null,
    );
    const buttonPosition = restSnapshot.findText(buttonText);
    if (!buttonPosition)
      throw new Error(`FAIL Find ${description} button is not visible`);
    const restCell = restSnapshot.cell(
      buttonPosition.row,
      buttonPosition.column,
    );
    if (!restCell)
      throw new Error(`FAIL Find ${description} rest cell is missing`);
    driver.sendMouseWithoutFrameExpectation({
      kind: 'move',
      column: buttonPosition.column,
      row: buttonPosition.row,
      button: 'none',
    });
    await driver.awaitGridCondition(
      `the Find ${description} button paints its hover state`,
      (candidate) =>
        candidate.cell(buttonPosition.row, buttonPosition.column)
          ?.background !== restCell.background,
    );
    driver.sendMouse({
      kind: 'press',
      column: buttonPosition.column,
      row: buttonPosition.row,
      button: 'left',
    });
    driver.sendMouse({
      kind: 'release',
      column: buttonPosition.column,
      row: buttonPosition.row,
      button: 'left',
    });
  };
  await pressFindOptionButton('ab', 'whole-word');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the whole-word button publishes its active state',
    (status) => status.findWholeWord === true,
  );
  await pressFindOptionButton('.*', 'regex');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'whole-word and regex buttons publish their active state',
    (status) => status.findWholeWord === true && status.findUseRegex === true,
  );
  HarnessSmoke.Class.pass('ab and .* are visible live option buttons');

  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Escape closes Find before opening Replace',
    (status) => status.findOpen === false,
  );
  driver.sendKeys('Control+h');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Ctrl+H opens replace mode',
    (status) => status.findMode === 'replace',
  );
  const replaceBaselineStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the buffer revision is published before replace-all',
    (status) => typeof status.bufferRevision === 'number',
  );
  const revisionBeforeReplace = Number(replaceBaselineStatus.bufferRevision);
  snapshot = await driver.awaitGridCondition(
    'the Replace All button is painted',
    (candidate) => {
      try {
        findReplaceAllPosition(candidate);
        return true;
      } catch {
        return false;
      }
    },
  );
  const replaceAllPosition = findReplaceAllPosition(snapshot);
  driver.sendMouse({
    kind: 'press',
    column: replaceAllPosition.column,
    row: replaceAllPosition.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: replaceAllPosition.column,
    row: replaceAllPosition.row,
    button: 'left',
  });
  const consentStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Replace All waits in the shared dialog with safe focus',
    (status) =>
      status.consentDialogIdentifier === 'replace-all-in-file' &&
      status.consentDialogFocusedChoice === 'no' &&
      status.findBulkFlowState === 'awaitingConsent',
  );
  snapshot = await driver.awaitGridCondition(
    'Replace All consent copy is visible',
    (candidate) =>
      candidate.findText('Replace all in this file') !== null &&
      candidate.findText('Replace 1 item in sample.txt?') !== null &&
      candidate.findText('The editor will record one undo step.') !== null,
  );
  HarnessSmoke.Class.requireCondition(
    snapshot.findText('Replace 1 item in sample.txt?') !== null,
    'one replacement uses singular item copy',
  );
  const consentBounds = consentDialogBounds(consentStatus);
  const focusedButtonBackground = parseRgbColor(
    ThemePalettes.Class.DARK.selection,
  );
  snapshot = await driver.awaitGridCondition(
    'the safe Cancel action paints its own padded span',
    (candidate) =>
      cancelButtonPaintsPaddedSpan(
        candidate,
        consentBounds,
        focusedButtonBackground,
      ),
  );
  HarnessSmoke.Class.requireCondition(
    cancelButtonPaintsPaddedSpan(
      snapshot,
      consentBounds,
      focusedButtonBackground,
    ),
    'the safe Cancel action has key-width padding painted by the button itself',
  );
  driver.sendKeys('Escape');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'Escape cancels Replace All without a mutation',
    (status) =>
      status.consentDialogOpen === false &&
      Number(status.bufferRevision) === revisionBeforeReplace,
  );
  driver.sendKeys('Control+h');
  snapshot = await driver.awaitSnapshot((candidate) => {
    try {
      findReplaceAllPosition(candidate);
      return true;
    } catch {
      return false;
    }
  });
  const repeatedReplaceAllPosition = findReplaceAllPosition(snapshot);
  driver.sendMouse({
    kind: 'press',
    column: repeatedReplaceAllPosition.column,
    row: repeatedReplaceAllPosition.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: repeatedReplaceAllPosition.column,
    row: repeatedReplaceAllPosition.row,
    button: 'left',
  });
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the repeated Replace All reaches consent again',
    (status) => status.consentDialogIdentifier === 'replace-all-in-file',
  );
  driver.sendKeys('Left', 'Enter');
  const replacedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: Number(status.bufferRevision) > revisionBeforeReplace && status.findMatchCount === 0',
    (status) =>
      Number(status.bufferRevision) > revisionBeforeReplace &&
      status.findMatchCount === 0 &&
      status.dirty === true,
  );
  HarnessSmoke.Class.pass(
    `replace-all click mutated the document (${revisionBeforeReplace} to ${String(replacedStatus.bufferRevision)})`,
  );
  driver.sendKeys('Control+z');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'one undo opens the bulk confirmation',
    (status) =>
      status.consentDialogIdentifier === 'undo-replace-all-in-file' &&
      status.consentDialogFocusedChoice === 'no',
  );
  driver.sendKeys('Left', 'Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'confirmed undo restores the exact original lines',
    (status) =>
      JSON.stringify(status.editorLines) ===
        JSON.stringify([
          'Alpha alpha ALPHA beta',
          'second line',
          'Alpha again here',
          '',
        ]) && status.dirty === false,
  );
  driver.sendKeys('Control+y');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'one redo opens the bulk confirmation',
    (status) =>
      status.consentDialogIdentifier === 'redo-replace-all-in-file' &&
      status.consentDialogFocusedChoice === 'no',
  );
  driver.sendKeys('Left', 'Enter');
  await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'confirmed redo re-applies the bulk edit',
    (status) =>
      Number(status.bufferRevision) > revisionBeforeReplace &&
      status.dirty === true &&
      JSON.stringify(status.editorLines) ===
        JSON.stringify([
          'Alpha  ALPHA beta',
          'second line',
          'Alpha again here',
          '',
        ]),
  );

  console.log(
    '== harness search-mouse: open-project is a live click-drill navigator ==',
  );
  driver.sendKeys('F1');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('Command Palette') !== null,
  );
  driver.sendText('Open Folder');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('Open Folder') !== null,
  );
  driver.sendKeys('Enter');
  snapshot = await driver.awaitSnapshot(
    (candidate) =>
      candidate.findText('sibling-alpha') !== null &&
      candidate.findText('sibling-beta') !== null,
  );
  let status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: candidate.quickOpenMode === 'workspacePath' && candidate.quickOpenPathOpenable === true",
    (candidate) =>
      candidate.quickOpenMode === 'workspacePath' &&
      candidate.quickOpenPathOpenable === true,
  );
  HarnessSmoke.Class.requireCondition(
    status.quickOpenMode === 'workspacePath' &&
      status.quickOpenPathOpenable === true,
    'navigator opens on the real parent directory',
  );
  requireNoSelectionArrow(
    snapshot,
    ['sibling-alpha', 'sibling-beta'],
    'folder result rows have no arrow marker',
  );
  driver.sendText('sib');
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: candidate.quickOpenPathOpenable === false && candidate.quickOpenMatches === 2',
    (candidate) =>
      candidate.quickOpenPathOpenable === false &&
      candidate.quickOpenMatches === 2,
  );
  HarnessSmoke.Class.pass(
    'partial path is flagged and filters live to two siblings',
  );
  snapshot = await driver.awaitGridCondition(
    'the un-openable path warning is painted in a distinct color',
    (candidate) => {
      const candidateAlert = warningAlert(candidate);
      return (
        candidateAlert.character === '!' &&
        candidateAlert.foreground !== null &&
        candidateAlert.foreground !== 0xa9b1d6
      );
    },
  );
  const alert = warningAlert(snapshot);
  HarnessSmoke.Class.requireCondition(
    alert.character === '!' &&
      alert.foreground !== null &&
      alert.foreground !== 0xa9b1d6,
    `un-openable path paints a distinct warning alert (${String(alert.foreground)})`,
  );
  HarnessSmoke.Class.clickText(driver, snapshot, 'sibling-alpha', 2);
  status = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    "status condition: String(candidate.quickOpenQuery).includes('sibling-alpha/') && candidate.quickOpenOpen === true && candidate.quickOpenPathOpenable === true",
    (candidate) =>
      String(candidate.quickOpenQuery).includes('sibling-alpha/') &&
      candidate.quickOpenOpen === true &&
      candidate.quickOpenPathOpenable === true,
  );
  HarnessSmoke.Class.pass(
    `folder click drills into ${String(status.quickOpenQuery)}`,
  );

  driver.sendKeys('Control+q');
  console.log('smoke-search-mouse-harness: ALL-PASS');
} finally {
  await driver.dispose();
  await HarnessSmoke.Class.removeTemporaryDirectory(navigatorBase);
  await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
}
