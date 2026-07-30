#!/usr/bin/env bun
// This probe launches the installed oh-my-zsh and Claude Code programs inside Invar's real terminal
// pane. It records exact FrameProbe colors from a zsh reference line and reports Claude's pure-white
// child cells and mouse mode. Run it from the repository root:
//   bun .invar/tasks/in-progress/313-child-owns-its-io-bundle/315-real-child-color-probe.ts
// A successful result prints the exact green, white, and indexed zsh lanes, a positive Claude white
// cell count, child mouse ownership, and the visible Claude rows used for the manual button check.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Static } from 'ivue/extras';
import type { FrameDump } from '../../../../src/modules/system/FrameProbe';
import type { StatusSnapshot } from '../../../../src/modules/system/StatusChannel';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

class $RealChildColorProbe {
  static async main(): Promise<void> {
    const repositoryRoot = join(import.meta.dir, '../../../..');
    const homeDirectory = mkdtempSync(
      join(tmpdir(), 'invar-real-child-color-'),
    );
    const statusPath = join(homeDirectory, 'status.json');
    const framePath = join(homeDirectory, 'frame.json');
    mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
    await Bun.write(
      join(homeDirectory, '.config', 'invar', 'settings.json'),
      '{"glyphMode":"unicode"}\n',
    );
    const driver = new PtyTestDriver.Class({
      workspaceRoot: join(repositoryRoot, 'fixtures'),
      repositoryRoot,
      columns: 120,
      rows: 40,
      homeDirectory,
      environment: {
        TUI_STATUS_PATH: statusPath,
        TUI_FRAME_PATH: framePath,
        TUI_FRAME_DUMP: '1',
      },
    });
    try {
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'Invar reports ready before the real child probe',
        (status) => status.ready === true,
        15_000,
      );
      driver.sendKeys('Control+j');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'the nested terminal is focused',
        (status) => status.terminalFocused === true,
      );

      driver.sendText('HOME=/home/parallels ZDOTDIR=/home/parallels zsh -i');
      driver.sendKeys('Enter');
      driver.sendText(
        "print -P 'ZSH-REFERENCE %F{green}GREEN%f %F{white}WHITE%f %F{15}BRIGHT%f %F{196}INDEX%f'",
      );
      driver.sendKeys('Enter');
      await driver.awaitSnapshot(
        (snapshot) =>
          snapshot.findText('ZSH-REFERENCE GREEN WHITE BRIGHT INDEX') !== null,
        15_000,
      );
      const zshFrame = await this.awaitFrame(framePath, 'ZSH-REFERENCE');
      console.log(
        `zshGreen=${this.laneAt(zshFrame, 'ZSH-REFERENCE GREEN WHITE BRIGHT INDEX', 14)}`,
      );
      console.log(
        `zshWhite=${this.laneAt(zshFrame, 'ZSH-REFERENCE GREEN WHITE BRIGHT INDEX', 20)}`,
      );
      console.log(
        `zshBrightWhite=${this.laneAt(zshFrame, 'ZSH-REFERENCE GREEN WHITE BRIGHT INDEX', 26)}`,
      );
      console.log(
        `zshIndexed196=${this.laneAt(zshFrame, 'ZSH-REFERENCE GREEN WHITE BRIGHT INDEX', 33)}`,
      );
      driver.sendKeys('Control+d');
      await driver.awaitScreenChange();

