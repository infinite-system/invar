#!/usr/bin/env bun
// This probe measures the real robbyrussell and Claude Code colors inside Invar's terminal.
// Run it from the repository root:
//   bun .invar/tasks/in-progress/320-terminal-pane-fidelity-two-bundle/320-terminal-theme-diagnostic-probe.ts 100 30
// The prompt lines report VS Code's ANSI green and blue. The Claude lines report its default
// background before and after a live theme switch plus an explicit white foreground. Run 100x30 and
// 160x50 for parity. Defaults must change with the theme; the explicit white must stay exact.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Static } from 'ivue/extras';
import type { FrameDump } from '../../../../src/modules/system/FrameProbe';
import type { StatusSnapshot } from '../../../../src/modules/system/StatusChannel';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

class $TerminalThemeDiagnosticProbe {
  static async main(argumentsList: readonly string[]): Promise<void> {
    const columns = this.positiveInteger(argumentsList[0], 100);
    const rows = this.positiveInteger(argumentsList[1], 30);
    const repositoryRoot = join(import.meta.dir, '../../../..');
    const homeDirectory = mkdtempSync(
      join(tmpdir(), 'invar-terminal-theme-diagnostic-'),
    );
    const workspaceRoot = join(homeDirectory, 'workspace');
    const framePath = join(homeDirectory, 'frame.json');
    const statusPath = join(homeDirectory, 'status.json');
    mkdirSync(workspaceRoot, { recursive: true });
    mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
    await Bun.write(
      join(homeDirectory, '.config', 'invar', 'settings.json'),
      '{"glyphMode":"unicode"}\n',
    );
    const gitInitialization = Bun.spawnSync(
      ['git', 'init', '--quiet', '--initial-branch=main', workspaceRoot],
      { stdout: 'pipe', stderr: 'pipe' },
    );
    if (gitInitialization.exitCode !== 0) {
      throw new Error(
        `The prompt fixture repository failed to initialize: ` +
          new TextDecoder().decode(gitInitialization.stderr),
      );
    }
    const driver = new PtyTestDriver.Class({
      workspaceRoot,
      repositoryRoot,
      columns,
      rows,
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
        'Invar reports ready before the terminal theme drive starts',
        (status) => status.ready === true,
        15_000,
      );
      driver.sendKeys('Control+j');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'the real integrated terminal is visible and focused',
        (status) =>
          status.terminalVisible === true &&
          status.terminalFocused === true &&
          status.panelActiveContent === 'terminal',
      );
      driver.sendText('HOME=/home/parallels zsh -i');
      driver.sendKeys('Enter');
      await driver.awaitSnapshot(
        (snapshot) =>
          snapshot.findText('git:(main)') !== null &&
          snapshot.findText('➜') !== null,
        15_000,
      );
      const frameDump = await this.awaitFrameDump(framePath, (candidate) =>
        candidate.rows.some((row) => row.text.includes('git:(main)')),
      );

      console.log(`geometry=${columns}x${rows}`);
      console.log(`promptGreen=${this.promptForeground(frameDump)}`);
      console.log(`gitBlue=${this.foregroundAt(frameDump, 'git:(main)', 0)}`);
      console.log(
        `defaultBackground=${this.backgroundAt(frameDump, 'git:(main)', 0)}`,
      );

      driver.sendKeys('Control+d');
      await driver.awaitSnapshot(
        (snapshot) => snapshot.findText('$') !== null,
        15_000,
      );
      driver.sendText(
        `cd ${repositoryRoot} && HOME=/home/parallels /home/parallels/.local/bin/claude`,
      );
      driver.sendKeys('Enter');
      const claudeMarkers = ['Claude Code', 'Claude Max', 'Try "'];
      const claudeLaunchSnapshot = await driver.awaitSnapshot(
        (snapshot) =>
          claudeMarkers.some((marker) => snapshot.findText(marker) !== null) ||
          snapshot.findText('Yes, I trust this folder') !== null,
        30_000,
      );
      if (claudeLaunchSnapshot.findText('Yes, I trust this folder') !== null) {
        driver.sendKeys('Enter');
      }
      await driver.awaitSnapshot(
        (snapshot) =>
          claudeMarkers.some((marker) => snapshot.findText(marker) !== null),
        30_000,
      );
      const claudeMarker =
        claudeMarkers.find(
          (marker) => driver.snapshot().findText(marker) !== null,
        ) ?? 'Claude Max';
      const claudeStatus = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'Claude Code owns its terminal mouse input',
        (status) => status.terminalWheelForwardedToChild === true,
        30_000,
      );
      const darkClaudeFrame = await this.awaitFrameDump(
        framePath,
        (candidate) =>
          candidate.rows.some((row) => row.text.includes(claudeMarker)),
      );
      const darkClaudeBackground = this.backgroundAt(
        darkClaudeFrame,
        claudeMarker,
        0,
      );
      console.log(`claudeDarkDefaultBackground=${darkClaudeBackground}`);
      console.log(
        `claudeDarkDefaultForeground=${this.foregroundAt(darkClaudeFrame, claudeMarker, 0)}`,
      );
      console.log(
        `claudeDarkPureWhiteCells=${this.childWhiteCellCount(darkClaudeFrame, claudeStatus)}`,
      );

