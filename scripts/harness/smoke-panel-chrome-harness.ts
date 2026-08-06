#!/usr/bin/env bun
// Drive the mixed workspace-tab and editor-action row through its keyboard and mouse paths.
// Run: bun scripts/harness/smoke-panel-chrome-harness.ts
// ALL-PASS means tabs survive when editor actions truncate, the exact terminal lifecycle graph
// survives every create/remove/split step at small and large scale, expanded mode always has a
// symmetric exit, row controls share their backgrounds, and all neighboring panel controls work.
//
// invariant: Harness input and output use the real PTY (scripts/harness/harness.invariants.md)
// invariant: The terminal emulator is the harness screen oracle (scripts/harness/harness.invariants.md)
// invariant: Harness waits observe conditions not frame ordinals (scripts/harness/harness.invariants.md)
// invariant: Every wait names itself (scripts/harness/harness.invariants.md)
// invariant: Panel controls share paint and hit geometry (src/modules/ui/ui.invariants.md)
// invariant: Tab bars share paint and hit geometry (src/modules/ui/ui.invariants.md)
// invariant: Expanded panel overrides only the editor center rows (src/modules/layout/layout.invariants.md)
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StatusSnapshot } from '../../src/modules/system/StatusChannel';
import { ThemeIcons } from '../../src/modules/theme/ThemeIcons';
import { ThemePalettes } from '../../src/modules/theme/ThemePalettes';
import { GraphClient } from './GraphClient';
import { HarnessSmoke } from './HarnessSmoke';
import type { HarnessSnapshot } from './HarnessSnapshot';
import { PtyTestDriver } from './PtyTestDriver';

interface WorkspaceTabSegment {
  readonly spaceIdentifier: string;
  readonly startColumn: number;
  readonly endColumnExclusive: number;
}

interface EditorActionSegment {
  readonly commandId: string;
  readonly startColumn: number;
  readonly endColumnExclusive: number;
}

interface ControlSegment {
  readonly action: 'pane-list' | 'pane-add' | 'expand' | 'close';
  readonly startColumn: number;
  readonly endColumnExclusive: number;
}

interface TabBarGeometry {
  readonly row: number;
  readonly editorActionRow: number;
  readonly tabRow: number;
  readonly tabs: readonly WorkspaceTabSegment[];
  readonly spaceAdd: {
    readonly startColumn: number;
    readonly endColumnExclusive: number;
  } | null;
  readonly editorActions: readonly EditorActionSegment[];
  readonly instancesToggle: {
    readonly startColumn: number;
    readonly endColumnExclusive: number;
  } | null;
  readonly drag: {
    readonly left: number;
    readonly width: number;
    readonly leadingPaintPadCells: number;
  };
  readonly controls: readonly ControlSegment[];
}

function tabBar(status: StatusSnapshot): TabBarGeometry {
  const geometry = status.panelSeparatorGeometry as
    TabBarGeometry | null | undefined;
  if (!geometry) throw new Error('Missing panel tab-bar geometry');
  return geometry;
}

// The painted mark run on the separator row addresses both drag edges through what is on screen.
interface MarkRun {
  readonly firstColumn: number;
  readonly lastColumn: number;
}

function splitterMarkRun(
  snapshot: HarnessSnapshot.Model,
  row: number,
  startColumn: number,
  width: number,
): MarkRun {
  const dragSpan = Array.from(
    snapshot.rowText(row).slice(startColumn, startColumn + width),
  );
  const firstColumnWithinSpan = dragSpan.indexOf('\u2500');
  const lastColumnWithinSpan = dragSpan.lastIndexOf('\u2500');
  if (firstColumnWithinSpan < 0) {
    throw new Error(`No splitter mark painted on row ${row}`);
  }
  return {
    firstColumn: startColumn + firstColumnWithinSpan,
    lastColumn: startColumn + lastColumnWithinSpan,
  };
}

function clickSegment(
  driver: PtyTestDriver.Model,
  row: number,
  segment: { startColumn: number; endColumnExclusive: number },
): void {
  const column =
    segment.startColumn +
    Math.floor((segment.endColumnExclusive - segment.startColumn) / 2);
  driver.sendMouse({ kind: 'move', column, row, button: 'none' });
  driver.sendMouseClick({ column, row, button: 'left' });
}

function clickCell(
  driver: PtyTestDriver.Model,
  column: number,
  row: number,
): void {
  driver.sendMouse({ kind: 'move', column, row, button: 'none' });
  driver.sendMouseClick({ column, row, button: 'left' });
}