      driver.sendText('HOME=/home/parallels /home/parallels/.local/bin/claude');
      driver.sendKeys('Enter');
      const claudeSnapshot = await driver.awaitSnapshot(
        (snapshot) =>
          snapshot
            .textRows()
            .some((rowText) => rowText.includes('Claude Code')),
        30_000,
      );
      const claudeStatus = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'Claude Code enables child mouse ownership',
        (status) => status.terminalWheelForwardedToChild === true,
        30_000,
      );
      const claudeFrame = await this.awaitFrame(framePath, 'Claude Code');
      console.log(
        `claudePureWhiteChildCells=${this.childWhiteCellCount(claudeFrame, claudeStatus)}`,
      );
      console.log(
        `claudeMouseOwned=${String(claudeStatus.terminalWheelForwardedToChild)}`,
      );
      const panel = this.bottomPanel(claudeStatus);
      driver.sendText(
        'Reply with exactly 25 numbered lines. Put only the number and the word test on each line.',
      );
      await driver.awaitSnapshot((snapshot) =>
        snapshot
          .textRows()
          .some((rowText) => rowText.includes('Reply with exactly 25')),
      );
      driver.sendKeys('Enter');
      await driver.awaitSnapshot(
        (snapshot) =>
          snapshot
            .textRows()
            .some(
              (rowText) => rowText.includes('25.') && rowText.includes('test'),
            ),
        120_000,
      );
      await driver.awaitSnapshot(
        (snapshot) =>
          snapshot
            .textRows()
            .some((rowText) => rowText.includes('? for shortcuts')),
        120_000,
      );
      const wheelColumn = panel.left + Math.floor(panel.width / 2);
      const wheelRow = panel.top + Math.floor(panel.height / 2);
      for (let wheelIndex = 0; wheelIndex < 12; wheelIndex += 1) {
        driver.sendMouse({
          kind: 'wheel',
          column: wheelColumn,
          row: wheelRow,
          direction: 'up',
        });
      }
      const scrolledClaudeSnapshot = await driver.awaitSnapshot(
        (snapshot) =>
          !snapshot
            .textRows()
            .some(
              (rowText) => rowText.includes('25.') && rowText.includes('test'),
            ),
      );
      const jumpButton = scrolledClaudeSnapshot.findText('Jump to bottom');
      if (!jumpButton) throw new Error('Claude did not paint its jump button');
      driver.sendMouseClick({
        column: jumpButton.column + 5,
        row: jumpButton.row,
        button: 'left',
      });
      await driver.awaitSnapshot((snapshot) =>
        snapshot
          .textRows()
          .some(
            (rowText) => rowText.includes('25.') && rowText.includes('test'),
          ),
      );
      console.log(
        `claudeJumpButtonClick=${jumpButton.column + 5},${jumpButton.row}`,
      );
      console.log('claudeNewestContent=25. test');
    } finally {
      driver.dispose();
      await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
    }
  }

  protected static async awaitFrame(
    framePath: string,
    marker: string,
  ): Promise<FrameDump> {
    const deadline = performance.now() + 5_000;
    while (performance.now() < deadline) {
      const frameFile = Bun.file(framePath);
      if (await frameFile.exists()) {
        const frameDump = (await frameFile.json()) as FrameDump;
        if (frameDump.rows.some((row) => row.text.includes(marker))) {
          return frameDump;
        }
      }
      await Bun.sleep(10);
    }
    throw new Error(`FrameProbe did not publish ${marker} at ${framePath}`);
  }

  protected static laneAt(
    frameDump: FrameDump,
    marker: string,
    markerCellOffset: number,
  ): string {
    for (const row of frameDump.rows) {
      const markerStart = row.text.indexOf(marker);
      if (markerStart >= 0) {
        return row.fg[markerStart + markerCellOffset] ?? 'missing';
      }
    }
    return 'marker-missing';
  }

  protected static childWhiteCellCount(
    frameDump: FrameDump,
    status: StatusSnapshot,
  ): number {
    const panel = this.bottomPanel(status);
    let whiteCellCount = 0;
    for (
      let rowIndex = panel.top + 2;
      rowIndex < panel.top + panel.height - 1;
      rowIndex += 1
    ) {
      const row = frameDump.rows[rowIndex];
      if (!row) continue;
      for (
        let columnIndex = panel.left + 2;
        columnIndex < panel.left + panel.width - 2;
        columnIndex += 1
      ) {
        if (
          row.text[columnIndex] &&
          row.text[columnIndex] !== ' ' &&
          row.fg[columnIndex] === '255,255,255,255'
        ) {
          whiteCellCount += 1;
        }
      }
    }
    return whiteCellCount;
  }

  protected static bottomPanel(status: StatusSnapshot): {
    left: number;
    top: number;
    width: number;
    height: number;
  } {
    const panel = (
      status.layoutSlots as
        | Record<
            string,
            { left: number; top: number; width: number; height: number }
          >
        | undefined
    )?.bottomPanel;
    if (!panel) throw new Error('The bottom-panel geometry disappeared');
    return panel;
  }
}

export namespace RealChildColorProbe {
  export const $Class = Static($RealChildColorProbe);
  export let Class = $Class;
}

await RealChildColorProbe.Class.main();
