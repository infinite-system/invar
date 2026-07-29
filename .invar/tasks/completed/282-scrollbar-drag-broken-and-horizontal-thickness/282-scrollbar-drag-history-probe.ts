#!/usr/bin/env bun
// This probe records real PTY thumb-drag positions for the editor and structure right dock.
// Run it as `bun .invar/tasks/*/282-scrollbar-drag-broken-and-horizontal-thickness/282-scrollbar-drag-history-probe.ts [repository-root] [line-count] [theme] [focus-click|filter-input]`.
// Each printed sequence is the published scroll offset after successive pressed-pointer moves.
// A growing sequence means the thumb tracked the drag. A flat sequence means the drag did not move it.
// The paint fingerprint counts lower-half and full-block cells and lists their foreground colours.
// `filter-input` also prints the structure filter's unselected-copy, selected-copy, and word-delete
// results. Equal results at 500 and 100000 lines mean the field behavior is document-scale invariant.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';
import {
  deriveScrollbarThumbDragTargets,
  dragScrollbarThumb,
  type ScrollbarThumbDragTarget,
} from '../../../../scripts/harness/ScrollbarThumbDrag';

class $ScrollbarDragHistoryProbe {
  protected static get COLUMNS(): number {
    return 120;
  }

  protected static get ROWS(): number {
    return 40;
  }

