#!/usr/bin/env bun
// This contract drives the left-dock Search surface through the real PTY.
// Run it with `bun scripts/harness/smoke-workspace-search-harness.ts`.
// ALL-PASS means mouse and keyboard search, option toggles, match dismissal, exact match opening,
// result copy, shared scrolling, replacement consent, undo, redo, the 20,000-match cap, and the
// missing-ripgrep message hold at 10 and 100,000 lines.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Search results are click-set and highlight-shown (src/modules/search/search.invariants.md)
// invariant: Editable text fields share one input model (project.invariants.md)
// invariant: One generator owns each scroll position (src/modules/ui/scroll.invariants.md)
// invariant: Copy reaches the host terminal (src/modules/system/system.invariants.md)
import { mkdirSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
import { GraphClient } from './GraphClient';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { dragBetweenCells } from './HarnessSmokeSupport';
import { PtyTestDriver } from './PtyTestDriver';

interface WorkspaceSearchStatus {
  workspaceSearchFlowState?: string;
  workspaceSearchBulkFlowState?: string;
  workspaceSearchQueryGeneration?: number;
  workspaceSearchResultCount?: number;
  workspaceSearchSelectedCount?: number;
  workspaceSearchSelectedRow?: number;
  workspaceSearchFileCount?: number;
  workspaceSearchScrollTop?: number;
  workspaceSearchActiveField?: string;
  workspaceSearchSelectionChars?: number;
  workspaceSearchErrorMessage?: string;
  cursorLineIndex?: number;
  activeBuffer?: string | null;
  dirty?: boolean;
  workspaceSearchAppliedCount?: number;
  workspaceSearchDriftedCount?: number;
  workspaceSearchFailedCount?: number;
  workspaceSearchSkippedCount?: number;
}

function searchReady(
  status: WorkspaceSearchStatus,
  generation: number,
  resultCount: number,
): boolean {
  return (
    status.workspaceSearchFlowState === 'ready' &&
    Number(status.workspaceSearchQueryGeneration) > generation &&
    status.workspaceSearchResultCount === resultCount
  );
}

function resultOpened(
  status: WorkspaceSearchStatus,
  filePath: string,
  lineIndex: number,
): boolean {
  return (
    status.activeBuffer === filePath && status.cursorLineIndex === lineIndex
  );
}

function searchPaneRectangle(snapshot: HarnessSnapshot.Model): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const header = snapshot.findText('─Search');
  if (!header) throw new Error('FAIL Search pane header is not visible');
  const headerText = snapshot.rowText(header.row);
  const leftBorder = headerText.lastIndexOf('╭', header.column);
  const rightBorder = headerText.indexOf('╮', header.column);
  if (leftBorder < 0 || rightBorder <= leftBorder) {
    throw new Error('FAIL Search pane border does not enclose its header');
  }
  return {
    left: leftBorder + 1,
    top: header.row + 1,
    width: rightBorder - leftBorder - 1,
    height: snapshot.rows - header.row - 4,
  };
}

function searchActivityRow(snapshot: HarnessSnapshot.Model): number {
  const searchGlyph =
    ThemeIcons.Class.interfaceGlyphVocabularyFor('unicode').activitySearch;
  for (let row = 0; row < snapshot.rows; row += 1) {
    if (snapshot.cell(row, 2)?.characters === searchGlyph) return row;
  }
  throw new Error('FAIL Search activity glyph is not visible');
}

function clickCell(
  driver: PtyTestDriver.Model,
  column: number,
  row: number,
): void {
  driver.sendMouseWithoutFrameExpectation({
    kind: 'press',
    column,
    row,
    button: 'left',
  });
  driver.sendMouseWithoutFrameExpectation({
    kind: 'release',
    column,
    row,
    button: 'left',
  });
}

