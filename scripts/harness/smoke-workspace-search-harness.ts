#!/usr/bin/env bun
// This contract drives the left-dock Search surface through the real PTY.
// Run it with `bun scripts/harness/smoke-workspace-search-harness.ts`.
// ALL-PASS means mouse and keyboard search, exact match opening, result copy, shared scrolling,
// the 20,000-match cap, and the missing-ripgrep message hold at 10 and 100,000 lines.
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
  workspaceSearchQueryGeneration?: number;
  workspaceSearchResultCount?: number;
  workspaceSearchSelectedCount?: number;
  workspaceSearchFileCount?: number;
  workspaceSearchScrollTop?: number;
  workspaceSearchActiveField?: string;
  workspaceSearchSelectionChars?: number;
  workspaceSearchErrorMessage?: string;
  cursorLineIndex?: number;
  activeBuffer?: string | null;
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
      marker: 'Use ignores:',
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
      control.marker === 'Use ignores:'
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
    if (lineCount === 10) await driveButtonTooltips(driver, statusPath);

    const targetLineIndex = lineCount - 1;
    const targetMarker = `DRIVE-LINE-${String(lineCount).padStart(6, '0')}`;
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
          snapshot.findTextInRectangle(targetMarker, paneRectangle) !== null
        );
      },
    );

    driver.sendKeys('Tab', 'Tab', 'Tab', 'Tab');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: Tab reaches the result tree`,
      (status) => status.workspaceSearchActiveField === 'results',
    );
    driver.sendKeys('Down', 'Enter');
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
      'Workspace search is',
      'unavailable because ripgrep',
      'is not installed. Install',
      'ripgrep, make rg available',
      'in PATH, and restart Invar.',
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
await driveUnavailable();
console.log('smoke-workspace-search-harness: ALL-PASS');