  static async main(argumentsList: readonly string[]): Promise<void> {
    const repositoryRoot = resolve(argumentsList[0] ?? process.cwd());
    const lineCount = Number(argumentsList[1] ?? 2_000);
    const themeName = argumentsList[2];
    const warmUp = argumentsList[3];
    if (!Number.isInteger(lineCount) || lineCount < 100) {
      throw new Error(
        `Invalid line count ${argumentsList[1] ?? ''}. Use an integer of at least 100.`,
      );
    }
    const fixtureRoot = mkdtempSync(
      join(tmpdir(), `invar-282-scrollbar-drag-${lineCount}-`),
    );
    const homeDirectory = mkdtempSync(
      join(tmpdir(), `invar-282-scrollbar-drag-home-${lineCount}-`),
    );
    const statusPath = join(homeDirectory, 'status.json');
    await this.writeFixture(fixtureRoot, lineCount, themeName);
    const driver = new PtyTestDriver.Class({
      repositoryRoot,
      workspaceRoot: fixtureRoot,
      columns: this.COLUMNS,
      rows: this.ROWS,
      homeDirectory,
      environment: {
        TUI_STATUS_PATH: statusPath,
      },
    });

    try {
      console.log(`repository=${repositoryRoot}`);
      console.log(`lineCount=${lineCount}`);
      console.log(`theme=${themeName ?? 'default'}`);
      console.log('phase=await-workspace');
      await driver.awaitGridCondition(
        'the default workspace paints before the scrollbar drag probe opens its file',
        (snapshot) => snapshot.findText('Files') !== null,
      );
      driver.sendKeys('Control+p');
      console.log('phase=await-quick-open');
      await driver.awaitGridCondition(
        'Quick Open appears before the scrollbar drag probe selects its file',
        (snapshot) => snapshot.findText('Go to File') !== null,
      );
      driver.sendText('scrollbar-drag-probe');
      await driver.awaitScreenChange();
      driver.sendKeys('Enter');
      console.log('phase=await-editor');
      await driver.awaitGridCondition(
        'the scale fixture is visible in the editor',
        (candidate) => candidate.findText('symbol000000') !== null,
        60_000,
      );
      const visibleStatus = HarnessSmoke.Class.readStatus(statusPath);
      console.log(
        `visibleExtents=${String(visibleStatus.editorMaximumScrollTop)},` +
          `${String(visibleStatus.editorMaximumScrollLeft)} ` +
          `rightDockVisible=${String(visibleStatus.rightDockVisible)}`,
      );
      const status = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'the editor publishes overflowing extents',
        (candidate) =>
          Number(candidate.editorMaximumScrollTop) > 0 &&
          Number(candidate.editorMaximumScrollLeft) > 0,
        5_000,
      );
      const snapshot =
        status.rightDockVisible === true && warmUp !== 'focus-click'
          ? await driver.awaitGridCondition(
              'the structure right dock paints the first fixture symbol',
              (candidate) => candidate.findText('symbol000000 :1') !== null,
              60_000,
            )
          : driver.snapshot();
      if (warmUp === 'filter-input') {
        await this.probeStructureFilterInput(driver, statusPath, snapshot);
      }
      console.log('phase=drag');
      const probes = deriveScrollbarThumbDragTargets(
        snapshot,
        HarnessSmoke.Class.readStatus(statusPath),
      );
      if (warmUp === 'focus-click') {
        const editorText = snapshot.findText('export const symbol000000');
        if (!editorText) {
          throw new Error('The focus warm-up could not find editor text.');
        }
        driver.sendMouse({
          kind: 'press',
          column: editorText.column + 10,
          row: editorText.row,
          button: 'left',
        });
        driver.sendMouse({
          kind: 'release',
          column: editorText.column + 10,
          row: editorText.row,
          button: 'left',
        });
        console.log('warmUp=focus-click-sent-before-drag');
      }
      console.log(this.horizontalPaintFingerprint(snapshot, probes));
      for (const probe of probes) {
        const positions = await dragScrollbarThumb(driver, statusPath, probe);
        console.log(`${probe.name}=${positions.join(',')}`);
      }
      const finalStatus = HarnessSmoke.Class.readStatus(statusPath);
      console.log(
        `focus=${String(finalStatus.focus)} ` +
          `primaryDockFocused=${String(finalStatus.primaryDockFocused)} ` +
          `rightDockFocused=${String(finalStatus.rightDockFocused)}`,
      );
      driver.sendKeys('Control+q');
    } finally {
      await driver.dispose();
      await HarnessSmoke.Class.removeTemporaryDirectory(fixtureRoot);
      await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
    }
  }

  protected static async writeFixture(
    fixtureRoot: string,
    lineCount: number,
    themeName: string | undefined,
  ): Promise<void> {
    const symbolLineCount = Math.min(500, lineCount);
    const lines = Array.from(
      { length: lineCount },
      (_unusedValue, lineIndex) => {
        if (lineIndex >= symbolLineCount) return '// scale filler';
        const symbolName = `symbol${String(lineIndex).padStart(6, '0')}`;
        return `export const ${symbolName} = "${'x'.repeat(180)}";`;
      },
    );
    await Bun.write(
      join(fixtureRoot, 'scrollbar-drag-probe.ts'),
      `${lines.join('\n')}\n`,
    );
    if (themeName) {
      mkdirSync(join(fixtureRoot, '.invar'));
      await Bun.write(
        join(fixtureRoot, '.invar', 'settings.json'),
        `${JSON.stringify({ theme: themeName })}\n`,
      );
    }
  }

  protected static horizontalPaintFingerprint(
    snapshot: ReturnType<InstanceType<typeof PtyTestDriver.Class>['snapshot']>,
    probes: readonly ScrollbarThumbDragTarget[],
  ): string {
    const horizontalProbe = probes.find(
      (probe) => probe.name === 'editorHorizontal',
    );
    if (!horizontalProbe) {
      throw new Error('The horizontal paint probe has no editor bar geometry.');
    }
    const rowCells = snapshot.rowCells(horizontalProbe.pressRow);
    const lowerHalfCells = rowCells.filter((cell) => cell.characters === '▄');
    const fullBlockCells = rowCells.filter((cell) => cell.characters === '█');
    const foregroundColors = [
      ...new Set(lowerHalfCells.map((cell) => cell.foreground)),
    ];
    return (
      `horizontalPaint=lowerHalf:${lowerHalfCells.length},` +
      `fullBlock:${fullBlockCells.length},` +
      `foregrounds:${foregroundColors.join('|')}`
    );
  }

  protected static async probeStructureFilterInput(
    driver: PtyTestDriver.Model,
    statusPath: string,
    snapshot: ReturnType<InstanceType<typeof PtyTestDriver.Class>['snapshot']>,
  ): Promise<void> {
    const searchPosition = snapshot.findText('⌕');
    if (!searchPosition) {
      throw new Error('The structure filter search mark is not visible.');
    }
    driver.sendMouseWithoutFrameExpectation({
      kind: 'press',
      column: searchPosition.column,
      row: searchPosition.row,
      button: 'left',
    });
    driver.sendMouse({
      kind: 'release',
      column: searchPosition.column,
      row: searchPosition.row,
      button: 'left',
    });
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the structure filter owns focus before its scale probe',
      (candidate) => candidate.rightDockFocused === true,
    );
    driver.sendText('alpha beta');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the structure filter receives its scale probe text',
      (candidate) => candidate.structureFilter === 'alpha beta',
    );
    driver.sendRawInputWithoutFrameExpectation('\x1b[27;5;99~');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'unselected structure-filter copy publishes zero characters',
      (candidate) => candidate.lastCopyChars === 0,
    );
    driver.sendKeys('Shift+Left');
    driver.sendKeys('Shift+Left');
    driver.sendRawInputWithoutFrameExpectation('\x1b[27;5;99~');
    await HarnessSmoke.Class.awaitStatusWithoutFrame(
      driver,
      statusPath,
      'selected structure-filter copy publishes two characters',
      (candidate) => candidate.lastCopyChars === 2,
    );
    driver.sendKeys('End');
    driver.sendRawInput('\x1b\x7f');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'structure-filter Alt+Backspace removes one word',
      (candidate) => candidate.structureFilter === 'alpha ',
    );
    console.log(
      'structureFilterInput=unselectedCopy:0,selectedCopy:2,wordDelete:"alpha "',
    );
    driver.sendKeys('Escape');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the structure filter clears before the scrollbar probe',
      (candidate) => candidate.structureFilter === '',
    );
  }
}

await $ScrollbarDragHistoryProbe.main(process.argv.slice(2));
