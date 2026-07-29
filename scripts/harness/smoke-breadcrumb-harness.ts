#!/usr/bin/env bun
// Drive the breadcrumb at 10 and 100,000 lines. Run with:
// `COLORTERM=truecolor bun scripts/harness/smoke-breadcrumb-harness.ts`.
// PASS means the breadcrumb has no history controls, its separator uses the active theme's readable
// secondary-text token instead of the border token, and a live theme switch repaints that cell.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Appearance comes only from theme data (src/modules/theme/theme.invariants.md)
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import {
  ThemePalettes,
  type Palette,
} from '../../src/modules/theme/ThemePalettes';
import { HarnessSmoke } from './HarnessSmoke';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

function packedColor(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

function colorDistance(left: string, right: string): number {
  const leftValue = packedColor(left);
  const rightValue = packedColor(right);
  const redDifference = (leftValue >> 16) - (rightValue >> 16);
  const greenDifference =
    ((leftValue >> 8) & 0xff) - ((rightValue >> 8) & 0xff);
  const blueDifference = (leftValue & 0xff) - (rightValue & 0xff);
  return Math.sqrt(
    redDifference ** 2 + greenDifference ** 2 + blueDifference ** 2,
  );
}

function requireBreadcrumb(
  snapshot: HarnessSnapshot.Model,
  workspaceLabel: string,
  fileLabel: string,
  palette: Palette,
  description: string,
): void {
  const marker = `${workspaceLabel} › ${fileLabel}`;
  const markerPosition = snapshot.findText(marker);
  HarnessSmoke.Class.requireCondition(
    markerPosition !== null,
    `${description} paints ${marker}`,
  );
  if (!markerPosition) throw new Error(`${description} breadcrumb vanished`);
  const status = HarnessSmoke.Class.readStatus(statusPath);
  const editorLeft = Number(
    (status.layoutSlots as { editorCenter?: { left?: number } } | undefined)
      ?.editorCenter?.left,
  );
  const prefix = snapshot
    .rowText(markerPosition.row)
    .slice(editorLeft, markerPosition.column);
  HarnessSmoke.Class.requireCondition(
    prefix.trim() === '',
    `${description} starts with the path and has no breadcrumb history controls`,
  );
  const separatorColumn = markerPosition.column + workspaceLabel.length + 1;
  const separatorCell = snapshot.cell(markerPosition.row, separatorColumn);
  HarnessSmoke.Class.requireCondition(
    separatorCell?.characters === '›' &&
      separatorCell.isForegroundRgb &&
      separatorCell.foreground === packedColor(palette.dim),
    `${description} paints the separator with the active theme dim token`,
  );
  if (!separatorCell) throw new Error(`${description} separator cell vanished`);
  HarnessSmoke.Class.requireCondition(
    separatorCell.foreground !== packedColor(palette.bg) &&
      colorDistance(palette.dim, palette.bg) >
        colorDistance(palette.border, palette.bg),
    `${description} separator differs from the row background and has more contrast than the old border token`,
  );
}

async function driveBreadcrumbAtScale(lineCount: number): Promise<void> {
  const fixtureRoot = mkdtempSync(
    join(tmpdir(), `tui-breadcrumb-${lineCount}-`),
  );
  const homeDirectory = mkdtempSync(
    join(tmpdir(), `tui-breadcrumb-home-${lineCount}-`),
  );
  statusPath = join(homeDirectory, 'status.json');
  const generated = Bun.spawnSync([
    'bun',
    'scripts/make-scale-workspace.ts',
    '--lines',
    String(lineCount),
    '--directory',
    fixtureRoot,
  ]);
  HarnessSmoke.Class.requireCondition(
    generated.exitCode === 0,
    `${lineCount}-line shared scale fixture generated`,
  );
  const driver = new PtyTestDriver.Class({
    workspaceRoot: fixtureRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: {
      COLORTERM: 'truecolor',
      TUI_STATUS_PATH: statusPath,
    },
  });
  const workspaceLabel = basename(fixtureRoot);
  try {
    await driver.awaitGridCondition(
      `${lineCount}-line scale workspace paints`,
      (snapshot) => snapshot.findText('huge.ts') !== null,
    );
    driver.sendKeys('Control+p');
    await driver.awaitGridCondition(
      `${lineCount}-line scale workspace opens Quick Open`,
      (snapshot) => snapshot.findText('Go to File') !== null,
    );
    driver.sendText('huge.ts');
    await driver.awaitScreenChange();
    driver.sendKeys('Enter');
    const darkSnapshot = await driver.awaitGridCondition(
      `${lineCount}-line breadcrumb paints in the dark theme`,
      (snapshot) => snapshot.findText(`${workspaceLabel} › huge.ts`) !== null,
      60_000,
    );
    requireBreadcrumb(
      darkSnapshot,
      workspaceLabel,
      'huge.ts',
      ThemePalettes.Class.DARK,
      `${lineCount}-line dark theme`,
    );

    driver.sendKeys('Control+,');
    let settingsStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line drive opens Settings`,
      (candidate) =>
        candidate.settingsOpen === true &&
        typeof candidate.settingsSelectedLabel === 'string',
    );
    for (
      let navigationStep = 0;
      navigationStep < 40 && settingsStatus.settingsSelectedLabel !== 'Theme';
      navigationStep += 1
    ) {
      const previousLabel = settingsStatus.settingsSelectedLabel;
      driver.sendKeys('Down');
      settingsStatus = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${lineCount}-line Settings advances toward Theme`,
        (candidate) => candidate.settingsSelectedLabel !== previousLabel,
      );
    }
    HarnessSmoke.Class.requireCondition(
      settingsStatus.settingsSelectedLabel === 'Theme',
      `${lineCount}-line drive finds the Theme setting`,
    );
    driver.sendKeys('Right');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line drive switches the live theme to light`,
      (candidate) =>
        candidate.settingsSelectedLabel === 'Theme' &&
        candidate.settingsSelectedValue === 'light',
    );
    driver.sendKeys('Escape');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line drive closes Settings`,
      (candidate) => candidate.settingsOpen === false,
    );
    const lightSnapshot = await driver.awaitGridCondition(
      `${lineCount}-line breadcrumb repaints in the light theme`,
      (snapshot) => {
        const markerPosition = snapshot.findText(`${workspaceLabel} › huge.ts`);
        if (!markerPosition) return false;
        const separatorColumn =
          markerPosition.column + workspaceLabel.length + 1;
        return (
          snapshot.cell(markerPosition.row, separatorColumn)?.foreground ===
          packedColor(ThemePalettes.Class.LIGHT.dim)
        );
      },
    );
    requireBreadcrumb(
      lightSnapshot,
      workspaceLabel,
      'huge.ts',
      ThemePalettes.Class.LIGHT,
      `${lineCount}-line live light theme`,
    );
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

let statusPath = '';
await driveBreadcrumbAtScale(10);
await driveBreadcrumbAtScale(100_000);
console.log('smoke-breadcrumb-harness: ALL-PASS');
