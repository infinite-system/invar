#!/usr/bin/env bun
// Re-record the real OpenTUI streams used by TerminalEmulatorConformance.test.ts. The recorder
// launches the unmodified app through PtyTestDriver at 80x24, captures a dark boot, an F1 keypress
// diff, and a light-theme boot, then writes base64 byte streams plus compact reviewed grid snapshots.
// Run from the repository root:
//   bun scripts/harness/record-terminal-emulator-fixtures.ts
import { Buffer } from 'node:buffer';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Static } from 'ivue/extras';
import type { HarnessSnapshotCell } from './HarnessSnapshot';
import { HarnessSmoke } from './HarnessSmoke';
import { PtyTestDriver } from './PtyTestDriver';

class $TerminalEmulatorFixtureRecorder {
  protected static get fixtureDirectory(): string {
    return join(process.cwd(), 'src', 'modules', 'terminal', 'fixtures');
  }

  static async record(): Promise<void> {
    const darkHomeDirectory = mkdtempSync(
      join(tmpdir(), 'invar-emulator-dark-'),
    );
    const lightHomeDirectory = mkdtempSync(
      join(tmpdir(), 'invar-emulator-light-'),
    );
    mkdirSync(this.fixtureDirectory, { recursive: true });
    try {
      await this.recordDarkFixtures(darkHomeDirectory);
      await this.recordLightFixture(lightHomeDirectory);
    } finally {
      rmSync(darkHomeDirectory, { recursive: true, force: true });
      rmSync(lightHomeDirectory, { recursive: true, force: true });
    }
    console.log(
      `recorded TerminalEmulator fixtures in ${this.fixtureDirectory}`,
    );
  }

  protected static async recordDarkFixtures(
    homeDirectory: string,
  ): Promise<void> {
    const statusPath = join(homeDirectory, 'status.json');
    const driver = await this.launch(homeDirectory, statusPath);
    try {
      const bootOutput = driver.recordedOutput();
      await this.writeFixture(
        'terminal-emulator-recorded-boot',
        bootOutput,
        driver.snapshot(),
      );

      const outputLengthBeforeKeypress = bootOutput.length;
      driver.sendKeys('F1');
      await driver.awaitSnapshot(
        (snapshot) => snapshot.findText('Command Palette') !== null,
      );
      await driver.awaitScreenChange();
      await this.writeFixture(
        'terminal-emulator-recorded-keypress-diff',
        driver.recordedOutput().slice(outputLengthBeforeKeypress),
        driver.snapshot(),
      );
    } finally {
      await driver.dispose();
    }
  }

  protected static async recordLightFixture(
    homeDirectory: string,
  ): Promise<void> {
    const settingsDirectory = join(homeDirectory, '.config', 'invar');
    mkdirSync(settingsDirectory, { recursive: true });
    await Bun.write(
      join(settingsDirectory, 'settings.json'),
      JSON.stringify({ theme: 'light', glyphMode: 'unicode' }),
    );
    const statusPath = join(homeDirectory, 'status.json');
    const driver = await this.launch(homeDirectory, statusPath);
    try {
      await this.writeFixture(
        'terminal-emulator-recorded-light-theme',
        driver.recordedOutput(),
        driver.snapshot(),
      );
    } finally {
      await driver.dispose();
    }
  }

