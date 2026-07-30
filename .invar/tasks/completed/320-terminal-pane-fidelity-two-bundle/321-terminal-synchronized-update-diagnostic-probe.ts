#!/usr/bin/env bun
// This probe records the real tasks:watch paint sequence inside Invar's integrated terminal.
// Run it from the repository root:
//   bun .invar/tasks/in-progress/320-terminal-pane-fidelity-two-bundle/321-terminal-synchronized-update-diagnostic-probe.ts 100 30
// Each frame line classifies the screen as the old shell or the complete dashboard. Any other
// completed frame is a blank or partial child update, and the probe fails. Run 100x30 and 160x50
// for parity. A pass means the initial real tasks:watch paint crossed the outer PTY atomically.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Static } from 'ivue/extras';
import type { StatusSnapshot } from '../../../../src/modules/system/StatusChannel';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import type { HarnessSnapshot } from '../../../../scripts/harness/HarnessSnapshot';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

class $TerminalPaneFidelityDiagnosticProbe {
  static async main(argumentsList: readonly string[]): Promise<void> {
    const columns = this.positiveInteger(argumentsList[0], 100);
    const rows = this.positiveInteger(argumentsList[1], 30);
    const repositoryRoot = join(import.meta.dir, '../../../..');
    const homeDirectory = mkdtempSync(
      join(tmpdir(), 'invar-terminal-pane-fidelity-diagnostic-'),
    );
    const statusPath = join(homeDirectory, 'status.json');
    const driver = new PtyTestDriver.Class({
      workspaceRoot: repositoryRoot,
      repositoryRoot,
      columns,
      rows,
      homeDirectory,
      environment: {
        TUI_STATUS_PATH: statusPath,
      },
    });

    try {
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'Invar reports ready before the terminal fidelity drive starts',
        (status) => status.ready === true,
        15_000,
      );
      driver.sendKeys('Control+j');
      const terminalStatus = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'the real integrated terminal is visible and focused',
        (status) =>
          status.terminalVisible === true &&
          status.terminalFocused === true &&
          status.panelActiveContent === 'terminal',
      );
      const panelRectangle = this.bottomPanelRectangle(terminalStatus);
      await driver.awaitOutputCondition(
        'the nested shell prompt reaches a completed outer frame',
        () => {
          const observations = driver.completedFrameObservationsSince(0);
          const latestObservation = observations.at(-1);
          if (!latestObservation) return false;
          return this.terminalBodyRows(
            latestObservation.snapshot,
            panelRectangle,
          )
            .join('\n')
            .includes('$');
        },
        10_000,
      );
      const firstObservationIndex = driver.completedFrameObservationCount;
      driver.sendText('bun run tasks:watch');
      driver.sendKeys('Enter');
      await driver.awaitSnapshot(
        (snapshot) => snapshot.findText('active ·') !== null,
        15_000,
      );
      const observations = driver.completedFrameObservationsSince(
        firstObservationIndex,
      );

      console.log(`geometry=${columns}x${rows}`);
      console.log(`completedFrames=${observations.length}`);
      let unsafeFrameCount = 0;
      for (
        let observationIndex = 0;
        observationIndex < observations.length;
        observationIndex += 1
      ) {
        const observation = observations[observationIndex];
        if (!observation) continue;
        const terminalBodyRows = this.terminalBodyRows(
          observation.snapshot,
          panelRectangle,
        );
        const terminalBodyText = terminalBodyRows.join('\n');
        const contentRows = terminalBodyRows.map((rowText) =>
          rowText.replace(/[│╭╰╮╯─]/g, ''),
        );
        const nonblankRowCount = contentRows.filter(
          (rowText) => rowText.trim().length > 0,
        ).length;
        const hasSummary = terminalBodyText.includes('active ·');
        const hasHeader = terminalBodyText.includes('INVAR TASKS');
        const hasOldShell = terminalBodyText.includes('bun run tasks:watch');
        if (!hasSummary && !hasHeader && !hasOldShell) unsafeFrameCount += 1;
        console.log(
          `frame=${observationIndex + 1} ` +
            `state=${hasSummary || hasHeader ? 'dashboard' : hasOldShell ? 'shell' : 'partial'} ` +
            `nonblankRows=${nonblankRowCount} ` +
            `first=${JSON.stringify(
              contentRows.find((rowText) => rowText.trim().length > 0) ?? '',
            )}`,
        );
        if (!hasSummary && !hasHeader && !hasOldShell) {
          console.log(`  body=${JSON.stringify(contentRows)}`);
        }
      }
      console.log(`unsafeFrames=${unsafeFrameCount}`);
      if (unsafeFrameCount > 0) {
        throw new Error(
          `Observed ${unsafeFrameCount} blank or partial tasks:watch frames`,
        );
      }
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

  protected static bottomPanelRectangle(status: StatusSnapshot): Rectangle {
    const layoutSlots = status.layoutSlots as
      Record<string, Rectangle> | undefined;
    const bottomPanelRectangle = layoutSlots?.bottomPanel;
    if (!bottomPanelRectangle) {
      throw new Error('The bottom-panel rectangle was not published');
    }
    return bottomPanelRectangle;
  }

  protected static terminalBodyRows(
    snapshot: HarnessSnapshot.Model,
    panelRectangle: Rectangle,
  ): readonly string[] {
    const endRowExclusive = Math.min(
      snapshot.rows,
      panelRectangle.top + panelRectangle.height,
    );
    const endColumnExclusive = Math.min(
      snapshot.columns,
      panelRectangle.left + panelRectangle.width,
    );
    return snapshot
      .textRows()
      .slice(panelRectangle.top, endRowExclusive)
      .map((rowText) => rowText.slice(panelRectangle.left, endColumnExclusive));
  }
}

export namespace TerminalPaneFidelityDiagnosticProbe {
  export const $Class = Static($TerminalPaneFidelityDiagnosticProbe);
  export let Class = $Class;
}

interface Rectangle {
  left: number;
  top: number;
  width: number;
  height: number;
}

await TerminalPaneFidelityDiagnosticProbe.Class.main(process.argv.slice(2));
