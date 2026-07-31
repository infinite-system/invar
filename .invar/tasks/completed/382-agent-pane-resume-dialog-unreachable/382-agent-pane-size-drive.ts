#!/usr/bin/env bun
// This drive compares each task-pane child's reported PTY size with its visible cell region.
// Run it with `bun .invar/tasks/in-progress/382-agent-pane-resume-dialog-unreachable/382-agent-pane-size-drive.ts`.
// Each table row names the outer grid, pane span, expected child grid, reported child grid, visible
// numbered rows, and SIGWINCH event. Equal expected and reported grids with rows 1 through N visible
// rule out stale sizing and host clipping for that layout change.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../../../src/modules/system/StatusChannel';
import { HarnessSmoke } from '../../../../scripts/harness/HarnessSmoke';
import type { HarnessSnapshot } from '../../../../scripts/harness/HarnessSnapshot';
import { PtyTestDriver } from '../../../../scripts/harness/PtyTestDriver';

interface ProbeObservation {
  readonly paneLabel: string;
  readonly reportedColumns: number;
  readonly reportedRows: number;
  readonly resizeEventCount: number;
  readonly visibleRowNumbers: readonly number[];
}

interface ProbeTableRow {
  readonly scenario: string;
  readonly outerGrid: string;
  readonly paneLabel: string;
  readonly paneRegion: string;
  readonly expectedChildGrid: string;
  readonly reportedChildGrid: string;
  readonly visibleNumberedRows: string;
  readonly resizeEvent: number;
}

class $AgentPaneSizeDrive {
  protected get probeLabels(): readonly string[] {
    return ['A', 'B'];
  }

  protected readonly repositoryRoot = join(import.meta.dir, '../../../..');
  protected readonly probeScriptPath = join(
    import.meta.dir,
    '382-pty-window-size-probe.py',
  );

  async run(): Promise<void> {
    const tableRows = [
      ...(await this.driveCase('single initial', 1)),
      ...(await this.driveCase('split initial', 2)),
    ];
    console.table(tableRows);
  }

