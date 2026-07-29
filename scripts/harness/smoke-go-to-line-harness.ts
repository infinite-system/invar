#!/usr/bin/env bun
// This contract drives go-to-line through the real PTY at 10 and 100,000 lines.
// Run it with `bun scripts/harness/smoke-go-to-line-harness.ts`.
// ALL-PASS means valid targets land in reading view, large targets clamp, malformed input does not
// move, and Back/Forward restore both jump ends at both document scales.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Explicit jumps use one reading position (src/modules/text/text.invariants.md)
// invariant: Programmatic history navigation does not record new history (src/modules/navigation/navigation.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

interface GoToLineStatus {
  cursor?: { line?: number; col?: number } | null;
  cursorLineIndex?: number;
  editorScrollTop?: number;
  goToLineOpen?: boolean;
  goToLineNotice?: string;
}

function validTargetLanded(
  status: GoToLineStatus,
  targetLine: number,
  targetColumn: number,
): boolean {
  return (
    status.goToLineOpen === false &&
    status.cursorLineIndex === targetLine - 1 &&
    status.cursor?.col === targetColumn - 1
  );
}

function lineClamped(status: GoToLineStatus, lineCount: number): boolean {
  return status.cursorLineIndex === lineCount - 1;
}

function historyRestored(
  status: GoToLineStatus,
  expectedLineIndex: number,
): boolean {
  return status.cursorLineIndex === expectedLineIndex;
}

function malformedInputStayedPut(
  status: GoToLineStatus,
  cursorBeforeMalformed: GoToLineStatus['cursor'],
  scrollTopBeforeMalformed: number,
): boolean {
  return (
    status.goToLineOpen === true &&
    status.goToLineNotice === 'Enter a line or line:column' &&
    JSON.stringify(status.cursor) === JSON.stringify(cursorBeforeMalformed) &&
    status.editorScrollTop === scrollTopBeforeMalformed
  );
}

