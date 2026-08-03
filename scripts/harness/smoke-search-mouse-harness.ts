#!/usr/bin/env bun
// Byte-level mouse contract for Quick Open, Find/Replace, and the open-project path navigator.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Search results are click-set and highlight-shown (src/modules/search/search.invariants.md)
// invariant: Find bar controls are mouse-clickable buttons (src/modules/search/search.invariants.md)
// invariant: Case sensitivity is a live toggle that re-runs the query (src/modules/search/search.invariants.md)
// invariant: The open-project path input is a live directory navigator (src/modules/search/search.invariants.md)
// invariant: An un-openable open-project path is flagged live (src/modules/search/search.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  driver.sendMouse({
    kind: 'press',
    column: buttonGeometry.caseColumn - 4,
    row: buttonGeometry.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: buttonGeometry.caseColumn - 4,
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
  driver.sendMouse({
    kind: 'press',
    column: buttonGeometry.caseColumn,
    row: buttonGeometry.row,
    button: 'left',
  });
  driver.sendMouse({
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

  driver.sendKeys('Control+h');
  await driver.awaitSnapshot(
    (candidate) => candidate.findText('Replace') !== null,
  );
  const replaceBaselineStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'the buffer revision is published before replace-all',
    (status) => typeof status.bufferRevision === 'number',
  );
  const revisionBeforeReplace = Number(replaceBaselineStatus.bufferRevision);
  buttonGeometry = findButtonGeometry(driver.snapshot());
  const replaceAllColumn = buttonGeometry.caseColumn + 9;
  driver.sendMouse({
    kind: 'press',
    column: replaceAllColumn,
    row: buttonGeometry.row,
    button: 'left',
  });
  driver.sendMouse({
    kind: 'release',
    column: replaceAllColumn,
    row: buttonGeometry.row,
    button: 'left',
  });
  const replacedStatus = await HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    'status condition: Number(status.bufferRevision) > revisionBeforeReplace && status.findMatchCount === 0',
    (status) =>
      Number(status.bufferRevision) > revisionBeforeReplace &&
      status.findMatchCount === 0,
  );
  HarnessSmoke.Class.pass(
    `replace-all click mutated the document (${revisionBeforeReplace} to ${String(replacedStatus.bufferRevision)})`,
  );
  driver.sendKeys('Escape');
  await driver.awaitGridCondition(
    'Escape closes Find before Command Palette input',
    (candidate) => candidate.findText('Find / Replace') === null,
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