async function openSearchWithMouse(
  driver: PtyTestDriver.Model,
  statusPath: string,
): Promise<void> {
  const activityRow = searchActivityRow(driver.snapshot());
  driver.sendMouseWithoutFrameExpectation({
    kind: 'move',
    column: 2,
    row: activityRow,
    button: 'none',
  });
  await driver.awaitGridCondition(
    'the Search activity item paints its chord tooltip',
    (snapshot) => snapshot.findText('Search (Ctrl+Shift+F)') !== null,
  );
  clickCell(driver, 2, activityRow);
  await GraphClient.Class.awaitValue(
    statusPath,
    'primaryDockHost.activeId',
    'search',
  );
  await GraphClient.Class.awaitValue(
    statusPath,
    'primaryDockHost.visible',
    true,
  );

  clickCell(driver, 2, activityRow);
  await GraphClient.Class.awaitValue(
    statusPath,
    'primaryDockHost.visible',
    false,
  );
  clickCell(driver, 2, activityRow);
  await GraphClient.Class.awaitValue(
    statusPath,
    'primaryDockHost.visible',
    true,
  );
}

async function driveButtonTooltips(
  driver: PtyTestDriver.Model,
  statusPath: string,
): Promise<void> {
  const controls = [
    {
      marker: 'Aa',
      tooltip: 'Match case',
      path: 'workspaceSet.active.workspaceSearch.caseSensitive',
      expected: true,
    },
    {
      marker: 'ab',
      tooltip: 'Match whole word',
      path: 'workspaceSet.active.workspaceSearch.wholeWord',
      expected: true,
    },
    {
      marker: '.*',
      tooltip: 'Use regular expression',
      path: 'workspaceSet.active.workspaceSearch.useRegex',
      expected: true,
    },
    {
      marker: 'Use ignores',
      tooltip: 'Use workspace excludes and .gitignore',
      path: 'workspaceSet.active.workspaceSearch.useIgnoreFiles',
      expected: false,
    },
  ] as const;
  for (const control of controls) {
    const snapshot = driver.snapshot();
    const paneRectangle = searchPaneRectangle(snapshot);
    const position = snapshot.findTextInRectangle(
      control.marker,
      paneRectangle,
    );
    if (!position)
      throw new Error(`FAIL Search control ${control.marker} is not visible`);
    const column =
      control.marker === 'Use ignores'
        ? position.column + Math.floor(control.marker.length / 2)
        : position.column;
    driver.sendMouseWithoutFrameExpectation({
      kind: 'move',
      column,
      row: position.row,
      button: 'none',
    });
    await driver.awaitGridCondition(
      `${control.marker} paints its tooltip`,
      (candidate) => candidate.findText(control.tooltip) !== null,
    );
    clickCell(driver, column, position.row);
    await GraphClient.Class.awaitValue(
      statusPath,
      control.path,
      control.expected,
    );
  }
}

async function driveKeyboardOptions(
  driver: PtyTestDriver.Model,
  statusPath: string,
): Promise<void> {
  driver.sendKeys('Alt+i');
  await GraphClient.Class.awaitValue(
    statusPath,
    'workspaceSet.active.workspaceSearch.useIgnoreFiles',
    true,
  );
  driver.sendKeys('Alt+i');
  await GraphClient.Class.awaitValue(
    statusPath,
    'workspaceSet.active.workspaceSearch.useIgnoreFiles',
    false,
  );
}

