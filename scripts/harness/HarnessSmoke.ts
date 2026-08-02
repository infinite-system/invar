import { readFileSync, rmSync } from 'node:fs';
import { Static } from 'ivue/extras';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import type { HarnessSnapshot } from './HarnessSnapshot';
import type { PtyTestDriver } from './PtyTestDriver';
import {
  activePanelCell,
  panelCellsOfKind,
  panelContentIdentifiersOfKind,
  type HarnessStatus,
  type PublishedPanelCell,
} from './HarnessSmokeSupport';

// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Async-published state is always awaited (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)

/** Shared generators for hermetic fixtures, status reads, and text-addressed pointer input. */
class $HarnessSmoke {
  static pass(label: string): void {
    console.log(`  PASS  ${label}`);
  }

  static requireCondition(condition: unknown, label: string): void {
    if (!condition) throw new Error(`FAIL ${label}`);
    this.pass(label);
  }

  static runGit(
    repositoryRoot: string,
    commandArguments: readonly string[],
  ): string {
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key, value]) => value !== undefined && !key.startsWith('GIT_'),
      ),
    ) as Record<string, string>;
    const result = Bun.spawnSync(['git', ...commandArguments], {
      cwd: repositoryRoot,
      stdout: 'pipe',
      stderr: 'pipe',
      env: environment,
    });
    if (result.exitCode !== 0) {
      // Report BOTH streams and the exit code. git writes several of its most common
      // failure reasons to STDOUT, not stderr — "nothing to commit, working tree clean"
      // being the one that matters here — so a stderr-only message renders a failing
      // commit as `failed: ` with no reason at all. That is what a gutter-diff fixture
      // failure looked like tonight, in the gate AND in an independent builder run:
      // undiagnosable by construction.
      const standardError = new TextDecoder().decode(result.stderr).trim();
      const standardOutput = new TextDecoder().decode(result.stdout).trim();
      throw new Error(
        `git ${commandArguments.join(' ')} failed (exit ${result.exitCode})` +
          (standardError.length > 0 ? `; stderr: ${standardError}` : '') +
          (standardOutput.length > 0 ? `; stdout: ${standardOutput}` : '') +
          (standardError.length === 0 && standardOutput.length === 0
            ? '; both streams were empty'
            : ''),
      );
    }
    return new TextDecoder().decode(result.stdout).trim();
  }

  static readStatus(statusPath: string): StatusSnapshot {
    return JSON.parse(readFileSync(statusPath, 'utf8')) as StatusSnapshot;
  }

  static activePanelCell(status: HarnessStatus): PublishedPanelCell | null {
    return activePanelCell(status);
  }

  static panelCellsOfKind(
    status: HarnessStatus,
    kind: string,
  ): readonly PublishedPanelCell[] {
    return panelCellsOfKind(status, kind);
  }

  static panelContentIdentifiersOfKind(
    status: HarnessStatus,
    kind: string,
  ): readonly string[] {
    return panelContentIdentifiersOfKind(status, kind);
  }

  static async removeTemporaryDirectory(directoryPath: string): Promise<void> {
    try {
      rmSync(directoryPath, { recursive: true, force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EFAULT') throw error;
      // Bun can transiently surface EFAULT while recursive removal crosses a just-closed watcher.
      await Bun.sleep(25);
      rmSync(directoryPath, { recursive: true, force: true });
    }
  }

  static async awaitStatus(
    driver: PtyTestDriver.Model,
    statusPath: string,
    description: string,
    predicate: (status: StatusSnapshot) => boolean,
    timeoutMilliseconds = 30_000,
  ): Promise<StatusSnapshot> {
    return this.awaitStatusWithoutFrame(
      driver,
      statusPath,
      description,
      predicate,
      timeoutMilliseconds,
    );
  }

  static async awaitStatusWithoutFrame(
    driver: PtyTestDriver.Model,
    statusPath: string,
    description: string,
    predicate: (status: StatusSnapshot) => boolean,
    timeoutMilliseconds = 30_000,
  ): Promise<StatusSnapshot> {
    const deadline = performance.now() + timeoutMilliseconds;
    while (true) {
      try {
        const status = this.readStatus(statusPath);
        if (predicate(status)) return status;
      } catch {
        // The atomic status file has not been published yet.
      }
      const remainingMilliseconds = deadline - performance.now();
      if (remainingMilliseconds <= 0) {
        throw new Error(
          `Timed out waiting for ${description} at ${statusPath}`,
        );
      }
      await Bun.sleep(Math.min(5, remainingMilliseconds));
    }
  }

  /** Close the auto-revealed structure dock through the user's own toggle gesture (Ctrl+Alt+B),
   *  for a smoke whose PROPERTY needs the editor width the dock occupies at the app's defaults
   *  (a long-line reveal, a rewrite ghost, a preview table). Call it after opening a document a
   *  structure source supports: the wait for the reveal keeps the toggle from racing the
   *  default-visibility policy and reopening the dock instead. */
  static async concealAutoRevealedRightDock(
    driver: PtyTestDriver.Model,
    statusPath: string,
  ): Promise<void> {
    await this.awaitStatus(
      driver,
      statusPath,
      'the structure pane auto-reveals before the dock is concealed',
      (status) => status.rightDockVisible === true,
    );
    driver.sendKeys('Control+Alt+b');
    await this.awaitStatus(
      driver,
      statusPath,
      'the right dock is concealed for the width-dependent arms',
      (status) => status.rightDockVisible === false,
    );
  }

  /** Close one row in the pinned panel contents list through its visible hover control. */
  static async closePanelContentsListRow(
    driver: PtyTestDriver.Model,
    statusPath: string,
    visibleTitle: string,
    expectedRemainingCount = 0,
  ): Promise<void> {
    await this.awaitStatus(
      driver,
      statusPath,
      `the pinned panel list shows ${visibleTitle}`,
      (candidate) =>
        candidate.panelListVisible === true &&
        typeof candidate.panelListGeometry === 'object' &&
        Array.isArray(candidate.panelContentLabels) &&
        candidate.panelContentLabels.some(
          (label) =>
            typeof label === 'string' && label.startsWith(visibleTitle),
        ),
    );
    const geometry = this.readStatus(statusPath).panelListGeometry as {
      width: number;
    };
    const snapshot = await driver.awaitGridCondition(
      `the pinned panel list paints ${visibleTitle}`,
      (candidate) => {
        const header =
          candidate.findText('+ Terminal') ?? candidate.findText('+ Database');
        if (!header) return false;
        return candidate.textRows().some((rowText, row) => {
          if (row <= header.row) return false;
          return rowText
            .slice(header.column, header.column + geometry.width)
            .includes(visibleTitle);
        });
      },
    );
    const headerPosition =
      snapshot.findText('+ Terminal') ?? snapshot.findText('+ Database');
    if (!headerPosition) {
      throw new Error('The pinned panel list did not paint its Add header');
    }
    const targetRow = snapshot.textRows().findIndex((rowText, row) => {
      if (row <= headerPosition.row) return false;
      return rowText
        .slice(headerPosition.column, headerPosition.column + geometry.width)
        .includes(visibleTitle);
    });
    if (targetRow < 0) {
      throw new Error(`The pinned panel list did not paint ${visibleTitle}`);
    }
    const targetColumn = headerPosition.column + geometry.width - 2;
    for (
      let column = headerPosition.column + 1;
      column <= targetColumn;
      column += 1
    ) {
      driver.sendMouseWithoutFrameExpectation({
        kind: 'move',
        column,
        row: targetRow,
        button: 'none',
      });
    }
    const hoveredSnapshot = await driver.awaitGridCondition(
      `${visibleTitle} reveals its close control on hover`,
      (candidate) => candidate.findText('Close instance') !== null,
    );
    const revealedCloseColumn = hoveredSnapshot
      .rowText(targetRow)
      .lastIndexOf('×');
    if (revealedCloseColumn < 0) {
      throw new Error(`${visibleTitle} did not paint its close glyph`);
    }
    driver.sendMouseWithoutFrameExpectation({
      kind: 'move',
      column: revealedCloseColumn,
      row: targetRow,
      button: 'none',
    });
    driver.sendMouse({
      kind: 'press',
      column: revealedCloseColumn,
      row: targetRow,
      button: 'left',
    });
    driver.sendMouse({
      kind: 'release',
      column: revealedCloseColumn,
      row: targetRow,
      button: 'left',
    });
    await this.awaitStatus(
      driver,
      statusPath,
      `${visibleTitle} has ${expectedRemainingCount} rows after one row close`,
      (candidate) =>
        Array.isArray(candidate.panelContentLabels) &&
        candidate.panelContentLabels.filter(
          (label) => typeof label === 'string' && label === visibleTitle,
        ).length === expectedRemainingCount,
    );
    if (expectedRemainingCount === 0) {
      await driver.awaitGridCondition(
        `${visibleTitle} is no longer painted after its row close`,
        (candidate) => candidate.findText(visibleTitle) === null,
      );
    } else {
      await driver.awaitGridCondition(
        `${visibleTitle} remains painted after one matching row closes`,
        (candidate) => candidate.findText(visibleTitle) !== null,
      );
    }
  }

  static async awaitScrollPosition(
    driver: PtyTestDriver.Model,
    statusPath: string,
    description: string,
    fieldName: string,
    targetPosition: number,
    timeoutMilliseconds = 30_000,
  ): Promise<StatusSnapshot> {
    return this.awaitStatusWithoutFrame(
      driver,
      statusPath,
      description,
      (status) => Number(status[fieldName]) === targetPosition,
      timeoutMilliseconds,
    );
  }

  static clickText(
    driver: PtyTestDriver.Model,
    snapshot: HarnessSnapshot.Model,
    marker: string,
    columnOffset = 0,
  ): void {
    const position = snapshot.findText(marker);
    if (!position)
      throw new Error(`Marker is not visible: ${marker}\n${snapshot.text()}`);
    const column = position.column + columnOffset;
    driver.sendMouse({
      kind: 'press',
      column,
      row: position.row,
      button: 'left',
    });
    driver.sendMouse({
      kind: 'release',
      column,
      row: position.row,
      button: 'left',
    });
  }
}

export namespace HarnessSmoke {
  export const $Class = Static($HarnessSmoke);
  export let Class = $Class;
}
