#!/usr/bin/env bun
// Drive the mixed workspace-tab and editor-action row through its keyboard and mouse paths.
// Run: bun scripts/harness/smoke-panel-chrome-harness.ts
// ALL-PASS means tabs survive when editor actions truncate, both action shortcuts work,
// their tooltips show effective chords, wide buttons use their painted geometry, and all panel
// controls still work.
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
): MarkRun {
  const text = Array.from(snapshot.rowText(row));
  const firstColumn = text.indexOf('\u2500');
  const lastColumn = text.lastIndexOf('\u2500');
  if (firstColumn < 0) {
    throw new Error(`No splitter mark painted on row ${row}`);
  }
  return { firstColumn, lastColumn };
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
  driver.sendMouse({ kind: 'press', column, row, button: 'left' });
  driver.sendMouse({ kind: 'release', column, row, button: 'left' });
}

function clickCell(
  driver: PtyTestDriver.Model,
  column: number,
  row: number,
): void {
  driver.sendMouse({ kind: 'move', column, row, button: 'none' });
  driver.sendMouse({ kind: 'press', column, row, button: 'left' });
  driver.sendMouse({ kind: 'release', column, row, button: 'left' });
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
      `${columns}-column tab bar shows Terminal and Database spaces`,
      (candidate) =>
        candidate.panelVisible === true &&
        JSON.stringify(candidate.panelSpaceLabels) ===
          JSON.stringify(['Terminal', 'Database']) &&
        Array.isArray(candidate.panelHeadingGeometry) &&
        candidate.panelHeadingGeometry.some(
          (geometry: { contentId?: string }) => geometry.contentId === 'panel',
        ),
    );
    const initialSnapshot = await driver.awaitGridCondition(
      `${columns}-column tab row paints both space tabs without pane headings`,
      (snapshot) =>
        snapshot.findText('Terminal') !== null &&
        snapshot.findText(columns === 120 ? 'Database' : 'Datab') !== null &&
        snapshot.findText('Claude ×') === null,
    );
    const panelSlot = (
      status.layoutSlots as Record<
        string,
        { left: number; top: number; width: number; height: number }
      >
    ).bottomPanel;
    if (!panelSlot) throw new Error('Missing bottom-panel slot');
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
      for (const [edgeName, edgeColumnOf, rowDelta] of [
        ['the first painted cell', (run: MarkRun) => run.firstColumn, 1],
        [
          'the last cell of the drag span',
          (run: MarkRun) => run.lastColumn,
          -1,
        ],
      ] as const) {
        const rowBeforeEdgeDrag = tabBar(
          HarnessSmoke.Class.readStatus(statusPath),
        ).row;
        const edgeSnapshot = await driver.awaitGridCondition(
          `${columns}-column splitter mark is painted before the ${edgeName} drag`,
          (snapshot) =>
            Array.from(snapshot.rowText(rowBeforeEdgeDrag)).indexOf('\u2500') >=
            0,
        );
        const edgeColumn = edgeColumnOf(
          splitterMarkRun(edgeSnapshot, rowBeforeEdgeDrag),
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
        await HarnessSmoke.Class.awaitStatus(
          driver,
          statusPath,
          `${columns}-column a drag begun on ${edgeName} still resizes the panel`,
          (candidate) => tabBar(candidate).row !== rowBeforeEdgeDrag,
        );
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
        JSON.stringify(candidate.panelCellIds) === JSON.stringify(['database']),
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
    const instancesToggleSnapshot = await driver.awaitGridCondition(
      `${columns}-column instances button paints its pad before the panel border`,
      (snapshot) =>
        snapshot.cell(tabBar(status).tabRow, columns - 3)?.characters === ' ',
    );
    HarnessSmoke.Class.requireCondition(
      instancesToggle.endColumnExclusive === columns - 2 &&
        instancesToggleSnapshot.cell(tabBar(status).tabRow, columns - 3)
          ?.characters === ' ',
      `${columns}-column instances button owns the pad before the panel border`,
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
      const databaseAddPosition = await driver
        .awaitGridCondition(
          '120-column Database instances list paints its contextual add',
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
        '120-column Database add offers only another Database instance',
        (candidate) =>
          candidate.boundedListPopupOpen === true &&
          candidate.boundedListPopupTitle === 'Add Database' &&
          JSON.stringify(candidate.boundedListPopupItemIdentifiers) ===
            JSON.stringify(['database-instance']),
      );
      driver.sendKeys('Enter');
      status = await HarnessSmoke.Class.awaitStatus(
        driver,
        statusPath,
        '120-column contextual add creates an independent Database instance',
        (candidate) =>
          Array.isArray(candidate.panelContentIds) &&
          candidate.panelContentIds.includes('database-2'),
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
        candidate.panelSpaceLabels.includes('Database'),
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

await driveRightDockCrossing();
await driveAtSize(120, 40);
await driveAtSize(88, 24);
console.log('smoke-panel-chrome-harness: ALL-PASS');