      const statusBarRow = rows - 1;
      const settingsButtonColumn = driver
        .snapshot()
        .rowText(statusBarRow)
        .lastIndexOf('⚙');
      if (settingsButtonColumn < 0) {
        throw new Error('The status-bar settings button disappeared');
      }
      driver.sendMouseClick({
        column: settingsButtonColumn,
        row: statusBarRow,
        button: 'left',
      });
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'settings opens above Claude Code',
        (status) => status.settingsOpen === true,
      );
      await this.selectSettingByVisibleLabel(driver, statusPath, 'Theme');
      driver.sendKeys('Right');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'the live theme changes to light above Claude Code',
        (status) => status.settingsSelectedValue === 'light',
      );
      driver.sendKeys('Escape');
      const lightClaudeFrame = await this.awaitFrameDump(
        framePath,
        (candidate) =>
          candidate.rows.some((row) => row.text.includes(claudeMarker)) &&
          this.backgroundAt(candidate, claudeMarker, 0) !==
            darkClaudeBackground,
      );
      console.log(
        `claudeLightDefaultBackground=${this.backgroundAt(lightClaudeFrame, claudeMarker, 0)}`,
      );
      console.log(
        `claudeLightDefaultForeground=${this.foregroundAt(lightClaudeFrame, claudeMarker, 0)}`,
      );
      console.log(
        `claudeLightPureWhiteCells=${this.childWhiteCellCount(lightClaudeFrame, claudeStatus)}`,
      );
    } finally {
      await driver.dispose();
      await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
    }
  }

  protected static positiveInteger(
    value: string | undefined,
    fallback: number,
  ): number {
    const parsed = Number(value ?? fallback);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`Expected a positive integer, received ${value}`);
    }
    return parsed;
  }

  protected static async selectSettingByVisibleLabel(
    driver: PtyTestDriver.Model,
    statusPath: string,
    settingLabel: string,
  ): Promise<void> {
    let selectionStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the selected settings label is published before navigation',
      (status) => typeof status.settingsSelectedLabel === 'string',
    );
    for (let navigationStep = 0; navigationStep < 40; navigationStep += 1) {
      if (selectionStatus.settingsSelectedLabel === settingLabel) break;
      const previousSelectedLabel = selectionStatus.settingsSelectedLabel;
      driver.sendKeys('Down');
      selectionStatus = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `settings navigation advances toward ${settingLabel}`,
        (status) => status.settingsSelectedLabel !== previousSelectedLabel,
      );
    }
    if (selectionStatus.settingsSelectedLabel !== settingLabel) {
      throw new Error(`Settings did not expose ${settingLabel}`);
    }
  }

  protected static async awaitFrameDump(
    framePath: string,
    predicate: (frameDump: FrameDump) => boolean,
  ): Promise<FrameDump> {
    const deadline = performance.now() + 5_000;
    let lastFrameDump: FrameDump | null = null;
    while (performance.now() < deadline) {
      const frameFile = Bun.file(framePath);
      if (await frameFile.exists()) {
        const frameDump = (await frameFile.json()) as FrameDump;
        lastFrameDump = frameDump;
        if (predicate(frameDump)) return frameDump;
      }
      await Bun.sleep(10);
    }
    throw new Error(
      `FrameProbe did not publish the robbyrussell prompt: ` +
        JSON.stringify(lastFrameDump?.rows.map((row) => row.text) ?? []),
    );
  }

  protected static foregroundAt(
    frameDump: FrameDump,
    marker: string,
    markerCellOffset: number,
  ): string {
    return this.cellLaneAt(frameDump, marker, markerCellOffset, 'fg');
  }

  protected static promptForeground(frameDump: FrameDump): string {
    const promptRow = frameDump.rows.find((row) =>
      row.text.includes('git:(main)'),
    );
    if (!promptRow) return 'marker-missing';
    const codePoints = Array.from(promptRow.text);
    const workspaceStart = this.codePointSequenceStart(
      codePoints,
      Array.from('workspace'),
    );
    for (let cellIndex = workspaceStart - 1; cellIndex >= 0; cellIndex -= 1) {
      if (codePoints[cellIndex] !== ' ') {
        return promptRow.fg[cellIndex] ?? 'missing';
      }
    }
    return 'marker-missing';
  }

  protected static backgroundAt(
    frameDump: FrameDump,
    marker: string,
    markerCellOffset: number,
  ): string {
    return this.cellLaneAt(frameDump, marker, markerCellOffset, 'bg');
  }

  protected static cellLaneAt(
    frameDump: FrameDump,
    marker: string,
    markerCellOffset: number,
    lane: 'fg' | 'bg',
  ): string {
    for (const row of frameDump.rows) {
      const markerStart = this.codePointSequenceStart(
        Array.from(row.text),
        Array.from(marker),
      );
      if (markerStart >= 0) {
        return row[lane][markerStart + markerCellOffset] ?? 'missing';
      }
    }
    return 'marker-missing';
  }

  protected static codePointSequenceStart(
    codePoints: readonly string[],
    markerCodePoints: readonly string[],
  ): number {
    for (
      let startIndex = 0;
      startIndex <= codePoints.length - markerCodePoints.length;
      startIndex += 1
    ) {
      if (
        markerCodePoints.every(
          (codePoint, markerIndex) =>
            codePoints[startIndex + markerIndex] === codePoint,
        )
      ) {
        return startIndex;
      }
    }
    return -1;
  }

  protected static childWhiteCellCount(
    frameDump: FrameDump,
    status: StatusSnapshot,
  ): number {
    const panel = (
      status.layoutSlots as
        | Record<
            string,
            { left: number; top: number; width: number; height: number }
          >
        | undefined
    )?.bottomPanel;
    if (!panel) return 0;
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
}

export namespace TerminalThemeDiagnosticProbe {
  export const $Class = Static($TerminalThemeDiagnosticProbe);
  export let Class = $Class;
}

await TerminalThemeDiagnosticProbe.Class.main(process.argv.slice(2));