async function driveScale(lineCount: 10 | 100_000): Promise<void> {
  const fixture = await HarnessSmoke.Class.createDriveScaleFixture(lineCount);
  const homeDirectory = mkdtempSync(
    join(tmpdir(), `tui-workspace-search-home-${lineCount}-`),
  );
  const statusPath = join(homeDirectory, 'status.json');
  mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
  await Bun.write(
    join(homeDirectory, '.config', 'invar', 'settings.json'),
    '{"glyphMode":"unicode"}\n',
  );
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixture.workspaceRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: { TUI_STATUS_PATH: statusPath, NERD_FONT: '0' },
  });

  try {
    await driver.awaitGridCondition(
      `scale ${lineCount}: the shared scale fixture is visible`,
      (snapshot) => snapshot.findText(`scale-${lineCount}.txt`) !== null,
      15_000,
    );
    if (lineCount === 10) {
      const knownBadStatus: WorkspaceSearchStatus = {
        workspaceSearchFlowState: 'idle',
        workspaceSearchQueryGeneration: 0,
        workspaceSearchResultCount: 0,
        cursorLineIndex: -1,
        activeBuffer: '',
        workspaceSearchScrollTop: 0,
        workspaceSearchErrorMessage: '',
      };
      HarnessSmoke.Class.requireCondition(
        !searchReady(knownBadStatus, 0, 1) &&
          !resultOpened(knownBadStatus, fixture.filePath, 9),
        'Search controls reject an idle result list and the wrong open file',
      );
    }

    await openSearchWithMouse(driver, statusPath);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: mouse opens Search and focuses the query`,
      (status) => status.workspaceSearchActiveField === 'query',
    );
    if (lineCount === 10) {
      await driveButtonTooltips(driver, statusPath);
      await driveKeyboardOptions(driver, statusPath);
    }

    const targetLineIndex = lineCount - 1;
    const targetMarker = `DRIVE-LINE-${String(lineCount).padStart(6, '0')}`;
    const visibleTargetMarker =
      lineCount === 100_000 ? targetMarker.slice(0, -1) : targetMarker;
    let generation = Number(
      HarnessSmoke.Class.readStatus(statusPath)
        .workspaceSearchQueryGeneration ?? 0,
    );
    driver.sendText(targetMarker);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: the unique query returns one result`,
      (status) => searchReady(status, generation, 1),
    );
    await driver.awaitGridCondition(
      `scale ${lineCount}: the unique match is painted in the Search tree`,
      (snapshot) => {
        const paneRectangle = searchPaneRectangle(snapshot);
        paneRectangle.top += 6;
        paneRectangle.height -= 6;
        return (
          snapshot.findTextInRectangle(visibleTargetMarker, paneRectangle) !==
          null
        );
      },
    );

    driver.sendKeys('Tab', 'Tab', 'Tab', 'Tab');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: Tab reaches the result tree`,
      (status) =>
        status.workspaceSearchActiveField === 'results' &&
        status.workspaceSearchSelectedRow === 0,
    );
    if (lineCount === 10) {
      driver.sendKeysWithoutFrameExpectation('Alt+d');
      const fileRowDismissCount = Number(
        (
          await GraphClient.Class.query(
            statusPath,
            'workspaceSet.active.workspaceSearch.resultTree.selectedCount',
            'settle',
          )
        ).value,
      );
      HarnessSmoke.Class.requireCondition(
        fileRowDismissCount === 1,
        'Alt+D does not dismiss the selected file group',
      );
    }
    driver.sendKeys('Down');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: Down selects the exact match`,
      (status) => status.workspaceSearchSelectedRow === 1,
    );
    if (lineCount === 10) {
      driver.sendKeys('Alt+d');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'Alt+D dismisses the selected match',
        (status) => status.workspaceSearchSelectedCount === 0,
      );
      driver.sendKeys('Alt+d');
      const repeatedDismissCount = Number(
        (
          await GraphClient.Class.query(
            statusPath,
            'workspaceSet.active.workspaceSearch.resultTree.selectedCount',
            'settle',
          )
        ).value,
      );
      HarnessSmoke.Class.requireCondition(
        repeatedDismissCount === 0,
        'repeating Alt+D keeps the selected match dismissed',
      );
    }
    driver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: keyboard opens the exact match`,
      (status) => resultOpened(status, fixture.filePath, targetLineIndex),
    );

    driver.sendKeys('Control+Shift+f');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: the Search chord returns to the query`,
      (status) => status.workspaceSearchActiveField === 'query',
    );
    generation = Number(
      HarnessSmoke.Class.readStatus(statusPath)
        .workspaceSearchQueryGeneration ?? 0,
    );
    driver.sendKeys('Control+a');
    driver.sendText('DRIVE-LINE-000001');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: a second query replaces the first generation`,
      (status) => searchReady(status, generation, 1),
    );
    let snapshot = await driver.awaitGridCondition(
      `scale ${lineCount}: the second-generation match is painted`,
      (candidate) => {
        const candidateRectangle = searchPaneRectangle(candidate);
        candidateRectangle.top += 6;
        candidateRectangle.height -= 6;
        return (
          candidate.findTextInRectangle(
            'DRIVE-LINE-000001',
            candidateRectangle,
          ) !== null
        );
      },
    );
    const paneRectangle = searchPaneRectangle(snapshot);
    paneRectangle.top += 6;
    paneRectangle.height -= 6;
    const firstMatch = snapshot.findTextInRectangle(
      'DRIVE-LINE-000001',
      paneRectangle,
    );
    if (!firstMatch)
      throw new Error('FAIL the first-line match is not visible');
    clickCell(driver, firstMatch.column + 4, firstMatch.row);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: mouse opens the exact match`,
      (status) => resultOpened(status, fixture.filePath, 0),
    );

    if (lineCount === 10) {
      driver.sendKeys('Control+Shift+f');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'the Search chord focuses the query before result copy',
        (status) => status.workspaceSearchActiveField === 'query',
      );
      snapshot = driver.snapshot();
      const copyRectangle = searchPaneRectangle(snapshot);
      copyRectangle.top += 6;
      copyRectangle.height -= 6;
      const copyMatch = snapshot.findTextInRectangle(
        'DRIVE-LINE-000001',
        copyRectangle,
      );
      if (!copyMatch) throw new Error('FAIL the copy match is not visible');
      await dragBetweenCells(
        driver,
        copyMatch.column,
        copyMatch.row,
        copyMatch.column + 9,
        copyMatch.row,
      );
      await HarnessSmoke.Class.awaitStatusWithoutFrame(
        driver,
        statusPath,
        'pointer drag selects Search result text',
        (status) => Number(status.workspaceSearchSelectionChars) === 10,
      );
      const copyCount = Number(
        HarnessSmoke.Class.readStatus(statusPath)
          .clipboardCopyCompletionCount ?? 0,
      );
      driver.sendRawInputWithoutFrameExpectation('\x03');
      await HarnessSmoke.Class.awaitStatusWithoutFrame(
        driver,
        statusPath,
        'Search result copy completes through the shared clipboard',
        (status) =>
          Number(status.clipboardCopyCompletionCount) === copyCount + 1 &&
          Number(status.lastCopyChars) === 10,
      );
    } else {
      driver.sendKeys('Control+Shift+f');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'the large-scale Search chord focuses the query',
        (status) => status.workspaceSearchActiveField === 'query',
      );
      generation = Number(
        HarnessSmoke.Class.readStatus(statusPath)
          .workspaceSearchQueryGeneration ?? 0,
      );
      driver.sendKeys('Control+a');
      driver.sendText('DRIVE-LINE');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'the large-scale query stops at the 20,000-match cap',
        (status) => searchReady(status, generation, 20_000),
      );
      const rowCount = Number(
        (
          await GraphClient.Class.query(
            statusPath,
            'workspaceSet.active.workspaceSearch.resultTree.rows.length',
            'settle',
          )
        ).value,
      );
      await GraphClient.Class.awaitValue(
        statusPath,
        `workspaceSet.active.workspaceSearch.resultTree.rows.${rowCount - 1}.kind`,
        'limitNotice',
      );
      driver.sendKeys('Tab', 'Tab', 'Tab', 'Tab');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'the large-scale result tree receives keyboard focus',
        (status) => status.workspaceSearchActiveField === 'results',
      );
      driver.sendKeys('PageDown');
      const pagedStatus = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'PageDown moves the shared Search result scroll position',
        (status) => Number(status.workspaceSearchScrollTop) > 0,
      );
      const pageTop = Number(pagedStatus.workspaceSearchScrollTop);
      for (let wheelIndex = 0; wheelIndex < 3; wheelIndex += 1) {
        driver.sendMouseWithoutFrameExpectation({
          kind: 'wheel',
          column: 20,
          row: 20,
          direction: 'down',
        });
      }
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'wheel momentum advances the same Search result scroll position',
        (status) => Number(status.workspaceSearchScrollTop) > pageTop,
      );
    }
    HarnessSmoke.Class.pass(
      `scale ${lineCount}: mouse, keyboard, exact open, and Search tree behavior passed`,
    );
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(fixture.workspaceRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

async function driveReplacementScale(lineCount: 10 | 100_000): Promise<void> {
  const fixture = await HarnessSmoke.Class.createDriveScaleFixture(lineCount);
  const homeDirectory = mkdtempSync(
    join(tmpdir(), `tui-workspace-replace-home-${lineCount}-`),
  );
  const statusPath = join(homeDirectory, 'status.json');
  mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
  await Bun.write(
    join(homeDirectory, '.config', 'invar', 'settings.json'),
    '{"glyphMode":"unicode"}\n',
  );
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixture.workspaceRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: { TUI_STATUS_PATH: statusPath, NERD_FONT: '0' },
  });
  const targetMarker = `DRIVE-LINE-${String(lineCount).padStart(6, '0')}`;
  const visibleTargetMarker =
    lineCount === 100_000 ? targetMarker.slice(0, -1) : targetMarker;
  const replacementText = `REPLACED-${String(lineCount)}`;

  try {
    await driver.awaitGridCondition(
      `replace scale ${lineCount}: the shared scale fixture is visible`,
      (snapshot) => snapshot.findText(`scale-${lineCount}.txt`) !== null,
      15_000,
    );
    if (lineCount === 10) {
      const plantedUnappliedStatus: WorkspaceSearchStatus = {
        workspaceSearchResultCount: 1,
        workspaceSearchAppliedCount: 0,
        workspaceSearchDriftedCount: 0,
        workspaceSearchFailedCount: 0,
        workspaceSearchSkippedCount: 0,
        dirty: false,
      };
      HarnessSmoke.Class.requireCondition(
        !(
          plantedUnappliedStatus.workspaceSearchResultCount === 0 &&
          plantedUnappliedStatus.workspaceSearchAppliedCount === 1 &&
          plantedUnappliedStatus.workspaceSearchDriftedCount === 0 &&
          plantedUnappliedStatus.workspaceSearchFailedCount === 0 &&
          plantedUnappliedStatus.workspaceSearchSkippedCount === 0 &&
          plantedUnappliedStatus.dirty === true
        ),
        'the replacement completion check rejects an unapplied result',
      );
    }

    driver.sendKeys('Control+Shift+f');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `replace scale ${lineCount}: Search focuses the query`,
      (status) => status.workspaceSearchActiveField === 'query',
    );
    driver.sendText(targetMarker);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `replace scale ${lineCount}: the unique query returns one item`,
      (status) =>
        status.workspaceSearchFlowState === 'ready' &&
        status.workspaceSearchResultCount === 1,
    );
    let snapshot = await driver.awaitGridCondition(
      `replace scale ${lineCount}: the target item is visible`,
      (candidate) => {
        const candidateRectangle = searchPaneRectangle(candidate);
        candidateRectangle.top += 6;
        candidateRectangle.height -= 6;
        return (
          candidate.findTextInRectangle(
            visibleTargetMarker,
            candidateRectangle,
          ) !== null
        );
      },
    );
    const resultRectangle = searchPaneRectangle(snapshot);
    resultRectangle.top += 6;
    resultRectangle.height -= 6;
    const matchPosition = snapshot.findTextInRectangle(
      visibleTargetMarker,
      resultRectangle,
    );
    if (!matchPosition) throw new Error('FAIL replacement target is missing');
    clickCell(driver, matchPosition.column + 4, matchPosition.row);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `replace scale ${lineCount}: the target file and line open`,
      (status) => resultOpened(status, fixture.filePath, lineCount - 1),
    );

    const paneRectangle = searchPaneRectangle(driver.snapshot());
    clickCell(driver, paneRectangle.left + 2, paneRectangle.top + 1);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `replace scale ${lineCount}: the replacement field receives focus`,
      (status) => status.workspaceSearchActiveField === 'replacement',
    );
    driver.sendText(replacementText);
    await driver.awaitGridCondition(
      `replace scale ${lineCount}: the replacement preview is visible`,
      (candidate) => candidate.findText(`→ ${replacementText}`) !== null,
    );
    snapshot = driver.snapshot();
    const replaceAllPosition = snapshot.findText('Replace All');
    if (!replaceAllPosition) throw new Error('FAIL Replace All is not visible');
    clickCell(
      driver,
      replaceAllPosition.column + Math.floor('Replace All'.length / 2),
      replaceAllPosition.row,
    );
    await GraphClient.Class.awaitValue(
      statusPath,
      'quitConfirmation.open',
      true,
    );
    await driver.awaitGridCondition(
      `replace scale ${lineCount}: consent names one item and one file`,
      (candidate) =>
        candidate.findText('Replace 1 item across 1 file?') !== null &&
        candidate.findText('Cancel') !== null,
    );
    driver.sendKeys('Escape');
    await GraphClient.Class.awaitValue(
      statusPath,
      'quitConfirmation.open',
      false,
    );
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `replace scale ${lineCount}: Escape keeps the item unchanged`,
      (status) =>
        status.workspaceSearchResultCount === 1 && status.dirty === false,
    );

    if (lineCount === 10) {
      snapshot = driver.snapshot();
      const currentPaneRectangle = searchPaneRectangle(snapshot);
      const editorRectangle = {
        left: currentPaneRectangle.left + currentPaneRectangle.width + 1,
        top: 0,
        width:
          snapshot.columns -
          currentPaneRectangle.left -
          currentPaneRectangle.width -
          1,
        height: snapshot.rows,
      };
      const sourcePosition = snapshot.findTextInRectangle(
        `${targetMarker} content at scale`,
        editorRectangle,
      );
      if (!sourcePosition)
        throw new Error('FAIL the source line is not visible for drift');
      clickCell(driver, sourcePosition.column + 5, sourcePosition.row);
      driver.sendText('X');
      await driver.awaitGridCondition(
        'replace drift: the editor paints the changed match',
        (candidate) => candidate.findText('DRIVEX-LINE-000010') !== null,
      );
      snapshot = driver.snapshot();
      const driftReplacePosition = snapshot.findText('Replace All');
      if (!driftReplacePosition)
        throw new Error('FAIL Replace All is missing for drift');
      clickCell(
        driver,
        driftReplacePosition.column + Math.floor('Replace All'.length / 2),
        driftReplacePosition.row,
      );
      await GraphClient.Class.awaitValue(
        statusPath,
        'quitConfirmation.open',
        true,
      );
      await driver.awaitGridCondition(
        'replace drift: consent names the changed item and zero safe items',
        (candidate) =>
          candidate.findText(
            '1 of 1 items changed since this search and will be skipped.',
          ) !== null &&
          candidate.findText('Replace 0 safe items across 0 files?') !== null,
      );
      driver.sendKeys('Escape');
      await GraphClient.Class.awaitValue(
        statusPath,
        'quitConfirmation.open',
        false,
      );
      const changedPosition = driver.snapshot().findText('DRIVEX-LINE-000010');
      if (!changedPosition)
        throw new Error('FAIL the drifted source line is missing');
      clickCell(driver, changedPosition.column, changedPosition.row);
      driver.sendKeys('Control+z');
      await driver.awaitGridCondition(
        'replace drift: ordinary undo restores the searched match',
        (candidate) =>
          candidate.findText(`${targetMarker} content at scale`) !== null,
      );
    }

    snapshot = driver.snapshot();
    const confirmedReplaceAllPosition = snapshot.findText('Replace All');
    if (!confirmedReplaceAllPosition)
      throw new Error('FAIL Replace All disappeared after cancel');
    clickCell(
      driver,
      confirmedReplaceAllPosition.column + Math.floor('Replace All'.length / 2),
      confirmedReplaceAllPosition.row,
    );
    await GraphClient.Class.awaitValue(
      statusPath,
      'quitConfirmation.open',
      true,
    );
    driver.sendKeys('Tab');
    await GraphClient.Class.awaitValue(
      statusPath,
      'quitConfirmation.focusedChoice',
      'yes',
    );
    driver.sendKeys('Enter');
    await GraphClient.Class.awaitValue(
      statusPath,
      'quitConfirmation.open',
      false,
    );
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `replace scale ${lineCount}: one item applies with no skip`,
      (status) =>
        status.workspaceSearchResultCount === 0 &&
        status.workspaceSearchAppliedCount === 1 &&
        status.workspaceSearchDriftedCount === 0 &&
        status.workspaceSearchFailedCount === 0 &&
        status.workspaceSearchSkippedCount === 0 &&
        status.dirty === true,
    );
    await driver.awaitGridCondition(
      `replace scale ${lineCount}: the editor paints the replacement`,
      (candidate) =>
        candidate.findText(`${replacementText} content at scale`) !== null,
    );

    snapshot = driver.snapshot();
    const undoPosition = snapshot.findText('Undo');
    if (!undoPosition) throw new Error('FAIL workspace Undo is not visible');
    clickCell(driver, undoPosition.column + 2, undoPosition.row);
    await GraphClient.Class.awaitValue(
      statusPath,
      'quitConfirmation.open',
      true,
    );
    await driver.awaitGridCondition(
      `replace scale ${lineCount}: undo consent names one item and one file`,
      (candidate) =>
        candidate.findText('Undo will revert 1 item across 1 file.') !== null,
    );
    driver.sendKeys('Tab', 'Enter');
    await GraphClient.Class.awaitValue(
      statusPath,
      'quitConfirmation.open',
      false,
    );
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `replace scale ${lineCount}: undo restores the source and dirty state`,
      (status) =>
        status.workspaceSearchFlowState === 'ready' &&
        status.workspaceSearchBulkFlowState === 'undone' &&
        !status.dirty,
    );
    await driver.awaitGridCondition(
      `replace scale ${lineCount}: the editor paints the restored source`,
      (candidate) =>
        candidate.findText(`${targetMarker} content at scale`) !== null,
    );

    snapshot = driver.snapshot();
    const redoPosition = snapshot.findText('Redo');
    if (!redoPosition) throw new Error('FAIL workspace Redo is not visible');
    clickCell(driver, redoPosition.column + 2, redoPosition.row);
    await GraphClient.Class.awaitValue(
      statusPath,
      'quitConfirmation.open',
      true,
    );
    driver.sendKeys('Tab', 'Enter');
    await GraphClient.Class.awaitValue(
      statusPath,
      'quitConfirmation.open',
      false,
    );
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `replace scale ${lineCount}: redo reapplies one item`,
      (status) =>
        status.workspaceSearchFlowState === 'ready' &&
        status.workspaceSearchBulkFlowState === 'applied' &&
        status.dirty,
    );
    if (lineCount === 10) {
      snapshot = driver.snapshot();
      const replacementPosition = snapshot.findText(
        `${replacementText} content at scale`,
      );
      if (!replacementPosition)
        throw new Error('FAIL replacement line is missing for undo drift');
      clickCell(
        driver,
        replacementPosition.column + 3,
        replacementPosition.row,
      );
      driver.sendText('X');
      await driver.awaitGridCondition(
        'undo drift: the editor paints the changed replacement',
        (candidate) => candidate.findText('REPXLACED-10') !== null,
      );
      snapshot = driver.snapshot();
      const driftUndoPosition = snapshot.findText('Undo');
      if (!driftUndoPosition)
        throw new Error('FAIL workspace Undo is missing for drift');
      clickCell(driver, driftUndoPosition.column + 2, driftUndoPosition.row);
      await GraphClient.Class.awaitValue(
        statusPath,
        'quitConfirmation.open',
        true,
      );
      await driver.awaitGridCondition(
        'undo drift: consent names the changed item and zero safe items',
        (candidate) =>
          candidate.findText(
            '1 of 1 items changed since replacement and will be skipped.',
          ) !== null &&
          candidate.findText(
            'Undo will revert 0 safe items across 0 files.',
          ) !== null,
      );
      driver.sendKeys('Escape');
      await GraphClient.Class.awaitValue(
        statusPath,
        'quitConfirmation.open',
        false,
      );
      const changedReplacementPosition = driver
        .snapshot()
        .findText('REPXLACED-10');
      if (!changedReplacementPosition)
        throw new Error('FAIL changed replacement is missing after cancel');
      clickCell(
        driver,
        changedReplacementPosition.column,
        changedReplacementPosition.row,
      );
      driver.sendKeys('Control+z');
      await driver.awaitGridCondition(
        'undo drift: ordinary undo restores the replacement text',
        (candidate) =>
          candidate.findText(`${replacementText} content at scale`) !== null,
      );
    }
    HarnessSmoke.Class.pass(
      `replace scale ${lineCount}: consent, cancel, replace, undo, and redo passed`,
    );
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(fixture.workspaceRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

async function driveUnavailable(): Promise<void> {
  const fixture = await HarnessSmoke.Class.createDriveScaleFixture(10);
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'tui-workspace-search-unavailable-home-'),
  );
  const binaryDirectory = mkdtempSync(
    join(tmpdir(), 'tui-workspace-search-path-without-rg-'),
  );
  const statusPath = join(homeDirectory, 'status.json');
  symlinkSync('/usr/bin/setsid', join(binaryDirectory, 'setsid'));
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixture.workspaceRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: { TUI_STATUS_PATH: statusPath, PATH: binaryDirectory },
  });
  const expectedMessage =
    'Workspace search is unavailable because ripgrep is not installed. ' +
    'Install ripgrep, make rg available in PATH, and restart Invar.';
  try {
    await driver.awaitGridCondition(
      'the unavailable fixture boots before Search opens',
      (snapshot) => snapshot.findText('scale-10.txt') !== null,
      15_000,
    );
    driver.sendKeys('Control+Shift+f');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the unavailable Search chord focuses the query',
      (status) => status.workspaceSearchActiveField === 'query',
    );
    driver.sendText('DRIVE-LINE');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'missing ripgrep publishes the exact unavailable state',
      (status) =>
        status.workspaceSearchFlowState === 'unavailable' &&
        status.workspaceSearchResultCount === 0 &&
        status.workspaceSearchErrorMessage === expectedMessage,
    );
    const unavailableFragments = [
      'Workspace search is unavaila',
      'ble because ripgrep is not i',
      'nstalled. Install ripgrep, m',
      'ake rg available in PATH, an',
      'd restart Invar.',
    ];
    const unavailableSnapshot = await driver.awaitGridCondition(
      'the unavailable Search message is painted across its wrapped rows',
      (candidate) => {
        const candidateRectangle = searchPaneRectangle(candidate);
        return unavailableFragments.every(
          (fragment) =>
            candidate.findTextInRectangle(fragment, candidateRectangle) !==
            null,
        );
      },
    );
    const paneRectangle = searchPaneRectangle(unavailableSnapshot);
    for (const fragment of unavailableFragments) {
      HarnessSmoke.Class.requireCondition(
        unavailableSnapshot.findTextInRectangle(fragment, paneRectangle) !==
          null,
        `the unavailable Search pane paints ${JSON.stringify(fragment)}`,
      );
    }
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(fixture.workspaceRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
    await HarnessSmoke.Class.removeTemporaryDirectory(binaryDirectory);
  }
}

await driveScale(10);
await driveScale(100_000);
await driveReplacementScale(10);
await driveReplacementScale(100_000);
await driveUnavailable();
console.log('smoke-workspace-search-harness: ALL-PASS');
