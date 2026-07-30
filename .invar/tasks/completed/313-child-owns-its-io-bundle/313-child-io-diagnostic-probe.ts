#!/usr/bin/env bun
// This probe shows whether a nested terminal child receives a real mouse click and which colors
// Invar paints for the child's default, ANSI, and truecolor cells.
// Run it from the repository root:
//   bun .invar/tasks/in-progress/313-child-owns-its-io-bundle/313-child-io-diagnostic-probe.ts 100 30
// The clickBytes line is "none" when Invar swallowed the click. Otherwise it prints the exact SGR
// bytes. Each color line prints FrameProbe's four RGBA lanes for one child cell. Matching default
// and theme-derived lanes show that Invar re-themed the child. ANSI and truecolor provide controls.
// After the fix, default foreground is 192,192,192,255 and default background is 0,0,0,255 at
// every geometry, matching the terminal profile rather than either Invar theme.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Static } from 'ivue/extras';
import type { FrameDump } from '../../../../src/modules/system/FrameProbe';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

class $ChildIoDiagnosticProbe {
  static async main(argumentsList: readonly string[]): Promise<void> {
    const columns = this.positiveInteger(argumentsList[0], 100);
    const rows = this.positiveInteger(argumentsList[1], 30);
    const repositoryRoot = join(import.meta.dir, '../../../..');
    const homeDirectory = mkdtempSync(
      join(tmpdir(), 'invar-child-io-diagnostic-'),
    );
    const statusPath = join(homeDirectory, 'status.json');
    const framePath = join(homeDirectory, 'frame.json');
    const childInputPath = join(homeDirectory, 'child-input.bin');
    const childScriptPath = join(homeDirectory, 'child-io-fixture.py');
    mkdirSync(join(homeDirectory, '.config', 'invar'), { recursive: true });
    await Bun.write(
      join(homeDirectory, '.config', 'invar', 'settings.json'),
      '{"glyphMode":"unicode"}\n',
    );
    await Bun.write(childScriptPath, this.childScript(childInputPath));

    const driver = new PtyTestDriver.Class({
      workspaceRoot: join(repositoryRoot, 'fixtures'),
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
        'Invar reports ready before the terminal diagnostic starts',
        (status) => status.ready === true,
        15_000,
      );
      await driver.awaitScreenChange();
      driver.sendKeys('Control+j');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'the real nested terminal is visible and focused',
        (status) =>
          status.terminalVisible === true &&
          status.terminalFocused === true &&
          status.panelActiveContent === 'terminal',
      );
      driver.sendText(`python3 ${childScriptPath}`);
      driver.sendKeys('Enter');
      const fixtureSnapshot = await driver.awaitSnapshot(
        (snapshot) => snapshot.findText('MOUSE-TARGET') !== null,
        15_000,
      );
      const mouseTarget = fixtureSnapshot.findText('MOUSE-TARGET');
      if (!mouseTarget) throw new Error('The child mouse target disappeared');
      const frameDump = await this.awaitFrameDump(framePath, 'MOUSE-TARGET');

      console.log(`geometry=${columns}x${rows}`);
      console.log(
        `defaultForeground=${this.foregroundAt(frameDump, 'DEFAULT-D', 8)}`,
      );
      console.log(
        `defaultBackground=${this.backgroundAt(frameDump, 'DEFAULT-D', 8)}`,
      );
      console.log(
        `ansiWhiteForeground=${this.foregroundAt(frameDump, 'ANSI7-W', 6)}`,
      );
      console.log(
        `ansiBlackBackground=${this.backgroundAt(frameDump, 'ANSI0-B', 6)}`,
      );
      console.log(
        `truecolorForeground=${this.foregroundAt(frameDump, 'TRUE-T', 5)}`,
      );
      console.log(
        `truecolorBackground=${this.backgroundAt(frameDump, 'TRUE-T', 5)}`,
      );

      driver.sendMouseClick({
        column: mouseTarget.column + 3,
        row: mouseTarget.row,
        button: 'left',
      });
      const capturedBytes = await this.awaitOptionalBytes(childInputPath, 750);
      console.log(
        `clickBytes=${
          capturedBytes
            ? JSON.stringify(new TextDecoder().decode(capturedBytes))
            : 'none'
        }`,
      );
      console.log('expectedClickBytes="\\u001b[<0;4;1M\\u001b[<0;4;1m"');
    } finally {
      driver.dispose();
      await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
    }
  }

  protected static childScript(childInputPath: string): string {
    return [
      'import os',
      'import sys',
      'import termios',
      'import tty',
      'previous = termios.tcgetattr(sys.stdin.fileno())',
      'tty.setraw(sys.stdin.fileno())',
      'try:',
      "    os.write(sys.stdout.fileno(), b'\\x1b[?1000h\\x1b[?1006h\\x1b[2J\\x1b[H')",
      "    os.write(sys.stdout.fileno(), b'MOUSE-TARGET\\r\\n')",
      "    os.write(sys.stdout.fileno(), b'DEFAULT-D\\r\\n')",
      "    os.write(sys.stdout.fileno(), b'ANSI7-\\x1b[37mW\\x1b[0m\\r\\n')",
      "    os.write(sys.stdout.fileno(), b'ANSI0-\\x1b[40mB\\x1b[0m\\r\\n')",
      "    os.write(sys.stdout.fileno(), b'TRUE-\\x1b[38;2;18;52;86;48;2;101;67;33mT\\x1b[0m\\r\\n')",
      "    os.write(sys.stdout.fileno(), b'CHILD-IO-READY')",
      "    child_input = b''",
      "    while not child_input.endswith(b'm'):",
      '        child_input += os.read(sys.stdin.fileno(), 64)',
      `    open(${JSON.stringify(childInputPath)}, 'wb').write(child_input)`,
      'finally:',
      "    os.write(sys.stdout.fileno(), b'\\x1b[?1000l\\x1b[?1006l')",
      '    termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, previous)',
      '',
    ].join('\n');
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

  protected static async awaitFrameDump(
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

  protected static async awaitOptionalBytes(
    filePath: string,
    observationMilliseconds: number,
  ): Promise<Uint8Array | null> {
    const deadline = performance.now() + observationMilliseconds;
    while (performance.now() < deadline) {
      const file = Bun.file(filePath);
      if (await file.exists()) return new Uint8Array(await file.arrayBuffer());
      await Bun.sleep(10);
    }
    return null;
  }

  protected static foregroundAt(
    frameDump: FrameDump,
    marker: string,
    markerCellOffset: number,
  ): string {
    return this.cellLaneAt(frameDump, marker, markerCellOffset, 'fg');
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
      const codePoints = Array.from(row.text);
      const markerCodePoints = Array.from(marker);
      const markerStart = this.codePointSequenceStart(
        codePoints,
        markerCodePoints,
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
}

export namespace ChildIoDiagnosticProbe {
  export const $Class = Static($ChildIoDiagnosticProbe);
  export let Class = $Class;
}

await ChildIoDiagnosticProbe.Class.main(process.argv.slice(2));