  protected async driveCase(
    initialScenario: string,
    paneCount: number,
  ): Promise<ProbeTableRow[]> {
    const workspaceRoot = mkdtempSync(
      join(tmpdir(), `invar-382-pane-size-${paneCount}-workspace-`),
    );
    const homeDirectory = mkdtempSync(
      join(tmpdir(), `invar-382-pane-size-${paneCount}-home-`),
    );
    const statusPath = join(homeDirectory, 'status.json');
    mkdirSync(join(workspaceRoot, '.invar'), { recursive: true });
    await Bun.write(
      join(workspaceRoot, '.invar', 'tasks.json'),
      `${JSON.stringify(this.tasksConfiguration(paneCount), null, 2)}\n`,
    );

    const driver = new PtyTestDriver.Class({
      repositoryRoot: this.repositoryRoot,
      workspaceRoot,
      columns: 120,
      rows: 40,
      homeDirectory,
      environment: {
        TUI_STATUS_PATH: statusPath,
        INVAR_AGENT_BACKEND: 'echo',
        INVAR_TEST_SUPPRESS_BUILT_IN_TASK: '0',
        INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS: '0',
      },
    });

    try {
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${paneCount}-pane probe tasks launch in one visible group`,
        (status) =>
          status.ready === true &&
          Array.isArray(status.taskLaunchedLabels) &&
          status.taskLaunchedLabels.length === paneCount &&
          Array.isArray(status.panelCellColumns) &&
          status.panelCellColumns.length === paneCount,
        20_000,
      );
      const initialObservations = await this.awaitProbeObservations(
        driver,
        paneCount,
        () => true,
        `${paneCount}-pane initial probe frame appears`,
      );
      let tableRows = await this.tableRows(
        statusPath,
        initialScenario,
        initialObservations,
      );
      if (paneCount === 1) return tableRows;

      driver.resize(100, 30);
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'the outer PTY resize publishes 100 by 30',
        (status) => status.width === 100 && status.height === 30,
      );
      const outerResizeObservations = await this.awaitProbeObservations(
        driver,
        paneCount,
        (observation) =>
          observation.resizeEventCount >
          (initialObservations.find(
            (candidate) => candidate.paneLabel === observation.paneLabel,
          )?.resizeEventCount ?? 0),
        'both task children receive the outer-terminal resize',
      );
      tableRows = [
        ...tableRows,
        ...(await this.tableRows(
          statusPath,
          'outer grid resized',
          outerResizeObservations,
        )),
      ];

      const resizedStatus = await HarnessSmoke.Class.readStatus(statusPath);
      const splitterRegions = resizedStatus.splitterRegions as Record<
        string,
        { left: number; top: number; width: number }
      >;
      const bottomPanelSplitter = splitterRegions.bottomPanel;
      const splitterColumn =
        bottomPanelSplitter.left + Math.floor(bottomPanelSplitter.width / 2);
      driver.sendMouse({
        kind: 'press',
        column: splitterColumn,
        row: bottomPanelSplitter.top,
        button: 'left',
      });
      driver.sendMouse({
        kind: 'move',
        column: splitterColumn,
        row: bottomPanelSplitter.top - 4,
        button: 'left',
      });
      driver.sendMouse({
        kind: 'release',
        column: splitterColumn,
        row: bottomPanelSplitter.top - 4,
        button: 'left',
      });
      const previousPanelHeight = this.bottomPanelHeight(resizedStatus);
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'the bottom-panel splitter grows the task-pane height',
        (status) => this.bottomPanelHeight(status) > previousPanelHeight,
      );
      const panelResizeObservations = await this.awaitProbeObservations(
        driver,
        paneCount,
        (observation) =>
          observation.resizeEventCount >
          (outerResizeObservations.find(
            (candidate) => candidate.paneLabel === observation.paneLabel,
          )?.resizeEventCount ?? 0),
        'both task children receive the bottom-panel height change',
      );
      return [
        ...tableRows,
        ...(await this.tableRows(
          statusPath,
          'panel height grown',
          panelResizeObservations,
        )),
      ];
    } finally {
      await driver.dispose();
      await HarnessSmoke.Class.removeTemporaryDirectory(workspaceRoot);
      await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
    }
  }

  protected tasksConfiguration(paneCount: number): object {
    return {
      version: '2.0.0',
      tasks: this.probeLabels.slice(0, paneCount).map((paneLabel) => ({
        label: `PTY Probe ${paneLabel}`,
        type: 'shell',
        command: 'python3',
        args: [this.probeScriptPath, paneLabel],
        problemMatcher: [],
        presentation: {
          group: 'pty-size-probes',
          panel: 'dedicated',
        },
        runOptions: { runOn: 'folderOpen' },
      })),
    };
  }

  protected async awaitProbeObservations(
    driver: PtyTestDriver.Model,
    paneCount: number,
    predicate: (observation: ProbeObservation) => boolean,
    description: string,
  ): Promise<ProbeObservation[]> {
    const paneLabels = this.probeLabels.slice(0, paneCount);
    const snapshot = await driver.awaitGridCondition(
      description,
      (candidate) => {
        const observations = paneLabels
          .map((paneLabel) => this.probeObservation(candidate, paneLabel))
          .filter(
            (observation): observation is ProbeObservation =>
              observation !== null,
          );
        return (
          observations.length === paneCount &&
          observations.every(
            (observation) =>
              predicate(observation) &&
              observation.visibleRowNumbers.length ===
                observation.reportedRows &&
              observation.visibleRowNumbers[0] === 1 &&
              observation.visibleRowNumbers.at(-1) === observation.reportedRows,
          )
        );
      },
    );
    return paneLabels.map((paneLabel) => {
      const observation = this.probeObservation(snapshot, paneLabel);
      if (!observation) throw new Error(`Missing probe pane ${paneLabel}`);
      return observation;
    });
  }

  protected probeObservation(
    snapshot: HarnessSnapshot.Model,
    paneLabel: string,
  ): ProbeObservation | null {
    const pattern = new RegExp(
      `${paneLabel}\\s+(\\d+)\\/(\\d+)\\s+(\\d+)x(\\d+)\\s+E(\\d+)`,
      'g',
    );
    const matches = snapshot
      .textRows()
      .flatMap((rowText) => [...rowText.matchAll(pattern)]);
    const lastMatch = matches.at(-1);
    if (!lastMatch) return null;
    return {
      paneLabel,
      reportedColumns: Number(lastMatch[3]),
      reportedRows: Number(lastMatch[4]),
      resizeEventCount: Number(lastMatch[5]),
      visibleRowNumbers: [
        ...new Set(matches.map((match) => Number(match[1]))),
      ].sort((left, right) => left - right),
    };
  }

  protected async tableRows(
    statusPath: string,
    scenario: string,
    observations: readonly ProbeObservation[],
  ): Promise<ProbeTableRow[]> {
    const status = await HarnessSmoke.Class.readStatus(statusPath);
    const paneColumns = this.panelCellColumns(status);
    const paneRows = this.bottomPanelHeight(status);
    return observations.map((observation, paneIndex) => {
      const expectedColumns = Math.max(1, Number(paneColumns[paneIndex]) - 4);
      const expectedRows = Math.max(1, paneRows - 2);
      const visibleRows = observation.visibleRowNumbers;
      return {
        scenario,
        outerGrid: `${status.width}x${status.height}`,
        paneLabel: observation.paneLabel,
        paneRegion: `${paneColumns[paneIndex]}x${paneRows}`,
        expectedChildGrid: `${expectedColumns}x${expectedRows}`,
        reportedChildGrid: `${observation.reportedColumns}x${observation.reportedRows}`,
        visibleNumberedRows:
          visibleRows.length === 0
            ? 'none'
            : `${visibleRows[0]}-${visibleRows.at(-1)} (${visibleRows.length}/${observation.reportedRows})`,
        resizeEvent: observation.resizeEventCount,
      };
    });
  }

  protected panelCellColumns(status: StatusSnapshot): number[] {
    return Array.isArray(status.panelCellColumns)
      ? status.panelCellColumns.map(Number)
      : [];
  }

  protected bottomPanelHeight(status: StatusSnapshot): number {
    const layoutSlots = status.layoutSlots as Record<
      string,
      { height?: number }
    >;
    return Number(layoutSlots.bottomPanel?.height ?? 0);
  }
}

export namespace AgentPaneSizeDrive {
  export const $Class = $AgentPaneSizeDrive;
  export let Class = $Class;
}

await new AgentPaneSizeDrive.Class().run();
