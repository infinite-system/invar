#!/usr/bin/env bun
// This contract drives the quit confirmation through the real PTY.
// Run it with `bun scripts/harness/smoke-quit-confirmation-harness.ts`.
// ALL-PASS means keyboard and mouse can choose both answers, every safe dismissal preserves a dirty
// buffer, the shared close glyph and theme focus tone paint at 10 and 100,000 lines, and Yes exits.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Quit requires explicit confirmation (src/modules/app/app.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
import { ThemePalettes } from '../../src/modules/theme/ThemePalettes';
import type { GlyphLevel } from '../../src/modules/theme/TerminalCapabilities';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

type QuitScale = 10 | 100_000;
type QuitTheme = 'dark' | 'light';

interface DialogBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly closeButtonLeft: number;
  readonly closeButtonTop: number;
  readonly closeButtonWidth: number;
}

function parseRgbColor(hexColor: string): number {
  return Number.parseInt(hexColor.slice(1), 16);
}

function quitBounds(status: StatusSnapshot): DialogBounds {
  const bounds = (
    status.overlayDialogBounds as
      Record<string, DialogBounds | null> | undefined
  )?.quitConfirmation;
  if (!bounds) throw new Error('Quit confirmation bounds were not published');
  return bounds;
}

function clickCell(
  driver: PtyTestDriver.Model,
  column: number,
  row: number,
): void {
  driver.sendMouse({ kind: 'press', column, row, button: 'left' });
  driver.sendMouse({ kind: 'release', column, row, button: 'left' });
}

function focusedButtonUsesTheme(
  snapshot: HarnessSnapshot.Model,
  buttonText: '[ Yes ]' | '[ No ]',
  expectedBackground: number,
): boolean {
  const position = snapshot.findText(buttonText);
  return (
    position !== null &&
    snapshot.cell(position.row, position.column + 2)?.background ===
      expectedBackground
  );
}

function frameQuote(
  snapshot: HarnessSnapshot.Model,
  bounds: DialogBounds,
  label: string,
): void {
  const rows = Array.from(
    { length: bounds.height },
    (_unusedValue, rowOffset) =>
      snapshot
        .rowText(bounds.top + rowOffset)
        .slice(bounds.left, bounds.left + bounds.width),
  );
  console.log(`FRAME ${label}\n${rows.join('\n')}`);
}

async function writeSettings(
  homeDirectory: string,
  glyphLevel: GlyphLevel,
  theme: QuitTheme,
): Promise<void> {
  const settingsDirectory = join(homeDirectory, '.config', 'invar');
  mkdirSync(settingsDirectory, { recursive: true });
  await Bun.write(
    join(settingsDirectory, 'settings.json'),
    `${JSON.stringify({ glyphMode: glyphLevel, theme })}\n`,
  );
}

async function awaitQuitOpen(
  driver: PtyTestDriver.Model,
  statusPath: string,
  description: string,
): Promise<StatusSnapshot> {
  return HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    description,
    (status) =>
      status.quitConfirmationOpen === true &&
      status.inputOverlay === 'quitConfirmation' &&
      status.inputOverlayCount === 1,
  );
}

async function awaitQuitClosed(
  driver: PtyTestDriver.Model,
  statusPath: string,
  description: string,
  expectedActiveBuffer: string,
): Promise<StatusSnapshot> {
  return HarnessSmoke.Class.awaitStatus(
    driver,
    statusPath,
    description,
    (status) =>
      status.quitConfirmationOpen === false &&
      status.activeBuffer === expectedActiveBuffer &&
      status.dirty === true,
  );
}

async function openQuit(
  driver: PtyTestDriver.Model,
  statusPath: string,
  description: string,
): Promise<StatusSnapshot> {
  driver.sendKeys('Control+q');
  return awaitQuitOpen(driver, statusPath, description);
}