  protected static async launch(
    homeDirectory: string,
    statusPath: string,
  ): Promise<PtyTestDriver.Model> {
    const driver = new PtyTestDriver.Class({
      workspaceRoot: join(process.cwd(), 'fixtures'),
      columns: 80,
      rows: 24,
      homeDirectory,
      retainFullOutput: true,
      environment: { TUI_STATUS_PATH: statusPath },
    });
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'status condition: status.ready === true',
      (status) => status.ready === true,
      15_000,
    );
    await driver.awaitSnapshot(
      (snapshot) => snapshot.findText('Files') !== null,
      15_000,
    );
    await driver.awaitScreenChange();
    return driver;
  }

  protected static async writeFixture(
    fixtureName: string,
    output: string,
    snapshot: ReturnType<PtyTestDriver.Model['snapshot']>,
  ): Promise<void> {
    await Bun.write(
      join(this.fixtureDirectory, `${fixtureName}.base64`),
      `${Buffer.from(output, 'utf8').toString('base64')}\n`,
    );
    await Bun.write(
      join(this.fixtureDirectory, `${fixtureName}.expected.json`),
      `${JSON.stringify(this.snapshotExpectations(snapshot), null, 2)}\n`,
    );
  }

  protected static snapshotExpectations(
    snapshot: ReturnType<PtyTestDriver.Model['snapshot']>,
  ): RecordedGridExpectations {
    const textRows: Record<number, string> = {};
    snapshot.textRows().forEach((rowText, row) => {
      textRows[row] = rowText.trimEnd();
    });
    const representativeCells = new Map<string, RecordedCellExpectation>();
    for (let row = 0; row < snapshot.rows; row++) {
      for (let column = 0; column < snapshot.columns; column++) {
        const cell = snapshot.cell(row, column)!;
        const styleSignature = this.styleSignature(cell);
        if (representativeCells.has(styleSignature)) continue;
        representativeCells.set(styleSignature, {
          row,
          column,
          characters: cell.characters,
          width: cell.width,
          foreground: this.colorExpectation(cell, 'foreground'),
          background: this.colorExpectation(cell, 'background'),
          attributes: {
            isBold: cell.isBold,
            isDim: cell.isDim,
            isItalic: cell.isItalic,
            isUnderline: cell.isUnderline,
            isBlink: cell.isBlink,
            isInverse: cell.isInverse,
            isInvisible: cell.isInvisible,
            isStrikethrough: cell.isStrikethrough,
            isOverline: cell.isOverline,
          },
        });
      }
    }
    return {
      columns: snapshot.columns,
      rows: snapshot.rows,
      textRows,
      cursor: {
        row: snapshot.cursorRow,
        column: snapshot.cursorColumn,
      },
      cells: [...representativeCells.values()],
    };
  }

  protected static styleSignature(cell: HarnessSnapshotCell): string {
    return JSON.stringify([
      cell.foreground,
      cell.background,
      cell.isForegroundDefault,
      cell.isForegroundRgb,
      cell.isForegroundPalette,
      cell.isBackgroundDefault,
      cell.isBackgroundRgb,
      cell.isBackgroundPalette,
      cell.isBold,
      cell.isDim,
      cell.isItalic,
      cell.isUnderline,
      cell.isBlink,
      cell.isInverse,
      cell.isInvisible,
      cell.isStrikethrough,
      cell.isOverline,
      cell.width,
    ]);
  }

  protected static colorExpectation(
    cell: HarnessSnapshotCell,
    layer: 'foreground' | 'background',
  ): RecordedColorExpectation {
    const isForeground = layer === 'foreground';
    const isDefault = isForeground
      ? cell.isForegroundDefault
      : cell.isBackgroundDefault;
    const isPalette = isForeground
      ? cell.isForegroundPalette
      : cell.isBackgroundPalette;
    return {
      mode: isDefault ? 'default' : isPalette ? 'palette' : 'rgb',
      value: isForeground ? cell.foreground : cell.background,
    };
  }
}

export namespace TerminalEmulatorFixtureRecorder {
  export const $Class = Static($TerminalEmulatorFixtureRecorder);
  export let Class = $Class;
}

interface RecordedColorExpectation {
  mode: 'default' | 'palette' | 'rgb';
  value: number;
}

interface RecordedCellExpectation {
  row: number;
  column: number;
  characters: string;
  width: number;
  foreground: RecordedColorExpectation;
  background: RecordedColorExpectation;
  attributes: {
    isBold: boolean;
    isDim: boolean;
    isItalic: boolean;
    isUnderline: boolean;
    isBlink: boolean;
    isInverse: boolean;
    isInvisible: boolean;
    isStrikethrough: boolean;
    isOverline: boolean;
  };
}

interface RecordedGridExpectations {
  columns: number;
  rows: number;
  textRows: Record<number, string>;
  cursor: { row: number; column: number };
  cells: RecordedCellExpectation[];
}

await TerminalEmulatorFixtureRecorder.Class.record();