async function driveLegacyPersistedPaneRestore(): Promise<void> {
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'invar-panel-legacy-identity-'),
  );
  const settingsDirectory = join(homeDirectory, '.config', 'invar');
  mkdirSync(settingsDirectory, { recursive: true });
  await Bun.write(
    join(settingsDirectory, 'settings.json'),
    `${JSON.stringify({
      glyphMode: 'unicode',
      panelContentOrder: ['terminal', 'agent'],
      panelWorkspaceStates: {
        [process.cwd()]: {
          spaces: [
            {
              kind: 'terminal',
              label: 'Terminal',
              groups: [
                [
                  {
                    kind: 'terminal',
                    label: 'Terminal',
                    identifier: 'terminal',
                  },
                ],
              ],
              activeGroupIndex: 0,
            },
          ],
          activeSpaceIndex: 0,
          panelListExpanded: false,
          panelListWidth: 20,
          visible: true,
        },
      },
    })}\n`,
  );
  const statusPath = join(homeDirectory, 'status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: process.cwd(),
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_AGENT_BACKEND: 'echo',
    },
  });

  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'an old saved terminal identifier restores unchanged',
      (status) =>
        status.ready === true &&
        status.panelActiveContent === 'terminal' &&
        Array.isArray(status.panelContentIds) &&
        status.panelContentIds.includes('terminal') &&
        Array.isArray(status.panelContentKinds) &&
        status.panelContentIds.length === status.panelContentKinds.length &&
        Array.isArray(status.panelContentLabels) &&
        status.panelContentIds.length === status.panelContentLabels.length,
      15_000,
    );
    HarnessSmoke.Class.pass('old saved pane identifiers restore unchanged');
  } finally {
    driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

async function driveRestoredTaskPaneSpaceHealing(
  lineCount: number,
): Promise<void> {
  const scaleFixture =
    await HarnessSmoke.Class.createDriveScaleFixture(lineCount);
  const taskConfigurationDirectory = join(scaleFixture.workspaceRoot, '.invar');
  mkdirSync(taskConfigurationDirectory, { recursive: true });
  const taskConfigurationPath = join(taskConfigurationDirectory, 'tasks.json');
  await Bun.write(
    taskConfigurationPath,
    `${JSON.stringify({
      version: '2.0.0',
      tasks: [
        {
          label: 'Claude',
          type: 'shell',
          command: '/bin/sh',
          args: ['-lc', "printf 'RESTORED_TASK_READY\\n'; exec /bin/sh -i"],
          presentation: { panel: 'dedicated' },
          runOptions: { runOn: 'folderOpen' },
        },
      ],
    })}\n`,
  );
  const homeDirectory = mkdtempSync(
    join(tmpdir(), `invar-panel-restored-task-space-${lineCount}-`),
  );
  const settingsDirectory = join(homeDirectory, '.config', 'invar');
  mkdirSync(settingsDirectory, { recursive: true });
  const settingsPath = join(settingsDirectory, 'settings.json');
  const terminalPane = {
    kind: 'terminal',
    label: 'Terminal 5',
    identifier: 'pane-instance-5',
  };
  const taskPanes = [
    {
      kind: `task:${encodeURIComponent(scaleFixture.workspaceRoot)}:0`,
      label: 'Claude',
      identifier: `task:${encodeURIComponent(scaleFixture.workspaceRoot)}:0`,
    },
    {
      kind: `task:${encodeURIComponent(scaleFixture.workspaceRoot)}:1`,
      label: 'Terminal',
      identifier: `task:${encodeURIComponent(scaleFixture.workspaceRoot)}:1`,
    },
  ];
  await Bun.write(
    settingsPath,
    `${JSON.stringify({
      panelContentOrder: [
        terminalPane.identifier,
        ...taskPanes.map((pane) => pane.identifier),
      ],
      panelWorkspaceStates: {
        [scaleFixture.workspaceRoot]: {
          spaces: [
            {
              kind: 'terminal',
              label: 'Terminal',
              groups: [[terminalPane, ...taskPanes]],
              activeGroupIndex: 0,
            },
            {
              kind: taskPanes[0]!.kind,
              label: taskPanes[0]!.label,
              groups: [[taskPanes[0]!]],
              activeGroupIndex: 0,
            },
          ],
          activeSpaceIndex: 0,
          panelListExpanded: true,
          panelListWidth: 24,
          visible: true,
        },
      },
    })}\n`,
  );

  const startDriver = (statusName: string): PtyTestDriver.Model =>
    new PtyTestDriver.Class({
      workspaceRoot: scaleFixture.workspaceRoot,
      columns: 120,
      rows: 40,
      homeDirectory,
      environment: {
        TUI_STATUS_PATH: join(homeDirectory, statusName),
        INVAR_AGENT_BACKEND: 'echo',
        INVAR_TEST_SUPPRESS_BUILT_IN_TASK: '1',
        INVAR_TEST_SUPPRESS_FOLDER_OPEN_TASKS: '0',
      },
    });
  try {
    const observeOneTerminalSpace = async (
      statusName: string,
      observationName: string,
    ): Promise<void> => {
      const statusPath = join(homeDirectory, statusName);
      const driver = startDriver(statusName);
      try {
        const status = await HarnessSmoke.Class.awaitStatus(
          driver,
          statusPath,
          observationName,
          (candidate) =>
            candidate.ready === true &&
            JSON.stringify(candidate.panelSpaceLabels) ===
              JSON.stringify(['Terminal']) &&
            JSON.stringify(candidate.panelContentLabels) ===
              JSON.stringify(['Terminal 5', 'Claude']) &&
            Array.isArray(candidate.panelContentKinds) &&
            candidate.panelContentKinds.every((kind) => kind === 'terminal') &&
            JSON.stringify(candidate.panelCellLabels) ===
              JSON.stringify(['Claude']),
          15_000,
        );
        const snapshot = await driver.awaitGridCondition(
          `${lineCount}-line ${observationName} paints the relaunched task terminal`,
          (candidate) => candidate.findText('RESTORED_TASK_READY') !== null,
        );
        const listRegion = status.panelListGeometry as {
          left: number;
          top: number;
          width: number;
        };
        const taskRow = snapshot
          .textRows()
          .findIndex(
            (rowText, row) =>
              row >= listRegion.top &&
              rowText
                .slice(listRegion.left, listRegion.left + listRegion.width)
                .includes('Claude'),
          );
        if (taskRow < 0) throw new Error('The task row did not paint');
        driver.sendMouse({
          kind: 'move',
          column: listRegion.left + listRegion.width - 8,
          row: taskRow,
          button: 'none',
        });
        const hoveredSnapshot = await driver.awaitGridCondition(
          `${lineCount}-line task row reveals its Open tasks.json control`,
          (candidate) => candidate.findText('Open tasks.json') !== null,
        );
        const taskGlyphLocation =
          (['nerd', 'unicode', 'ascii'] as const)
            .map((glyphLevel) =>
              hoveredSnapshot.findTextInRectangle(
                ThemeIcons.Class.taskActionIconsFor(glyphLevel).taskRecord,
                {
                  left: listRegion.left + listRegion.width - 9,
                  top: taskRow,
                  width: 3,
                  height: 1,
                },
              ),
            )
            .find((location) => location !== null) ?? null;
        const panelContentKinds = Array.isArray(status.panelContentKinds)
          ? status.panelContentKinds
          : [];
        HarnessSmoke.Class.requireCondition(
          tabBar(status).tabs.length === 1 &&
            taskGlyphLocation !== null &&
            taskGlyphLocation.row === taskRow &&
            !panelContentKinds.some((kind) => String(kind).startsWith('task:')),
          `${lineCount}-line ${observationName} paints one Terminal space, a task glyph, and no task kind`,
        );
        if (!taskGlyphLocation) {
          throw new Error('The task glyph assertion did not retain a cell');
        }
        clickCell(driver, taskGlyphLocation.column, taskGlyphLocation.row);
        await HarnessSmoke.Class.awaitStatus(
          driver,
          statusPath,
          `${lineCount}-line task glyph opens its workspace task source`,
          (candidate) => candidate.activeBuffer === taskConfigurationPath,
        );
      } finally {
        await driver.dispose();
      }
    };

    await observeOneTerminalSpace(
      'first-status.json',
      'the first boot drops dead task panes from their saved Terminal space',
    );
    const healedSettings = (await Bun.file(settingsPath).json()) as {
      panelContentOrder: readonly string[];
      panelWorkspaceStates: Record<
        string,
        {
          spaces: readonly {
            kind: string;
            groups: readonly (readonly {
              identifier?: string;
              kind: string;
            }[])[];
          }[];
        }
      >;
    };
    const healedPanelContentOrder = healedSettings.panelContentOrder;
    HarnessSmoke.Class.requireCondition(
      healedPanelContentOrder.includes(terminalPane.identifier) &&
        healedPanelContentOrder.every(
          (identifier) => !identifier.startsWith('task:'),
        ),
      `${lineCount}-line first boot must drop saved task identities from global order; order=${JSON.stringify(healedPanelContentOrder)}`,
    );
    HarnessSmoke.Class.requireCondition(
      JSON.stringify(
        healedSettings.panelWorkspaceStates[
          scaleFixture.workspaceRoot
        ]?.spaces.map((space) => space.kind),
      ) === JSON.stringify(['terminal']),
      `${lineCount}-line first boot saves only the healed Terminal space`,
    );
    HarnessSmoke.Class.requireCondition(
      healedSettings.panelWorkspaceStates[
        scaleFixture.workspaceRoot
      ]?.spaces.every((space) =>
        space.groups.every((group) =>
          group.every(
            (pane) =>
              !pane.kind.startsWith('task:') &&
              !pane.identifier?.startsWith('task:'),
          ),
        ),
      ) === true,
      `${lineCount}-line first boot saves no task entry because declared tasks relaunch through TaskLauncher`,
    );
    await observeOneTerminalSpace(
      'second-status.json',
      'the second boot reads the layout with no dead task panes',
    );
    HarnessSmoke.Class.pass(
      `${lineCount}-line dead task panes stay gone and the real terminal survives restart`,
    );
  } finally {
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
    await HarnessSmoke.Class.removeTemporaryDirectory(
      scaleFixture.workspaceRoot,
    );
  }
}

async function driveEmptyPanelRecovery(
  columns: number,
  rows: number,
): Promise<void> {
  const workspaceRoot = mkdtempSync(
    join(tmpdir(), 'invar-panel-empty-workspace-'),
  );
  await Bun.write(join(workspaceRoot, 'alpha.ts'), 'export const alpha = 1;\n');
  const homeDirectory = mkdtempSync(join(tmpdir(), 'invar-panel-empty-home-'));
  const settingsDirectory = join(homeDirectory, '.config', 'invar');
  mkdirSync(settingsDirectory, { recursive: true });
  await Bun.write(
    join(settingsDirectory, 'settings.json'),
    `${JSON.stringify({
      panelWorkspaceStates: {
        [workspaceRoot]: {
          spaces: [
            {
              kind: 'terminal',
              label: 'Terminal',
              groups: [
                [
                  { kind: 'terminal', label: 'Terminal One' },
                  { kind: 'terminal', label: 'Terminal Two' },
                ],
              ],
              activeGroupIndex: 0,
            },
          ],
          activeSpaceIndex: 0,
          panelListExpanded: true,
          panelListWidth: 24,
          visible: true,
        },
      },
    })}\n`,
  );
  const statusPath = join(homeDirectory, 'status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot,
    columns,
    rows,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_AGENT_BACKEND: 'echo',
    },
  });

  try {
    const initialStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column restored panel has two reachable terminal rows and no Database pane`,
      (candidate) =>
        candidate.panelVisible === true &&
        candidate.panelListVisible === true &&
        JSON.stringify(candidate.panelContentLabels) ===
          JSON.stringify(['Terminal One', 'Terminal Two']) &&
        JSON.stringify(candidate.panelCellLabels) ===
          JSON.stringify(['Terminal One', 'Terminal Two']),
    );
    HarnessSmoke.Class.requireCondition(
      !(initialStatus.panelContentKinds as string[]).includes('database') &&
        driver.snapshot().findText('No Terminal instances') === null,
      'a nonempty restored panel has no phantom Database pane or empty notice',
    );

    await HarnessSmoke.Class.requestPanelContainerClose(driver, 'Terminal', 2);
    driver.sendKeys('Enter');
    await driver.awaitGridCondition(
      `${columns}-column Terminal container dialog defaults to No`,
      (candidate) =>
        candidate.findText('Close Terminal and its 2 instances?') === null,
    );
    const preservedStatus = HarnessSmoke.Class.readStatus(statusPath);
    HarnessSmoke.Class.requireCondition(
      Array.isArray(preservedStatus.panelContentKinds) &&
        preservedStatus.panelContentKinds.filter((kind) => kind === 'terminal')
          .length === 2,
      `${columns}-column container dialog defaults to No and preserves both instances`,
    );

    const promptSnapshot = await driver.awaitGridCondition(
      'the first restored terminal paints a prompt before foreground work starts',
      (candidate) => candidate.findText('$') !== null,
    );
    HarnessSmoke.Class.clickText(driver, promptSnapshot, '$');
    driver.sendText('sleep 30');
    driver.sendKeys('Enter');
    await driver.awaitGridCondition(
      'the first terminal paints its live foreground command',
      (candidate) => candidate.findText('sleep 30') !== null,
    );

    await HarnessSmoke.Class.closePanelContentsListRow(
      driver,
      statusPath,
      'Terminal One',
    );
    // Graph wait for the MODEL condition (registry down to one), then a
    // screen assertion for what the user sees — graph sequences, screen
    // asserts (task #469).
    await GraphClient.Class.awaitValue(
      statusPath,
      'panelHost.orderedContents.length',
      1,
    );
    const oneRemainingSnapshot = await driver.awaitGridCondition(
      'one remaining terminal keeps the empty notice absent',
      (candidate) =>
        candidate.findText('Terminal Two') !== null &&
        candidate.findText('No Terminal instances') === null,
    );
    HarnessSmoke.Class.requireCondition(
      oneRemainingSnapshot.findText('No Terminal instances') === null,
      'the empty notice does not paint while one terminal remains',
    );

    await HarnessSmoke.Class.closePanelContentsListRow(
      driver,
      statusPath,
      'Terminal Two',
    );
    const emptyStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the last instance leaves one visible empty panel list',
      (candidate) =>
        candidate.panelVisible === true &&
        candidate.panelListVisible === true &&
        Array.isArray(candidate.panelContentIds) &&
        candidate.panelContentIds.length === 0 &&
        Array.isArray(candidate.panelCellIds) &&
        candidate.panelCellIds.length === 0,
    );
    // The #465 invariant, observable only through the graph: the emptied
    // SPACE survives its last instance — the container is not destroyed.
    // invariant: An emptied space survives its last instance (src/modules/ui/ui.invariants.md)
    await GraphClient.Class.awaitValue(
      statusPath,
      'panelHost.spaces.length',
      1,
    );
    await GraphClient.Class.awaitValue(
      statusPath,
      'panelHost.activeSpace.contentIds.length',
      0,
    );
    // Screen contract: the empty panel offers the one-form add button and
    // the notice (the #467 shape).
    const emptySnapshot = await driver.awaitGridCondition(
      'the empty panel paints the add button and the notice',
      (candidate) =>
        candidate.findText('+ Terminal ▾') !== null &&
        candidate.findText('No Terminal instances') !== null,
    );
    HarnessSmoke.Class.requireCondition(
      emptyStatus.panelVisible === true &&
        emptyStatus.panelListVisible === true &&
        emptySnapshot.findText('+ Terminal ▾') !== null,
      'the empty panel stays open and offers the + Terminal button',
    );
    HarnessSmoke.Class.pass(
      `${columns}-column instance rows close without dialogs and the empty panel offers + Terminal`,
    );
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
    await HarnessSmoke.Class.removeTemporaryDirectory(workspaceRoot);
  }
}

async function driveTerminalLifecycleProtocol(
  lineCount: number,
): Promise<void> {
  const scaleFixture =
    await HarnessSmoke.Class.createDriveScaleFixture(lineCount);
  const homeDirectory = mkdtempSync(
    join(tmpdir(), `invar-panel-lifecycle-${lineCount}-`),
  );
  const statusPath = join(homeDirectory, 'status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: scaleFixture.workspaceRoot,
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_AGENT_BACKEND: 'echo',
    },
  });

  const exactState = async (
    name: string,
    contentIds: readonly string[],
    groups: readonly (readonly string[])[],
    cellIds: readonly string[],
  ): Promise<StatusSnapshot> => {
    await GraphClient.Class.awaitValue(
      statusPath,
      'panelHost.orderedContents.length',
      contentIds.length,
    );
    await GraphClient.Class.awaitValue(
      statusPath,
      'panelHost.resolvedCells.length',
      cellIds.length,
    );
    const status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line lifecycle graph after ${name}`,
      (candidate) =>
        JSON.stringify(candidate.panelContentIds) ===
          JSON.stringify(contentIds) &&
        JSON.stringify(candidate.panelGroups) === JSON.stringify(groups) &&
        JSON.stringify(candidate.panelCellIds) === JSON.stringify(cellIds),
    );
    HarnessSmoke.Class.requireCondition(
      JSON.stringify(status.panelContentIds) === JSON.stringify(contentIds) &&
        JSON.stringify(status.panelGroups) === JSON.stringify(groups) &&
        JSON.stringify(status.panelCellIds) === JSON.stringify(cellIds),
      `${lineCount}-line lifecycle graph is exact after ${name}`,
    );
    return status;
  };

  const listGeometry = (): { left: number; top: number; width: number } => {
    const geometry = HarnessSmoke.Class.readStatus(statusPath)
      .panelListGeometry as { left: number; top: number; width: number };
    if (!geometry || geometry.width <= 0) {
      throw new Error('Missing panel instances-list geometry');
    }
    return geometry;
  };

  const choosePopupItem = async (identifier: string): Promise<void> => {
    const popupStatus = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `the lifecycle chooser offers ${identifier}`,
      (candidate) =>
        candidate.boundedListPopupOpen === true &&
        Array.isArray(candidate.boundedListPopupItemIdentifiers) &&
        candidate.boundedListPopupItemIdentifiers.includes(identifier),
    );
    const identifiers = popupStatus.boundedListPopupItemIdentifiers as string[];
    const selectedIndex = Number(popupStatus.boundedListPopupSelected);
    const targetIndex = identifiers.indexOf(identifier);
    const movement = targetIndex - selectedIndex;
    const key = movement < 0 ? 'Up' : 'Down';
    for (let step = 0; step < Math.abs(movement); step += 1) {
      driver.sendKeys(key);
    }
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `the lifecycle chooser selects ${identifier}`,
      (candidate) =>
        candidate.boundedListPopupSelectedIdentifier === identifier,
    );
    driver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `the lifecycle chooser closes after selecting ${identifier}`,
      (candidate) => candidate.boundedListPopupOpen === false,
    );
  };

  const addInstance = async (identifier = 'terminal'): Promise<void> => {
    const geometry = listGeometry();
    clickCell(driver, geometry.left + 2, geometry.top);
    await choosePopupItem(identifier);
  };

  const closeRow = (rowIndex: number): void => {
    const geometry = listGeometry();
    clickCell(
      driver,
      geometry.left + geometry.width - 2,
      geometry.top + 2 + rowIndex,
    );
  };

  const splitRow = async (rowIndex: number): Promise<void> => {
    const geometry = listGeometry();
    clickCell(
      driver,
      geometry.left + geometry.width - 5,
      geometry.top + 2 + rowIndex,
    );
    await choosePopupItem('terminal');
  };

  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line lifecycle fixture is ready`,
      (status) => status.ready === true,
      15_000,
    );
    const statusControlSnapshot = await driver.awaitGridCondition(
      `${lineCount}-line generic panel status control is visible`,
      (candidate) =>
        candidate.rowText(candidate.rows - 1).lastIndexOf(' ❯ ') >= 0,
    );
    const statusBarRow = statusControlSnapshot.rows - 1;
    const statusControlStart = statusControlSnapshot
      .rowText(statusBarRow)
      .lastIndexOf(' ❯ ');
    clickCell(driver, statusControlStart + 1, statusBarRow);
    let status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line lifecycle panel opens`,
      (candidate) => candidate.panelVisible === true,
    );
    const listToggle = tabBar(status).instancesToggle;
    if (!listToggle) throw new Error('Missing instances-list toggle');
    clickSegment(driver, tabBar(status).tabRow, listToggle);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line lifecycle list opens`,
      (candidate) => candidate.panelListVisible === true,
    );
    await exactState('opening the list', [], [], []);

    status = HarnessSmoke.Class.readStatus(statusPath);
    const firstSpaceAdd = tabBar(status).spaceAdd;
    if (!firstSpaceAdd) throw new Error('Missing first Terminal-space Add');
    clickSegment(driver, tabBar(status).tabRow, firstSpaceAdd);
    await choosePopupItem('terminal');
    await exactState(
      'creating terminal 1',
      ['pane-instance-1'],
      [['pane-instance-1']],
      ['pane-instance-1'],
    );
    status = HarnessSmoke.Class.readStatus(statusPath);
    if (status.panelListVisible !== true) {
      const recreatedListToggle = tabBar(status).instancesToggle;
      if (!recreatedListToggle) {
        throw new Error('Missing recreated instances-list toggle');
      }
      clickSegment(driver, tabBar(status).tabRow, recreatedListToggle);
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${lineCount}-line recreated lifecycle list opens`,
        (candidate) => candidate.panelListVisible === true,
      );
    }
    const headerGeometry = listGeometry();
    const idleHeaderSnapshot = await driver.awaitGridCondition(
      `${lineCount}-line add header paints its leading space in the idle state`,
      (candidate) =>
        candidate.cell(headerGeometry.top, headerGeometry.left + 1)
          ?.characters === '+',
    );
    const darkPalette = ThemePalettes.Class.DARK;
    HarnessSmoke.Class.requireCondition(
      idleHeaderSnapshot.cell(headerGeometry.top, headerGeometry.left)
        ?.characters === ' ' &&
        idleHeaderSnapshot.cell(headerGeometry.top, headerGeometry.left + 1)
          ?.background === Number.parseInt(darkPalette.panel.slice(1), 16),
      `${lineCount}-line add header starts with one leading space and no selected background`,
    );
    driver.sendMouse({
      kind: 'move',
      column: headerGeometry.left + 2,
      row: headerGeometry.top,
      button: 'none',
    });
    const hoveredHeaderSnapshot = await driver.awaitGridCondition(
      `${lineCount}-line add header paints its hover state`,
      (candidate) =>
        candidate.findText('Add Terminal instance') !== null &&
        candidate.cell(headerGeometry.top, headerGeometry.left + 1)
          ?.background === Number.parseInt(darkPalette.cursorLine.slice(1), 16),
    );
    HarnessSmoke.Class.requireCondition(
      hoveredHeaderSnapshot.cell(headerGeometry.top, headerGeometry.left + 1)
        ?.background === Number.parseInt(darkPalette.cursorLine.slice(1), 16),
      `${lineCount}-line add header hover uses the shared hover background`,
    );
    driver.sendMouse({
      kind: 'press',
      column: headerGeometry.left + 2,
      row: headerGeometry.top,
      button: 'left',
    });
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line add header press opens its chooser`,
      (candidate) => candidate.boundedListPopupOpen === true,
    );
    const pressedHeaderSnapshot = await driver.awaitGridCondition(
      `${lineCount}-line add header paints its pressed state`,
      (candidate) =>
        candidate.cell(headerGeometry.top, headerGeometry.left + 1)
          ?.background === Number.parseInt(darkPalette.selection.slice(1), 16),
    );
    HarnessSmoke.Class.requireCondition(
      pressedHeaderSnapshot.cell(headerGeometry.top, headerGeometry.left + 1)
        ?.background === Number.parseInt(darkPalette.selection.slice(1), 16),
      `${lineCount}-line add header press uses the shared selected background`,
    );
    driver.sendKeys('Escape');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line add header press cancels cleanly`,
      (candidate) => candidate.boundedListPopupOpen === false,
    );
    driver.sendMouse({
      kind: 'release',
      column: headerGeometry.left + 2,
      row: headerGeometry.top,
      button: 'left',
    });
    await exactState(
      'cancelling the pressed add header',
      ['pane-instance-1'],
      [['pane-instance-1']],
      ['pane-instance-1'],
    );
    await addInstance();
    await exactState(
      'creating terminal 2',
      ['pane-instance-1', 'pane-instance-2'],
      [['pane-instance-1'], ['pane-instance-2']],
      ['pane-instance-2'],
    );
    await addInstance();
    await exactState(
      'creating terminal 3',
      ['pane-instance-1', 'pane-instance-2', 'pane-instance-3'],
      [['pane-instance-1'], ['pane-instance-2'], ['pane-instance-3']],
      ['pane-instance-3'],
    );
    const activeRowGeometry = listGeometry();
    const activeRow = activeRowGeometry.top + 4;
    const idleActiveRowText = driver
      .snapshot()
      .rowText(activeRow)
      .slice(
        activeRowGeometry.left,
        activeRowGeometry.left + activeRowGeometry.width,
      );
    driver.sendMouse({
      kind: 'move',
      column: activeRowGeometry.left + activeRowGeometry.width - 5,
      row: activeRow,
      button: 'none',
    });
    const rowControlSnapshot = await driver.awaitGridCondition(
      `${lineCount}-line active instance row paints one hover cluster`,
      (candidate) => candidate.findText('Split instance') !== null,
    );
    HarnessSmoke.Class.requireCondition(
      rowControlSnapshot.cell(
        activeRow,
        activeRowGeometry.left + activeRowGeometry.width - 5,
      )?.background === Number.parseInt(darkPalette.cursorLine.slice(1), 16) &&
        rowControlSnapshot.cell(
          activeRow,
          activeRowGeometry.left + activeRowGeometry.width - 2,
        )?.background === Number.parseInt(darkPalette.selection.slice(1), 16),
      `${lineCount}-line hovered split and idle close controls keep the row's background family`,
    );
    const hoveredActiveRowText = rowControlSnapshot
      .rowText(activeRow)
      .slice(
        activeRowGeometry.left,
        activeRowGeometry.left + activeRowGeometry.width,
      );
    HarnessSmoke.Class.requireCondition(
      hoveredActiveRowText.slice(0, -6) === idleActiveRowText.slice(0, -6) &&
        hoveredActiveRowText.slice(-6) !== idleActiveRowText.slice(-6),
      `${lineCount}-line row controls overlay only the right tail without shifting the title`,
    );
    driver.sendMouse({
      kind: 'move',
      column: activeRowGeometry.left + 2,
      row: activeRowGeometry.top,
      button: 'none',
    });
    const restoredActiveRowSnapshot = await driver.awaitGridCondition(
      `${lineCount}-line unhover restores the full instance row`,
      (candidate) =>
        candidate
          .rowText(activeRow)
          .slice(
            activeRowGeometry.left,
            activeRowGeometry.left + activeRowGeometry.width,
          ) === idleActiveRowText,
    );
    HarnessSmoke.Class.requireCondition(
      restoredActiveRowSnapshot
        .rowText(activeRow)
        .slice(
          activeRowGeometry.left,
          activeRowGeometry.left + activeRowGeometry.width,
        ) === idleActiveRowText,
      `${lineCount}-line unhover restores the full edge-to-edge instance title`,
    );
    driver.sendMouse({
      kind: 'move',
      column: activeRowGeometry.left + activeRowGeometry.width - 1,
      row: activeRow,
      button: 'none',
    });
    const rightEdgeCloseSnapshot = await driver.awaitGridCondition(
      `${lineCount}-line overlay geometry reaches the row's right edge`,
      (candidate) => candidate.findText('Close instance') !== null,
    );
    HarnessSmoke.Class.requireCondition(
      rightEdgeCloseSnapshot.findText('Close instance') !== null,
      `${lineCount}-line truncation and overlay controls fill the same row width`,
    );
    closeRow(0);
    await exactState(
      'removing terminal 1',
      ['pane-instance-2', 'pane-instance-3'],
      [['pane-instance-2'], ['pane-instance-3']],
      ['pane-instance-3'],
    );
    closeRow(0);
    await exactState(
      'removing terminal 2',
      ['pane-instance-3'],
      [['pane-instance-3']],
      ['pane-instance-3'],
    );
    closeRow(0);
    await exactState('removing the last terminal', [], [], []);
    await GraphClient.Class.awaitValue(
      statusPath,
      'panelHost.spaces.length',
      1,
    );

    const emptyGeometry = listGeometry();
    clickCell(
      driver,
      emptyGeometry.left + emptyGeometry.width - 2,
      emptyGeometry.top + 2,
    );
    await exactState('clicking close in an empty list', [], [], []);

    await addInstance();
    await exactState(
      'recreating terminal 4',
      ['pane-instance-4'],
      [['pane-instance-4']],
      ['pane-instance-4'],
    );
    await addInstance();
    await exactState(
      'recreating terminal 5',
      ['pane-instance-4', 'pane-instance-5'],
      [['pane-instance-4'], ['pane-instance-5']],
      ['pane-instance-5'],
    );
    await addInstance();
    await exactState(
      'recreating terminal 6',
      ['pane-instance-4', 'pane-instance-5', 'pane-instance-6'],
      [['pane-instance-4'], ['pane-instance-5'], ['pane-instance-6']],
      ['pane-instance-6'],
    );
    closeRow(1);
    await exactState(
      'removing the middle recreated terminal',
      ['pane-instance-4', 'pane-instance-6'],
      [['pane-instance-4'], ['pane-instance-6']],
      ['pane-instance-6'],
    );

    await splitRow(0);
    await exactState(
      'splitting terminal 4 with terminal 7',
      ['pane-instance-4', 'pane-instance-6', 'pane-instance-7'],
      [['pane-instance-4', 'pane-instance-7'], ['pane-instance-6']],
      ['pane-instance-4', 'pane-instance-7'],
    );
    await splitRow(2);
    await exactState(
      'splitting terminal 6 with terminal 8',
      [
        'pane-instance-4',
        'pane-instance-6',
        'pane-instance-7',
        'pane-instance-8',
      ],
      [
        ['pane-instance-4', 'pane-instance-7'],
        ['pane-instance-6', 'pane-instance-8'],
      ],
      ['pane-instance-6', 'pane-instance-8'],
    );

    await addInstance('terminal');
    await exactState(
      'creating the normal terminal',
      [
        'pane-instance-4',
        'pane-instance-6',
        'pane-instance-7',
        'pane-instance-8',
        'pane-instance-9',
      ],
      [
        ['pane-instance-4', 'pane-instance-7'],
        ['pane-instance-6', 'pane-instance-8'],
        ['pane-instance-9'],
      ],
      ['pane-instance-9'],
    );
    await addInstance('invar-agent');
    await exactState(
      'creating the Invar agent',
      [
        'pane-instance-10',
        'pane-instance-4',
        'pane-instance-6',
        'pane-instance-7',
        'pane-instance-8',
        'pane-instance-9',
      ],
      [
        ['pane-instance-4', 'pane-instance-7'],
        ['pane-instance-6', 'pane-instance-8'],
        ['pane-instance-9'],
        ['pane-instance-10'],
      ],
      ['pane-instance-10'],
    );
    await addInstance('terminal-agent');
    await exactState(
      'creating the Claude terminal agent',
      [
        'pane-instance-10',
        'pane-instance-4',
        'pane-instance-6',
        'pane-instance-7',
        'pane-instance-8',
        'pane-instance-9',
        'pane-instance-11',
      ],
      [
        ['pane-instance-4', 'pane-instance-7'],
        ['pane-instance-6', 'pane-instance-8'],
        ['pane-instance-9'],
        ['pane-instance-10'],
        ['pane-instance-11'],
      ],
      ['pane-instance-11'],
    );

    closeRow(4);
    await exactState(
      'removing the normal terminal',
      [
        'pane-instance-10',
        'pane-instance-4',
        'pane-instance-6',
        'pane-instance-7',
        'pane-instance-8',
        'pane-instance-11',
      ],
      [
        ['pane-instance-4', 'pane-instance-7'],
        ['pane-instance-6', 'pane-instance-8'],
        ['pane-instance-10'],
        ['pane-instance-11'],
      ],
      ['pane-instance-11'],
    );
    closeRow(4);
    await exactState(
      'removing the Invar agent',
      [
        'pane-instance-4',
        'pane-instance-6',
        'pane-instance-7',
        'pane-instance-8',
        'pane-instance-11',
      ],
      [
        ['pane-instance-4', 'pane-instance-7'],
        ['pane-instance-6', 'pane-instance-8'],
        ['pane-instance-11'],
      ],
      ['pane-instance-11'],
    );
    closeRow(4);
    const survivingIds = [
      'pane-instance-4',
      'pane-instance-6',
      'pane-instance-7',
      'pane-instance-8',
    ];
    const survivingGroups = [
      ['pane-instance-4', 'pane-instance-7'],
      ['pane-instance-6', 'pane-instance-8'],
    ];
    await exactState(
      'removing the Claude terminal agent',
      survivingIds,
      survivingGroups,
      ['pane-instance-4', 'pane-instance-7'],
    );

    const cancellationGeometry = listGeometry();
    clickCell(driver, cancellationGeometry.left + 2, cancellationGeometry.top);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the lifecycle add chooser opens before cancellation',
      (candidate) => candidate.boundedListPopupOpen === true,
    );
    driver.sendKeys('Escape');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the lifecycle add chooser cancels',
      (candidate) => candidate.boundedListPopupOpen === false,
    );
    await exactState('cancelling an add', survivingIds, survivingGroups, [
      'pane-instance-4',
      'pane-instance-7',
    ]);

    status = HarnessSmoke.Class.readStatus(statusPath);
    let expand = tabBar(status).controls.find(
      (control) => control.action === 'expand',
    );
    if (!expand) throw new Error('Missing lifecycle expand control');
    clickSegment(driver, tabBar(status).row, expand);
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the lifecycle panel expands with a split active',
      (candidate) => candidate.panelExpanded === true,
    );
    HarnessSmoke.Class.requireCondition(
      Number(tabBar(status).instancesToggle?.endColumnExclusive) <=
        Number(
          tabBar(status).controls.find((control) => control.action === 'expand')
            ?.startColumn,
        ),
      'expanded tab controls stop before the restore control hit area',
    );
    await exactState(
      'expanding with a split active',
      survivingIds,
      survivingGroups,
      ['pane-instance-4', 'pane-instance-7'],
    );
    expand = tabBar(status).controls.find(
      (control) => control.action === 'expand',
    );
    if (!expand) throw new Error('Missing lifecycle restore control');
    clickSegment(driver, tabBar(status).row, expand);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the lifecycle panel restores through the same control',
      (candidate) => candidate.panelExpanded === false,
    );
    await exactState(
      'restoring the split panel',
      survivingIds,
      survivingGroups,
      ['pane-instance-4', 'pane-instance-7'],
    );

    status = HarnessSmoke.Class.readStatus(statusPath);
    expand = tabBar(status).controls.find(
      (control) => control.action === 'expand',
    );
    if (!expand)
      throw new Error('Missing lifecycle expand control before toggle');
    clickSegment(driver, tabBar(status).row, expand);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the lifecycle panel expands before the chord interleave',
      (candidate) => candidate.panelExpanded === true,
    );
    driver.sendKeys('Control+j');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'Ctrl+J closes and clears expanded mode',
      (candidate) =>
        candidate.panelVisible === false && candidate.panelExpanded === false,
    );
    await exactState(
      'closing an expanded panel with Ctrl+J',
      survivingIds,
      survivingGroups,
      ['pane-instance-4', 'pane-instance-7'],
    );
    driver.sendKeys('Control+j');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'Ctrl+J reopens the retained split without expanded mode',
      (candidate) =>
        candidate.panelVisible === true && candidate.panelExpanded === false,
    );
    await exactState(
      'reopening after the expanded chord interleave',
      survivingIds,
      survivingGroups,
      ['pane-instance-4', 'pane-instance-7'],
    );

    status = HarnessSmoke.Class.readStatus(statusPath);
    expand = tabBar(status).controls.find(
      (control) => control.action === 'expand',
    );
    if (!expand)
      throw new Error('Missing lifecycle expand control before resize');
    clickSegment(driver, tabBar(status).row, expand);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the lifecycle panel expands before resize',
      (candidate) => candidate.panelExpanded === true,
    );
    driver.resize(100, 32);
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'expanded lifecycle geometry follows a PTY resize',
      (candidate) =>
        candidate.width === 100 &&
        candidate.height === 32 &&
        candidate.panelExpanded === true,
    );
    expand = tabBar(status).controls.find(
      (control) => control.action === 'expand',
    );
    if (!expand) throw new Error('Missing resized lifecycle restore control');
    clickSegment(driver, tabBar(status).row, expand);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the resized lifecycle panel restores',
      (candidate) => candidate.panelExpanded === false,
    );
    await exactState(
      'resizing and restoring the expanded split',
      survivingIds,
      survivingGroups,
      ['pane-instance-4', 'pane-instance-7'],
    );

    status = HarnessSmoke.Class.readStatus(statusPath);
    expand = tabBar(status).controls.find(
      (control) => control.action === 'expand',
    );
    if (!expand) throw new Error('Missing expand control before create/remove');
    clickSegment(driver, tabBar(status).row, expand);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the lifecycle panel expands before create/remove',
      (candidate) => candidate.panelExpanded === true,
    );
    await addInstance();
    await exactState(
      'creating terminal 12 while expanded',
      [...survivingIds, 'pane-instance-12'],
      [...survivingGroups, ['pane-instance-12']],
      ['pane-instance-12'],
    );
    closeRow(4);
    status = await exactState(
      'removing terminal 12 while expanded',
      survivingIds,
      survivingGroups,
      ['pane-instance-4', 'pane-instance-7'],
    );
    HarnessSmoke.Class.requireCondition(
      status.panelExpanded === true,
      'removing an expanded singleton keeps the symmetric restore control active',
    );
    expand = tabBar(status).controls.find(
      (control) => control.action === 'expand',
    );
    if (!expand) throw new Error('Missing restore after expanded remove');
    clickSegment(driver, tabBar(status).row, expand);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the lifecycle panel restores after expanded create/remove',
      (candidate) => candidate.panelExpanded === false,
    );
    await exactState(
      'restoring after expanded create/remove',
      survivingIds,
      survivingGroups,
      ['pane-instance-4', 'pane-instance-7'],
    );

    status = HarnessSmoke.Class.readStatus(statusPath);
    expand = tabBar(status).controls.find(
      (control) => control.action === 'expand',
    );
    if (!expand) throw new Error('Missing expand control before rapid cycle');
    const frameBeforeRapidCycle = Number(status.frame);
    clickSegment(driver, tabBar(status).row, expand);
    clickSegment(driver, tabBar(status).row, expand);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'two rapid expand clicks complete one symmetric cycle',
      (candidate) =>
        Number(candidate.frame) > frameBeforeRapidCycle &&
        candidate.panelExpanded === false,
    );
    await exactState('two rapid expand clicks', survivingIds, survivingGroups, [
      'pane-instance-4',
      'pane-instance-7',
    ]);

    status = HarnessSmoke.Class.readStatus(statusPath);
    const dragRemovalGeometry = listGeometry();
    const layoutSlots = status.layoutSlots as
      Record<string, { left: number; top: number; width: number }> | undefined;
    const panelLeft = Number(layoutSlots?.bottomPanel?.left ?? 0);
    const splitCellColumns = Array.isArray(status.panelCellColumns)
      ? status.panelCellColumns.map(Number)
      : [];
    const firstCellColumns = Number(splitCellColumns[0] ?? 0);
    const dividerColumn = panelLeft + firstCellColumns;
    const dividerRow = dragRemovalGeometry.top + 4;
    driver.sendMouse({
      kind: 'move',
      column: dividerColumn,
      row: dividerRow,
      button: 'none',
    });
    driver.sendMouse({
      kind: 'press',
      column: dividerColumn,
      row: dividerRow,
      button: 'left',
    });
    driver.sendMouse({
      kind: 'move',
      column: dividerColumn - 2,
      row: dividerRow,
      button: 'left',
    });
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${lineCount}-line split divider moves before a removal interleaves`,
      (candidate) =>
        JSON.stringify(candidate.panelCellColumns) !==
        JSON.stringify(splitCellColumns),
    );
    await exactState(
      'moving the split divider before removal',
      survivingIds,
      survivingGroups,
      ['pane-instance-4', 'pane-instance-7'],
    );
    driver.sendMouse({
      kind: 'press',
      column: dragRemovalGeometry.left + dragRemovalGeometry.width - 2,
      row: dragRemovalGeometry.top + 2,
      button: 'left',
    });
    await exactState(
      'attempting removal while the split-divider drag owns the pointer',
      survivingIds,
      survivingGroups,
      ['pane-instance-4', 'pane-instance-7'],
    );
    driver.sendMouse({
      kind: 'release',
      column: dividerColumn - 2,
      row: dividerRow,
      button: 'left',
    });
    await exactState(
      'cancelling the removal attempt by releasing the split-divider drag',
      survivingIds,
      survivingGroups,
      ['pane-instance-4', 'pane-instance-7'],
    );
    closeRow(0);
    await exactState(
      'removing the active split member after the drag releases',
      ['pane-instance-6', 'pane-instance-7', 'pane-instance-8'],
      [['pane-instance-7'], ['pane-instance-6', 'pane-instance-8']],
      ['pane-instance-7'],
    );
    await driver.dispose();
    const secondLaunchStatusPath = join(
      homeDirectory,
      'second-launch-status.json',
    );
    const secondLaunchDriver = new PtyTestDriver.Class({
      workspaceRoot: scaleFixture.workspaceRoot,
      columns: 120,
      rows: 40,
      homeDirectory,
      environment: {
        TUI_STATUS_PATH: secondLaunchStatusPath,
        INVAR_AGENT_BACKEND: 'echo',
      },
    });
    try {
      await GraphClient.Class.awaitValue(
        secondLaunchStatusPath,
        'panelHost.orderedContents.length',
        3,
      );
      await GraphClient.Class.awaitValue(
        secondLaunchStatusPath,
        'panelHost.resolvedCells.length',
        1,
      );
      const secondLaunchStatus = await HarnessSmoke.Class.awaitStatus(
        secondLaunchDriver,
        secondLaunchStatusPath,
        `${lineCount}-line second launch reads the state written by the lifecycle protocol`,
        (candidate) =>
          candidate.ready === true &&
          JSON.stringify(candidate.panelContentIds) ===
            JSON.stringify([
              'pane-instance-6',
              'pane-instance-7',
              'pane-instance-8',
            ]) &&
          JSON.stringify(candidate.panelGroups) ===
            JSON.stringify([
              ['pane-instance-7'],
              ['pane-instance-6', 'pane-instance-8'],
            ]) &&
          JSON.stringify(candidate.panelCellIds) ===
            JSON.stringify(['pane-instance-7']),
        15_000,
      );
      HarnessSmoke.Class.requireCondition(
        secondLaunchStatus.panelVisible === true &&
          secondLaunchStatus.panelListVisible === true,
        `${lineCount}-line second launch restores the visible panel and instances list`,
      );
    } finally {
      await secondLaunchDriver.dispose();
    }
    HarnessSmoke.Class.pass(
      `${lineCount}-line terminal lifecycle protocol and its second launch keep every exact graph transition`,
    );
  } finally {
    await driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
    await HarnessSmoke.Class.removeTemporaryDirectory(
      scaleFixture.workspaceRoot,
    );
  }
}

async function driveRightDockCrossing(): Promise<void> {
  const homeDirectory = mkdtempSync(
    join(tmpdir(), 'invar-panel-right-dock-crossing-'),
  );
  const statusPath = join(homeDirectory, 'status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: process.cwd(),
    columns: 120,
    rows: 40,
    homeDirectory,
    environment: { TUI_STATUS_PATH: statusPath },
  });

  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the panel crossing fixture is ready',
      (status) => status.ready === true,
      15_000,
    );
    driver.sendKeys('Control+j');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the panel opens before the right dock crossing check',
      (status) => status.panelVisible === true,
    );
    driver.sendRawInput('\x1b[98;7u');
    const status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      'the right dock opens across the panel splitter row',
      (candidate) => candidate.rightDockVisible === true,
    );
    const crossingColumn = Number(
      (
        status.layoutSlots as {
          rightDockSplitter?: { left?: number };
        }
      ).rightDockSplitter?.left,
    );
    const snapshot = await driver.awaitGridCondition(
      'the panel splitter repaints the right-dock crossing',
      (candidate) => {
        const cell = candidate.cell(tabBar(status).row, crossingColumn);
        return (
          cell?.characters === '─' &&
          cell.background === Number.parseInt('1a1b26', 16)
        );
      },
    );
    HarnessSmoke.Class.requireCondition(
      crossingColumn === 91 &&
        snapshot.cell(tabBar(status).row, crossingColumn)?.characters === '─' &&
        snapshot.cell(tabBar(status).row, crossingColumn)?.background ===
          Number.parseInt('1a1b26', 16),
      'column 91 keeps its line and takes the panel-row background at the right dock',
    );
  } finally {
    driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

async function driveAtSize(columns: number, rows: number): Promise<void> {
  const homeDirectory = mkdtempSync(
    join(tmpdir(), `invar-panel-tabs-${columns}-`),
  );
  const settingsDirectory = join(homeDirectory, '.config', 'invar');
  mkdirSync(settingsDirectory, { recursive: true });
  await Bun.write(
    join(settingsDirectory, 'settings.json'),
    `${JSON.stringify({ glyphMode: columns < 100 ? 'ascii' : 'unicode' })}\n`,
  );
  const statusPath = join(homeDirectory, 'status.json');
  const driver = new PtyTestDriver.Class({
    workspaceRoot: process.cwd(),
    columns,
    rows,
    homeDirectory,
    environment: {
      TUI_STATUS_PATH: statusPath,
      INVAR_AGENT_BACKEND: 'echo',
    },
  });

  try {
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column application is ready`,
      (status) => status.ready === true,
      15_000,
    );
    driver.sendKeys('Control+p');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column Quick Open appears before the editor-action drive`,
      (status) => status.quickOpenOpen === true,
    );
    driver.sendText('greeter.ts');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column Quick Open finds the shared source fixture`,
      (status) =>
        status.quickOpenQuery === 'greeter.ts' &&
        Number(status.quickOpenMatches) > 0,
    );
    driver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column source fixture opens before shortcut checks`,
      (status) => String(status.activeBuffer).endsWith('/greeter.ts'),
    );
    driver.sendKeys('F1');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column command palette opens for editor focus`,
      (status) => status.paletteOpen === true,
    );
    driver.sendText('View: Focus Editor');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column editor-focus command is the sole palette match`,
      (status) =>
        status.paletteQuery === 'View: Focus Editor' &&
        Number(status.paletteMatches) === 1,
    );
    driver.sendKeys('Enter');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column editor owns focus before shortcut checks`,
      (status) => status.focus === 'editor' && status.paletteOpen === false,
    );
    driver.sendKeys('Alt+z');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column word-wrap shortcut turns wrap on`,
      (status) => status.wordWrap === true,
    );
    driver.sendKeys('Alt+z');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column word-wrap shortcut turns wrap off`,
      (status) => status.wordWrap === false,
    );
    driver.sendKeys('Alt+g');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column go-to-line shortcut opens the shared prompt`,
      (status) => status.goToLineOpen === true,
    );
    driver.sendKeys('Escape');
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column Escape closes the shortcut-opened prompt`,
      (status) => status.goToLineOpen === false,
    );
    driver.sendKeys('Control+Shift+a');
    let status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column tab bar starts with no unrequested Database space`,
      (candidate) =>
        candidate.panelVisible === true &&
        JSON.stringify(candidate.panelSpaceLabels) ===
          JSON.stringify(['Terminal']) &&
        Array.isArray(candidate.panelContentKinds) &&
        !candidate.panelContentKinds.includes('database') &&
        Array.isArray(candidate.panelHeadingGeometry) &&
        candidate.panelHeadingGeometry.some(
          (geometry: { contentId?: string }) => geometry.contentId === 'panel',
        ),
    );
    const initialSpaceAdd = tabBar(status).spaceAdd;
    if (!initialSpaceAdd) throw new Error('Missing initial Add geometry');
    clickSegment(driver, tabBar(status).tabRow, initialSpaceAdd);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column container Add offers Database only after a user gesture`,
      (candidate) =>
        candidate.boundedListPopupOpen === true &&
        Array.isArray(candidate.boundedListPopupItemIdentifiers) &&
        JSON.stringify(candidate.boundedListPopupItemIdentifiers) ===
          JSON.stringify(['terminal', 'database']),
    );
    driver.sendKeys('Down');
    driver.sendKeys('Enter');
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column user Add creates the first Database container`,
      (candidate) =>
        JSON.stringify(candidate.panelSpaceLabels) ===
          JSON.stringify(['Terminal', 'Database']) &&
        Array.isArray(candidate.panelContentKinds) &&
        candidate.panelContentKinds.filter((kind) => kind === 'database')
          .length === 1,
    );
    const panelSlot = HarnessSmoke.Class.layoutSlotRectangle(
      status,
      'bottomPanel',
    );
    if (!panelSlot) throw new Error('Missing bottom-panel slot');
    const panelTabsSlot = HarnessSmoke.Class.layoutSlotRectangle(
      status,
      'bottomPanelTabs',
    );
    if (!panelTabsSlot) throw new Error('Missing bottom-panel tabs slot');
    const initialSnapshot = await driver.awaitGridCondition(
      `${columns}-column tab row paints both space tabs without pane headings`,
      (snapshot) =>
        snapshot.findTextInRectangle('Terminal', panelTabsSlot) !== null &&
        snapshot.findTextInRectangle(
          columns === 120 ? 'Database' : 'Datab',
          panelTabsSlot,
        ) !== null &&
        snapshot.findText('Claude ×') === null,
    );
    const topLeft = initialSnapshot.cell(panelSlot.top, panelSlot.left);
    const bottomLeft = initialSnapshot.cell(
      panelSlot.top + panelSlot.height - 1,
      panelSlot.left,
    );
    HarnessSmoke.Class.requireCondition(
      topLeft !== null &&
        bottomLeft !== null &&
        !['╭', '┌'].includes(topLeft.characters) &&
        !(topLeft.characters === '+' && bottomLeft.characters === '+'),
      `${columns}-column panel content starts without a rounded frame`,
    );
    const initialTabBar = tabBar(status);
    const firstControl = initialTabBar.controls[0];
    HarnessSmoke.Class.requireCondition(
      initialTabBar.tabs.length === 2 &&
        initialTabBar.tabs[0]?.spaceIdentifier.startsWith('terminal-space-') ===
          true &&
        initialTabBar.tabs[1]?.spaceIdentifier.startsWith('database-space-') ===
          true,
      `${columns}-column workspace tabs publish by space identity`,
    );
    HarnessSmoke.Class.requireCondition(
      initialTabBar.tabs.every(
        (tab) =>
          initialSnapshot.cell(initialTabBar.tabRow, tab.endColumnExclusive - 1)
            ?.characters === ' ',
      ),
      `${columns}-column every panel tab paints one cell after its close glyph`,
    );
    const expectedEditorActionIdentifiers = [
      'view.toggleWordWrap',
      'editor.goToLine',
      'go.bottom',
    ];
    HarnessSmoke.Class.requireCondition(
      JSON.stringify(
        initialTabBar.editorActions.map((action) => action.commandId),
      ) === JSON.stringify(expectedEditorActionIdentifiers),
      `${columns}-column editor actions publish on the editor frame independently of tabs`,
    );
    const firstEditorAction = initialTabBar.editorActions[0];
    if (firstEditorAction) {
      HarnessSmoke.Class.requireCondition(
        [
          firstEditorAction.startColumn - 2,
          firstEditorAction.startColumn - 1,
        ].every((column) => {
          const cell = initialSnapshot.cell(
            initialTabBar.editorActionRow,
            column,
          );
          return (
            ['-', '─'].includes(cell?.characters ?? '') &&
            cell?.foreground === Number.parseInt('7aa2f7', 16)
          );
        }),
        `${columns}-column editor action lead dashes use the active frame tone`,
      );
    }
    HarnessSmoke.Class.requireCondition(
      initialTabBar.drag.width >= 1,
      `${columns}-column splitter leaves a live drag span`,
    );
    HarnessSmoke.Class.requireCondition(
      JSON.stringify(
        initialTabBar.controls.map((control) => control.action),
      ) === JSON.stringify(['expand', 'close']),
      `${columns}-column splitter row keeps only expand and close`,
    );
    HarnessSmoke.Class.requireCondition(
      firstControl !== undefined &&
        initialTabBar.drag.left === panelSlot.left &&
        initialTabBar.drag.left + initialTabBar.drag.width ===
          firstControl.startColumn,
      `${columns}-column splitter starts flush and meets the frame controls`,
    );
    const padCellCount = initialTabBar.drag.leadingPaintPadCells;
    const expectedDragCells = '─'.repeat(initialTabBar.drag.width);
    const tabRowSnapshot = await driver.awaitGridCondition(
      `${columns}-column published drag span paints a thin line from its first cell`,
      (snapshot) =>
        snapshot
          .rowText(initialTabBar.row)
          .slice(
            initialTabBar.drag.left,
            initialTabBar.drag.left + initialTabBar.drag.width,
          ) === expectedDragCells,
    );
    HarnessSmoke.Class.requireCondition(
      initialTabBar.drag.width > 0 &&
        tabRowSnapshot
          .rowText(initialTabBar.row)
          .slice(
            initialTabBar.drag.left,
            initialTabBar.drag.left + initialTabBar.drag.width,
          ) === expectedDragCells,
      `${columns}-column splitter paints thin marks between the left edge and controls`,
    );
    HarnessSmoke.Class.requireCondition(
      padCellCount === 0 &&
        (columns !== 120 || initialTabBar.drag.left === 37) &&
        tabRowSnapshot.cell(initialTabBar.row, initialTabBar.drag.left)
          ?.characters === '─' &&
        tabRowSnapshot.cell(initialTabBar.row, initialTabBar.drag.left)
          ?.background === Number.parseInt('1a1b26', 16),
      `${columns}-column splitter starts with a line in the row background${columns === 120 ? ' at column 37' : ''}`,
    );

    // Both ends of the flush drag span must grab. The two drags move in opposite directions so
    // neither asks the panel to push past a bound it already occupies.
    if (initialTabBar.drag.width > 1) {
      let currentTabBar = initialTabBar;
      let currentEdgeSnapshot = tabRowSnapshot;
      for (const [edgeName, edgeColumnOf, rowDelta] of [
        ['the first painted cell', (run: MarkRun) => run.firstColumn, 1],
        [
          'the last cell of the drag span',
          (run: MarkRun) => run.lastColumn,
          -1,
        ],
      ] as const) {
        const rowBeforeEdgeDrag = currentTabBar.row;
        const edgeColumn = edgeColumnOf(
          splitterMarkRun(
            currentEdgeSnapshot,
            rowBeforeEdgeDrag,
            currentTabBar.drag.left,
            currentTabBar.drag.width,
          ),
        );
        const edgeTargetRow = Math.max(0, rowBeforeEdgeDrag + rowDelta);
        driver.sendMouse({
          kind: 'press',
          column: edgeColumn,
          row: rowBeforeEdgeDrag,
          button: 'left',
        });
        driver.sendMouse({
          kind: 'move',
          column: edgeColumn,
          row: edgeTargetRow,
          button: 'left',
        });
        driver.sendMouse({
          kind: 'release',
          column: edgeColumn,
          row: edgeTargetRow,
          button: 'left',
        });
        const resizedStatus = await HarnessSmoke.Class.awaitStatus(
          driver,
          statusPath,
          `${columns}-column a drag begun on ${edgeName} still resizes the panel`,
          (candidate) => tabBar(candidate).row !== rowBeforeEdgeDrag,
        );
        const nextTabBar = tabBar(resizedStatus);
        const previousDragCells = '\u2500'.repeat(currentTabBar.drag.width);
        const nextDragCells = '\u2500'.repeat(nextTabBar.drag.width);
        currentEdgeSnapshot = await driver.awaitGridCondition(
          `${columns}-column relayout paints the current splitter before the next drag`,
          (candidate) =>
            candidate
              .rowText(nextTabBar.row)
              .slice(
                nextTabBar.drag.left,
                nextTabBar.drag.left + nextTabBar.drag.width,
              ) === nextDragCells &&
            candidate
              .rowText(rowBeforeEdgeDrag)
              .slice(
                currentTabBar.drag.left,
                currentTabBar.drag.left + currentTabBar.drag.width,
              ) !== previousDragCells,
        );
        currentTabBar = nextTabBar;
        HarnessSmoke.Class.pass(
          `${columns}-column a drag begun on ${edgeName} still resizes the panel`,
        );
      }
    }
    if (initialTabBar.editorActions.length === 3) {
      for (const action of initialTabBar.editorActions) {
        const actionText = tabRowSnapshot
          .rowText(initialTabBar.editorActionRow)
          .slice(action.startColumn, action.endColumnExclusive);
        const actionCharacters = Array.from(actionText);
        HarnessSmoke.Class.requireCondition(
          actionCharacters.length === 3 &&
            actionCharacters[0]?.trim().length === 0 &&
            (actionCharacters[1]?.trim().length ?? 0) > 0 &&
            actionCharacters[2]?.trim().length === 0,
          `${columns}-column ${action.commandId} icon has one painted padding cell on each side (painted ${JSON.stringify(actionText)})`,
        );
      }
      HarnessSmoke.Class.requireCondition(
        status.wordWrap === false && status.goToLineOpen === false,
        `${columns}-column editor-action effects start absent before clicks`,
      );
      const expectedTooltipByCommandIdentifier = new Map([
        ['view.toggleWordWrap', 'View: Toggle Word Wrap (Alt+Z)'],
        ['editor.goToLine', 'Editor: Go to Line (Alt+G)'],
      ]);
      for (const action of initialTabBar.editorActions) {
        const expectedTooltip = expectedTooltipByCommandIdentifier.get(
          action.commandId,
        );
        if (!expectedTooltip) continue;
        const actionColumn =
          action.startColumn +
          Math.floor((action.endColumnExclusive - action.startColumn) / 2);
        driver.sendMouse({
          kind: 'move',
          column: actionColumn,
          row: initialTabBar.editorActionRow,
          button: 'none',
        });
        const tooltipSnapshot = await driver.awaitGridCondition(
          `${columns}-column ${action.commandId} tooltip shows ${expectedTooltip}`,
          (candidate) => candidate.findText(expectedTooltip) !== null,
          5_000,
        );
        HarnessSmoke.Class.requireCondition(
          tooltipSnapshot.findText(expectedTooltip) !== null,
          `${columns}-column ${action.commandId} tooltip shows its effective chord`,
        );
      }
      clickSegment(
        driver,
        initialTabBar.editorActionRow,
        initialTabBar.editorActions[0]!,
      );
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${columns}-column word-wrap button turns wrap on`,
        (candidate) => candidate.wordWrap === true,
      );
      clickSegment(
        driver,
        initialTabBar.editorActionRow,
        initialTabBar.editorActions[0]!,
      );
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${columns}-column word-wrap button turns wrap off`,
        (candidate) => candidate.wordWrap === false,
      );
      clickSegment(
        driver,
        initialTabBar.editorActionRow,
        initialTabBar.editorActions[1]!,
      );
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${columns}-column go-to-line button opens the shared prompt`,
        (candidate) => candidate.goToLineOpen === true,
      );
      driver.sendKeys('Escape');
      status = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        `${columns}-column Escape closes the button-opened prompt`,
        (candidate) => candidate.goToLineOpen === false,
      );
    }

    const firstTab = tabBar(status).tabs[0];
    const secondTab = tabBar(status).tabs[1];
    if (!firstTab || !secondTab) throw new Error('Missing reorderable tabs');
    const firstTabColumn = Math.floor(
      (firstTab.startColumn + firstTab.endColumnExclusive) / 2,
    );
    const secondTabColumn = Math.floor(
      (secondTab.startColumn + secondTab.endColumnExclusive) / 2,
    );
    driver.sendMouse({
      kind: 'move',
      column: firstTabColumn,
      row: tabBar(status).tabRow,
      button: 'none',
    });
    driver.sendMouse({
      kind: 'press',
      column: firstTabColumn,
      row: tabBar(status).tabRow,
      button: 'left',
    });
    driver.sendMouse({
      kind: 'move',
      column: secondTabColumn,
      row: tabBar(status).tabRow,
      button: 'left',
    });
    driver.sendMouse({
      kind: 'release',
      column: secondTabColumn,
      row: tabBar(status).tabRow,
      button: 'left',
    });
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column tab drag reorders plugin spaces`,
      (candidate) =>
        JSON.stringify(candidate.panelSpaceLabels) ===
        JSON.stringify(['Database', 'Terminal']),
    );

    const activeTerminalTab = tabBar(status).tabs.find((tab) =>
      tab.spaceIdentifier.startsWith('terminal-space-'),
    );
    if (!activeTerminalTab)
      throw new Error('Missing active Terminal tab geometry');
    clickSegment(driver, tabBar(status).tabRow, activeTerminalTab);
    driver.sendKeys('Alt+PageDown');
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column keyboard cycle selects Database`,
      (candidate) =>
        candidate.panelActiveSpace === 'database-space-1' &&
        JSON.stringify(candidate.panelCellKinds) ===
          JSON.stringify(['database']),
    );
    const terminalTab = tabBar(status).tabs.find((tab) =>
      tab.spaceIdentifier.startsWith('terminal-space-'),
    );
    if (!terminalTab) throw new Error('Missing Terminal tab geometry');
    clickSegment(driver, tabBar(status).tabRow, terminalTab);
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column mouse tab click restores Terminal`,
      (candidate) =>
        String(candidate.panelActiveSpace).startsWith('terminal-space-'),
    );

    const instancesToggle = tabBar(status).instancesToggle;
    if (!instancesToggle) throw new Error('Missing Instances geometry');
    // The toggle ends the row flush (trailing pad removed, user request
    // 2026-08-02): its hit target reaches the row edge, and its own one-space
    // margin is the last painted cell.
    const instancesToggleSnapshot = await driver.awaitGridCondition(
      `${columns}-column instances toggle margin is the last cell of the row`,
      (snapshot) =>
        snapshot.cell(tabBar(status).tabRow, columns - 1)?.characters === ' ',
    );
    HarnessSmoke.Class.requireCondition(
      instancesToggle.endColumnExclusive === columns &&
        instancesToggleSnapshot.cell(tabBar(status).tabRow, columns - 1)
          ?.characters === ' ',
      `${columns}-column instances toggle ends the row flush`,
    );
    clickSegment(driver, tabBar(status).tabRow, instancesToggle);
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column one-instance toggle opens the instances list`,
      (candidate) => candidate.panelListVisible === true,
    );
    clickSegment(
      driver,
      tabBar(status).tabRow,
      tabBar(status).instancesToggle!,
    );
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column instances toggle closes the instances list`,
      (candidate) => candidate.panelListVisible === false,
    );

    const add = tabBar(status).spaceAdd;
    if (!add) throw new Error('Missing Add geometry');
    clickSegment(driver, tabBar(status).tabRow, add);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column Add popup exposes generic content kinds`,
      (candidate) =>
        candidate.boundedListPopupOpen === true &&
        Array.isArray(candidate.boundedListPopupItemIdentifiers) &&
        candidate.boundedListPopupItemIdentifiers.includes('terminal') &&
        candidate.boundedListPopupItemIdentifiers.includes('database'),
    );
    driver.sendKeys('Enter');
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column Add creates Terminal 2 as a space`,
      (candidate) =>
        Array.isArray(candidate.panelSpaceLabels) &&
        candidate.panelSpaceLabels.includes('Terminal 2'),
    );
    if (columns === 120) {
      const databaseTab = tabBar(status).tabs.find((tab) =>
        tab.spaceIdentifier.startsWith('database-space-'),
      );
      if (!databaseTab) throw new Error('Missing Database tab geometry');
      clickSegment(driver, tabBar(status).tabRow, databaseTab);
      status = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        '120-column Database plugin becomes active',
        (candidate) =>
          String(candidate.panelActiveSpace).startsWith('database-space-'),
      );
      clickSegment(
        driver,
        tabBar(status).tabRow,
        tabBar(status).instancesToggle!,
      );
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        '120-column Database instances list opens',
        (candidate) => candidate.panelListVisible === true,
      );
      const addDatabaseInstance = async (
        expectedLabel: string,
        expectedLabelCount = 1,
      ): Promise<StatusSnapshot> => {
        const databaseAddPosition = await driver
          .awaitGridCondition(
            `120-column Database instances list paints its contextual add before ${expectedLabel}`,
            (snapshot) => snapshot.findText('+ Database') !== null,
          )
          .then((snapshot) => snapshot.findText('+ Database'));
        if (!databaseAddPosition)
          throw new Error('Missing contextual Database add');
        clickCell(
          driver,
          databaseAddPosition.column + 2,
          databaseAddPosition.row,
        );
        await HarnessSmoke.Class.awaitStatus(
          driver,
          statusPath,
          `120-column Database add offers only another Database instance before ${expectedLabel}`,
          (candidate) =>
            candidate.boundedListPopupOpen === true &&
            candidate.boundedListPopupTitle === 'Add Database' &&
            JSON.stringify(candidate.boundedListPopupItemIdentifiers) ===
              JSON.stringify(['database-instance']),
        );
        driver.sendKeys('Enter');
        return HarnessSmoke.Class.awaitStatus(
          driver,
          statusPath,
          `120-column contextual add creates ${expectedLabel}`,
          (candidate) =>
            Array.isArray(candidate.panelContentLabels) &&
            candidate.panelContentLabels.filter(
              (label) => label === expectedLabel,
            ).length === expectedLabelCount,
        );
      };
      status = await addDatabaseInstance('Database 2');
      status = await addDatabaseInstance('Database 3');
      // The close removes a list row, so every geometry below it MOVES. The
      // next add locates its control by findText, and "+ Database" is painted
      // both before and after the relayout — a wait on it is pre-satisfied and
      // hands back the stale frame, so the click lands on the old row. Wait for
      // the relayout itself: the model count at a settled frame, then the
      // screen actually dropping the row. Under load this was the #464 flake.
      // The expected count is MEASURED, never invented: one fewer than now.
      const contentsBeforeClose = Number(
        (
          await GraphClient.Class.query(
            statusPath,
            'panelHost.orderedContents.length',
            'settle',
          )
        ).value,
      );
      await HarnessSmoke.Class.closePanelContentsListRow(
        driver,
        statusPath,
        'Database 2',
      );
      await GraphClient.Class.awaitValue(
        statusPath,
        'panelHost.orderedContents.length',
        contentsBeforeClose - 1,
      );
      await driver.awaitGridCondition(
        'the closed Database 2 row leaves the instances list',
        (candidate) => candidate.findText('Database 2') === null,
      );
      status = await addDatabaseInstance('Database 3', 2);
      const duplicateLabelIdentifiers = (
        status.panelContentIds as string[]
      ).filter(
        (_identifier, index) =>
          (status.panelContentLabels as string[])[index] === 'Database 3',
      );
      HarnessSmoke.Class.requireCondition(
        duplicateLabelIdentifiers.length === 2 &&
          new Set(duplicateLabelIdentifiers).size === 2,
        'two Database 3 panes keep separate identifiers',
      );
      await HarnessSmoke.Class.closePanelContentsListRow(
        driver,
        statusPath,
        'Database 3',
        1,
      );
      status = HarnessSmoke.Class.readStatus(statusPath);
      const survivingDuplicateLabelIdentifiers = (
        status.panelContentIds as string[]
      ).filter(
        (_identifier, index) =>
          (status.panelContentLabels as string[])[index] === 'Database 3',
      );
      HarnessSmoke.Class.requireCondition(
        survivingDuplicateLabelIdentifiers.length === 1 &&
          duplicateLabelIdentifiers.includes(
            survivingDuplicateLabelIdentifiers[0]!,
          ),
        'closing one Database 3 pane leaves the other Database 3 pane alive',
      );
      const countSnapshot = await driver.awaitGridCondition(
        '120-column instances toggle paints a superscript count with one separator space',
        (snapshot) => {
          const countPosition = snapshot.findText('²');
          return (
            countPosition !== null &&
            snapshot.cell(countPosition.row, countPosition.column - 2)
              ?.characters === '≡' &&
            snapshot.cell(countPosition.row, countPosition.column - 1)
              ?.characters === ' '
          );
        },
      );
      const countPosition = countSnapshot.findText('²');
      HarnessSmoke.Class.requireCondition(
        countPosition !== null &&
          countSnapshot.cell(countPosition.row, countPosition.column - 2)
            ?.characters === '≡' &&
          countSnapshot.cell(countPosition.row, countPosition.column - 1)
            ?.characters === ' ' &&
          countPosition.column + 2 ===
            tabBar(status).instancesToggle?.endColumnExclusive,
        'the superscript count and right pad stay inside the instances toggle hit area',
      );

      const containerConfirmation =
        await HarnessSmoke.Class.requestPanelContainerClose(
          driver,
          'Database',
          2,
        );
      HarnessSmoke.Class.requireCondition(
        containerConfirmation.findText(
          'Close Database and its 2 instances?',
        ) !== null,
        'a two-instance container close confirms with its exact count',
      );
      driver.sendKeys('Enter');
      await driver.awaitGridCondition(
        'the container dialog defaults to No and preserves both instances',
        (candidate) =>
          candidate.findText('Close Database and its 2 instances?') === null,
      );
      status = HarnessSmoke.Class.readStatus(statusPath);
      HarnessSmoke.Class.requireCondition(
        Array.isArray(status.panelSpaceLabels) &&
          status.panelSpaceLabels.includes('Database') &&
          Array.isArray(status.panelContentKinds) &&
          status.panelContentKinds.filter((kind) => kind === 'database')
            .length === 2,
        'the container dialog defaults to No and preserves both instances',
      );
      await HarnessSmoke.Class.requestPanelContainerClose(
        driver,
        'Database',
        2,
      );
      driver.sendKeys('Left');
      driver.sendKeys('Enter');
      status = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'confirming the container close removes both Database instances',
        (candidate) =>
          Array.isArray(candidate.panelSpaceLabels) &&
          !candidate.panelSpaceLabels.includes('Database') &&
          Array.isArray(candidate.panelContentKinds) &&
          !candidate.panelContentKinds.includes('database'),
      );
    }

    const close = tabBar(status).controls.find(
      (control) => control.action === 'close',
    );
    if (!close) throw new Error('Missing Close geometry');
    clickSegment(driver, tabBar(status).row, close);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column panel close hides without disposing spaces`,
      (candidate) =>
        candidate.panelVisible === false &&
        Array.isArray(candidate.panelSpaceLabels) &&
        candidate.panelSpaceLabels.includes('Terminal 2'),
    );
    const editorActionCluster = columns < 100 ? 'w  g  b' : '↵  ↕  ⇊';
    const closedPanelSnapshot = await driver.awaitGridCondition(
      `${columns}-column editor action cluster repaints after the panel closes`,
      (snapshot) => snapshot.findText(editorActionCluster) !== null,
    );
    HarnessSmoke.Class.requireCondition(
      closedPanelSnapshot.findText(editorActionCluster) !== null,
      `${columns}-column editor actions remain painted after the panel closes`,
    );
    driver.sendKeys('Control+j');
    status = await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column terminal shortcut reopens the retained spaces`,
      (candidate) => candidate.panelVisible === true,
    );
    const expand = tabBar(status).controls.find(
      (control) => control.action === 'expand',
    );
    if (!expand) throw new Error('Missing Expand geometry');
    clickSegment(driver, tabBar(status).row, expand);
    await HarnessSmoke.Class.awaitStatus(
      driver,
      statusPath,
      `${columns}-column Expand keeps the tab spaces`,
      (candidate) =>
        candidate.panelExpanded === true &&
        Array.isArray(candidate.panelSpaceLabels) &&
        candidate.panelSpaceLabels.includes('Terminal 2'),
    );
    if (columns === 120) {
      driver.sendKeys('Control+j');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        '120-column panel closes before the Markdown action drive',
        (candidate) => candidate.panelVisible === false,
      );
      driver.sendKeys('Control+p');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'Markdown action drive opens Quick Open',
        (candidate) => candidate.quickOpenOpen === true,
      );
      driver.sendText('project.conventions.md');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'Markdown action drive finds project.conventions.md',
        (candidate) => Number(candidate.quickOpenMatches) > 0,
      );
      driver.sendKeys('Enter');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'Markdown action drive opens project.conventions.md',
        (candidate) =>
          String(candidate.activeBuffer).endsWith('/project.conventions.md'),
      );
      driver.sendKeys('F1');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'Markdown action drive opens the command palette',
        (candidate) => candidate.paletteOpen === true,
      );
      driver.sendText('View: Focus Editor');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'Markdown action drive selects editor focus',
        (candidate) => Number(candidate.paletteMatches) === 1,
      );
      driver.sendKeys('Enter');
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'Markdown action drive gives the editor keyboard ownership',
        (candidate) => candidate.focus === 'editor',
      );
      driver.sendKeys('Control+Shift+v');
      status = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'Markdown preview parses before its frame actions run',
        (candidate) =>
          candidate.markdownViewMode === 'preview' &&
          candidate.markdownParsing === false,
      );
      const markdownActionMarker = driver.snapshot().findText('↵  ↕  ⇊');
      if (!markdownActionMarker)
        throw new Error('Missing Markdown editor-frame actions');
      clickCell(driver, markdownActionMarker.column, markdownActionMarker.row);
      status = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'Markdown frame action disables preview wrapping',
        (candidate) => candidate.markdownPreviewWordWrap === false,
      );
      clickCell(
        driver,
        markdownActionMarker.column + 3,
        markdownActionMarker.row,
      );
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'Markdown frame action opens the line prompt',
        (candidate) => candidate.goToLineOpen === true,
      );
      driver.sendText('200');
      driver.sendKeys('Enter');
      status = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'Markdown line prompt scrolls the preview',
        (candidate) =>
          candidate.goToLineOpen === false &&
          Number(candidate.markdownPreviewScrollTop) > 0,
      );
      clickCell(
        driver,
        markdownActionMarker.column + 6,
        markdownActionMarker.row,
      );
      await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        'Markdown bottom action reaches the preview end',
        (candidate) =>
          Number(candidate.markdownPreviewScrollTop) ===
          Math.max(
            0,
            Number(candidate.markdownPreviewContentRows) -
              Number(candidate.markdownPreviewViewportRows),
          ),
      );
    }
    HarnessSmoke.Class.pass(
      `${columns}x${rows} tab row keyboard, mouse, Add, expand, and close`,
    );
  } finally {
    driver.dispose();
    await HarnessSmoke.Class.removeTemporaryDirectory(homeDirectory);
  }
}

await driveLegacyPersistedPaneRestore();
await driveRestoredTaskPaneSpaceHealing(10);
await driveRestoredTaskPaneSpaceHealing(100_000);
await driveTerminalLifecycleProtocol(10);
await driveTerminalLifecycleProtocol(100_000);
await driveEmptyPanelRecovery(120, 40);
await driveEmptyPanelRecovery(88, 24);
await driveRightDockCrossing();
await driveAtSize(120, 40);
await driveAtSize(88, 24);
console.log('smoke-panel-chrome-harness: ALL-PASS');