async function driveScale(
  lineCount: QuitScale,
  glyphLevel: GlyphLevel,
  theme: QuitTheme,
  finalChoice: 'keyboard' | 'mouse',
): Promise<void> {
  const workspaceRoot = mkdtempSync(
    join(tmpdir(), `tui-quit-confirmation-${lineCount}-`),
  );
  const homeDirectory = mkdtempSync(
    join(tmpdir(), `tui-quit-confirmation-home-${lineCount}-`),
  );
  const documentPath = join(workspaceRoot, `scale-${lineCount}.txt`);
  const statusPath = join(homeDirectory, 'status.json');
  const fixtureLines = Array.from(
    { length: lineCount },
    (_unusedValue, lineIndex) =>
      `DRIVE-LINE-${String(lineIndex + 1).padStart(6, '0')} content at scale ${lineCount}`,
  );
  await Bun.write(documentPath, fixtureLines.join('\n'));
  await writeSettings(homeDirectory, glyphLevel, theme);

  const driver = new PtyTestDriver.Class({
    workspaceRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_HARNESS_DIRECT_QUIT: '0',
    },
  });

  try {
    await driver.awaitGridCondition(
      `scale ${lineCount}: the scale fixture is visible`,
      (snapshot) => snapshot.findText(`scale-${lineCount}.txt`) !== null,
      15_000,
    );
    driver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: the scale fixture is active`,
      (status) => status.activeBuffer === documentPath,
    );
    driver.sendKeys('End');
    driver.sendText(' dirty');
    const dirtyStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: an unsaved edit is published`,
      (status) => status.activeBuffer === documentPath && status.dirty === true,
    );
    const preservedCursor = JSON.stringify(dirtyStatus.cursor);

    let openStatus = await openQuit(
      driver,
      statusPath,
      `scale ${lineCount}: Ctrl+Q opens one modal confirmation`,
    );
    const bounds = quitBounds(openStatus);
    HarnessSmoke.Class.requireCondition(
      bounds.width < 50 &&
        bounds.height === 8 &&
        Math.abs(bounds.left * 2 + bounds.width - 120) <= 1 &&
        Math.abs(bounds.top * 2 + bounds.height - 40) <= 1,
      `scale ${lineCount}: the dialog is compact and centered`,
    );
    const closeGlyph =
      ThemeIcons.Class.interfaceGlyphVocabularyFor(glyphLevel).panelClose;
    const palette =
      theme === 'dark' ? ThemePalettes.Class.DARK : ThemePalettes.Class.LIGHT;
    let snapshot = await driver.awaitGridCondition(
      `scale ${lineCount}: title, body, buttons, and shared close glyph paint`,
      (candidate) =>
        candidate.findText('Are you sure you want to quit?') !== null &&
        candidate.findText('[ Yes ]') !== null &&
        candidate.findText('[ No ]') !== null &&
        candidate
          .rowText(bounds.closeButtonTop)
          .slice(
            bounds.closeButtonLeft,
            bounds.closeButtonLeft + bounds.closeButtonWidth,
          )
          .includes(closeGlyph),
    );
    HarnessSmoke.Class.requireCondition(
      focusedButtonUsesTheme(
        snapshot,
        '[ No ]',
        parseRgbColor(palette.selection),
      ),
      `scale ${lineCount}: No starts focused with the ${theme} theme selection tone`,
    );
    HarnessSmoke.Class.requireCondition(
      snapshot.findText('[y/N]') === null,
      `scale ${lineCount}: the quit path has no terminal y/N prompt`,
    );
    frameQuote(snapshot, bounds, `${lineCount} lines, ${theme}, ${glyphLevel}`);

    driver.sendKeys('Left');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: Left focuses Yes`,
      (status) => status.quitConfirmationFocusedChoice === 'yes',
    );
    snapshot = await driver.awaitGridCondition(
      `scale ${lineCount}: Yes focus is visible`,
      (candidate) =>
        focusedButtonUsesTheme(
          candidate,
          '[ Yes ]',
          parseRgbColor(palette.selection),
        ),
    );
    driver.sendKeys('Right');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: Right focuses No`,
      (status) => status.quitConfirmationFocusedChoice === 'no',
    );
    driver.sendKeys('Tab');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `scale ${lineCount}: Tab focuses Yes`,
      (status) => status.quitConfirmationFocusedChoice === 'yes',
    );
    driver.sendKeys('Right', 'Enter');
    await awaitQuitClosed(
      driver,
      statusPath,
      `scale ${lineCount}: keyboard No dismisses and preserves the dirty buffer`,
      documentPath,
    );

    await openQuit(
      driver,
      statusPath,
      `scale ${lineCount}: confirmation reopens for Escape`,
    );
    driver.sendKeys('Escape');
    await awaitQuitClosed(
      driver,
      statusPath,
      `scale ${lineCount}: Escape acts as No`,
      documentPath,
    );

    await openQuit(
      driver,
      statusPath,
      `scale ${lineCount}: confirmation opens before a second Ctrl+Q`,
    );
    driver.sendKeys('Control+q');
    await awaitQuitClosed(
      driver,
      statusPath,
      `scale ${lineCount}: a second Ctrl+Q dismisses without quitting`,
      documentPath,
    );

    openStatus = await openQuit(
      driver,
      statusPath,
      `scale ${lineCount}: confirmation opens for outside click`,
    );
    clickCell(driver, 0, 39);
    const outsideDismissStatus = await awaitQuitClosed(
      driver,
      statusPath,
      `scale ${lineCount}: an outside click dismisses and is consumed`,
      documentPath,
    );
    HarnessSmoke.Class.requireCondition(
      JSON.stringify(outsideDismissStatus.cursor) === preservedCursor,
      `scale ${lineCount}: outside dismissal leaves the dirty cursor intact`,
    );

    await openQuit(
      driver,
      statusPath,
      `scale ${lineCount}: confirmation opens for mouse No`,
    );
    snapshot = await driver.awaitGridCondition(
      `scale ${lineCount}: No is visible for pointer input`,
      (candidate) => candidate.findText('[ No ]') !== null,
    );
    HarnessSmoke.Class.clickText(driver, snapshot, '[ No ]', 2);
    await awaitQuitClosed(
      driver,
      statusPath,
      `scale ${lineCount}: mouse No dismisses`,
      documentPath,
    );

    openStatus = await openQuit(
      driver,
      statusPath,
      `scale ${lineCount}: confirmation opens for the close control`,
    );
    const closeBounds = quitBounds(openStatus);
    clickCell(
      driver,
      closeBounds.closeButtonLeft +
        Math.floor(closeBounds.closeButtonWidth / 2),
      closeBounds.closeButtonTop,
    );
    await awaitQuitClosed(
      driver,
      statusPath,
      `scale ${lineCount}: the shared close control dismisses`,
      documentPath,
    );

    await openQuit(
      driver,
      statusPath,
      `scale ${lineCount}: confirmation opens for Yes`,
    );
    if (finalChoice === 'keyboard') {
      driver.sendKeys('Left');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `scale ${lineCount}: keyboard Yes is focused before activation`,
        (status) => status.quitConfirmationFocusedChoice === 'yes',
      );
      driver.sendKeysWithoutFrameExpectation('Enter');
    } else {
      snapshot = await driver.awaitGridCondition(
        `scale ${lineCount}: Yes is visible for pointer activation`,
        (candidate) => candidate.findText('[ Yes ]') !== null,
      );
      const yesPosition = snapshot.findText('[ Yes ]');
      if (!yesPosition) throw new Error('Yes button was not visible');
      driver.sendRawInputWithoutFrameExpectation(
        `\x1b[<0;${yesPosition.column + 3};${yesPosition.row + 1}M` +
          `\x1b[<0;${yesPosition.column + 3};${yesPosition.row + 1}m`,
      );
    }
    HarnessSmoke.Class.requireCondition(
      (await driver.exitCode()) === 0,
      `scale ${lineCount}: ${finalChoice} Yes exits with code zero`,
    );
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(workspaceRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

await driveScale(10, 'nerd', 'dark', 'keyboard');
await driveScale(100_000, 'ascii', 'light', 'mouse');
console.log('smoke-quit-confirmation-harness: ALL-PASS');