async function driveScale(lineCount: 10 | 100_000): Promise<void> {
  const workspaceRoot = mkdtempSync(
    join(tmpdir(), `tui-go-to-line-${lineCount}-`),
  );
  const homeDirectory = mkdtempSync(
    join(tmpdir(), `tui-go-to-line-home-${lineCount}-`),
  );
  const documentPath = join(workspaceRoot, `scale-${lineCount}.txt`);
  const statusPath = join(homeDirectory, 'status.json');
  const fixtureLines = Array.from(
    { length: lineCount },
    (_unusedValue, lineIndex) =>
      `DRIVE-LINE-${String(lineIndex + 1).padStart(6, '0')} content at scale ${lineCount}`,
  );
  await Bun.write(documentPath, fixtureLines.join('\n'));

  const driver = new PtyTestDriver.Class({
    workspaceRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: { TUI_STATUS_PATH: statusPath },
  });

  try {
    await driver.awaitSnapshot(
      (snapshot) => snapshot.findText(`scale-${lineCount}.txt`) !== null,
      15_000,
    );
    driver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: fixture is active at line zero`,
      (status) =>
        status.activeBuffer === documentPath &&
        status.cursorLineIndex === 0 &&
        status.editorScrollTop === 0,
    );

    if (lineCount === 10) {
      driver.sendKeys('Control+Shift+p');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'the command palette opens',
        (status) => status.paletteOpen === true,
      );
      driver.sendText('editor go to line');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'editor.goToLine is the sole palette match',
        (status) => status.paletteMatches === 1,
      );
      driver.sendKeys('Enter');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'the palette command opens the shared prompt',
        (status) =>
          status.paletteOpen === false && status.goToLineOpen === true,
      );
      driver.sendKeys('Escape');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'Escape closes the command-opened prompt',
        (status) => status.goToLineOpen === false,
      );
    }

    const targetLine = lineCount === 10 ? 7 : 75_000;
    const targetColumn = lineCount === 10 ? 5 : 10;
    if (lineCount === 10) {
      const knownBadStatus: GoToLineStatus = {
        cursor: { line: -1, col: -1 },
        cursorLineIndex: -1,
        editorScrollTop: -1,
        goToLineOpen: true,
        goToLineNotice: '',
      };
      HarnessSmoke.Class.requireCondition(
        !validTargetLanded(knownBadStatus, targetLine, targetColumn),
        'valid-target control rejects the wrong cursor and open prompt',
      );
      HarnessSmoke.Class.requireCondition(
        !lineClamped(knownBadStatus, lineCount),
        'clamp control rejects a cursor outside the document',
      );
      HarnessSmoke.Class.requireCondition(
        !historyRestored(knownBadStatus, 0) &&
          !historyRestored(knownBadStatus, targetLine - 1),
        'history control rejects wrong Back and Forward positions',
      );
      HarnessSmoke.Class.requireCondition(
        !malformedInputStayedPut(knownBadStatus, { line: 0, col: 0 }, 0),
        'malformed-input control rejects movement and a missing notice',
      );
      HarnessSmoke.Class.requireCondition(
        knownBadStatus.editorScrollTop !== targetLine - 3,
        'reading-position control rejects the wrong viewport',
      );
      HarnessSmoke.Class.pass(
        'valid, clamp, malformed, history, and reading controls rejected known-bad states',
      );
    }
    driver.sendKeys('Alt+g');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: Alt+G opens the prompt`,
      (status) => status.goToLineOpen === true,
    );
    driver.sendText(`${targetLine}:${targetColumn}`);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: the shared field receives line:column`,
      (status) => status.goToLineValue === `${targetLine}:${targetColumn}`,
    );
    driver.sendKeys('Enter');
    const landedStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: the valid target lands`,
      (status) => validTargetLanded(status, targetLine, targetColumn),
    );
    if (lineCount === 100_000) {
      HarnessSmoke.Class.requireCondition(
        landedStatus.editorScrollTop === targetLine - 3,
        'the 100,000-line target has two reading rows above it',
      );
    }

    driver.sendKeys('Alt+[');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: Back restores the jump source`,
      (status) => historyRestored(status, 0),
    );
    driver.sendKeys('Alt+]');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: Forward restores the jump target`,
      (status) => historyRestored(status, targetLine - 1),
    );

    driver.sendKeys('Alt+g');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: prompt reopens for the clamp arm`,
      (status) => status.goToLineOpen === true,
    );
    driver.sendText('999999');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: out-of-range input is present`,
      (status) => status.goToLineValue === '999999',
    );
    driver.sendKeys('Enter');
    const clampedStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: out-of-range line clamps to the document end`,
      (status) => lineClamped(status, lineCount),
    );
    const cursorBeforeMalformed = clampedStatus.cursor;
    const scrollTopBeforeMalformed = clampedStatus.editorScrollTop;

    driver.sendKeys('Alt+g');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: prompt reopens for the malformed arm`,
      (status) => status.goToLineOpen === true,
    );
    driver.sendText('x');
    driver.sendKeys('Enter');
    const malformedStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: malformed input states the miss`,
      (status) =>
        status.goToLineOpen === true &&
        status.goToLineNotice === 'Enter a line or line:column',
    );
    HarnessSmoke.Class.requireCondition(
      malformedInputStayedPut(
        malformedStatus,
        cursorBeforeMalformed as GoToLineStatus['cursor'],
        Number(scrollTopBeforeMalformed),
      ),
      `scale ${lineCount}: malformed input leaves cursor and viewport unchanged`,
    );
    HarnessSmoke.Class.pass(
      `scale ${lineCount}: valid, clamp, malformed, Back, and Forward arms passed`,
    );
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(workspaceRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

await driveScale(10);
await driveScale(100_000);
console.log('smoke-go-to-line-harness: ALL-PASS');
